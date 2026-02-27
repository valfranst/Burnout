import { Component, inject, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import Chart from 'chart.js/auto';
import * as tf from '@tensorflow/tfjs';
import { BurnoutService } from '../../core/services/burnout.service';
import { ModelCacheService, ModelContext } from '../../core/services/model-cache.service';
import { TrainingRecord } from '../../shared/models/models';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';

@Component({
  selector: 'app-training',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatIconModule,
    DecimalPipe,
    NavbarComponent,
  ],
  template: `
    <app-navbar />
    <div class="training-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title><mat-icon>model_training</mat-icon> Treinamento de Modelo (Browser)</mat-card-title>
          <mat-card-subtitle>O modelo TensorFlow.js é treinado diretamente no seu navegador</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="startTraining()">
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Número de Registros</mat-label>
                <input matInput type="number" min="10" max="1000" formControlName="numRecords" />
                <mat-hint>10–1000 registros para treinamento</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Épocas</mat-label>
                <input matInput type="number" min="5" max="100" formControlName="epochs" />
              </mat-form-field>

              <button mat-flat-button color="primary" type="submit" [disabled]="training">
                <mat-icon>play_arrow</mat-icon> Treinar
              </button>

              <button mat-stroked-button type="button" (click)="clearCache()" [disabled]="training">
                <mat-icon>delete_sweep</mat-icon> Limpar Cache
              </button>
            </div>
          </form>

          @if (training) {
            <div class="progress-section">
              <p>Época {{ currentEpoch }} / {{ totalEpochs }} — Loss: {{ currentLoss | number:'1.4-4' }}</p>
              <mat-progress-bar mode="determinate" [value]="(currentEpoch / totalEpochs) * 100" />
            </div>
          }

          @if (status) {
            <p class="status-msg" [class.error]="isError">{{ status }}</p>
          }
        </mat-card-content>
      </mat-card>

      @if (metrics) {
        <mat-card class="metrics-card">
          <mat-card-header><mat-card-title>📊 Métricas de Treinamento</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="metrics-grid">
              <div class="metric-item">
                <div class="metric-value">{{ metrics.finalTrainLoss | number:'1.4-4' }}</div>
                <div class="metric-label">Loss Final (Treino)</div>
              </div>
              @if (metrics.finalValLoss !== null) {
                <div class="metric-item">
                  <div class="metric-value">{{ metrics.finalValLoss | number:'1.4-4' }}</div>
                  <div class="metric-label">Loss Final (Validação)</div>
                </div>
              }
              <div class="metric-item">
                <div class="metric-value">{{ metrics.totalEpochs }}</div>
                <div class="metric-label">Épocas</div>
              </div>
            </div>
            <div class="chart-container"><canvas #lossChart></canvas></div>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .training-container { padding: 1.5rem; max-width: 900px; margin: 0 auto; }
    .form-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .form-row mat-form-field { flex: 1; min-width: 160px; }
    .progress-section { margin-top: 1rem; }
    .status-msg { margin-top: 0.5rem; color: #4caf50; }
    .status-msg.error { color: #f44336; }
    .metrics-card { margin-top: 1.5rem; }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1rem; text-align: center; }
    .metric-value { font-size: 1.5rem; font-weight: 700; }
    .metric-label { font-size: 0.8rem; color: rgba(0,0,0,0.54); }
    .chart-container { height: 250px; position: relative; }
  `],
})
export class TrainingComponent implements OnDestroy {
  @ViewChild('lossChart') lossChartRef!: ElementRef<HTMLCanvasElement>;

