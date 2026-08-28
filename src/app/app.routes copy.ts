import { Routes } from '@angular/router';
import { AuthGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent) },
  { path: 'modulos', canActivate: [AuthGuard], loadComponent: () => import('./module-selector/module-selector.component').then(m => m.ModuleSelectorComponent) },
  // { path: 'modulos/gestion-web', canActivate: [AuthGuard], loadChildren: () => import('./modulos/gestion-web/gestion-web.routes').then(m => m.gestionWebRoutes) },
  { path: '', redirectTo: 'modulos', pathMatch: 'full' }
];
// Archivo innecesario, eliminado en refactorización
