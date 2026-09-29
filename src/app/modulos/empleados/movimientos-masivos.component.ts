import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { EmpleadosConceptosService } from './empleados-conceptos.service';
import { AuthService } from '../../auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { ModalFotos } from '../../shared/modal-fotos/modal-fotos';
import { LiquidacionesAnaliticaService } from './liquidaciones-analitica.service';
import { Router } from '@angular/router';

interface EmpleadoItem {
  id: number;
  empleado_id?: number;
  empresa_id?: number;
  sucursal_id?: number;
  seccion_id?: number;
  cargo_id?: number;
  usuario_id?: number;
  legajo?: string;
  tipo_documento?: string;
  numero_documento?: string;
  apellido?: string;
  nombre?: string;
  fecha_nacimiento?: string | null;
  sexo?: string;
  estado_civil?: string;
  nacionalidad?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  email?: string;
  telefono?: string;
  fecha_ingreso?: string | null;
  fecha_egreso?: string | null;
  foto?: string | null;
  habilitado?: number;
  estado?: string | number | EstadoEmpleadoValue;
  foto_url_publica?: string | null;
  url_publica?: string | null;
  empresa?: {
    nombre?: string;
    nombre_fantasia?: string;
    cuit?: string;
  };
  cargo?: {
    cargo_id?: number;
    nombre?: string;
    descripcion?: string | null;
  };
  seccion?: {
    seccion_id?: number;
    nombre?: string;
    orden?: number;
    estado?: number;
  };
  sucursal?: {
    nombre?: string;
  };
  contratacion_tipo?: {
    nombre?: string;
  };
  convenio_categoria?: {
    nombre?: string;
  };
  convenio?: {
    nombre?: string;
  };
  forma_pago?: {
    nombre?: string;
  };
  cuenta_bancaria_principal?: {
    alias_cbu?: string;
    banco?: {
      nombre?: string;
    };
  };
}
interface EstadoEmpleadoValue {
  id?: number;
  estado_id?: number;
  estado_empleado_id?: number;
  nombre?: string;
  descripcion?: string;
  es_activo?: number | boolean;
}

interface ConceptoMasivoItem {
  concepto_id: number;
  unidades?: number;
  importe?: number;
  fecha_asignacion?: string;
}

interface AsignacionMasivaRequest {
  empresa_id?: number;
  employee_ids?: number[];
  filter?: { sucursal_id?: number[]; seccion_id?: number[]; tipo_contratacion?: number[]; q?: string; activo?: boolean };
  conceptos: ConceptoMasivoItem[];
  batchSize?: number;
  dryRun?: boolean;
  atomicPerEmployee?: boolean;
  razon_override?: string;
  requestedBy?: number;
}

interface AsignacionMasivaResponse {
  summary: { requested: number; processed: number; succeeded: number; failed: number };
  failures: { empleado_id: number; errors: string[] }[];
  job_id: string;
  message: string;
  created: { empleado_concepto_id: number; concepto_id: number; empleado_id: number }[];
  updated: { empleado_concepto_id: number; concepto_id: number; empleado_id: number }[];
}

@Component({
  selector: 'app-movimientos-masivos',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ModalFotos],
  templateUrl: './movimientos-masivos.component.html',
  styleUrls: ['./movimientos-masivos.component.scss']
})
export class MovimientosMasivosComponent implements OnInit {
  filterForm: FormGroup;
  cargos: any[] = [];
  secciones: any[] = [];
  sucursales: any[] = [];
  private seccionesCache = new Map<number, any[]>();
  private cargosCache = new Map<number, any[]>();
  private allCargos: any[] = [];
  loadingCatalogos = false;
  employees: any[] = [];
  conceptos: any[] = [];
  conceptQ = '';
  conceptTipo = '';
  conceptTipos: any[] = [];
  selectedEmployeeIds = new Set<number>();
  selectedConcepts: { concepto_id: number; importe?: number | null; unidades?: number | null }[] = [];
  loading = false;
  result: any = null;
  assignSummary: any[] = [];
  analyticsLoading = false;
  analyticsError = '';
  analyticsLoaded = false;
  analyticsResumen: any = null;
  analyticsTop: any[] = [];
  analyticsSectores: any[] = [];

  analyticsFilters = { periodo_desde: '', periodo_hasta: '', liquidacion_tipo_id: null as number | null };
  liquidacionTipos: any[] = [];
  // last payload enviado, usado para reintentos por empleado
  lastPayload: any = null;
  // Modal state for showing success/error messages from backend
  modalVisible = false;
  modalClosing = false;
  private modalCloseTimeout: any = null;
  private modalForceCloseTimeout: any = null;
  modalTitle = '';
  modalMessage: string | null = null;
  modalErrors: any = null;
  avatarsSinImagen = new Set<number>();
  // track which employees have their conceptos list expanded
  expandedEmployeeIds = new Set<number>();
  fotoAmpliada: string | null = null;
  mostrarModalFoto = false;
  empleadoSeleccionado: any;
  /** Si la eliminación masiva debe ser física (DELETE duro) en lugar de baja lógica. */
  deleteHardDelete = false;
  /** Preview de la última simulación (dryRun) de eliminación masiva. */
  deletePreview: { summary: any; removed: any[] } | null = null;
  // Resumen de conceptos mostrado dentro del modal
  modalConceptsSummary: any[] = [];
  modalConceptsAction: 'asignados' | 'eliminados' | null = null;
  // ---- Asignación masiva (contrato AsignacionMasivaRequest) ----
  /** Razón obligatoria cuando algún concepto de sueldo básico lleva importe manual. */
  razonOverride = '';
  batchSize = 200;
  atomicPerEmployee = true;
  /** Última respuesta completa del POST (summary/failures/job_id/created/updated). */
  lastAssignResponse: any = null;
  /** Último job_id devuelto por el backend (auditoría). */
  lastJobId: string | null = null;
  /** Preview de la última simulación de asignación (dryRun). */
  assignPreview: AsignacionMasivaResponse | null = null;
  /** Snapshot del payload pendiente de confirmación tras un dryRun. */
  private pendingPayload: any = null;
  /** Conceptos enviados en la última llamada (para el resumen post-respuesta). */
  private lastSentConceptos: ConceptoMasivoItem[] = [];
  /** Mensaje de validación para mostrar junto a los botones. */
  validationError = '';

  constructor(
    private fb: FormBuilder,
    private svc: EmpleadosConceptosService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private loadingService: LoadingService,
    private auth: AuthService,
    private analyticsSvc: LiquidacionesAnaliticaService,
    private router: Router
  ) {
    this.filterForm = this.fb.group({
      q: [''],
      tipo_contratacion: [''],
      sucursal_id: [null],
      cargo: [''],
      seccion: ['']
    });
  }

