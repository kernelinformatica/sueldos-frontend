import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { LiquidacionesService } from './liquidaciones.service';

interface LiquidacionTipoOption { liquidacion_tipo_id: number; nombre: string; descripcion?: string; orden?: number; }
interface EstadoLiquidacionOption { estado_liquidacion_id: number; nombre: string; descripcion?: string; es_activo?: number | boolean; }
interface MesOption { value: number; label: string; }
interface CatalogoOption { id?: number; nombre?: string; descripcion?: string; [key: string]: any; }
interface EmpleadoOption {
  id: number;
  empleado_id?: number;
  legajo?: string;
  apellido?: string;
  nombre?: string;
  foto_url_publica?: string | null;
  url_publica?: string | null;
  foto?: string | null;
  foto_url?: string | null;
  imagen_url?: string | null;
  avatar_url?: string | null;
  estado?: string | number | Record<string, any>;
  sucursal_id?: number | null;
  seccion_id?: number | null;
  convenio_id?: number | null;
  convenio_categoria_id?: number | null;
  cargo_id?: number | null;
  sucursal?: { nombre?: string };
  seccion?: { nombre?: string };
  convenio?: { nombre?: string };
  convenio_categoria?: { nombre?: string };
  cargo?: { nombre?: string };
}
interface LiquidacionPreviewRow { empleado?: string; mensaje?: string; total_neto?: number | null; estado?: string; }
interface LiquidacionResultadoResumen {
  liquidadas: number;
  idsGenerados: number[];
  advertencias: string[];
  errores: string[];
}

@Component({
  selector: 'app-sueldos-liquidar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './liquidar.component.html',
  styleUrls: ['./liquidar.component.scss']
})
export class LiquidarComponent implements OnInit {
  loading = false;
  saving = false;
  loadingEmpleados = false;
  loadingTipos = false;
  loadingResult = false;
  errorMsg = '';
  tiposErrorMsg = '';
  estadosErrorMsg = '';

