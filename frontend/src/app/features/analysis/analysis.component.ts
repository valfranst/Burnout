import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { NgClass } from '@angular/common';
import { BurnoutService } from '../../core/services/burnout.service';
import { ModelCacheService } from '../../core/services/model-cache.service';
import { BurnoutLogResponse } from '../../shared/models/models';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSliderModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatDividerModule,
    NgClass,
    NavbarComponent,
  ],
  template: `
    <app-navbar />
    <div class="analysis-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title><mat-icon>add_circle</mat-icon> Novo Registro Diário</mat-card-title>
          <mat-card-subtitle>Registre suas métricas comportamentais do dia</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-grid">
              <!-- Day type -->
              <mat-form-field appearance="outline">
                <mat-label>Tipo de Dia</mat-label>
                <mat-select formControlName="dayType">
                  <mat-option value="Weekday">Dia de Semana</mat-option>
                  <mat-option value="Weekend">Final de Semana</mat-option>
                </mat-select>
              </mat-form-field>

              <!-- Date -->
              <mat-form-field appearance="outline">
                <mat-label>Data</mat-label>
                <input matInput type="date" formControlName="dataRegistro" />
              </mat-form-field>
            </div>

            <mat-divider class="section-divider" />
            <h3>📊 Métricas Comportamentais</h3>

            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Horas de Trabalho</mat-label>
                <input matInput type="number" min="0.5" max="18" step="0.5" formControlName="workHours" />
                <mat-hint>0.5–18h</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Tempo de Tela (h)</mat-label>
                <input matInput type="number" min="0" max="18" step="0.5" formControlName="screenTimeHours" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Reuniões</mat-label>
                <input matInput type="number" min="0" max="30" formControlName="meetingsCount" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Troca de Apps</mat-label>
                <input matInput type="number" min="0" max="500" formControlName="appSwitches" />
                <mat-hint>Indicador de multitarefa</mat-hint>
              </mat-form-field>

              <mat-checkbox formControlName="afterHoursWork" class="checkbox-field">
                Trabalho após expediente
              </mat-checkbox>
            </div>

            <mat-divider class="section-divider" />
            <h3>🧠 Métricas Psicológicas</h3>

            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Horas de Sono</mat-label>
                <input matInput type="number" min="0" max="12" step="0.5" formControlName="sleepHours" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Pausas Realizadas</mat-label>
                <input matInput type="number" min="0" max="20" formControlName="breaksTaken" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Completude de Tarefas (%)</mat-label>
                <input matInput type="number" min="0" max="100" formControlName="taskCompletion" />
              </mat-form-field>

              <div class="slider-field">
                <label>Índice de Isolamento: {{ form.value.isolationIndex }}</label>
                <mat-slider min="3" max="9" step="1">
                  <input matSliderThumb formControlName="isolationIndex" />
                </mat-slider>
                <span class="hint-text">3=muito conectado, 9=muito isolado</span>
              </div>

              <div class="slider-field">
                <label>Score de Fadiga: {{ form.value.fatigueScore }}</label>
                <mat-slider min="0" max="10" step="0.5">
                  <input matSliderThumb formControlName="fatigueScore" />
                </mat-slider>
                <span class="hint-text">0=descansado, 10=exausto</span>
              </div>
            </div>

            @if (errorMessage) {
              <p class="error-msg">{{ errorMessage }}</p>
            }

            <div class="form-actions">
              <button mat-flat-button color="primary" type="submit" [disabled]="loading">
                @if (loading) {
                  <mat-progress-spinner diameter="20" mode="indeterminate" />
                } @else {
                  <ng-container><mat-icon>save</mat-icon> Salvar Registro</ng-container>
                }
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      @if (result) {
        <mat-card class="result-card">
          <mat-card-header>
            <mat-card-title>✅ Análise Concluída</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="result-grid">
              <div class="result-item">
                <div class="result-value">{{ result.burnoutScore }}</div>
                <div class="result-label">Score de Burnout</div>
              </div>
              <div class="result-item">
                <div class="result-value" [ngClass]="riskClass(result.burnoutRisk)">{{ result.burnoutRisk }}</div>
                <div class="result-label">Nível de Risco</div>
              </div>
              <div class="result-item">
                <div class="result-value">{{ result.archetype || '—' }}</div>
                <div class="result-label">Arquétipo</div>
              </div>
            </div>
            @if (clientScore !== null) {
              <p class="client-score">
                🤖 Score do modelo TF.js (browser): <strong>{{ clientScore }}</strong>
              </p>
            }
          </mat-card-content>
          <mat-card-actions>
            <button mat-flat-button color="primary" (click)="goToDashboard()">
              <mat-icon>dashboard</mat-icon> Ver Dashboard
            </button>
          </mat-card-actions>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .analysis-container { padding: 1.5rem; max-width: 900px; margin: 0 auto; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .section-divider { margin: 1.5rem 0 0.5rem; }
    .checkbox-field { align-self: center; }
    .slider-field { display: flex; flex-direction: column; gap: 0.25rem; }
    .slider-field label { font-size: 0.875rem; color: rgba(0,0,0,0.6); }
    .hint-text { font-size: 0.75rem; color: rgba(0,0,0,0.54); }
    .form-actions { display: flex; justify-content: flex-end; margin-top: 1.5rem; }
    .error-msg { color: #f44336; }
    .result-card { margin-top: 1.5rem; }
    .result-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align: center; }
    .result-value { font-size: 2rem; font-weight: 700; }
    .result-label { font-size: 0.8rem; color: rgba(0,0,0,0.54); }
    .risk-low { color: #4caf50; }
    .risk-medium { color: #ff9800; }
    .risk-high { color: #f44336; }
    .client-score { margin-top: 1rem; font-size: 0.875rem; color: rgba(0,0,0,0.7); }
  `],
})
export class AnalysisComponent {
  private readonly burnout = inject(BurnoutService);
  private readonly modelCache = inject(ModelCacheService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    dayType: ['Weekday'],
    dataRegistro: [new Date().toISOString().slice(0, 10)],
    workHours: [8, [Validators.required, Validators.min(0.5), Validators.max(18)]],
    screenTimeHours: [6, [Validators.required, Validators.min(0), Validators.max(18)]],
    meetingsCount: [3, [Validators.required, Validators.min(0), Validators.max(30)]],
    appSwitches: [50, [Validators.required, Validators.min(0), Validators.max(500)]],
    afterHoursWork: [false],
    sleepHours: [7, [Validators.required, Validators.min(0), Validators.max(12)]],
    isolationIndex: [5, [Validators.required, Validators.min(3), Validators.max(9)]],
    fatigueScore: [5, [Validators.required, Validators.min(0), Validators.max(10)]],
    breaksTaken: [3, [Validators.required, Validators.min(0), Validators.max(20)]],
    taskCompletion: [80, [Validators.min(0), Validators.max(100)]],
  });

  loading = false;
  errorMessage = '';
  result?: BurnoutLogResponse;
  clientScore: number | null = null;

  riskClass(risk?: string): string {
    return risk ? `risk-${risk.toLowerCase()}` : '';
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading = true;
    this.errorMessage = '';
    try {
      const v = this.form.getRawValue();
      this.result = await this.burnout.submitLog({
        dayType: v.dayType,
        workHours: v.workHours,
        screenTimeHours: v.screenTimeHours,
        meetingsCount: v.meetingsCount,
        appSwitches: v.appSwitches,
        afterHoursWork: v.afterHoursWork,
        sleepHours: v.sleepHours,
        isolationIndex: v.isolationIndex,
        fatigueScore: v.fatigueScore,
        breaksTaken: v.breaksTaken,
        taskCompletion: v.taskCompletion,
        dataRegistro: v.dataRegistro,
      });

      // Try client-side TF.js prediction
      if (await this.modelCache.ensureModelLoaded()) {
        const features = [
          v.dayType === 'Weekday' ? 1 : 0,
          v.workHours, v.screenTimeHours, v.meetingsCount,
          v.breaksTaken, v.afterHoursWork ? 1 : 0,
          v.appSwitches, v.sleepHours, v.isolationIndex,
          v.taskCompletion, v.fatigueScore,
        ];
        this.clientScore = await this.modelCache.predict(features);
      }
    } catch (err: unknown) {
      this.errorMessage = (err as { error?: { error?: string } })?.error?.error ?? 'Erro ao salvar registro.';
    } finally {
      this.loading = false;
    }
  }
}
