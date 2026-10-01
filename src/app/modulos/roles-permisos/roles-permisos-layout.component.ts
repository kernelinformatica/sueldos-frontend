import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-roles-permisos-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, SidebarComponent],
  template: `
    <div class="layout-shell">
      <app-navbar [user]="user" [sitioActual]="sitioActual" [sidebarCollapsed]="collapsed" (collapsedChange)="collapsed = $event"></app-navbar>
      <div class="layout-body">
        <app-sidebar [menu]="menu" [tituloModulo]="'Roles y Permisos'" [collapsed]="collapsed" (collapsedChange)="collapsed = $event"></app-sidebar>
        <main class="layout-main"><router-outlet></router-outlet></main>
      </div>
    </div>
  `,
  styles: [`
    .layout-shell {
      min-height: 100vh;
      background: #f6f8fb;
    }

    .layout-body {
      display: flex;
      min-height: calc(100vh - 60px);
      padding-top: 60px;
      margin-left: 220px;
    }

    .layout-main {
      flex: 1;
      min-width: 0;
      background: #f6f8fb;
      padding: 1rem;
    }

    .layout-body:has(.sidebar.collapsed) {
      margin-left: 60px;
    }

    @media (max-width: 991.98px) {
      .layout-body {
        margin-left: 0;
        padding-top: 56px;
      }
    }
  `]
})
export class RolesPermisosLayoutComponent {
  collapsed = false;
  menu = [{ label: 'Administración', route: '/admin/roles-permisos', icon: 'bi bi-shield-lock' }];
  constructor(private auth: AuthService) {}
  get user(): any { return this.auth.getUser(); }
  get sitioActual(): any { try { const sitios = JSON.parse(localStorage.getItem('sitios') || '[]'); if (!Array.isArray(sitios)) return null; const sitioId = Number(localStorage.getItem('sitioId')); return sitios.find((s: any) => s.id === sitioId) || sitios[0] || null; } catch { return null; } }
}
