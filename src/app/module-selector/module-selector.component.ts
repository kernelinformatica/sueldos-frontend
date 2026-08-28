import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ModeloImputacionService } from '../core/modelo-imputacion.service';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { AuthService } from '../auth/auth.service';
import { app } from '../environments/environment';
import { FooterComponent } from '../core/footer/footer.component';

interface PermisoMenu {
  id?: number | string;
  nombre: string;
  descripcion?: string;
  alias?: string;
  modulo?: string;
  grupo?: string;
  icono?: string;
  router?: string;
  esMenu?: number | boolean;
  estado?: number | boolean;
  orden?: number;
  imagen?: string;
}

interface GrupoMenu {
  nombre: string;
  permisos: PermisoMenu[];
}

import { NavbarComponent } from '../core/layout/navbar.component';
@Component({
  selector: 'app-module-selector',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, FooterComponent, NavbarComponent],
  templateUrl: './module-selector.component.html',
  styleUrls: ['./module-selector.component.scss']
})
export class ModuleSelectorComponent implements OnInit {
  app: any = app;
  user: any;
  showUserMenu = false;
  showAlerts = false;
  showMessages = false;
  notificationsCount = 0;
  messagesCount = 0;

  grupos: GrupoMenu[] = [];
  hasVisibleMenus = false;
  loading = true;
  error = '';

  constructor(
    private router: Router,
    private auth: AuthService,
    private modeloImputacionService: ModeloImputacionService
  ) {
    this.user = this.auth.getUser();
  }

  ngOnInit() {
    this.loading = false;
    this.cargarPermisosMenu();
  }

  private cargarPermisosMenu() {
    const user = this.auth.getUser();
    const permisos = Array.isArray(user?.permisos) ? user.permisos : [];

    const visibles = permisos
      .filter((permiso: PermisoMenu) => Number(permiso?.estado ?? 1) !== 0)
      .filter((permiso: PermisoMenu) => (Number(permiso?.esMenu ?? 0) === 1) || permiso?.esMenu === true)
      .sort((a: PermisoMenu, b: PermisoMenu) => Number(a.orden ?? 0) - Number(b.orden ?? 0));

    const grupos = new Map<string, PermisoMenu[]>();
    for (const permiso of visibles) {
      const grupo = permiso.grupo || 'General';
      if (!grupos.has(grupo)) {
        grupos.set(grupo, []);
      }
      grupos.get(grupo)!.push(permiso);
    }

    this.grupos = Array.from(grupos.entries()).map(([nombre, permisosGrupo]) => ({
      nombre,
      permisos: permisosGrupo
    }));
    this.hasVisibleMenus = visibles.length > 0;

    this.user = user;
  }

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

  toggleUserMenu() {
    this.showUserMenu = !this.showUserMenu;
    this.showAlerts = false;
    this.showMessages = false;
  }

  seleccionar(permiso: PermisoMenu) {
    let destino = permiso.router || permiso.alias;
    // Map common aliases to routes
    if (!destino && permiso?.alias === 'conceptos') destino = 'admin/conceptos';
    if (permiso?.alias === 'conceptos' && !permiso.router) destino = 'admin/conceptos';
    // If alias is simply 'conceptos', navigate to admin/conceptos
    if (permiso?.alias === 'conceptos' && permiso?.router !== undefined) {
      destino = permiso.router || 'admin/conceptos';
    }
    if (!destino) return;

    this.modeloImputacionService.clearModeloImputacionCab();
    this.router.navigate([destino]);
  }

  logout() {
    this.auth.logout();
  }
}
