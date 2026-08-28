import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-conceptos-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, NavbarComponent, SidebarComponent],
  templateUrl: './conceptos-layout.component.html',
  styleUrls: ['./conceptos-layout.component.scss']
})
export class ConceptosLayoutComponent {
  collapsed = false;
  menu = [
    { label: 'Listado', route: '/admin/conceptos', icon: 'bi bi-list' },
    { label: 'Nuevo concepto', route: '/admin/conceptos/alta', icon: 'bi bi-plus-lg' }
  ];

  constructor(private auth: AuthService) {
    const perms = this.auth.getPermissions() || [];
    const has = (alias: string) => Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : (p?.alias === alias)));
    // example: show extra items based on permisos
    if (!has('conceptos')) {
      // hide menu items if no permiso
      this.menu = [];
    }
    // no automatic insertion of grupos into the main menu; sidebar will render Grupos separately when applicable
  }

  get user(): any { return this.auth.getUser(); }

  get sitioActual(): any {
    try {
      const sitios = JSON.parse(localStorage.getItem('sitios') || '[]');
      if (!Array.isArray(sitios)) return null;
      const sitioId = Number(localStorage.getItem('sitioId'));
      return sitios.find((s: any) => s.id === sitioId) || sitios[0] || null;
    } catch { return null; }
  }
}
