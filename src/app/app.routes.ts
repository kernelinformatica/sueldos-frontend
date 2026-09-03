import { Routes } from '@angular/router';

import { LoginComponent } from './auth/login.component';

import { ModuleSelectorComponent } from './module-selector/module-selector.component';
import { AuthGuard } from './auth/auth.guard';


export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'modulos', component: ModuleSelectorComponent, canActivate: [AuthGuard] },
  { path: 'admin/empleados', canActivate: [AuthGuard], loadChildren: () => import('./modulos/empleados/empleados.routes').then(m => m.empleadosRoutes) },
  { path: 'admin/conceptos', canActivate: [AuthGuard], loadComponent: () => import('./modulos/conceptos/conceptos-layout.component').then(m => m.ConceptosLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./modulos/conceptos/conceptos.component').then(m => m.ConceptosComponent) },
      { path: 'alta', loadComponent: () => import('./modulos/conceptos/concepto-form.component').then(m => m.ConceptoFormComponent) },
      { path: 'editar/:id', loadComponent: () => import('./modulos/conceptos/concepto-form.component').then(m => m.ConceptoFormComponent) },
      { path: 'grupos', loadComponent: () => import('./modulos/conceptos/grupos.component').then(m => m.GruposComponent) },
      { path: 'grupos/alta', loadComponent: () => import('./modulos/conceptos/grupo-form.component').then(m => m.GrupoFormComponent) },
      { path: 'grupos/editar', loadComponent: () => import('./modulos/conceptos/grupo-form.component').then(m => m.GrupoFormComponent) },
      { path: 'grupos/relacionar', loadComponent: () => import('./modulos/conceptos/grupo-form.component').then(m => m.GrupoFormComponent) }
    ]
  },
  { path: 'admin/secciones', canActivate: [AuthGuard], loadComponent: () => import('./modulos/secciones/secciones-layout.component').then(m => m.SeccionesLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./modulos/secciones/secciones.component').then(m => m.SeccionesComponent) },
      { path: 'alta', loadComponent: () => import('./modulos/secciones/seccion-form.component').then(m => m.SeccionFormComponent) },
      { path: 'editar', loadComponent: () => import('./modulos/secciones/seccion-form.component').then(m => m.SeccionFormComponent) }
    ]
  },
  { path: 'admin/sucursales', canActivate: [AuthGuard], loadComponent: () => import('./modulos/sucursales/sucursales-layout.component').then(m => m.SucursalesLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./modulos/sucursales/sucursales.component').then(m => m.SucursalesComponent) },
      { path: 'alta', loadComponent: () => import('./modulos/sucursales/sucursal-form.component').then(m => m.SucursalFormComponent) },
      { path: 'editar', loadComponent: () => import('./modulos/sucursales/sucursal-form.component').then(m => m.SucursalFormComponent) }
    ]
  },
  { path: 'sueldos', canActivate: [AuthGuard], loadComponent: () => import('./modulos/sueldos/dashboard/dashboard.component').then(m => m.DashboardComponent) },
 
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
