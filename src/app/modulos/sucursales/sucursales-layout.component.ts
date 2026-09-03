import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-sucursales-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, SidebarComponent],
  templateUrl: './sucursales-layout.component.html',
  styleUrls: ['./sucursales-layout.component.scss']
})
export class SucursalesLayoutComponent {
  collapsed = false;
  menu = [
    { label: 'Listado', route: '/admin/sucursales', icon: 'bi bi-list' },
    { label: 'Secciones', route: '/admin/secciones', icon: 'bi bi-diagram-3' }
  ];

  constructor(private auth: AuthService) {
    const perms = this.auth.getPermissions() || [];
  }

  get tituloModulo(): string {
    return 'Sucursales';
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