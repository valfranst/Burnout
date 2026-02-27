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
  selector: 'app-register',
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
          <mat-card-title><mat-icon>person_add</mat-icon> Criar Conta</mat-card-title>
          <mat-card-subtitle>Registre-se gratuitamente</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Nome (opcional)</mat-label>
              <input matInput formControlName="name" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>E-mail</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Senha</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="new-password" />
              <mat-hint>Mínimo 8 caracteres, com letra e número</mat-hint>
            </mat-form-field>

            @if (errorMessage) {
              <p class="error-msg">{{ errorMessage }}</p>
            }
            @if (success) {
              <p class="success-msg">Conta criada! Redirecionando...</p>
            }

            <button mat-flat-button color="primary" type="submit" class="full-width submit-btn" [disabled]="loading">
              @if (loading) {
                <mat-progress-spinner diameter="20" mode="indeterminate" />
              } @else {
                Criar Conta
              }
            </button>
          </form>
        </mat-card-content>

        <mat-card-actions>
          <p>Já tem conta? <a routerLink="/login">Entrar</a></p>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .auth-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1rem; }
    .auth-card { width: 100%; max-width: 400px; }
    .full-width { width: 100%; }
    .submit-btn { margin-top: 1rem; padding: 1rem; }
    .error-msg { color: #f44336; font-size: 0.875rem; }
    .success-msg { color: #4caf50; font-size: 0.875rem; }
    mat-card-header { margin-bottom: 1rem; }
    mat-card-title { display: flex; align-items: center; gap: 0.5rem; }
  `],
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  loading = false;
  errorMessage = '';
  success = false;

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading = true;
    this.errorMessage = '';
    try {
      await this.auth.register(
        this.form.value.email!,
        this.form.value.password!,
        this.form.value.name || undefined
      );
      this.success = true;
      await this.auth.login(this.form.value.email!, this.form.value.password!);
      this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      this.errorMessage = (err as { error?: { error?: string } })?.error?.error ?? 'Erro ao criar conta.';
    } finally {
      this.loading = false;
    }
  }
}
