import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { FloatingQuickAccessComponent } from '../../core/layout/floating-quick-access.component';
import { AuthService } from '../../auth/auth.service';

/**
 * Layout del módulo Impositivos. Reutiliza el navbar, sidebar y accesos
 * rápidos del sistema, y arma el menú según los permisos del usuario.
 * Dentro de este módulo vive la sección SICOS / ARCA.
 */
@Component({
  selector: 'app-impositivos-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, SidebarComponent, FloatingQuickAccessComponent],
  templateUrl: './impositivos-layout.component.html',
  styleUrls: ['./impositivos-layout.component.scss']
})
export class ImpositivosLayoutComponent {
  collapsed = false;
  menu: Array<{ label: string; route: string; icon: string }> = [];

  constructor(private auth: AuthService) {
    const perms = this.auth.getPermissions() || [];
    const has = (alias: string): boolean =>
      Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));


    // El módulo es visible si el usuario posee el permiso de Impositivos.
    const puedeImpositivos = has('impositivos');
    if (!puedeImpositivos) {
      this.menu = [];
      return;
    }

    this.menu = [
      { label: 'Inicio', route: '/admin/impositivos', icon: 'bi bi-house' },
      { label: 'Subsistemas', route: '/admin/impositivos/subsistemas', icon: 'bi bi-diagram-3' },
      { label: 'Relación AFIP', route: '/admin/impositivos/conceptos-afip', icon: 'bi bi-link-45deg' }
    ];

    // SICOS es una sección de Impositivos.
    const puedeSicoss = has('sicoss') || has('sicoss_crear') || has('sicoss_editar') ||
      has('sicoss_eliminar') || has('sicoss_exportar');
    if (puedeSicoss) {
      this.menu.push({ label: 'SICOS', route: '/admin/impositivos/sicoss', icon: 'bi bi-bank' });
    }
    if (has('sicoss_editar') || has('grupos_rela_conceptos') || has('grupos_editar')) {
      this.menu.push({ label: 'Config. SICOSS', route: '/admin/impositivos/sicoss/configuracion', icon: 'bi bi-gear' });
    }
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
