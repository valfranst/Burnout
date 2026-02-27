import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  template: `
    <div class="auth-container">
      <mat-card class="auth-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>psychology</mat-icon> Burnout Analysis
          </mat-card-title>
          <mat-card-subtitle>Faça login para acessar sua conta</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>E-mail</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email" />
              <mat-icon matSuffix>email</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Senha</mat-label>
              <input matInput [type]="hidePassword ? 'password' : 'text'" formControlName="password" autocomplete="current-password" />
              <button type="button" mat-icon-button matSuffix (click)="hidePassword = !hidePassword">
                <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>

            @if (errorMessage) {
              <p class="error-msg">{{ errorMessage }}</p>
            }

            <button mat-flat-button color="primary" type="submit" class="full-width submit-btn" [disabled]="loading">
              @if (loading) {
                <mat-progress-spinner diameter="20" mode="indeterminate" />
              } @else {
                Entrar
              }
            </button>
          </form>

          <div class="divider">ou</div>

          <a mat-stroked-button href="/api/auth/google" class="full-width google-btn">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20" />
            Continuar com Google
          </a>
        </mat-card-content>

        <mat-card-actions>
          <p>Não tem conta? <a routerLink="/register">Cadastre-se</a></p>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .auth-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1rem; }
    .auth-card { width: 100%; max-width: 400px; }
    .full-width { width: 100%; }
    .submit-btn { margin-top: 1rem; padding: 1rem; }
    .google-btn { margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem; justify-content: center; }
    .divider { text-align: center; margin: 1rem 0; color: rgba(0,0,0,0.54); }
    .error-msg { color: #f44336; font-size: 0.875rem; }
    mat-card-header { margin-bottom: 1rem; }
    mat-card-title { display: flex; align-items: center; gap: 0.5rem; }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  loading = false;
  hidePassword = true;
  errorMessage = '';

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading = true;
    this.errorMessage = '';
    try {
      await this.auth.login(this.form.value.email!, this.form.value.password!);
      this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      this.errorMessage = (err as { error?: { error?: string } })?.error?.error ?? 'Credenciais inválidas.';
    } finally {
      this.loading = false;
    }
  }
}
