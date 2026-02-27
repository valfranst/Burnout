import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AsyncPipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, AsyncPipe],
  template: `
    <mat-toolbar color="primary">
      <a routerLink="/" class="brand">
        <mat-icon>psychology</mat-icon>
        <span>Burnout Analysis</span>
      </a>

      <span class="spacer"></span>

      @if (auth.user$ | async; as user) {
        <button mat-button routerLink="/dashboard"><mat-icon>dashboard</mat-icon> Dashboard</button>
        <button mat-button routerLink="/analysis"><mat-icon>add_circle</mat-icon> Registrar</button>
        <button mat-button routerLink="/report"><mat-icon>bar_chart</mat-icon> Relatório</button>
        <button mat-button routerLink="/training"><mat-icon>model_training</mat-icon> Treinar</button>
        <button mat-icon-button [matMenuTriggerFor]="userMenu">
          <mat-icon>account_circle</mat-icon>
        </button>
        <mat-menu #userMenu>
          <button mat-menu-item disabled>{{ user.name || user.email }}</button>
          <button mat-menu-item (click)="logout()"><mat-icon>logout</mat-icon> Sair</button>
        </mat-menu>
      } @else {
        <button mat-button routerLink="/report"><mat-icon>bar_chart</mat-icon> Relatório</button>
        <button mat-button routerLink="/login"><mat-icon>login</mat-icon> Entrar</button>
        <button mat-flat-button color="accent" routerLink="/register">Cadastrar</button>
      }
    </mat-toolbar>
  `,
  styles: [`
    .brand { display: flex; align-items: center; gap: 0.5rem; color: white; text-decoration: none; font-size: 1.1rem; font-weight: 600; }
    .spacer { flex: 1; }
    mat-toolbar { position: sticky; top: 0; z-index: 100; }
  `],
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
