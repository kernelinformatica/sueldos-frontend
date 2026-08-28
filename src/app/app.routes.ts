import { Routes } from '@angular/router';

import { LoginComponent } from './auth/login.component';

import { ModuleSelectorComponent } from './module-selector/module-selector.component';
import { AuthGuard } from './auth/auth.guard';
import { PermissionGuard } from './auth/permission.guard';


export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'modulos', component: ModuleSelectorComponent, canActivate: [AuthGuard] },
  { path: 'admin/empleados', canActivate: [AuthGuard], loadChildren: () => import('./modulos/empleados/empleados.routes').then(m => m.empleadosRoutes) },
  { path: 'admin/conceptos', canActivate: [AuthGuard], loadComponent: () => import('./modulos/conceptos/conceptos-layout.component').then(m => m.ConceptosLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./modulos/conceptos/conceptos.component').then(m => m.ConceptosComponent) },
      { path: 'alta', loadComponent: () => import('./modulos/conceptos/concepto-form.component').then(m => m.ConceptoFormComponent) },
      { path: 'editar/:id', loadComponent: () => import('./modulos/conceptos/concepto-form.component').then(m => m.ConceptoFormComponent) },
      { path: 'grupos', loadComponent: () => import('./modulos/conceptos/grupos.component').then(m => m.GruposComponent), canActivate: [AuthGuard, PermissionGuard], data: { permiso: 'grupos' } },
      { path: 'grupos/alta', loadComponent: () => import('./modulos/conceptos/grupo-form.component').then(m => m.GrupoFormComponent), canActivate: [AuthGuard, PermissionGuard], data: { permiso: 'grupos_crear' } },
      { path: 'grupos/editar/:id', loadComponent: () => import('./modulos/conceptos/grupo-form.component').then(m => m.GrupoFormComponent), canActivate: [AuthGuard, PermissionGuard], data: { permiso: 'grupos_editar' } }
    ]
  },
  { path: 'sueldos', canActivate: [AuthGuard], loadComponent: () => import('./modulos/sueldos/dashboard/dashboard.component').then(m => m.DashboardComponent) },

  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
