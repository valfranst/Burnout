import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'analysis',
    loadComponent: () => import('./features/analysis/analysis.component').then(m => m.AnalysisComponent),
    canActivate: [authGuard],
  },
  {
    path: 'training',
    loadComponent: () => import('./features/training/training.component').then(m => m.TrainingComponent),
    canActivate: [authGuard],
  },
  {
    path: 'report',
    loadComponent: () => import('./features/report/report.component').then(m => m.ReportComponent),
  },
  { path: '**', redirectTo: '/dashboard' },
];

