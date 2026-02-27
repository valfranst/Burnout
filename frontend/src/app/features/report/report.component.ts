import { Component, OnInit, ViewChild, ElementRef, OnDestroy, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import Chart from 'chart.js/auto';
import { BurnoutService } from '../../core/services/burnout.service';
import { PublicReport } from '../../shared/models/models';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [MatCardModule, MatProgressSpinnerModule, MatIconModule, DecimalPipe, NavbarComponent],
  template: `
    <app-navbar />
    <div class="report-container">
      <h1 class="page-title"><mat-icon>bar_chart</mat-icon> Relatório Público</h1>

      @if (loading) {
        <div class="loading-center">
          <mat-progress-spinner mode="indeterminate" diameter="48" />
        </div>
      }

      @if (report && !loading) {
        <!-- Overall stats -->
        <div class="stats-grid">
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ report.overall.totalRecords }}</div>
              <div class="stat-label">Total de Registros</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ report.overall.totalUsers }}</div>
              <div class="stat-label">Usuários</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ report.overall.avgBurnoutScore | number:'1.1-1' }}</div>
              <div class="stat-label">Score Médio</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ report.overall.avgWorkHours | number:'1.1-1' }}h</div>
              <div class="stat-label">Horas/Dia</div>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- Charts row -->
        <div class="charts-row">
          <mat-card>
            <mat-card-header><mat-card-title>Distribuição de Risco</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="chart-container"><canvas #riskChart></canvas></div>
            </mat-card-content>
          </mat-card>

          <mat-card>
            <mat-card-header><mat-card-title>Distribuição de Arquétipos</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="chart-container"><canvas #archetypeChart></canvas></div>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- 30-day trend -->
        @if (report.trend30Days?.length) {
          <mat-card class="section-card">
            <mat-card-header><mat-card-title>Tendência 30 Dias</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="chart-container-wide"><canvas #trendChart></canvas></div>
            </mat-card-content>
          </mat-card>
        }
      }
    </div>
  `,
  styles: [`
    .report-container { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
    .page-title { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
    .loading-center { display: flex; justify-content: center; padding: 3rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stat-card mat-card-content { text-align: center; padding: 1rem; }
    .stat-value { font-size: 2rem; font-weight: 700; }
    .stat-label { font-size: 0.8rem; color: rgba(0,0,0,0.54); }
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    .chart-container { height: 250px; }
    .chart-container-wide { height: 300px; }
    .section-card { margin-bottom: 1.5rem; }
    @media (max-width: 768px) { .charts-row { grid-template-columns: 1fr; } }
  `],
})
export class ReportComponent implements OnInit, OnDestroy {
  @ViewChild('riskChart') riskChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('archetypeChart') archetypeChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;

  private readonly burnout = inject(BurnoutService);
  report?: PublicReport;
  loading = true;
  private charts: Chart[] = [];

  async ngOnInit(): Promise<void> {
    try {
      this.report = await this.burnout.getPublicReport();
    } finally {
      this.loading = false;
      setTimeout(() => this.initCharts(), 50);
    }
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
  }

  private initCharts(): void {
    if (!this.report) return;

    if (this.riskChartRef && this.report.riskDistribution?.length) {
      const chart = new Chart(this.riskChartRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels: this.report.riskDistribution.map(r => r.burnoutRisk),
          datasets: [{
            data: this.report.riskDistribution.map(r => r.total),
            backgroundColor: ['#4caf50', '#ff9800', '#f44336'],
          }],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
      this.charts.push(chart);
    }

    if (this.archetypeChartRef && this.report.archetypeDistribution?.length) {
      const chart = new Chart(this.archetypeChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: this.report.archetypeDistribution.map(a => a.archetype),
          datasets: [{
            label: 'Registros',
            data: this.report.archetypeDistribution.map(a => a.total),
            backgroundColor: ['#673ab7', '#3f51b5', '#2196f3', '#03a9f4'],
          }],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
      this.charts.push(chart);
    }

    if (this.trendChartRef && this.report.trend30Days?.length) {
      const chart = new Chart(this.trendChartRef.nativeElement, {
        type: 'line',
        data: {
          labels: this.report.trend30Days.map(t => t.dataRegistro.slice(0, 10)),
          datasets: [{
            label: 'Score Médio',
            data: this.report.trend30Days.map(t => t.avgBurnoutScore),
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
  }
}