  ngOnInit(): void {
    this.loadConceptos();
    this.cargarEmpleados();
    this.cargarCatalogos();
    this.loadLiquidacionTipos();
    // cuando cambia sucursal en filtros, cargar secciones por sucursal
    this.filterForm.get('sucursal_id')?.valueChanges.subscribe((val) => {
      const id = Number(val ?? null);
      try { this.filterForm.get('seccion')?.setValue(null); this.filterForm.get('cargo')?.setValue(null); } catch { }
      if (id) {
        this.getSeccionesBySucursal(id, false);
      } else {
        this.secciones = [];
        this.cargos = [];
      }
    });
    // cuando cambia seccion en filtros, cargar cargos por seccion
    this.filterForm.get('seccion')?.valueChanges.subscribe((val) => {
      const id = Number(val ?? null);
      try { this.filterForm.get('cargo')?.setValue(null); } catch { }
      if (id) {
        this.getCargosBySeccion(id, false);
      } else {
        this.cargos = [];
      }
    });
  }
  /**
   * Construye el resumen de conceptos para mostrar dentro del modal.
   *
   * action:
   *  - asignados
   *  - eliminados
   */
  private buildModalConceptsSummary(
    employeeIds: number[],
    conceptos: any[],
    action: 'asignados' | 'eliminados'
  ): any[] {

    const agrupado = new Map<number, any>();

    for (const item of conceptos || []) {
      const empleadoId = Number(
        item?.empleado_id ??
        item?.employee_id ??
        item?.empleado?.empleado_id ??
        item?.empleado?.id
      );

      const conceptoId = Number(
        item?.concepto_id ??
        item?.concepto?.concepto_id ??
        item?.concepto?.id
      );

      if (!empleadoId || !conceptoId) continue;

      if (!agrupado.has(empleadoId)) {
        const empleado =
          this.employees.find(
            (e) => Number(this.getEmpleadoId(e)) === empleadoId
          ) ||
          item?.empleado ||
          {
            empleado_id: empleadoId,
            apellido: '',
            nombre: ''
          };

        agrupado.set(empleadoId, {
          empleado,
          conceptos: []
        });
      }

      const conceptoObj =
        this.conceptos.find(
          (c) => Number(this.getConceptId(c)) === conceptoId
        ) ||
        item?.concepto ||
        {};

      agrupado.get(empleadoId).conceptos.push({
        concepto_id: conceptoId,
        codigo:
          item?.codigo ??
          conceptoObj?.codigo ??
          null,
        nombre:
          item?.nombre ??
          conceptoObj?.nombre ??
          conceptoObj?.descripcion ??
          conceptoObj?.codigo ??
          '(sin nombre)',
        tipo_codigo:
          item?.tipo_codigo ??
          conceptoObj?.tipo_concepto?.codigo ??
          conceptoObj?.tipo_concepto?.nombre ??
          null,
        importe:
          item?.importe ??
          null,
        unidades:
          item?.unidades ??
          1
      });
    }

    return Array.from(agrupado.values());
  }

  /**
   * Construye el resumen de asignaciones utilizando created + updated
   * devueltos por el backend.
   */
  private buildAssignedModalSummary(res: any): any[] {
    const created = Array.isArray(res?.created) ? res.created : [];
    const updated = Array.isArray(res?.updated) ? res.updated : [];

    const items = [...created, ...updated];

    const employeeIds = Array.from(
      new Set(
        items
          .map((item: any) => Number(item?.empleado_id))
          .filter((id: number) => !!id)
      )
    );

    return this.buildModalConceptsSummary(
      employeeIds,
      items,
      'asignados'
    );
  }

  /**
   * Construye el resumen de eliminaciones utilizando `removed`
   * devuelto por el backend.
   */
  private buildDeletedModalSummary(res: any): any[] {
    const removed = Array.isArray(res?.removed)
      ? res.removed
      : [];

    const employeeIds: number[] = Array.from(
      new Set<number>(
        removed
          .map((item: any): number => Number(
            item?.empleado_id ??
            item?.employee_id
          ))
          .filter((id: number): id is number => Number.isFinite(id) && id > 0)
      )
    );

    return this.buildModalConceptsSummary(
      employeeIds,
      removed,
      'eliminados'
    );
  }

  get totalModalConcepts(): number {
    return (this.modalConceptsSummary || [])
      .reduce(
        (total: number, item: any) =>
          total + (item?.conceptos?.length || 0),
        0
      );
  }
  loadLiquidacionTipos(): void {
    this.http.get<any>(`${environment.apiUrl}/api/liquidacion-tipos`).pipe(catchError(() => of([] as any[]))).subscribe((res) => {
      const items = Array.isArray(res) ? res : (res?.data || res?.items || []);
      this.liquidacionTipos = items || [];
    });
  }

  loadAnalytics(): void {
    this.analyticsLoading = true;
    this.analyticsLoaded = true;
    this.analyticsError = '';
    this.analyticsSvc.getResumen({
      periodo_desde: this.analyticsFilters.periodo_desde || undefined,
      periodo_hasta: this.analyticsFilters.periodo_hasta || undefined,
      liquidacion_tipo_id: this.analyticsFilters.liquidacion_tipo_id || undefined
    }).pipe(finalize(() => { this.analyticsLoading = false; this.cdr.detectChanges(); })).subscribe({
      next: (res: any) => {
        if (res?.error) {
          this.analyticsError = 'No se pudo cargar la analítica de liquidaciones.';
          this.analyticsTop = [];
          this.analyticsSectores = [];
          this.analyticsResumen = null;
          return;
        }
        this.analyticsResumen = res || {};
        this.analyticsTop = Array.isArray(res?.top_salarios) ? [...res.top_salarios].sort((a, b) => Number(b?.sueldo ?? 0) - Number(a?.sueldo ?? 0)).slice(0, 5) : [];
        this.analyticsSectores = Array.isArray(res?.por_sector) ? res.por_sector : [];
      },
      error: () => {
        this.analyticsError = 'No se pudo cargar la analítica de liquidaciones.';
        this.analyticsResumen = null;
        this.analyticsTop = [];
        this.analyticsSectores = [];
      }
    });
  }

  applyAnalyticsFilters(): void {
    this.loadAnalytics();
  }

  clearAnalyticsFilters(): void {
    this.analyticsFilters = { periodo_desde: '', periodo_hasta: '', liquidacion_tipo_id: null };
    this.loadAnalytics();
  }

  hasAnalyticsData(): boolean {
    return !!this.analyticsResumen || this.analyticsTop.length > 0 || this.analyticsSectores.length > 0;
  }

