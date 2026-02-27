import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  BurnoutLogRequest,
  BurnoutLogResponse,
  DashboardData,
  PublicReport,
  TrainingRecord,
} from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class BurnoutService {
  private readonly http = inject(HttpClient);

  async submitLog(req: BurnoutLogRequest): Promise<BurnoutLogResponse> {
    const headers = await this.getCsrfHeaders();
    return firstValueFrom(
      this.http.post<BurnoutLogResponse>('/api/burnout-logs', req, { headers, withCredentials: true })
    );
  }

  getDashboard(): Promise<DashboardData> {
    return firstValueFrom(
      this.http.get<DashboardData>('/api/dashboard', { withCredentials: true })
    );
  }

  getPublicReport(): Promise<PublicReport> {
    return firstValueFrom(this.http.get<PublicReport>('/api/report'));
  }

  async getTrainingRecords(n: number): Promise<TrainingRecord[]> {
    const headers = await this.getCsrfHeaders();
    const result = await firstValueFrom(
      this.http.post<{ records: TrainingRecord[] }>('/api/treinamento', { numRecords: n }, { headers, withCredentials: true })
    );
    return result.records;
  }

  private async getCsrfHeaders(): Promise<HttpHeaders> {
    try {
      const { csrfToken } = await firstValueFrom(
        this.http.get<{ csrfToken: string }>('/api/csrf-token', { withCredentials: true })
      );
      return new HttpHeaders({ 'X-CSRF-TOKEN': csrfToken });
    } catch {
      return new HttpHeaders();
    }
  }
}
