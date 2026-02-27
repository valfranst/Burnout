import { Component, OnInit, inject, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatBadgeModule } from '@angular/material/badge';
import { DatePipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import Chart from 'chart.js/auto';
import { BurnoutService } from '../../core/services/burnout.service';
import { ModelCacheService } from '../../core/services/model-cache.service';
import { DashboardData, LatestRecord } from '../../shared/models/models';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTableModule,
    MatPaginatorModule,
    MatBadgeModule,
    DatePipe,
    NgClass,
    RouterLink,
    NavbarComponent,
  ],
  template: `
    <app-navbar />
    <div class="dashboard-container">
      <h1 class="page-title"><mat-icon>dashboard</mat-icon> Meu Dashboard</h1>

      @if (loading) {
        <div class="loading-center">
          <mat-progress-spinner mode="indeterminate" diameter="48" />
          <p>Carregando dados...</p>
        </div>
      }

      @if (error) {
        <mat-card class="error-card">
          <mat-icon>error</mat-icon> {{ error }}
        </mat-card>
      }

      @if (data && !loading) {
        <!-- Summary cards -->
        <div class="stats-grid">
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ data.summary.totalRecords }}</div>
              <div class="stat-label">Registros (90d)</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ data.summary.avgBurnoutScore ?? '—' }}</div>
              <div class="stat-label">Score Médio</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">
                <span [ngClass]="riskClass(dominantRisk)">{{ dominantRisk || '—' }}</span>
              </div>
              <div class="stat-label">Risco Dominante</div>
            </mat-card-content>
          </mat-card>

          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ data.summary.dominantArchetype || '—' }}</div>
              <div class="stat-label">Arquétipo</div>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- Charts row -->
        @if (hasRecords) {
          <div class="charts-row">
            <mat-card>
              <mat-card-header><mat-card-title>Distribuição de Risco</mat-card-title></mat-card-header>
              <mat-card-content>
                <div class="chart-container"><canvas #riskChart></canvas></div>
              </mat-card-content>
            </mat-card>

            <mat-card>
              <mat-card-header>
                <mat-card-title>Tendência Temporal</mat-card-title>
                <mat-card-subtitle>{{ trendLabel }}</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <div class="chart-container"><canvas #trendChart></canvas></div>
              </mat-card-content>
            </mat-card>
          </div>
        }

        <!-- Anomalies -->
        @if (data.anomalies?.length) {
          <mat-card class="section-card">
            <mat-card-header><mat-card-title>⚠️ Anomalias Detectadas</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="chart-container"><canvas #anomalyChart></canvas></div>
            </mat-card-content>
          </mat-card>
        }

        <!-- Interventions -->
        @if (data.interventions) {
          <mat-card class="section-card">
            <mat-card-header><mat-card-title>☕ Eficácia de Pausas</mat-card-title></mat-card-header>
            <mat-card-content>
              <p>
                Score médio após dia com muitas pausas:
                <strong>{{ data.interventions.avgScoreAfterHighBreakDay }}</strong> |
                Após poucas pausas: <strong>{{ data.interventions.avgScoreAfterLowBreakDay }}</strong>
                <br/>
                Efeito: <strong>{{ data.interventions.interventionEffect }}</strong> —
                {{ data.interventions.effective ? '✅ Pausas ajudam' : '⚠️ Sem efeito claro' }}
              </p>
            </mat-card-content>
          </mat-card>
        }

        <!-- Latest records table -->
        @if (data.latestRecords?.length) {
          <mat-card class="section-card">
            <mat-card-header><mat-card-title>📋 Últimos Registros</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="table-container">
                <table mat-table [dataSource]="pagedRecords" class="records-table">
                  <ng-container matColumnDef="createdAt">
                    <th mat-header-cell *matHeaderCellDef>Data</th>
                    <td mat-cell *matCellDef="let r">{{ r.createdAt | date:'dd/MM/yyyy' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="burnoutScore">
                    <th mat-header-cell *matHeaderCellDef>Score</th>
                    <td mat-cell *matCellDef="let r">{{ r.burnoutScore ?? '—' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="burnoutRisk">
                    <th mat-header-cell *matHeaderCellDef>Risco</th>
                    <td mat-cell *matCellDef="let r">
                      <span [ngClass]="riskClass(r.burnoutRisk)">{{ r.burnoutRisk ?? '—' }}</span>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="archetype">
                    <th mat-header-cell *matHeaderCellDef>Arquétipo</th>
                    <td mat-cell *matCellDef="let r">{{ r.archetype ?? '—' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="fatigueScore">
                    <th mat-header-cell *matHeaderCellDef>Fadiga</th>
                    <td mat-cell *matCellDef="let r">{{ r.fatigueScore }}</td>
                  </ng-container>
                  <ng-container matColumnDef="workHours">
                    <th mat-header-cell *matHeaderCellDef>Horas Trab.</th>
                    <td mat-cell *matCellDef="let r">{{ r.workHours }}</td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
                </table>
              </div>

              <!-- Simple pagination -->
              <div class="pagination">
                <button mat-icon-button [disabled]="currentPage === 0" (click)="prevPage()">
                  <mat-icon>chevron_left</mat-icon>
                </button>
                <span>Página {{ currentPage + 1 }} de {{ totalPages }}</span>
                <button mat-icon-button [disabled]="currentPage >= totalPages - 1" (click)="nextPage()">
                  <mat-icon>chevron_right</mat-icon>
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        }

        <div class="actions">
          <button mat-flat-button color="primary" routerLink="/analysis">
            <mat-icon>add</mat-icon> Novo Registro
          </button>
          <button mat-stroked-button routerLink="/training">
            <mat-icon>model_training</mat-icon> Treinar Modelo
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .dashboard-container { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
    .page-title { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
    .loading-center { display: flex; flex-direction: column; align-items: center; padding: 3rem; gap: 1rem; }
    .error-card { background: #ffebee; display: flex; align-items: center; gap: 0.5rem; padding: 1rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stat-card mat-card-content { text-align: center; padding: 1rem; }
    .stat-value { font-size: 2rem; font-weight: 700; line-height: 1.2; }
    .stat-label { font-size: 0.8rem; color: rgba(0,0,0,0.54); margin-top: 0.25rem; }
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    .chart-container { height: 250px; position: relative; }
    .section-card { margin-bottom: 1.5rem; }
    .table-container { overflow-x: auto; }
    .records-table { width: 100%; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 0.5rem; }
    .actions { display: flex; gap: 1rem; margin-top: 1.5rem; }
    .risk-low { color: #4caf50; font-weight: 600; }
    .risk-medium { color: #ff9800; font-weight: 600; }
    .risk-high { color: #f44336; font-weight: 600; }
    @media (max-width: 768px) { .charts-row { grid-template-columns: 1fr; } }
  `],
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('riskChart') riskChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('anomalyChart') anomalyChartRef!: ElementRef<HTMLCanvasElement>;

  private readonly burnout = inject(BurnoutService);
  private readonly modelCache = inject(ModelCacheService);
  private readonly router = inject(Router);

  data?: DashboardData;
  loading = true;
  error = '';

  displayedColumns = ['createdAt', 'burnoutScore', 'burnoutRisk', 'archetype', 'fatigueScore', 'workHours'];
  currentPage = 0;
  pageSize = 10;

  private charts: Chart[] = [];
  private chartsInitialized = false;

  get hasRecords(): boolean {
    return (this.data?.summary.totalRecords ?? 0) > 0;
  }

  get dominantRisk(): string {
    if (!this.data) return '';
    const entries = Object.entries(this.data.summary.riskDistribution);
    return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }

  get trendLabel(): string {
    const t = this.data?.temporal.trend;
    const map: Record<string, string> = { improving: '📉 Melhorando', stable: '➡️ Estável', worsening: '📈 Piorando' };
    return t ? map[t] ?? t : '';
  }

  get pagedRecords(): LatestRecord[] {
    const records = this.data?.latestRecords ?? [];
    return records.slice(this.currentPage * this.pageSize, (this.currentPage + 1) * this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil((this.data?.latestRecords?.length ?? 0) / this.pageSize));
  }

  riskClass(risk?: string): string {
    if (!risk) return '';
    return `risk-${risk.toLowerCase()}`;
  }

  prevPage(): void { if (this.currentPage > 0) this.currentPage--; }
  nextPage(): void { if (this.currentPage < this.totalPages - 1) this.currentPage++; }

  async ngOnInit(): Promise<void> {
    try {
      this.data = await this.burnout.getDashboard();
      // Preload model in background
      this.modelCache.ensureModelLoaded().catch(console.warn);
    } catch (err: unknown) {
      const e = err as { status?: number; error?: { error?: string } };
      if (e?.status === 401) {
        this.router.navigate(['/login']);
        return;
      }
      this.error = e?.error?.error ?? 'Erro ao carregar dashboard.';
    } finally {
      this.loading = false;
    }
  }

  ngAfterViewInit(): void {
    if (this.data && !this.loading) this.initCharts();
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
  }

  private initCharts(): void {
    if (this.chartsInitialized || !this.data) return;
    this.chartsInitialized = true;

    // Risk doughnut chart
    if (this.riskChartRef) {
      const riskEntries = Object.entries(this.data.summary.riskDistribution);
      const chart = new Chart(this.riskChartRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels: riskEntries.map(([k]) => k),
          datasets: [{
            data: riskEntries.map(([, v]) => v),
            backgroundColor: ['#4caf50', '#ff9800', '#f44336'],
          }],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
      this.charts.push(chart);
    }

    // Trend line chart
    if (this.trendChartRef && this.data.temporal.weeklyAverages.length) {
      const chart = new Chart(this.trendChartRef.nativeElement, {
        type: 'line',
        data: {
          labels: this.data.temporal.weeklyAverages.map(w => w.week),
          datasets: [{
            label: 'Score Médio',
            data: this.data.temporal.weeklyAverages.map(w => w.avg),
            borderColor: '#673ab7',
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(103,58,183,0.1)',
          }],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
      this.charts.push(chart);
    }

    // Anomalies bar chart
    if (this.anomalyChartRef && this.data.anomalies?.length) {
      const chart = new Chart(this.anomalyChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: this.data.anomalies.map(a => a.createdAt.slice(0, 10)),
          datasets: [{
            label: 'Fadiga',
            data: this.data.anomalies.map(a => a.fatigueScore),
            backgroundColor: '#f44336',
          }],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
      this.charts.push(chart);
    }
  }
}
