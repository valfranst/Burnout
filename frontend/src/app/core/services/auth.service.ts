import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly userSubject = new BehaviorSubject<User | null>(null);

  readonly user$ = this.userSubject.asObservable();

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.userSubject.value !== null;
  }

  async loadCurrentUser(): Promise<void> {
    try {
      const user = await firstValueFrom(this.http.get<User>('/api/auth/me', { withCredentials: true }));
      this.userSubject.next(user);
    } catch {
      this.userSubject.next(null);
    }
  }

  async register(email: string, password: string, name?: string): Promise<void> {
    const headers = await this.getCsrfHeaders();
    await firstValueFrom(
      this.http.post('/api/auth/register', { email, password, name }, { headers, withCredentials: true })
    );
  }

  async login(email: string, password: string): Promise<void> {
    const headers = await this.getCsrfHeaders();
    const result = await firstValueFrom(
      this.http.post<{ message: string; userId: number }>(
        '/api/auth/login', { email, password }, { headers, withCredentials: true }
      )
    );
    await this.loadCurrentUser();
  }

  async logout(): Promise<void> {
    const headers = await this.getCsrfHeaders();
    await firstValueFrom(
      this.http.post('/api/auth/logout', {}, { headers, withCredentials: true })
    );
    this.userSubject.next(null);
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
