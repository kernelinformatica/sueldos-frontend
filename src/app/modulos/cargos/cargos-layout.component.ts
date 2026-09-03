import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-cargos-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, SidebarComponent],
  templateUrl: './cargos-layout.component.html',
  styleUrls: ['./cargos-layout.component.scss']
})
export class CargosLayoutComponent {
  collapsed = false;
  menu = [
    { label: 'Listado', route: '/admin/cargos', icon: 'bi bi-list' },
    { label: 'Nuevo cargo', route: '/admin/cargos/alta', icon: 'bi bi-plus-lg' },
    { label: 'Secciones', route: '/admin/secciones', icon: 'bi bi-diagram-3' },
    { label: 'Sucursales', route: '/admin/sucursales', icon: 'bi bi-shop' }
  ];

  constructor(private auth: AuthService, private router: Router) {
    const perms = this.auth.getPermissions() || [];
    const has = (alias: string): boolean => Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
    const canEnter = has('cargos') || has('cargos_agregar') || has('cargos_editar') || has('cargos_eliminar') || has('cargos_borrar') || has('cargos_relacionar');
    if (!canEnter) {
      this.menu = [];
      return;
    }

    this.menu = [{ label: 'Listado', route: '/admin/cargos', icon: 'bi bi-list' }];
    if (has('cargos_agregar')) {
      this.menu.push({ label: 'Nuevo cargo', route: '/admin/cargos/alta', icon: 'bi bi-plus-lg' });
    }
    this.menu.push({ label: 'Secciones', route: '/admin/secciones', icon: 'bi bi-diagram-3' });
    this.menu.push({ label: 'Sucursales', route: '/admin/sucursales', icon: 'bi bi-shop' });
  }

  get user(): any { return this.auth.getUser(); }

  goTo(path: string): void {
    this.router.navigateByUrl(path);
  }
}