  analyticsReady(): boolean {
    return this.hasAnalyticsData() && !this.analyticsError;
  }

  sortedTopSalarios(): any[] {
    return [...this.analyticsTop].sort((a, b) => Number(b?.sueldo ?? 0) - Number(a?.sueldo ?? 0));
  }

  topSalaryMax(): number {
    return Math.max(...this.sortedTopSalarios().map((item) => Number(item?.sueldo ?? 0)), 1);
  }

  topSalaryWidth(value: any): string {
    const current = Number(value ?? 0);
    return `${Math.max(8, Math.round((current / this.topSalaryMax()) * 100))}%`;
  }

  sectorMax(): number {
    return Math.max(...this.analyticsSectores.map((item) => Number(item?.promedio ?? 0)), 1);
  }

  sectorWidth(value: any): string {
    const current = Number(value ?? 0);
    return `${Math.max(8, Math.round((current / this.sectorMax()) * 100))}%`;
  }

  analyticsSummaryCards(): Array<{ label: string; value: number; tone: string; subtitle: string }> {
    return [
      { label: 'Promedio de liquidación', value: Number(this.analyticsResumen?.promedio ?? 0), tone: 'blue', subtitle: 'Monto promedio por empleado' },
      { label: 'Mediana de liquidación', value: Number(this.analyticsResumen?.mediana ?? 0), tone: 'indigo', subtitle: 'Valor central del reparto' },
      { label: 'Mayor liquidación', value: Number(this.analyticsResumen?.maximo ?? 0), tone: 'green', subtitle: 'Empleado con mayor monto' },
      { label: 'Menor liquidación', value: Number(this.analyticsResumen?.minimo ?? 0), tone: 'red', subtitle: 'Empleado con menor monto' },
      { label: 'Brecha salarial', value: Number(this.analyticsResumen?.diferencia ?? 0), tone: 'amber', subtitle: 'Diferencia entre extremos' }
    ];
  }

  rankColor(index: number): string {
    const palette = ['#2563eb', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f59e0b'];
    return palette[index % palette.length];
  }

  formatMoney(value: any): string {
    const num = Number(value ?? 0);
    try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(num); } catch { return String(num); }
  }

  formatPercent(value: any): string {
    const num = Number(value ?? 0);
    return `${num.toFixed(2)}%`;
  }

  analyticsBarWidth(value: any): string {
    const max = Math.max(...this.analyticsSectores.map((item) => Number(item?.promedio ?? 0)), 1);
    const current = Number(value ?? 0);
    return `${Math.max(6, Math.round((current / max) * 100))}%`;
  }

  cargarCatalogos(): void {
    this.loadingCatalogos = true;
    // Load sucursales and all cargos (we'll fetch secciones/cargos by sucursal/seccion on demand)
    this.http.get<any[] | { data?: any[]; cargos?: any[] }>(`${environment.apiUrl}/api/cargos/all`)
      .pipe(catchError(() => of([] as any[])))
      .subscribe((res) => {
        this.allCargos = Array.isArray(res) ? res : (res?.cargos || res?.data || []);
      });

    this.http.get<any[] | { data?: any[]; sucursales?: any[] }>(`${environment.apiUrl}/api/sucursales`)
      .pipe(catchError(() => of([] as any[])))
      .subscribe((res) => {
        this.sucursales = Array.isArray(res) ? res : (res?.sucursales || res?.data || []);
      });

    this.http.get<any[] | { data?: any[]; estados_empleados?: any[] }>(`${environment.apiUrl}/api/estados-empleados`)
      .pipe(
        catchError(() => of([] as any[])),
        finalize(() => { this.loadingCatalogos = false; })
      )
      .subscribe(() => { /* estados handled elsewhere if needed */ });
  }

  private getSeccionesBySucursal(sucursalId: number, forceReload = false): void {
    if (!sucursalId) { this.secciones = []; return; }
    if (!forceReload && this.seccionesCache.has(sucursalId)) {
      this.secciones = this.seccionesCache.get(sucursalId) || [];
      return;
    }
    this.loadingCatalogos = true;
    this.http.get<any>(`${environment.apiUrl}/api/secciones/by-sucursal`, { params: { sucursal_id: String(sucursalId) } as any })
      .pipe(catchError(() => of([] as any[])), finalize(() => { this.loadingCatalogos = false; }))
      .subscribe((res) => {
        const list = Array.isArray(res) ? res : (res?.secciones || res?.data || []);
        this.secciones = list || [];
        this.seccionesCache.set(sucursalId, this.secciones);
      });
  }

  private getCargosBySeccion(seccionId: number, forceReload = false): void {
    if (!seccionId) { this.cargos = []; return; }
    if (!forceReload && this.cargosCache.has(seccionId)) {
      this.cargos = this.cargosCache.get(seccionId) || [];
      return;
    }
    this.loadingCatalogos = true;
    this.http.get<any>(`${environment.apiUrl}/api/cargos/by-seccion`, { params: { seccion_id: String(seccionId) } as any })
      .pipe(catchError(() => of([] as any[])), finalize(() => { this.loadingCatalogos = false; }))
      .subscribe((res) => {
        const list = Array.isArray(res) ? res : (res?.cargos || res?.data || []);
        this.cargos = list || [];
        this.cargosCache.set(seccionId, list || []);
      });
  }

  // Called from template (change event) or programmatically when sucursal changes
  onSucursalChange(): void {
    const raw = this.filterForm.get('sucursal_id')?.value;
    const id = Number(raw ?? null);
    try { this.filterForm.get('seccion')?.setValue(null); this.filterForm.get('cargo')?.setValue(null); } catch { }
    if (id) {
      this.getSeccionesBySucursal(id, false);
    } else {
      this.secciones = [];
      this.cargos = [];
    }
  }

  onSucursalClick(): void {
    setTimeout(() => {
      const raw = this.filterForm.get('sucursal_id')?.value;
      const id = Number(raw ?? null);
      if (id) {
        this.getSeccionesBySucursal(id, true);
      }
    }, 0);
  }

  cargarEmpleados(): void {
    this.loading = true;
    this.loadingService.show();

    this.http
      .get<any[] | { data?: any[]; empleados?: any[] }>(`${environment.apiUrl}/api/empleados`)
      .pipe(
        catchError((err) => {
          console.error('Error cargando empleados', err);
          return of([] as any[]);
        }),
        finalize(() => {
          this.loading = false;
          try { this.cdr.detectChanges(); } catch { }
          this.loadingService.hide();
        })
      )
      .subscribe((res) => {
        const rows = Array.isArray(res) ? res : (res?.empleados || res?.data || []);
        this.employees = rows;
        try { this.cdr.detectChanges(); } catch { }
      });
  }

