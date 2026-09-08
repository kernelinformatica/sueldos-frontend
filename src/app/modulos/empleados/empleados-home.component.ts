import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { EmpleadosDashboardService } from './empleados-dashboard.service';
import { LiquidacionesAnaliticaService } from './liquidaciones-analitica.service';
import { catchError, finalize, of, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-empleados-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './empleados-home.component.html',
  styleUrls: ['./empleados-home.component.scss']
})
export class EmpleadosHomeComponent implements OnInit {
  private readonly analyticsStorageKey = 'empleados-home-analytics';
  private readonly dotacionStorageKey = 'empleados-home-dotacion';

  loading = true;
  error = '';
  analyticsLoading = false;
  analyticsError = '';
  dotacionLoading = false;
  resumen: any = null;
  porEstado: any[] = [];
  porGenero: any[] = [];
  porSeccion: any[] = [];
  liquidacionesAnalitica: any = null;
  dotacionSeccionCargo: any[] = [];
  loadedFromApi = false;
  animatedTotal = 0;
  animatedActivos = 0;
  animatedInactivos = 0;
  animatedPromedioEdad = 0;
  animatedHombres = 0;
  animatedMujeres = 0;
  animatedAnaliticaPromedio = 0;
  animatedAnaliticaMaximo = 0;
  animatedAnaliticaMinimo = 0;
  animatedAnaliticaDiferencia = 0;

  constructor(
    private dashboardSvc: EmpleadosDashboardService,
    private liquidacionesSvc: LiquidacionesAnaliticaService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    const snapshot = this.dashboardSvc.getResumenSnapshot();
    if (snapshot && !snapshot?.error) {
      this.resumen = snapshot.resumen || {};
      this.porEstado = Array.isArray(snapshot.por_estado) ? snapshot.por_estado : [];
      this.porGenero = Array.isArray(snapshot.por_genero) ? snapshot.por_genero : [];
      this.porSeccion = Array.isArray(snapshot.por_seccion) ? snapshot.por_seccion : [];
      this.loadedFromApi = true;
      this.loading = false;
      this.animateMainCounters();
      this.scheduleSecondaryLoads();
    } else {
      this.loading = true;
    }

    this.hydrateAnalyticsFromSession();
    this.hydrateDotacionFromSession();

    this.dashboardSvc.getResumen().subscribe({
      next: (res: any) => {
        if (res?.error) {
          this.error = 'No se pudo cargar el dashboard de empleados.';
          this.loading = false;
          return;
        }
        this.resumen = res?.resumen || {};
        this.porEstado = Array.isArray(res?.por_estado) ? res.por_estado : [];
        this.porGenero = Array.isArray(res?.por_genero) ? res.por_genero : [];
        this.porSeccion = Array.isArray(res?.por_seccion) ? res.por_seccion : [];
        this.loadedFromApi = true;
        this.loading = false;
        this.animateMainCounters();
        this.scheduleSecondaryLoads();
      },
      error: () => {
        this.error = 'No se pudo cargar el dashboard de empleados.';
        this.loading = false;
      }
    });
  }

  scheduleSecondaryLoads(): void {
    if (this.analyticsLoading || this.liquidacionesAnalitica) {
      return;
    }

    setTimeout(() => {
      if (!this.analyticsLoading && !this.analyticsError && !this.liquidacionesAnalitica) {
        this.loadSecondaryAnalytics();
      }
    }, 900);
  }

  loadDotacionSeccionCargo(): void {
    this.dotacionLoading = true;
    this.http.get<any>(`${environment.apiUrl}/api/empleados`).pipe(
      timeout(15000),
      catchError(() => of([])),
      finalize(() => {
        this.dotacionLoading = false;
      })
    ).subscribe((res) => {
      const rows = Array.isArray(res) ? res : (res?.empleados || res?.data || []);
      const grouped = new Map<string, { seccion: string; cargo: string; total: number }>();

      for (const item of rows as any[]) {
        const seccion = String(item?.seccion?.nombre || item?.seccion_nombre || item?.seccion || 'Sin sección').trim() || 'Sin sección';
        const cargo = String(item?.cargo?.nombre || item?.cargo_nombre || item?.cargo || 'Sin cargo').trim() || 'Sin cargo';
        const key = `${this.normalize(seccion)}|${this.normalize(cargo)}`;
        const current = grouped.get(key) || { seccion, cargo, total: 0 };
        current.total += 1;
        grouped.set(key, current);
      }

      this.dotacionSeccionCargo = [...grouped.values()].sort((a, b) => b.total - a.total).slice(0, 8);
      sessionStorage.setItem(this.dotacionStorageKey, JSON.stringify(this.dotacionSeccionCargo));
    });
  }

