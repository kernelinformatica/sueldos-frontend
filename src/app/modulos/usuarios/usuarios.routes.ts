import { Routes } from '@angular/router';
import { AuthGuard } from '../../auth/auth.guard';
import { UsuariosGuard } from './usuarios.guard';
import { UsuariosLayoutComponent } from './usuarios-layout.component';
import { UsuariosComponent } from './usuarios.component';
import { UsuarioFormComponent } from './usuario-form.component';
import { UsuarioPasswordComponent } from './usuario-password.component';

export const usuariosRoutes: Routes = [
  {
    path: '',
    component: UsuariosLayoutComponent,
    canActivate: [AuthGuard, UsuariosGuard],
    children: [
      { path: '', component: UsuariosComponent, data: { permiso: 'usuarios' } },
      { path: 'nuevo', component: UsuarioFormComponent, data: { permiso: 'usuarios_crear' } },
      { path: ':id/editar', component: UsuarioFormComponent, data: { permiso: 'usuarios_editar' } },
      { path: ':id/cambiar-password', component: UsuarioPasswordComponent, data: { permiso: 'usuarios_reset_password' } }
    ]
  }
];