  liquidacionTipos: LiquidacionTipoOption[] = [];
  estadosLiquidaciones: EstadoLiquidacionOption[] = [];
  readonly meses: MesOption[] = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];
  empleados: EmpleadoOption[] = [];
  sucursales: CatalogoOption[] = [];
  secciones: CatalogoOption[] = [];
  convenios: CatalogoOption[] = [];
  convenioCategorias: CatalogoOption[] = [];
  periodo = new Date().getFullYear();
  periodoMes = new Date().getMonth() + 1;
  fechaLiquidacion = new Date().toISOString().slice(0, 10);
  liquidacionTipoId: number | null = null;
  estadoLiquidacionId: number | null = null;
  sucursalId: number | null = null;
  seccionId: number | null = null;
  convenioId: number | null = null;
  categoriaId: number | null = null;
  legajoBusqueda = '';
  nombreBusqueda = '';
  selectedEmpleadoIds = new Set<number>();
  filtrosBusquedaColapsados = false;
  private seccionesBySucursalCache = new Map<number, CatalogoOption[]>();
  advertencias: string[] = [];
  resultado: any = null;
  resultadoMensaje = '';
  idsGenerados: number[] = [];
  detalleParcial: LiquidacionPreviewRow[] = [];
  resumenResultado: LiquidacionResultadoResumen = {
    liquidadas: 0,
    idsGenerados: [],
    advertencias: [],
    errores: []
  };

  confirmVisible = false;
  confirmTitle = 'Confirmar liquidación';
  confirmMessage = '¿Desea ejecutar la liquidación mensual?';
  confirmSpinner = false;

  constructor(private svc: LiquidacionesService, private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.cargarTipos();
    this.cargarEstadosLiquidaciones();
    this.cargarCatalogos();
    this.cargarEmpleados();
  }

  cargarEstadosLiquidaciones(): void {
    this.svc.estadosLiquidaciones().pipe(
      timeout(1500),
      catchError((err) => {
        this.estadosErrorMsg = err?.name === 'TimeoutError'
          ? 'La carga de estados tardó demasiado. Volvé a intentar.'
          : 'No se pudieron cargar los estados de liquidación.';
        return of({ data: [] });
      })
    ).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.data || res?.items || []);
        this.estadosLiquidaciones = items.map((it: any) => ({
          estado_liquidacion_id: Number(it.estado_liquidacion_id ?? it.id ?? 0),
          nombre: String(it.nombre ?? it.descripcion ?? 'Estado'),
          descripcion: it.descripcion ?? null,
          es_activo: it.es_activo
        })).filter((it: EstadoLiquidacionOption) => Number(it.estado_liquidacion_id) > 0 && (it.es_activo === 1 || it.es_activo === true || it.es_activo === undefined || it.es_activo === null));

        if (!this.estadoLiquidacionId && this.estadosLiquidaciones.length) {
          const defaultEstado = this.estadosLiquidaciones.find((item) => this.normalize(item.nombre).includes('edicion')) || this.estadosLiquidaciones[0];
          this.estadoLiquidacionId = defaultEstado.estado_liquidacion_id;
        }

        const estadoEdicion = this.estadosLiquidaciones.find((item) => this.normalize(item.nombre).includes('edicion'));
        if (estadoEdicion) {
          this.estadoLiquidacionId = estadoEdicion.estado_liquidacion_id;
        }

        this.estadosErrorMsg = '';
      },
      error: () => { this.estadosErrorMsg = 'No se pudieron cargar los estados de liquidación.'; }
    });
  }

  cargarTipos(): void {
    this.loadingTipos = true;
    this.svc.liquidacionTipos().pipe(
      timeout(4000),
      catchError((err) => {
        this.tiposErrorMsg = err?.name === 'TimeoutError'
          ? 'La carga de tipos tardó demasiado. Volvé a intentar.'
          : 'No se pudieron cargar los tipos de liquidación.';
        return of({ data: [] });
      }),
      finalize(() => { this.loadingTipos = false; })
    ).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.data || res?.items || []);
        this.liquidacionTipos = items.map((it: any) => ({
          liquidacion_tipo_id: Number(it.liquidacion_tipo_id ?? it.id ?? 0),
          nombre: String(it.nombre ?? it.descripcion ?? 'Tipo'),
          descripcion: it.descripcion ?? null,
          orden: Number(it.orden ?? 0)
        })).sort((a: LiquidacionTipoOption, b: LiquidacionTipoOption) => (a.orden ?? 0) - (b.orden ?? 0));
        if (!this.liquidacionTipoId && this.liquidacionTipos.length) this.liquidacionTipoId = this.liquidacionTipos[0].liquidacion_tipo_id;
      },
      error: () => { this.tiposErrorMsg = 'No se pudieron cargar los tipos de liquidación.'; }
    });
  }

  cargarCatalogos(): void {
    this.http.get<any>(`${environment.apiUrl}/api/sucursales`).pipe(
      timeout(4000),
      catchError(() => of([]))
    ).subscribe((res) => {
      this.sucursales = Array.isArray(res) ? res : (res?.sucursales || res?.data || []);
    });

    this.cargarSeccionesPorSucursal();

    this.http.get<any>(`${environment.apiUrl}/api/convenios`).pipe(
      timeout(4000),
      catchError(() => of([]))
    ).subscribe((res) => {
      this.convenios = Array.isArray(res) ? res : (res?.convenios || res?.data || []);
      this.cargarCategoriasConvenio();
    });
  }

  cargarCategoriasConvenio(): void {
    const convenioId = Number(this.convenioId ?? 0);
    if (!convenioId) {
      this.convenioCategorias = [];
      this.categoriaId = null;
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/api/convenios/${convenioId}/categorias`).pipe(
      timeout(4000),
      catchError(() => of([]))
    ).subscribe((res) => {
      this.convenioCategorias = Array.isArray(res) ? res : (res?.categorias || res?.data || []);
      if (this.categoriaId && !this.convenioCategorias.some((item) => Number(item?.id ?? item?.['categoria_id'] ?? item?.['convenio_categoria_id'] ?? 0) === Number(this.categoriaId))) {
        this.categoriaId = null;
      }
    });
  }

  cargarEmpleados(): void {
    this.loadingEmpleados = true;
    this.http.get<any>(`${environment.apiUrl}/api/empleados`).pipe(
      timeout(6000),
      catchError((err) => {
        this.errorMsg = err?.error?.mensaje || 'No se pudieron cargar los empleados.';
        return of([]);
      }),
      finalize(() => { this.loadingEmpleados = false; })
    ).subscribe((res) => {
      const rows = Array.isArray(res) ? res : (res?.empleados || res?.data || []);
      this.empleados = rows.map((item: any) => ({
        ...item,
        id: Number(item?.empleado_id ?? item?.id ?? 0)
      })).filter((item: EmpleadoOption) => Number(item.id) > 0);
    });
  }

  get totalSeleccionados(): number { return this.selectedEmpleadoIds.size; }
  get totalEmpleados(): number { return this.empleadosFiltrados.length; }
  get totalPages(): number { return 1; }

  get liquidacionTipoNombre(): string {
    const tipo = this.liquidacionTipos.find((item) => item.liquidacion_tipo_id === this.liquidacionTipoId);
    return tipo?.nombre || '-';
  }

  get estadoLiquidacionNombre(): string {
    return this.estadoLiquidacionLabel(this.estadoLiquidacionId) || '-';
  }

  get estadoEsEdicion(): boolean {
    return this.isEstadoEdicion(this.estadoLiquidacionId);
  }

  get estadoEsCerrada(): boolean {
    return this.isEstadoCerrada(this.estadoLiquidacionId);
  }

  get estadoEsRevision(): boolean {
    return this.isEstadoRevision(this.estadoLiquidacionId);
  }

  get estadoPermiteEdicion(): boolean {
    return this.estadoEsEdicion;
  }

  get estadoSoloLectura(): boolean {
    return this.estadoEsCerrada || this.estadoEsRevision;
  }

  get filtrosActivos(): Array<{ label: string; value: string }> {
    const items: Array<{ label: string; value: string }> = [];
    if (this.sucursalId) items.push({ label: 'Sucursal', value: this.sucursalLabel(this.sucursalId) });
    if (this.seccionId) items.push({ label: 'Sección', value: this.seccionLabel(this.seccionId) });
    if (this.convenioId) items.push({ label: 'Convenio', value: this.catalogoLabel(this.convenios, this.convenioId) });
    if (this.categoriaId) items.push({ label: 'Categoría', value: this.catalogoLabel(this.convenioCategorias, this.categoriaId) });
    if (this.nombreBusqueda) items.push({ label: 'Nombre', value: this.nombreBusqueda });
    if (this.legajoBusqueda) items.push({ label: 'Legajo', value: this.legajoBusqueda });
    return items;
  }

  get empleadosFiltrados(): EmpleadoOption[] {
    const nombre = this.normalize(this.nombreBusqueda);
    const legajo = this.normalize(this.legajoBusqueda);
    const sucursalId = Number(this.sucursalId ?? 0) || null;
    const seccionId = Number(this.seccionId ?? 0) || null;
    const convenioId = Number(this.convenioId ?? 0) || null;
    const categoriaId = Number(this.categoriaId ?? 0) || null;

    return this.empleados.filter((empleado) => {
      const nombreCompleto = this.normalize(this.nombreCompleto(empleado));
      const legajoEmpleado = this.normalize(String(empleado.legajo || ''));
      const activo = this.isEmpleadoActivo(empleado);

      if (!activo) return false;
      if (nombre && !nombreCompleto.includes(nombre)) return false;
      if (legajo && !legajoEmpleado.includes(legajo)) return false;

      if (sucursalId && Number(empleado.sucursal_id ?? 0) !== sucursalId) return false;
      if (seccionId && Number(empleado.seccion_id ?? 0) !== seccionId) return false;
      if (convenioId && !this.matchesConvenio(empleado, convenioId)) return false;
      if (categoriaId && Number(empleado.convenio_categoria_id ?? 0) !== categoriaId) return false;

      return true;
    });
  }

  get empleadosVisibles(): EmpleadoOption[] {
    return this.empleadosFiltrados;
  }

  get allVisibleSelected(): boolean {
    return this.empleadosVisibles.length > 0 && this.empleadosVisibles.every((empleado) => this.selectedEmpleadoIds.has(empleado.id));
  }

  get someVisibleSelected(): boolean {
    const selected = this.empleadosVisibles.some((empleado) => this.selectedEmpleadoIds.has(empleado.id));
    return selected && !this.allVisibleSelected;
  }

  get resumenAdvertencias(): string[] {
    const items = [...this.advertencias];
    if (this.totalSeleccionados === 0) items.push('No hay empleados seleccionados.');
    return items;
  }

  trackByEmpleadoId(_: number, empleado: EmpleadoOption): number {
    return empleado.id;
  }

  trackByCatalogoId(_: number, item: CatalogoOption): number {
    return Number(item?.id ?? 0);
  }

  catalogoNumericId(item: CatalogoOption): number {
    return Number(item?.id ?? item?.['sucursal_id'] ?? item?.['seccion_id'] ?? item?.['convenio_id'] ?? item?.['categoria_id'] ?? item?.['convenio_categoria_id'] ?? 0);
  }

  catalogoNombre(item: CatalogoOption, fallbackLabel: string): string {
    return String(item?.nombre ?? item?.descripcion ?? fallbackLabel);
  }

  toggleEmpleado(empleado: EmpleadoOption, checked: boolean): void {
    if (!this.estadoPermiteEdicion) return;
    const id = Number(empleado.id);
    if (!id) return;
    if (checked) this.selectedEmpleadoIds.add(id);
    else this.selectedEmpleadoIds.delete(id);
  }

  toggleTodos(checked: boolean): void {
    if (!this.estadoPermiteEdicion) return;
    if (checked) {
      this.empleadosVisibles.forEach((empleado) => this.selectedEmpleadoIds.add(empleado.id));
      return;
    }
    this.empleadosVisibles.forEach((empleado) => this.selectedEmpleadoIds.delete(empleado.id));
  }

  onFiltroChange(): void {
  }

  toggleFiltrosBusqueda(): void {
    this.filtrosBusquedaColapsados = !this.filtrosBusquedaColapsados;
  }

  onEstadoChange(): void {
    if (!this.estadoPermiteEdicion) {
      this.selectedEmpleadoIds.clear();
    }
  }

  onSucursalChange(): void {
    this.seccionId = null;
    this.cargarSeccionesPorSucursal();
  }

  onConvenioChange(): void {
    this.cargarCategoriasConvenio();
  }

  limpiarFiltros(): void {
    this.sucursalId = null;
    this.seccionId = null;
    this.convenioId = null;
    this.categoriaId = null;
    this.legajoBusqueda = '';
    this.nombreBusqueda = '';
    this.cargarSeccionesPorSucursal();
  }

  private cargarSeccionesPorSucursal(): void {
    const sucursalId = Number(this.sucursalId ?? 0);
    if (!sucursalId) {
      this.secciones = [];
      return;
    }

    const cached = this.seccionesBySucursalCache.get(sucursalId);
    if (cached) {
      this.secciones = cached;
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/api/secciones/by-sucursal`, { params: { sucursal_id: String(sucursalId) } as any })
      .pipe(
        timeout(4000),
        catchError(() => of([]))
      )
      .subscribe((res) => {
        const rows = Array.isArray(res) ? res : (res?.secciones || res?.data || []);
        const normalized = rows.map((item: any) => ({ ...item, id: Number(item?.seccion_id ?? item?.id ?? 0) })).filter((item: CatalogoOption) => Number(item.id) > 0);
        this.seccionesBySucursalCache.set(sucursalId, normalized);
        this.secciones = normalized;
        if (this.seccionId && !normalized.some((item: CatalogoOption) => Number(item?.id ?? 0) === Number(this.seccionId))) {
          this.seccionId = null;
        }
      });
  }

  sucursalLabel(id: number | null | undefined): string {
    const item = this.sucursales.find((row) => Number(row?.id ?? row?.['sucursal_id'] ?? 0) === Number(id ?? 0));
    return String(item?.nombre ?? item?.descripcion ?? 'Sucursal');
  }

  seccionLabel(id: number | null | undefined): string {
    const item = this.secciones.find((row) => Number(row?.id ?? row?.['seccion_id'] ?? 0) === Number(id ?? 0));
    return String(item?.nombre ?? item?.descripcion ?? 'Sección');
  }

  catalogoLabel(items: CatalogoOption[], id: number | null | undefined): string {
    const item = items.find((row) => Number(row?.id ?? row?.['categoria_id'] ?? row?.['convenio_categoria_id'] ?? 0) === Number(id ?? 0));
    return String(item?.nombre ?? item?.descripcion ?? '');
  }

  matchesConvenio(empleado: EmpleadoOption, convenioId: number): boolean {
    if (!convenioId) return true;
    const convenio = empleado?.convenio as any;
    const convenioDirecto = Number(
      empleado?.convenio_id ??
      convenio?.convenio_id ??
      convenio?.id ??
      convenio?.convenioId ??
      0
    );
    if (convenioDirecto && convenioDirecto === Number(convenioId)) return true;

    const filtroNombre = this.normalize(this.catalogoLabel(this.convenios, convenioId));
    const convenioNombre = this.normalize(
      convenio?.nombre ?? convenio?.descripcion ?? convenio?.name ?? empleado?.convenio?.nombre ?? ''
    );
    if (filtroNombre && convenioNombre && convenioNombre.includes(filtroNombre)) return true;

    const convenioTexto = this.normalize(String(convenio?.codigo ?? convenio?.nombre ?? convenio?.descripcion ?? ''));
    return filtroNombre ? convenioTexto.includes(filtroNombre) : false;
  }

  nombreCompleto(empleado: EmpleadoOption): string {
    return [empleado.apellido, empleado.nombre].filter(Boolean).join(', ') || 'Empleado';
  }

  inicialesEmpleado(empleado: EmpleadoOption): string {
    const apellido = (empleado.apellido || '').trim();
    const nombre = (empleado.nombre || '').trim();
    return `${apellido.charAt(0)}${nombre.charAt(0)}`.trim() || 'E';
  }

  fotoEmpleadoUrl(empleado: EmpleadoOption): string {
    const rawUrl = empleado.foto_url_publica || empleado.url_publica || empleado.foto_url || empleado.imagen_url || empleado.avatar_url || empleado.foto || '';
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (value.startsWith('/')) return `${environment.apiUrl}${value}`;
    if (value.startsWith('assets/')) return value;
    return `${environment.apiUrl}/${value.replace(/^\/+/, '')}`;
  }

  estadoClase(empleado: EmpleadoOption): string {
    return this.isEmpleadoActivo(empleado) ? 'activo' : 'no-activo';
  }

  estadoLabel(estado: any): string {
    if (estado === 1 || estado === '1') return 'Activo';
    if (typeof estado === 'string') return estado;
    if (estado && typeof estado === 'object') {
      return estado.nombre || estado.descripcion || estado.name || 'Estado';
    }
    return 'Inactivo';
  }

  isEmpleadoActivo(empleado: EmpleadoOption): boolean {
    const estado = empleado.estado;
    if (estado === 1 || estado === '1') return true;
    if (typeof estado === 'string' && this.normalize(estado).includes('activo')) return true;
    if (estado && typeof estado === 'object') {
      const anyEstado: any = estado;
      if (anyEstado.es_activo === 1 || anyEstado.es_activo === true) return true;
      if (String(anyEstado.nombre || anyEstado.descripcion || '').toLowerCase().includes('activo')) return true;
    }
    return !empleado?.estado ? true : false;
  }

  isSelected(empleado: EmpleadoOption): boolean {
    return this.selectedEmpleadoIds.has(empleado.id);
  }

  normalize(value: string): string {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[^\w\s]/g, '').replace(/[\u0300-\u036f]/g, '').trim();
  }

  abrirConfirmacion(): void {
    if (this.saving || !this.estadoPermiteEdicion) return;
    this.confirmMessage = `Período ${this.periodoMes}/${this.periodo} · Estado ${this.estadoLiquidacionNombre} · Fecha ${this.fechaLiquidacion}. Empleados seleccionados: ${this.totalSeleccionados}.`;
    this.confirmVisible = true;
  }

  onConfirmClose(confirmado = false): void {
    if (!confirmado) {
      this.confirmVisible = false;
      return;
    }
    
    // Si ya terminó y es un mensaje de éxito, solo cerramos el modal
    if (this.resultado) {
      this.confirmVisible = false;
      return;
    }

    this.confirmVisible = false;
    this.ejecutarLiquidacion();
  }

  ejecutarLiquidacion(): void {
    if (this.saving || !this.estadoPermiteEdicion) return;
    if (!this.estadoLiquidacionId) {
      this.errorMsg = 'Seleccioná un estado de liquidación.';
      return;
    }
    if (!this.selectedEmpleadoIds.size) {
      this.errorMsg = 'Seleccioná al menos un empleado para liquidar.';
      return;
    }
    this.saving = true;
    this.loadingResult = true;
    this.errorMsg = '';
    this.resultado = null;
    try { this.cdr.detectChanges(); } catch {}

    const payload = {
      periodo: `${this.periodo}-${String(this.periodoMes).padStart(2, '0')}`,
      fecha_liquidacion: this.fechaLiquidacion,
      empleado_ids: Array.from(this.selectedEmpleadoIds),
      liquidacion_tipo_id: this.liquidacionTipoId,
      estado_liquidacion_id: this.estadoLiquidacionId,
      sucursal_id: this.sucursalId,
      seccion_id: this.seccionId,
      convenio_id: this.convenioId,
      convenio_categoria_id: this.categoriaId
    };

    this.svc.calcularMensual(payload).pipe(
      timeout(25000),
      catchError((err) => {
        return of({ error: err });
      })
    ).subscribe({
      next: (res) => {
        this.saving = false;
        this.loadingResult = false;
        try { this.cdr.detectChanges(); } catch {}

        if (res && res.error) {
          this.errorMsg = this.extractHttpErrorMessage(res.error, 'No se pudo ejecutar la liquidación.');
          this.resultado = null;
          this.confirmVisible = false;
          try { this.cdr.detectChanges(); } catch {}
          return;
        }

        if (res?.success === false || res?.status === 'error' || res?.errorMsg) {
          this.errorMsg = res?.mensaje || res?.message || res?.errorMsg || 'No se pudo ejecutar la liquidación.';
          this.resultado = null;
          this.resumenResultado = {
            liquidadas: 0,
            idsGenerados: [],
            advertencias: [],
            errores: []
          };
          this.confirmVisible = false;
          try { this.cdr.detectChanges(); } catch {}
          return;
        }

        const responseData = res?.data || res || null;
        this.resultado = responseData;
        this.resultadoMensaje = String(responseData?.message || responseData?.mensaje || responseData?.detail || 'Liquidación ejecutada correctamente.');
        this.idsGenerados = this.normalizarIdsGenerados(responseData);
        this.advertencias = Array.isArray(responseData?.advertencias) ? responseData.advertencias : [];
        this.detalleParcial = Array.isArray(responseData?.detalles) ? responseData.detalles : (Array.isArray(responseData?.empleados) ? responseData.empleados : []);
        this.resumenResultado = {
          liquidadas: this.normalizarCantidadLiquidadas(responseData),
          idsGenerados: this.idsGenerados,
          advertencias: this.advertencias,
          errores: Array.isArray(responseData?.errores) ? responseData.errores : []
        };
        
        // Mostrar modal de éxito
        this.confirmTitle = 'Liquidación exitosa';
        this.confirmMessage = this.resultadoMensaje + (this.idsGenerados.length ? ` (IDs creados: ${this.idsGenerados.join(', ')})` : '');
        this.confirmVisible = true;

        try { this.cdr.detectChanges(); } catch {}

        // Hacer scroll suave hasta el panel de resultados
        setTimeout(() => {
          const el = document.querySelector('.result-card');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      },
      error: (err) => {
        this.saving = false;
        this.loadingResult = false;
        this.confirmVisible = false;
        this.errorMsg = this.extractHttpErrorMessage(err, 'No se pudo ejecutar la liquidación.');
        this.resultado = null;
        this.resumenResultado = {
          liquidadas: 0,
          idsGenerados: [],
          advertencias: [],
          errores: []
        };
        try { this.cdr.detectChanges(); } catch {}
      }
    });
  }

  private normalizarCantidadLiquidadas(responseData: any): number {
    const candidates = [
      responseData?.insertadas,
      responseData?.liquidadas,
      responseData?.liquidaciones,
      responseData?.cantidad,
      responseData?.count,
      responseData?.total,
      Array.isArray(responseData?.ids) ? responseData.ids.length : null
    ];
    const value = candidates.find((candidate) => Number.isFinite(Number(candidate)) && Number(candidate) > 0);
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  private normalizarIdsGenerados(responseData: any): number[] {
    const rawIds = Array.isArray(responseData?.ids)
      ? responseData.ids
      : Array.isArray(responseData?.liquidacion_ids)
        ? responseData.liquidacion_ids
        : Array.isArray(responseData?.ids_generados)
          ? responseData.ids_generados
          : [];
    return rawIds
      .map((id: any) => Number(id))
      .filter((id: number) => Number.isFinite(id));
  }

  private extractHttpErrorMessage(err: any, fallback: string): string {
    if (err?.name === 'TimeoutError') {
      return 'El servidor está tardando demasiado en responder dándonos timeout. Volvé a intentar.';
    }
    const payload = err?.error;
    if (typeof payload === 'string' && payload.trim()) return payload.trim();
    if (payload && typeof payload === 'object') {
      const candidates = [
        payload.mensaje,
        payload.message,
        payload.error,
        payload.detail,
        payload.descripcion,
        payload.title
      ].filter((value) => typeof value === 'string' && value.trim());
      if (candidates.length) return String(candidates[0]).trim();
      if (Array.isArray(payload.errors) && payload.errors.length) {
        const firstError = payload.errors.find((item: any) => typeof item === 'string' && item.trim()) || payload.errors[0];
        if (typeof firstError === 'string' && firstError.trim()) return firstError.trim();
        if (firstError && typeof firstError === 'object') {
          return String(firstError.message || firstError.mensaje || firstError.detail || fallback).trim();
        }
      }
    }

    const status = Number(err?.status ?? 0);
    if (status >= 400 && status < 500) return `Error ${status}: no se pudo completar la liquidación.`;
    if (status >= 500) return `Error ${status}: falló el servidor al procesar la liquidación.`;
    return err?.message || fallback;
  }

  estadoBadge(value?: string): string {
    const estado = String(value || '').toLowerCase();
    if (estado.includes('cerr')) return 'cerrada';
    if (estado.includes('revis')) return 'revision';
    if (estado.includes('edic')) return 'edicion';
    if (estado.includes('calcul')) return 'calculada';
    return 'borrador';
  }

  estadoLiquidacionLabel(id: number | null | undefined): string {
    const item = this.estadosLiquidaciones.find((estado) => estado.estado_liquidacion_id === Number(id ?? 0));
    return String(item?.nombre ?? item?.descripcion ?? '');
  }

  isEstadoEdicion(id: number | null | undefined): boolean {
    return this.normalize(this.estadoLiquidacionLabel(id)).includes('edicion');
  }

  isEstadoCerrada(id: number | null | undefined): boolean {
    return this.normalize(this.estadoLiquidacionLabel(id)).includes('cerr');
  }

  isEstadoRevision(id: number | null | undefined): boolean {
    return this.normalize(this.estadoLiquidacionLabel(id)).includes('revis');
  }
}