  loadSecondaryAnalytics(): void {
    this.analyticsLoading = true;
    this.analyticsError = '';
    this.liquidacionesSvc.getResumen().subscribe({
      next: (res: any) => {
        if (res?.error) {
          this.analyticsError = 'No se pudo cargar la analítica de liquidaciones.';
          this.liquidacionesAnalitica = null;
          this.analyticsLoading = false;
          return;
        }
        this.liquidacionesAnalitica = res || {};
        sessionStorage.setItem(this.analyticsStorageKey, JSON.stringify(this.liquidacionesAnalitica));
        this.analyticsLoading = false;
        this.animateAnalyticsCounters();
        if (!this.dotacionSeccionCargo.length && !this.dotacionLoading) {
          setTimeout(() => this.loadDotacionSeccionCargo(), 700);
        }
        this.scheduleSecondaryLoads();
      },
      error: () => {
        this.analyticsError = 'No se pudo cargar la analítica de liquidaciones.';
        this.analyticsLoading = false;
        if (!this.dotacionSeccionCargo.length && !this.dotacionLoading) {
          setTimeout(() => this.loadDotacionSeccionCargo(), 700);
        }
      }
    });
  }

  hydrateAnalyticsFromSession(): void {
    try {
      const raw = sessionStorage.getItem(this.analyticsStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && !parsed.error) {
        this.liquidacionesAnalitica = parsed;
        this.analyticsLoading = false;
      }
    } catch {
      // ignore session parse errors
    }
  }

  hydrateDotacionFromSession(): void {
    try {
      const raw = sessionStorage.getItem(this.dotacionStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.dotacionSeccionCargo = parsed;
        this.dotacionLoading = false;
      }
    } catch {
      // ignore session parse errors
    }
  }

  get total(): number { return Number(this.resumen?.total ?? 0); }
  get activos(): number { return Number(this.resumen?.activos ?? 0); }
  get inactivos(): number { return Number(this.resumen?.inactivos ?? 0); }
  get hombres(): number { return Number(this.resumen?.hombres ?? 0); }
  get mujeres(): number { return Number(this.resumen?.mujeres ?? 0); }
  get promedioEdad(): number { return Number(this.resumen?.promedio_edad ?? 0); }
  get totalEstado(): number { return this.porEstado.reduce((acc, item) => acc + Number(item?.total ?? 0), 0); }
  get totalGenero(): number { return this.porGenero.reduce((acc, item) => acc + Number(item?.total ?? 0), 0); }

  get activeRate(): number { return this.total ? Math.round((this.activos / this.total) * 100) : 0; }
  get inactiveRate(): number { return this.total ? 100 - this.activeRate : 0; }
  get maleRate(): number { return (this.hombres + this.mujeres) ? Math.round((this.hombres / (this.hombres + this.mujeres)) * 100) : 0; }
  get femaleRate(): number { return (this.hombres + this.mujeres) ? 100 - this.maleRate : 0; }
  get activeSegmentPct(): number { return this.totalEstado ? Math.round(((this.porEstado.find((item) => this.normalize(item?.codigo) === 'activo')?.total ?? this.activos) / this.totalEstado) * 100) : this.activeRate; }
  get maleSegmentPct(): number { return this.totalGenero ? Math.round(((this.porGenero.find((item) => this.normalize(item?.codigo) === 'm')?.total ?? this.hombres) / this.totalGenero) * 100) : this.maleRate; }

  animateMainCounters(): void {
    this.animateValue('animatedTotal', this.total);
    this.animateValue('animatedActivos', this.activos);
    this.animateValue('animatedInactivos', this.inactivos);
    this.animateValue('animatedPromedioEdad', this.promedioEdad);
    this.animateValue('animatedHombres', this.hombres);
    this.animateValue('animatedMujeres', this.mujeres);
  }

  animateAnalyticsCounters(): void {
    this.animateValue('animatedAnaliticaPromedio', Number(this.liquidacionesAnalitica?.promedio ?? 0));
    this.animateValue('animatedAnaliticaMaximo', Number(this.liquidacionesAnalitica?.maximo ?? 0));
    this.animateValue('animatedAnaliticaMinimo', Number(this.liquidacionesAnalitica?.minimo ?? 0));
    this.animateValue('animatedAnaliticaDiferencia', Number(this.liquidacionesAnalitica?.diferencia ?? 0));
  }