  private normalizarTexto(valor: string): string {
    return (valor || '').toString().trim().toLowerCase();
  }

  private parseCatalogoId(valor: string | number | null | undefined): number | null {
    const texto = (valor ?? '').toString().trim();
    if (!texto) return null;
    const parsed = Number(texto);
    return Number.isFinite(parsed) ? parsed : null;
  }

  get empleadosFiltrados(): any[] {
    const nombre = this.normalizarTexto(this.filterForm.get('q')?.value || '');
    const cargoId = this.parseCatalogoId(this.filterForm.get('cargo')?.value);
    const seccionId = this.parseCatalogoId(this.filterForm.get('seccion')?.value);

    return this.employees.filter((empleado) => {
      const nombreCompleto = this.normalizarTexto(((empleado.apellido || '') + ' ' + (empleado.nombre || '')).trim());

      if (nombre && !nombreCompleto.includes(nombre)) return false;

      const empleadoCargoId = this.parseCatalogoId(empleado.cargo_id ?? empleado.cargo?.cargo_id ?? null);
      if (cargoId !== null && empleadoCargoId !== null && empleadoCargoId !== cargoId) return false;

      const empleadoSeccionId = this.parseCatalogoId(empleado.seccion_id ?? empleado.seccion?.seccion_id ?? null);
      if (seccionId !== null && empleadoSeccionId !== null && empleadoSeccionId !== seccionId) return false;


      // Solo estados con estado_id = 1
      if (Number(empleado.estado?.estado_id) !== 1) {
        return false;
      }


      return true;
    });
  }

  loadConceptos() {
    this.svc.getConceptosDisponibles({ per_page: 200 }).subscribe((res: any) => {
      this.conceptos = res.items || [];
      // extraer tipos disponibles desde la propiedad anidada tipo_concepto
      const tipos = new Map<string, any>();
      (this.conceptos || []).forEach((c: any) => {
        const tipo = c?.tipo_concepto;
        const key = tipo ? String(tipo.tipo_concepto_id ?? tipo.codigo ?? tipo.nombre) : '';
        const nombre = tipo ? (tipo.nombre || tipo.codigo || key) : '';
        if (key && !tipos.has(key)) tipos.set(key, { id: key, nombre });
      });
      this.conceptTipos = Array.from(tipos.values());
    });
  }

  getConceptId(concepto: any): number | null {
    return concepto?.concepto_id ?? concepto?.id ?? null;
  }

  toggleEmployee(emp: any) {
    const id = this.getEmpleadoId(emp);
    if (!id) return;
    if (this.selectedEmployeeIds.has(id)) this.selectedEmployeeIds.delete(id);
    else this.selectedEmployeeIds.add(id);
  }

  toggleConcept(concepto: any) {
    const id = this.getConceptId(concepto);
    if (!id) return;
    const idx = this.selectedConcepts.findIndex((c) => c.concepto_id === id);
    if (idx >= 0) this.selectedConcepts.splice(idx, 1);
    else {
      const manual = this.isConceptManual(concepto);
      this.selectedConcepts.push({ concepto_id: id, importe: manual ? (concepto.importe_fijo ?? null) : null, unidades: manual ? 1 : null });
    }
  }

  toggleEmployeeConcepts(emp: any) {
    const id = this.getEmpleadoId(emp);
    if (!id) return;
    if (this.expandedEmployeeIds.has(id)) {
      // already open -> close it
      this.expandedEmployeeIds.delete(id);
    } else {
      // exclusive behavior: close others, open this one
      this.expandedEmployeeIds.clear();
      this.expandedEmployeeIds.add(id);
    }
  }

  isEmployeeConceptsExpanded(emp: any): boolean {
    const id = this.getEmpleadoId(emp);
    return !!id && this.expandedEmployeeIds.has(id);
  }

  getConceptsSortedByPriority(emp: any): any[] {
    // Delegar ordenamiento al backend: devolver la lista tal como viene.
    return Array.isArray(emp?.conceptos) ? emp.conceptos.slice() : [];
  }

  isConceptManual(concepto: any): boolean {
    // El backend sólo acepta override de importe si el concepto tiene es_sueldo_basico = 1.
    const esBasico = Number(concepto?.es_sueldo_basico) === 1 || concepto?.es_sueldo_basico === true;
    if (esBasico) return true;
    // Fallback: código de tipo de concepto con 'MANUAL' (cubre _MANUAL y variantes)
    const tipoCodigo = String(concepto?.tipo_concepto?.codigo ?? '').toUpperCase();
    return tipoCodigo.includes('MANUAL');
  }

  isEmployeeSelected(emp: any) {
    const id = this.getEmpleadoId(emp);
    return !!id && this.selectedEmployeeIds.has(id);
  }

  areAllEmployeesSelected(): boolean {
    const visibles = this.empleadosFiltrados;
    if (!visibles || visibles.length === 0) return false;
    return visibles.every((e) => {
      const id = this.getEmpleadoId(e);
      return !!id && this.selectedEmployeeIds.has(id);
    });
  }

  toggleSelectAllEmployees(): void {
    const all = this.areAllEmployeesSelected();
    if (all) {
      // deselect filtered
      for (const e of this.empleadosFiltrados) {
        const id = this.getEmpleadoId(e);
        if (id) this.selectedEmployeeIds.delete(id);
      }
    } else {
      for (const e of this.empleadosFiltrados) {
        const id = this.getEmpleadoId(e);
        if (id) this.selectedEmployeeIds.add(id);
      }
    }
  }

  getEmpleadoId(empleado: any): number | null {
    return empleado.empleado_id ?? empleado.id ?? null;
  }

  iniciales(empleado: any): string {
    const apellido = (empleado.apellido || '').trim();
    const nombre = (empleado.nombre || '').trim();
    const text = `${apellido.charAt(0) || ''}${nombre.charAt(0) || ''}`.trim();
    return text || 'E';
  }

  esEmpleadoInactivo(empleado: any): boolean {
    if (empleado.estado === 1 || empleado.estado === '1') return false;
    if (empleado && typeof empleado.estado === 'object') {
      if (empleado.estado.es_activo === 1 || empleado.estado.es_activo === true) return false;
      const nombre = (empleado.estado.nombre || empleado.estado.descripcion || '').toString().toLowerCase();
      if (nombre === 'activo') return false;
    }
    if (empleado.habilitado === 1) return false;
    return false;
  }

