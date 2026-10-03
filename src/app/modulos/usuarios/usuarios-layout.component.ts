import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-usuarios-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, SidebarComponent],
  templateUrl: './usuarios-layout.component.html',
  styleUrls: ['./usuarios-layout.component.scss']
})
export class UsuariosLayoutComponent {
  collapsed = false;
  menu = [
    { label: 'Listado', route: '/admin/usuarios', icon: 'bi bi-list' },
    { label: 'Nuevo usuario', route: '/admin/usuarios/nuevo', icon: 'bi bi-person-plus-fill' },
    { label: 'Mi contraseña', route: '/mi-perfil/cambiar-password', icon: 'bi bi-shield-lock' }
  ];

  constructor(private auth: AuthService) {
    const perms = this.auth.getPermissions() || [];
    const has = (alias: string): boolean => Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));

    if (!this.hasAnyUsersPerm()) {
      this.menu = [];
      return;
    }

    this.menu = [{ label: 'Listado', route: '/admin/usuarios', icon: 'bi bi-list' }];

    if (has('usuarios_crear')) {
      this.menu.push({ label: 'Nuevo usuario', route: '/admin/usuarios/nuevo', icon: 'bi bi-person-plus-fill' });
    }

    this.menu.push({ label: 'Mi contraseña', route: '/mi-perfil/cambiar-password', icon: 'bi bi-shield-lock' });
  }

  private hasAnyUsersPerm(): boolean {
    const perms = this.auth.getPermissions() || [];
    return Array.isArray(perms) && perms.some((p: any) => {
      const alias = String(typeof p === 'string' ? p : p?.alias || '').trim();
      return ['usuarios', 'usuarios_crear', 'usuarios_editar', 'usuarios_baja', 'usuarios_password', 'usuarios_reset_password', 'usuarios_desbloquear'].includes(alias);
    });
  }

  get user(): any { return this.auth.getUser(); }
}