  displayAnimatedValue(animatedValue: number, rawValue: number): number {
    return rawValue > 0 ? (animatedValue > 0 ? animatedValue : rawValue) : animatedValue;
  }

  displayAnalyticsValue(animatedValue: number, rawValue: number): number {
    return rawValue > 0 ? (animatedValue > 0 ? animatedValue : rawValue) : animatedValue;
  }

  accumulatedSectorItems(): any[] {
    const items = Array.isArray(this.liquidacionesAnalitica?.por_sector) ? this.liquidacionesAnalitica.por_sector : [];
    let cumulative = 0;
    return [...items]
      .sort((a, b) => Number(b?.porcentaje_total ?? 0) - Number(a?.porcentaje_total ?? 0))
      .map((item) => {
        const pct = Number(item?.porcentaje_total ?? 0);
        cumulative += pct;
        return {
          ...item,
          porcentaje_acumulado: Math.min(cumulative, 100)
        };
      });
  }

  accumulatedSectorMax(): number {
    return Math.max(...this.accumulatedSectorItems().map((item) => Number(item?.porcentaje_acumulado ?? 0)), 1);
  }

  accumulatedSectorBarWidth(value: any): string {
    const current = Number(value ?? 0);
    return `${Math.max(8, Math.round((current / this.accumulatedSectorMax()) * 100))}%`;
  }

  accumulatedEmployeeItems(): any[] {
    const items = Array.isArray(this.liquidacionesAnalitica?.top_salarios) ? this.liquidacionesAnalitica.top_salarios : [];
    const grouped = new Map<string, { empleado: string; sueldo: number }>();
    for (const item of items) {
      const key = this.normalize(item?.empleado);
      const current = grouped.get(key) || { empleado: String(item?.empleado || '').trim(), sueldo: 0 };
      current.sueldo += Number(item?.sueldo ?? 0);
      grouped.set(key, current);
    }
    let cumulative = 0;
    const sorted = [...grouped.values()].sort((a, b) => Number(b?.sueldo ?? 0) - Number(a?.sueldo ?? 0)).slice(0, 5);
    const total = sorted.reduce((acc, item) => acc + Number(item?.sueldo ?? 0), 0) || 1;
    return sorted.map((item) => {
      const pct = (Number(item?.sueldo ?? 0) / total) * 100;
      cumulative += pct;
      return {
        ...item,
        porcentaje_acumulado: Math.min(cumulative, 100)
      };
    });
  }

  displayEmployeeAccumulatedLabel(item: any): string {
    const sueldo = Number(item?.sueldo ?? 0);
    return `${item?.empleado || '-'} · ${sueldo.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  accumulatedEmployeeMax(): number {
    return Math.max(...this.accumulatedEmployeeItems().map((item) => Number(item?.porcentaje_acumulado ?? 0)), 1);
  }

  accumulatedEmployeeBarWidth(value: any): string {
    const current = Number(value ?? 0);
    return `${Math.max(8, Math.round((current / this.accumulatedEmployeeMax()) * 100))}%`;
  }

  animateValue(field: keyof EmpleadosHomeComponent, targetValue: number, duration = 800): void {
    const startValue = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const current = Math.round(startValue + (targetValue - startValue) * progress);
      (this as any)[field] = current;
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  donutStyle(primary: string, secondary: string, pct: number): any {
    return { background: `conic-gradient(${primary} 0 ${pct}%, ${secondary} ${pct}% 100%)` };
  }

  barWidth(total: number): string {
    const max = Math.max(...this.porSeccion.map((item) => Number(item.total ?? 0)), 1);
    return `${Math.max(6, Math.round((Number(total) / max) * 100))}%`;
  }

  topSections(limit = 5): any[] {
    return [...this.porSeccion].sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0)).slice(0, limit);
  }

  displaySectionName(item: any): string {
    const name = String(item?.nombre || '').trim();
    return name || 'Sin sección';
  }

  displaySeccionCargoLabel(item: any): string {
    return `${item?.seccion || 'Sin sección'} · ${item?.cargo || 'Sin cargo'}`;
  }

  maxDotacionSeccionCargo(): number {
    return Math.max(...this.dotacionSeccionCargo.map((item) => Number(item?.total ?? 0)), 1);
  }

  dotacionSeccionCargoWidth(total: number): string {
    return `${Math.max(8, Math.round((Number(total) / this.maxDotacionSeccionCargo()) * 100))}%`;
  }

  normalize(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }
}