  private readonly burnout = inject(BurnoutService);
  private readonly modelCache = inject(ModelCacheService);
  private readonly fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    numRecords: [200],
    epochs: [30],
  });

  training = false;
  status = '';
  isError = false;
  currentEpoch = 0;
  totalEpochs = 0;
  currentLoss = 0;

  metrics?: { finalTrainLoss: number; finalValLoss: number | null; totalEpochs: number };
  private lossChart?: Chart;

  ngOnDestroy(): void {
    this.lossChart?.destroy();
  }

  async clearCache(): Promise<void> {
    await this.modelCache.clearCache();
    this.status = 'Cache do modelo limpo com sucesso.';
    this.isError = false;
  }

  async startTraining(): Promise<void> {
    const { numRecords, epochs } = this.form.getRawValue();
    this.training = true;
    this.status = 'Buscando registros do servidor...';
    this.isError = false;
    this.metrics = undefined;
    this.totalEpochs = epochs;
    this.currentEpoch = 0;

    try {
      const records = await this.burnout.getTrainingRecords(numRecords);
      if (records.length < 10) {
        this.status = 'Poucos registros disponíveis para treinamento (mínimo: 10).';
        this.isError = true;
        return;
      }

      this.status = `Treinando com ${records.length} registros...`;

      const { model, context, trainLosses, valLosses } = await this.trainInBrowser(records, epochs);

      await this.modelCache.saveTrainedModel(model, context);

      this.metrics = {
        finalTrainLoss: trainLosses[trainLosses.length - 1],
        finalValLoss: valLosses.length > 0 ? valLosses[valLosses.length - 1] : null,
        totalEpochs: epochs,
      };

      this.status = '✅ Modelo treinado e salvo no navegador (IndexedDB).';
      this.renderLossChart(trainLosses, valLosses);
    } catch (err) {
      this.status = `Erro durante treinamento: ${(err as Error).message}`;
      this.isError = true;
    } finally {
      this.training = false;
    }
  }

  private async trainInBrowser(
    records: TrainingRecord[],
    epochs: number
  ): Promise<{
    model: tf.LayersModel;
    context: ModelContext;
    trainLosses: number[];
    valLosses: number[];
  }> {
    // Build context (min/max normalization bounds)
    const numFeatures = 11;
    const mins = new Array(numFeatures).fill(Infinity);
    const maxs = new Array(numFeatures).fill(-Infinity);

    for (const r of records) {
      const f = this.extractFeatures(r);
      for (let i = 0; i < numFeatures; i++) {
        if (f[i] < mins[i]) mins[i] = f[i];
        if (f[i] > maxs[i]) maxs[i] = f[i];
      }
    }
    for (let i = 0; i < numFeatures; i++) {
      if (maxs[i] === mins[i]) maxs[i] = mins[i] + 1;
    }
    const context: ModelContext = { mins, maxs, numFeatures };

    // Shuffle and split 80/20
    const shuffled = [...records].sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(shuffled.length * 0.8);
    const trainRecs = shuffled.slice(0, splitIdx);
    const valRecs = shuffled.slice(splitIdx);

    const buildTensors = (recs: TrainingRecord[]) => {
      const xs = recs.map(r => this.normalizeWithContext(this.extractFeatures(r), context));
      const ys = recs.map(r => [Math.min(1, Math.max(0, r.burnoutScore / 100))]);
      return {
        xs: tf.tensor2d(xs),
        ys: tf.tensor2d(ys),
      };
    };

    const trainTensors = buildTensors(trainRecs);
    const valTensors = valRecs.length > 0 ? buildTensors(valRecs) : null;

    // Build model
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [numFeatures], units: 32, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }) }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 16, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }) }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' }),
      ],
    });

    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });

    const trainLosses: number[] = [];
    const valLosses: number[] = [];

    await model.fit(trainTensors.xs, trainTensors.ys, {
      epochs,
      batchSize: 32,
      shuffle: true,
      validationData: valTensors ? [valTensors.xs, valTensors.ys] : undefined,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          this.currentEpoch = epoch + 1;
          this.currentLoss = logs?.['loss'] ?? 0;
          trainLosses.push(parseFloat((logs?.['loss'] ?? 0).toFixed(4)));
          if (logs?.['val_loss'] != null) valLosses.push(parseFloat(logs['val_loss'].toFixed(4)));
        },
      },
    });

    // Cleanup tensors
    trainTensors.xs.dispose();
    trainTensors.ys.dispose();
    valTensors?.xs.dispose();
    valTensors?.ys.dispose();

    return { model, context, trainLosses, valLosses };
  }

  private extractFeatures(r: TrainingRecord): number[] {
    return [
      r.dayType === 'Weekday' ? 1 : 0,
      r.workHours, r.screenTimeHours, r.meetingsCount,
      r.breaksTaken, r.afterHoursWork ? 1 : 0,
      r.appSwitches, r.sleepHours, r.isolationIndex,
      r.taskCompletion ?? 80, r.fatigueScore,
    ];
  }

  private normalizeWithContext(features: number[], ctx: ModelContext): number[] {
    return features.map((v, i) => {
      const range = ctx.maxs[i] - ctx.mins[i];
      return range > 0 ? Math.min(1, Math.max(0, (v - ctx.mins[i]) / range)) : 0;
    });
  }

  private renderLossChart(trainLosses: number[], valLosses: number[]): void {
    setTimeout(() => {
      if (!this.lossChartRef) return;
      this.lossChart?.destroy();
      const labels = trainLosses.map((_, i) => `${i + 1}`);
      const datasets: Chart['data']['datasets'] = [
        { label: 'Train Loss', data: trainLosses, borderColor: '#673ab7', tension: 0.4, fill: false },
      ];
      if (valLosses.length) {
        datasets.push({ label: 'Val Loss', data: valLosses, borderColor: '#ff9800', tension: 0.4, fill: false });
      }
      this.lossChart = new Chart(this.lossChartRef.nativeElement, {
        type: 'line',
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }, 100);
  }
}