  resolvePublicUrl(url: string): string {
    const value = (url || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
    const baseUrl = (environment.apiUrl || '').replace(/\/$/, '');
    const path = value.startsWith('/') ? value : `/${value}`;
    return `${baseUrl}${path}`;
  }

  fotoUrl(empleado: any): string {
    return this.resolvePublicUrl(empleado.foto_url_publica || empleado.url_publica || empleado.foto || '');
  }

  tieneFoto(empleado: any): boolean {
    const empleadoId = this.getEmpleadoId(empleado);
    return !!this.fotoUrl(empleado) && !!empleadoId;
  }

  avatarError(empleado: any): void {
    const empleadoId = this.getEmpleadoId(empleado);
    if (!empleadoId) return;
    // marcar para que muestre iniciales en caso de error
    try { this.avatarsSinImagen.add(empleadoId); } catch { }
  }

  isConceptSelected(concepto: any) {
    const id = this.getConceptId(concepto);
    return !!id && this.selectedConcepts.some((c) => c.concepto_id === id);
  }

  areAllConceptsSelected(): boolean {
    const visibles = this.conceptosFiltrados;
    if (!visibles || visibles.length === 0) return false;
    return visibles.every((c) => {
      const id = this.getConceptId(c);
      return !!id && this.selectedConcepts.some((sc) => sc.concepto_id === id);
    });
  }

  toggleSelectAllConcepts(): void {
    const all = this.areAllConceptsSelected();
    const visibles = this.conceptosFiltrados;
    if (all) {
      // deselect filtered
      const visiblesIds = new Set(visibles.map((c) => this.getConceptId(c)));
      this.selectedConcepts = this.selectedConcepts.filter((sc) => !visiblesIds.has(sc.concepto_id));
    } else {
      // add filtered concepts
      const visiblesIds = new Set(visibles.map((c) => this.getConceptId(c)));
      const newSelected = visibles
        .map((c) => ({ concepto_id: this.getConceptId(c), importe: this.isConceptManual(c) ? (c.importe_fijo ?? null) : null, unidades: this.isConceptManual(c) ? 1 : null }))
        .filter((s) => s.concepto_id != null) as { concepto_id: number; importe?: number | null; unidades?: number | null }[];
      // merge avoiding duplicates
      const map = new Map<number, any>(this.selectedConcepts.map((s) => [s.concepto_id, s]));
      newSelected.forEach((s) => {
        if (s.concepto_id != null) map.set(s.concepto_id, s);
      });
      this.selectedConcepts = Array.from(map.values());
    }
  }

  get conceptosFiltrados(): any[] {
    const q = (this.conceptQ || '').toString().trim().toLowerCase();
    const tipo = (this.conceptTipo || '').toString().trim();
    return (this.conceptos || []).filter((c) => {
      if (q) {
        const name = ((c.nombre || c.descripcion || c.codigo) + '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (tipo) {
        const key = String(c?.tipo_concepto?.tipo_concepto_id ?? c?.tipo_concepto?.codigo ?? c?.tipo_concepto?.nombre ?? '');
        if (key !== tipo) return false;
      }
      return true;
    });
  }

  /**
   * Obtiene el objeto seleccionado para un concepto, creándolo si no existe.
   * Esto evita accesos a `undefined` desde la plantilla.
   */
  getSelectedConcept(conceptoId: number) {
    if (!conceptoId) {
      return { concepto_id: null, importe: null, unidades: 1 };
    }
    let sc = this.selectedConcepts.find((c) => c.concepto_id === conceptoId);
    if (!sc) {
      sc = { concepto_id: conceptoId, importe: null, unidades: 1 };
      this.selectedConcepts.push(sc);
    }
    return sc;
  }

  getConceptField(concepto: any, field: 'importe' | 'unidades') {
    const id = this.getConceptId(concepto);
    if (!id) return field === 'unidades' ? 1 : null;
    const sc = this.selectedConcepts.find((s) => s.concepto_id === id);
    if (!sc) return field === 'unidades' ? 1 : null;
    return sc[field];
  }

  setConceptField(concepto: any, field: 'importe' | 'unidades', value: any) {
    if (!this.isConceptManual(concepto)) return;
    const id = this.getConceptId(concepto);
    if (!id) return;
    let sc = this.selectedConcepts.find((s) => s.concepto_id === id);
    if (!sc) {
      sc = { concepto_id: id, importe: null, unidades: 1 };
      this.selectedConcepts.push(sc);
    }
    sc[field] = value;
  }

  /**
   * Construye el payload según el contrato AsignacionMasivaRequest.
   * Usa employee_ids si hay selección explícita; si no, arma el filter con los filtros de pantalla.
   */
  private buildAssignPayload(dryRun: boolean): AsignacionMasivaRequest | null {
    const conceptos: ConceptoMasivoItem[] = this.selectedConcepts.map((c) => {
      const item: ConceptoMasivoItem = { concepto_id: Number(c.concepto_id) };
      const unidades = c.unidades != null ? Number(c.unidades) : 1;
      item.unidades = Number.isFinite(unidades) ? unidades : 1;
      // Sólo enviar importe cuando el usuario realmente cargó un valor (override manual)
      if (c.importe !== null && c.importe !== undefined && `${c.importe}`.toString().trim() !== '') {
        const importe = Number(c.importe);
        if (Number.isFinite(importe)) item.importe = importe;
      }
      return item;
    });

    if (!conceptos.length) {
      this.validationError = 'Lista vacía: debe seleccionar al menos un concepto.';
      return null;
    }

    const payload: AsignacionMasivaRequest = {
      empresa_id: Number(localStorage.getItem('empresaId') || 0) || undefined,
      conceptos,
      batchSize: this.batchSize,
      dryRun,
      atomicPerEmployee: this.atomicPerEmployee
    };

    const employeeIds: number[] = Array.from(this.selectedEmployeeIds);
    if (employeeIds.length) {
      payload.employee_ids = employeeIds;
    } else {
      const filter = this.buildFilter();
      if (!filter) {
        this.validationError = 'Seleccione al menos un empleado o defina un filtro de empleados.';
        return null;
      }
      payload.filter = filter;
    }

    // razon_override es obligatoria si algún concepto lleva importe manual
    const usaOverride = conceptos.some((c) => c.importe !== undefined);
    if (usaOverride) {
      const razon = String(this.razonOverride || '').trim();
      if (!razon) {
        this.validationError = 'Ingrese la razón del override de importe (campo obligatorio).';
        return null;
      }
      payload.razon_override = razon;
    }

    this.validationError = '';
    return payload;
  }

  /** Arma el filter alternativo a employee_ids con los filtros de la pantalla. */
  private buildFilter(): AsignacionMasivaRequest['filter'] | null {
    const filter: any = {};
    const sucursalId = Number(this.filterForm.get('sucursal_id')?.value || 0) || null;
    const seccionId = Number(this.filterForm.get('seccion')?.value || 0) || null;
    const tipoContratacion = Number(this.filterForm.get('tipo_contratacion')?.value || 0) || null;
    const q = String(this.filterForm.get('q')?.value || '').trim();

    if (sucursalId) filter.sucursal_id = [sucursalId];
    if (seccionId) filter.seccion_id = [seccionId];
    if (tipoContratacion) filter.tipo_contratacion = [tipoContratacion];
    if (q) filter.q = q;
    filter.activo = true;

    return Object.keys(filter).length ? filter : null;
  }

  /** Botón principal: si ya hubo un dryRun, reaplica el mismo payload con dryRun:false. */
  assign() {
    this.deletePreview = null;
    if (this.loading) return;

    const pending = this.pendingPayload;
    // Confirmación posterior a una simulación: reutilizar exactamente el mismo payload
    if (pending && pending.dryRun === false && this.assignPreview) {
      const proceed = confirm(
        `Se asignarán a ${pending.employee_ids?.length ?? 0} empleado(s) ${pending.conceptos.length} concepto(s).\n\n¿Confirma la operación?`
      );
      if (!proceed) return;
      this.enviarAsignacion(pending);
      return;
    }

    const payload = this.buildAssignPayload(false);
    if (!payload) return;
    this.enviarAsignacion(payload);
  }

  /** Simulación previa (dryRun: true) que no aplica cambios. */
  simulateAssign(): void {
    if (this.loading) return;
    const payload = this.buildAssignPayload(true);
    if (!payload) return;
    this.enviarAsignacion(payload);
  }

  private enviarAsignacion(payload: AsignacionMasivaRequest): void {
    try { this.lastPayload = JSON.parse(JSON.stringify(payload)); } catch { this.lastPayload = payload; }
    // Guardar los conceptos enviados para armar el resumen tras la respuesta
    this.lastSentConceptos = payload.conceptos || [];

    this.loading = true;
    try { this.loadingService.show(); } catch { /* noop */ }

    const esDryRun = payload.dryRun === true;

    this.svc.assignConceptosMasivos(payload).pipe(
      finalize(() => {
        try { this.loading = false; this.loadingService.hide(); this.cdr.detectChanges(); } catch { /* noop */ }
      })
    ).subscribe({
      next: (res: any) => this.procesarRespuestaAsignacion(res, esDryRun),
      error: (err: any) => this.procesarErrorAsignacion(err)
    });
  }

  private procesarRespuestaAsignacion(res: any, esDryRun: boolean): void {
    const summary = res?.summary || { requested: 0, processed: 0, succeeded: 0, failed: 0 };
    const failures = Array.isArray(res?.failures) ? res.failures : [];
    this.result = res;
    this.lastAssignResponse = res;

    if (res?.job_id) this.lastJobId = res.job_id;

    if (esDryRun) {
      this.assignPreview = res;
      this.pendingPayload = { ...(this.pendingPayload || this.lastPayload || {}), dryRun: false };
      this.pendingPayload = this.buildAssignPayload(false) || this.pendingPayload;
      this.modalTitle = 'Simulación de asignación';
      this.modalMessage = res?.message ||
        `Se afectarían ${summary.requested} empleado(s): ${summary.succeeded} exitoso(s), ${summary.failed} con errores.`;
      this.modalErrors = failures.length ? failures : null;
      this.modalVisible = true;
      return;
    }

    this.assignPreview = null;
    this.pendingPayload = null;
    // Resumen real de lo que el backend creó/actualizó
    this.modalConceptsSummary = this.buildAssignedModalSummary(res);
    this.modalConceptsAction = 'asignados';

    // Un 200 no implica éxito total: atomicPerEmployee permite failures parciales.
    if (Number(summary.failed || 0) > 0 || failures.length > 0) {
      this.modalTitle = 'Asignación con errores';
      this.modalMessage = res?.message ||
        `Procesados: ${summary.processed}, Exitosos: ${summary.succeeded}, Fallidos: ${summary.failed || failures.length}`;
      this.modalErrors = failures.length ? failures : (res?.errors || null);
    } else {
      this.modalTitle = 'Asignación exitosa';
      this.modalMessage = res?.message || `Se procesaron ${summary.succeeded || summary.processed} empleado(s).`;
      this.modalErrors = null;
    }

    this.assignSummary = this.buildAssignSummary(this.lastSentConceptos);
    this.selectedEmployeeIds.clear();
    this.selectedConcepts = [];
    try { this.cargarEmpleados(); } catch { /* noop */ }
    this.modalVisible = true;
  }

  private procesarErrorAsignacion(err: any): void {
    const status = Number(err?.status || 0);
    const body = err?.body || err?.error || null;
    const backendMessage = body?.message || err?.message || '';

    if (status === 403) {
      this.modalTitle = 'Permiso denegado';
      this.modalMessage = backendMessage || 'Permiso denegado';
    } else if (status === 400) {
      this.modalTitle = 'Solicitud inválida';
      this.modalMessage = backendMessage || 'Solicitud inválida';
    } else if (status === 500) {
      this.modalTitle = 'Error interno';
      this.modalMessage = 'Error interno al procesar asignaciones masivas';
    } else {
      this.modalTitle = 'Error en la asignación';
      this.modalMessage = backendMessage || `Error al ejecutar asignación. Código: ${status || ''}`;
    }

    this.modalErrors = body?.errors || (Array.isArray(body?.invalid_conceptos) ? { invalid_conceptos: body.invalid_conceptos } : null);
    this.modalVisible = true;
  }

  /** Resumen por empleado para el pie de pantalla. */
  private buildAssignSummary(conceptos: ConceptoMasivoItem[]): any[] {
    return Array.from(this.selectedEmployeeIds.values()).map((id) => {
      const empleado = this.employees.find((e) => this.getEmpleadoId(e) === id) || { empleado_id: id, nombre: '', apellido: '' };
      return {
        empleado,
        conceptos: conceptos.map((cp) => {
          const conceptoObj = this.conceptos.find((cc) => this.getConceptId(cc) === cp.concepto_id) || {};
          return {
            concepto_id: cp.concepto_id,
            nombre: conceptoObj.nombre || conceptoObj.descripcion || conceptoObj.codigo || '',
            codigo: conceptoObj.codigo || null,
            tipo_codigo: conceptoObj?.tipo_concepto?.codigo || conceptoObj?.tipo_concepto?.nombre || null,
            importe: cp.importe ?? null,
            unidades: cp.unidades ?? 1,
            valor: cp.importe != null ? cp.importe * (cp.unidades ?? 1) : null
          };
        })
      };
    });
  }

  retryEmpleado(empleadoId: number) {
    if (!empleadoId) return;
    if (!this.lastPayload) {
      this.modalMessage = 'No hay datos disponibles para reintentar. Realice la asignación nuevamente.';
      this.modalVisible = true;
      return;
    }
    const payload = JSON.parse(JSON.stringify(this.lastPayload));
    payload.employee_ids = [empleadoId];
    delete payload.filter;
    payload.dryRun = false;

    this.loading = true;
    let retryStart = Date.now();
    this.svc.assignConceptosMasivos(payload).pipe(finalize(() => { this.loading = false; const duration = Date.now() - retryStart; console.debug('retryEmpleado finalize - duration(ms):', duration); })).subscribe(
      (res: any) => {
        // mostrar resultado del intento específico
        const summary = res?.summary;
        const failures = res?.failures || [];
        if (summary && Number(summary.failed || 0) > 0) {
          this.modalTitle = 'Reintento con errores';
          this.modalMessage = res?.message || `Fallaron ${summary.failed} items al reintentar.`;
          this.modalErrors = failures.length ? failures : (res?.errors || null);
        } else {
          this.modalTitle = 'Reintento exitoso';
          this.modalMessage = res?.message || 'Reintento completado correctamente.';
          this.modalErrors = failures.length ? failures : null;
          // refrescar listado para mostrar concepto actualizado en el empleado
          try { this.cargarEmpleados(); } catch (e) { console.debug('refresh empleados after retry error', e); }
        }
        if (res?.job_id) {
          this.result = this.result || {};
          this.result.job_id = res.job_id;
          this.lastJobId = res.job_id;
        }
        // ensure loading flag is cleared for retry
        try { this.loading = false; } catch { }
        this.modalVisible = true;
      },
      (err: any) => {
        const msg = err?.message || err?.error?.message || `Error al reintentar. Código: ${err?.status || ''}`;
        this.modalTitle = 'Error en reintento';
        this.modalMessage = msg;
        this.modalErrors = err?.error?.errors || null;
        try { this.loading = false; } catch { }
        this.modalVisible = true;
      }
    );
  }

  exportFailuresCsv() {
    const list: any[] = this.assignFailures.length
      ? this.assignFailures
      : (Array.isArray(this.result?.failures) ? (this.result!.failures as any[]) : []);
    if (!list || !list.length) return;
    const rows = [['empleado_id', 'errors', 'job_id']];
    for (const f of list) {
      const errs = Array.isArray(f.errors) ? f.errors.join('; ') : (f.errors || '');
      rows.push([String(f.empleado_id || ''), errs, String(this.result?.job_id || '')]);
    }
    const csv = rows.map((r: any[]) => r.map((cell: any) => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asignaciones_errores_${(this.result?.job_id || Date.now())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  copyFailuresToClipboard() {
    const list: any[] = this.assignFailures.length
      ? this.assignFailures
      : (Array.isArray(this.result?.failures) ? (this.result!.failures as any[]) : []);
    if (!list || !list.length) return;
    const text = list.map((f: any) => `Empleado ${f.empleado_id}: ${(Array.isArray(f.errors) ? f.errors.join('; ') : f.errors || '')}`).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.modalMessage = 'Errores copiados al portapapeles.';
      }).catch(() => {
        this.modalMessage = 'No se pudo copiar automáticamente. Use Exportar CSV.';
      });
    } else {
      try { window.prompt('Copiar errores (Ctrl+C + Enter):', text); } catch { /* noop */ }
    }
  }

  /** True si algún concepto seleccionado es sueldo básico con importe cargado a mano. */
  get requiereRazonOverride(): boolean {
    return this.selectedConcepts.some((c) => c.importe !== null && c.importe !== undefined && `${c.importe}`.toString().trim() !== '');
  }

  /** Habilita el botón de confirmar sólo si hay conceptos seleccionados. */
  get puedeAsignar(): boolean {
    return !!this.canAssignConcepts && this.selectedConcepts.length > 0 && !this.loading;
  }

  get puedeSimular(): boolean {
    return this.puedeAsignar;
  }

  /** Resumen numérico de la última respuesta (para el pie de pantalla). */
  get assignSummaryData(): any {
    return this.lastAssignResponse?.summary || null;
  }

  get assignFailures(): any[] {
    const f = this.lastAssignResponse?.failures;
    return Array.isArray(f) ? f : [];
  }

  get tienePreviewAsignacion(): boolean {
    return !!this.assignPreview;
  }

  get tienePreview(): boolean {
    return !!this.assignPreview || !!this.deletePreview;
  }

  isArray(v: any): boolean {
    return Array.isArray(v);
  }
  closeModal() {
    // Allow repeated calls safely: clear any pending timeouts first
    try {
      if (this.modalCloseTimeout) { clearTimeout(this.modalCloseTimeout); this.modalCloseTimeout = null; }
      if (this.modalForceCloseTimeout) { clearTimeout(this.modalForceCloseTimeout); this.modalForceCloseTimeout = null; }
    } catch (e) {
      console.debug('closeModal: error clearing timeouts', e);
    }
    // play closing animation then hide
    try { this.modalClosing = true; this.cdr.detectChanges(); } catch (e) { console.debug('closeModal detectChanges error', e); }
    // ensure any spinner is hidden (force hide to clear counters)
    try { this.loading = false; this.loadingService.hide(true); } catch (e) { console.debug('closeModal hide spinner error', e); }

    this.modalCloseTimeout = setTimeout(() => {
      try {
        this.modalVisible = false;
        this.modalClosing = false;
        this.modalTitle = '';
        this.modalMessage = null;
        this.modalErrors = null;
        this.modalConceptsSummary = [];
        this.modalConceptsAction = null;
        this.cdr.detectChanges();
      } catch (ex) {
        console.debug('closeModal timeout handler error', ex);
      } finally {
        if (this.modalCloseTimeout) { clearTimeout(this.modalCloseTimeout); this.modalCloseTimeout = null; }
        if (this.modalForceCloseTimeout) { clearTimeout(this.modalForceCloseTimeout); this.modalForceCloseTimeout = null; }
      }
    }, 220);

    // Safety: force hide after 1s if animation fails
    this.modalForceCloseTimeout = setTimeout(() => {
      try {
        if (this.modalVisible) {
          this.modalVisible = false;
          this.modalClosing = false;
          this.modalTitle = '';
          this.modalMessage = null;
          this.modalErrors = null;
          // also force hide spinner again as last resort
          try { this.loadingService.hide(true); } catch { }
          this.cdr.detectChanges();
        }
      } catch (ex) {
        console.debug('closeModal force hide error', ex);
      } finally {
        if (this.modalCloseTimeout) { clearTimeout(this.modalCloseTimeout); this.modalCloseTimeout = null; }
        if (this.modalForceCloseTimeout) { clearTimeout(this.modalForceCloseTimeout); this.modalForceCloseTimeout = null; }
      }
    }, 1000);
  }
  irAFichaEmpleado(empleadoId: number) {

    if (empleadoId) {
      this.router.navigate(['admin/empleados/editar', empleadoId]);
    }
  }
  ampliarFoto(empleado: EmpleadoItem): void {

    if (this.tieneFoto(empleado)) {
      this.empleadoSeleccionado = empleado;
      this.fotoAmpliada = this.fotoUrl(empleado);
      this.mostrarModalFoto = true;
    }
  }

  cerrarFoto(): void {
    this.fotoAmpliada = null;
    this.mostrarModalFoto = false;
  }

  get canAssignConcepts(): boolean {
    try {
      if (this.auth.isSuperAdmin()) return true;
      const perms = this.auth.getPermissions() || [];
      const has = (alias: string) => Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : (p?.alias === alias)));
      // El backend exige el alias 'conceptos_asigna' en el rol del usuario.
      if (has('conceptos_asigna')) return true;
      // 'conceptos' habilita el módulo; los permisos granulares siguen siendo exigidos.
      return has('conceptos') && has('empleados_conceptos_masivos');
    } catch (e) {
      return false;
    }
  }

  get hasSelection(): boolean {
    try {
      const hasEmp = !!(this.selectedEmployeeIds && this.selectedEmployeeIds.size > 0);
      const hasConcept = !!(this.selectedConcepts && this.selectedConcepts.length > 0);
      return hasEmp || hasConcept;
    } catch (e) {
      return false;
    }
  }

  removeSelected() {
    if (!this.hasSelection) return;

    const conceptIds = this.selectedConcepts.map((c) => Number(c.concepto_id)).filter((id) => !!id);
    const employeeIds = Array.from(this.selectedEmployeeIds.values());

    if (!conceptIds.length) {
      this.modalTitle = 'Faltan conceptos';
      this.modalMessage = 'Debe seleccionar al menos un concepto para eliminar.';
      this.modalErrors = null;
      this.modalVisible = true;
      return;
    }
    if (!employeeIds.length) {
      this.modalTitle = 'Faltan empleados';
      this.modalMessage = 'Debe seleccionar al menos un empleado para eliminar.';
      this.modalErrors = null;
      this.modalVisible = true;
      return;
    }

    const empresaId = Number(localStorage.getItem('empresaId') || 0) || undefined;
    const basePayload: any = {
      empresa_id: empresaId,
      employee_ids: employeeIds,
      concepto_ids: conceptIds
    };

    const hardDelete = !!this.deleteHardDelete;
    const pregunta = (extra: string) =>
      `Se eliminará${hardDelete ? ' de forma definitiva' : ' (baja lógica)'} el concepto seleccionado de ${employeeIds.length} empleado(s).\n\n${extra}\n\n¿Confirma la operación?`;
    if (!confirm(pregunta('Continuar?'))) return;

    this.runDeleteMasivo(basePayload, false);
  }

  /** Ejecuta el DELETE de asignaciones masivas; si dryRun es true solo muestra el preview. */
  runDeleteMasivo(basePayload: any, dryRun: boolean) {
    const payload = {
      ...basePayload,
      dryRun,
      hardDelete: this.deleteHardDelete
    };

    this.loading = true;

    try {
      this.loadingService.show();
    } catch {
      /* noop */
    }

    this.svc.deleteConceptosMasivos(payload).pipe(
      finalize(() => {
        try {
          this.loading = false;
          this.loadingService.hide();
          this.cdr.detectChanges();
        } catch {
          /* noop */
        }
      })
    ).subscribe({
      next: (res: any) => {
        const summary = res?.summary || {};
        this.result = res;

        if (dryRun) {

          const removed = Array.isArray(res?.removed)
            ? res.removed
            : [];

          this.modalTitle = 'Simulación (dry run)';

          this.modalMessage =
            res?.message ||
            `Se eliminarían ${summary.removed ?? removed.length} asignación(es) sobre ${summary.requested ?? 0} empleado(s).`;

          this.modalErrors = null;

          this.deletePreview = {
            summary,
            removed
          };

        } else {

          this.deletePreview = null;

          // Resumen real de lo eliminado por el backend
          try {
            this.modalConceptsSummary =
              this.buildDeletedModalSummary(res);
          } catch (error) {

            console.error(
              'Error construyendo resumen de eliminación:',
              error
            );

            // Si falla el resumen, dejamos un array vacío
            // pero NO impedimos que se abra el modal.
            this.modalConceptsSummary = [];
          }

          this.modalConceptsAction = 'eliminados';

          this.modalTitle = 'Eliminación completada';

          this.modalMessage =
            res?.message ||
            `Se eliminaron ${summary.removed ?? 0} asignación(es) sobre ${summary.requested ?? 0} empleado(s).`;

          this.modalErrors =
            Number(summary.invalid_conceptos || 0) > 0
              ? {
                invalid_conceptos: summary.invalid_conceptos
              }
              : null;

          this.selectedEmployeeIds.clear();
          this.selectedConcepts = [];

          this.assignSummary = [];

          try {
            this.cargarEmpleados();
          } catch {
            /* noop */
          }
        }

        // IMPORTANTE:
        // El modal se abre SIEMPRE al final.
        this.modalVisible = true;

        this.cdr.detectChanges();
      },

      error: (err: any) => {

        this.modalTitle = 'Error en la eliminación';

        this.modalMessage =
          err?.message ||
          err?.body?.message ||
          `Error al eliminar asignaciones. Código: ${err?.status || ''}`;

        const body = err?.body || err?.error || null;

        this.modalErrors =
          body?.errors ||
          (
            Array.isArray(body?.invalid_conceptos)
              ? {
                invalid_conceptos: body.invalid_conceptos
              }
              : null
          );

        this.modalConceptsSummary = [];
        this.modalConceptsAction = 'eliminados';

        this.modalVisible = true;

        this.cdr.detectChanges();
      }
    });
  }

  /** Simula la eliminación sin aplicarla (dryRun). */
  previewDelete(): void {
    if (!this.hasSelection) return;
    const conceptIds = this.selectedConcepts.map((c) => Number(c.concepto_id)).filter((id) => !!id);
    const employeeIds = Array.from(this.selectedEmployeeIds.values());
    if (!conceptIds.length || !employeeIds.length) {
      this.modalTitle = 'Selección incompleta';
      this.modalMessage = 'Debe seleccionar al menos un empleado y un concepto.';
      this.modalErrors = null;
      this.modalVisible = true;
      return;
    }
    this.runDeleteMasivo({
      empresa_id: Number(localStorage.getItem('empresaId') || 0) || undefined,
      employee_ids: employeeIds,
      concepto_ids: conceptIds
    }, true);
  }
}
