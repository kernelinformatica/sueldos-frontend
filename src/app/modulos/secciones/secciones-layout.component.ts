import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-secciones-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, NavbarComponent, SidebarComponent],
  templateUrl: './secciones-layout.component.html',
  styleUrls: ['./secciones-layout.component.scss']
})
export class SeccionesLayoutComponent {
  collapsed = false;
  menu = [
    { label: 'Listado', route: '/admin/secciones', icon: 'bi bi-list' },
    { label: 'Nueva sección', route: '/admin/secciones/alta', icon: 'bi bi-plus-lg' },
    { label: 'Cargos', route: '/admin/cargos', icon: 'bi bi-briefcase' },
    { label: 'Sucursales', route: '/admin/sucursales', icon: 'bi bi-shop' }
  ];

  constructor(private auth: AuthService, private router: Router) {
    const perms = this.auth.getPermissions() || [];
    const has = (alias: string) => Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : (p?.alias === alias)));
    if (!has('secciones')) {
      this.menu = [];
      return;
    }

    this.menu = [{ label: 'Listado', route: '/admin/secciones', icon: 'bi bi-list' }];
    if (has('secciones_agregar')) {
      this.menu.push({ label: 'Nueva sección', route: '/admin/secciones/alta', icon: 'bi bi-plus-lg' });
    }
    this.menu.push({ label: 'Cargos', route: '/admin/cargos', icon: 'bi bi-briefcase' });
    this.menu.push({ label: 'Sucursales', route: '/admin/sucursales', icon: 'bi bi-shop' });
  }

  get user(): any { return this.auth.getUser(); }

  get sitioActual(): any {
    try {
      const sitios = JSON.parse(localStorage.getItem('sitios') || '[]');
      if (!Array.isArray(sitios)) return null;
      const sitioId = Number(localStorage.getItem('sitioId'));
      return sitios.find((s: any) => s.id === sitioId) || sitios[0] || null;
    } catch {
      return null;
    }
  }

}
