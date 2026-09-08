import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { FloatingQuickAccessComponent } from '../../core/layout/floating-quick-access.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-sueldos-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, SidebarComponent, FloatingQuickAccessComponent],
  templateUrl: './sueldos-layout.component.html',
  styleUrls: ['./sueldos-layout.component.scss']
})
export class SueldosLayoutComponent {
  collapsed = false;
  menu: Array<{ label: string; route: string; icon: string }> = [];

  constructor(private auth: AuthService, private router: Router) {
    const perms = this.auth.getPermissions() || [];
    const has = (alias: string): boolean => Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
    const canEnter = has('sueldos') || has('sueldos_liquidar') || has('sueldos_liquidaciones');
    if (!canEnter) {
      this.menu = [];
      return;
    }

    this.menu = [
      { label: 'Inicio', route: '/sueldos', icon: 'bi bi-house' }
    ];

    if (has('sueldos_liquidar')) {
      this.menu.push({ label: 'Liquidar', route: '/sueldos/liquidar', icon: 'bi bi-cash-stack' });
    }

    if (has('sueldos_liquidaciones')) {
      this.menu.push({ label: 'Listado de liquidaciones', route: '/sueldos/listado', icon: 'bi bi-card-list' });
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

  goTo(path: string): void {
    this.router.navigateByUrl(path);
  }
}