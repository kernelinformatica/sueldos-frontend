import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ModeloImputacionService } from '../core/modelo-imputacion.service';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { AuthService } from '../auth/auth.service';
import { app } from '../environments/environment';
import { FooterComponent } from '../core/footer/footer.component';
import { environment } from '../environments/environment';

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

interface PermissionCard extends PermisoMenu {
  itemCount?: number | null;
  itemLabel?: string;
}

interface DashboardModuleCount {
  label?: string;
  count?: number;
  estados?: Record<string, { label?: string; count?: number }>;
}

interface DashboardModuleEntry {
  label: string;
  count: number;
  estados?: Record<string, { label?: string; count?: number }>;
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

  grupos: Array<{ nombre: string; permisos: PermissionCard[] }> = [];
  hasVisibleMenus = false;
  loading = true;
  error = '';
  private dashboardCounts: Record<string, DashboardModuleEntry> = {};
  private readonly dashboardCountsCacheKey = 'dashboard_modulos_counts_cache';

  constructor(
    private router: Router,
    private auth: AuthService,
    private modeloImputacionService: ModeloImputacionService,
    private http: HttpClient
  ) {
    this.user = this.auth.getUser();
  }

  ngOnInit() {
    this.cargarPermisosMenu();
    this.loadCachedDashboardCounts();
    this.loading = false;
    this.cargarContadoresMenu();
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
    this.applyDashboardCountsToGroups();
    this.hasVisibleMenus = visibles.length > 0;

    this.user = user;
  }

  private cargarContadoresMenu(): void {
    this.http.get<any>(`${environment.apiUrl}/api/dashboard/modulos`).subscribe({
      next: (res) => {
        this.dashboardCounts = this.normalizeDashboardCounts(res?.data || res || {});
        this.saveDashboardCountsCache();
        this.applyDashboardCountsToGroups();
      },
      error: () => {
        this.dashboardCounts = this.normalizeDashboardCounts({});
        this.applyDashboardCountsToGroups();
      }
    });
  }

  private normalizeDashboardCounts(data: Record<string, DashboardModuleCount>): Record<string, DashboardModuleEntry> {
    const mapping: Record<string, { label: string; aliases: string[] }> = {
      empleados: { label: 'PLANTEL', aliases: ['empleados'] },
      cargos: { label: 'CANTIDAD', aliases: ['cargos'] },
      secciones: { label: 'CANTIDAD', aliases: ['secciones'] },
      sucursales: { label: 'CANTIDAD', aliases: ['sucursales'] },
      conceptos: { label: 'CANTIDAD', aliases: ['conceptos'] }
    };

    const resolved: Record<string, DashboardModuleEntry> = {};
    for (const [key, config] of Object.entries(mapping)) {
      const item = config.aliases.map((alias) => data?.[alias]).find(Boolean) || { count: 0, label: config.label };
      resolved[key] = {
        label: item?.label || config.label,
        count: Number(item?.count ?? 0) || 0,
        estados: data?.[key]?.estados
      };
    }

    return resolved;
  }

  private loadCachedDashboardCounts(): void {
    try {
      const stored = localStorage.getItem(this.dashboardCountsCacheKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return;
      this.dashboardCounts = parsed;
      this.applyDashboardCountsToGroups();
    } catch {
      // ignore cache errors
    }
  }

  private saveDashboardCountsCache(): void {
    try {
      localStorage.setItem(this.dashboardCountsCacheKey, JSON.stringify(this.dashboardCounts));
    } catch {
      // ignore cache errors
    }
  }

  private applyDashboardCountsToGroups(): void {
    this.grupos = this.grupos.map((grupo) => ({
      ...grupo,
      permisos: grupo.permisos.map((permiso) => {
        const normalizedAlias = String(permiso.alias || '').trim().toLowerCase();
        const normalizedGrupo = String(permiso.grupo || '').trim().toLowerCase();
        const normalizedModulo = String(permiso.modulo || '').trim().toLowerCase();
        const normalizedNombre = String(permiso.nombre || '').trim().toLowerCase();
        const badgeKey = Object.keys(this.dashboardCounts).find((key) => {
          return normalizedAlias === key
            || normalizedAlias.startsWith(`${key}_`)
            || normalizedAlias.includes(key)
            || normalizedGrupo === key
            || normalizedGrupo.includes(key)
            || normalizedModulo === key
            || normalizedModulo.includes(key)
            || normalizedNombre.includes(key)
            || key.includes(normalizedNombre);
        });
        const badge = badgeKey ? this.dashboardCounts[badgeKey] : null;
        return badge ? { ...permiso, itemCount: badge.count, itemLabel: badge.label } : permiso;
      })
    }));
  }

  countFor(key: string): number {
    return Number(this.dashboardCounts?.[key]?.count ?? 0) || 0;
  }

  labelFor(key: string, fallback: string): string {
    return String(this.dashboardCounts?.[key]?.label || fallback);
  }

  shouldShowEmployeeStats(permiso: PermisoMenu): boolean {
    return this.isEmployeesModule(permiso) || this.isEmployeeLikeText(permiso) || this.isEmployeeCardTitle(permiso);
  }

  getEmployeeStates(): Array<{ key: string; label: string; count: number }> {
    const empleados = this.dashboardCounts?.['empleados'];
    const estados = empleados?.estados || {};
    return Object.entries(estados)
      .map(([key, value]: [string, { label?: string; count?: number }]) => ({
        key,
        label: String(value?.label || this.humanizeStateKey(key)),
        count: Number(value?.count ?? 0) || 0
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }

  isEmployeesModule(permiso: PermisoMenu): boolean {
    const alias = String(permiso.alias || '').trim().toLowerCase();
    const modulo = String(permiso.modulo || '').trim().toLowerCase();
    const grupo = String(permiso.grupo || '').trim().toLowerCase();
    return alias.includes('empleado') || modulo.includes('empleado') || grupo.includes('empleado') || String(permiso.nombre || '').toLowerCase().includes('empleado');
  }

  private isEmployeeLikeText(permiso: PermisoMenu): boolean {
    const text = [permiso.nombre, permiso.descripcion, permiso.alias, permiso.modulo, permiso.grupo]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return text.includes('empleado') || text.includes('plantel') || text.includes('personal');
  }

  private isEmployeeCardTitle(permiso: PermisoMenu): boolean {
    return String(permiso.nombre || '').trim().toLowerCase() === 'empleados';
  }

  private humanizeStateKey(key: string): string {
    return String(key || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || 'Estado';
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
    const alias = String(permiso.alias || '').trim().toLowerCase();
    // Map common aliases to routes
    if (!destino && permiso?.alias === 'conceptos') destino = 'admin/conceptos';
    if (permiso?.alias === 'conceptos' && !permiso.router) destino = 'admin/conceptos';
    // If alias is simply 'conceptos', navigate to admin/conceptos
    if (permiso?.alias === 'conceptos' && permiso?.router !== undefined) {
      destino = permiso.router || 'admin/conceptos';
    }
    if (alias === 'sueldos' || alias === 'sueldos_liquidar' || alias === 'sueldos_liquidaciones') {
      destino = 'sueldos';
    }
    if (!destino) return;

    this.modeloImputacionService.clearModeloImputacionCab();
    this.router.navigate([destino]);
  }

  logout() {
    this.auth.logout();
  }
}
