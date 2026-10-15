import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../../shared/modal-alerta.component';
import { ToastService } from '../../../core/toast.service';
import { AuthService } from '../../../auth/auth.service';
import { LiquidacionesService } from '../../sueldos/liquidaciones.service';
import { SicossService } from './sicoss.service';
import {
  EmpleadoPadron,
  GeneracionHeader,
  GenerationRequest,
  LiquidacionTipo,
  PreviewResponse
} from './sicoss.model';

/**
 * Generaciones SICOS / ARCA.
 *
 * La generación la construye el BACKEND a partir de las liquidaciones ya
 * existentes. El frontend sólo:
 *   1) selecciona período (mes/año), tipo de liquidación y ámbito;
 *   2) pide la vista previa (POST /generaciones/preview);
 *   3) confirma y persiste la generación (POST /generaciones);
 *   4) exporta el archivo ARCA (POST /:id/export).
 *
 * No se recalculan sueldos ni se envían filas de liquidación desde el cliente.
 */
@Component({
  selector: 'app-sicoss-listado',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './sicoss-listado.component.html',
  styleUrls: ['./sicoss-listado.component.scss']
})
export class SicossListadoComponent implements OnInit, OnDestroy {
  private previewRefreshSub?: Subscription;

  generaciones: GeneracionHeader[] = [];
  loading = false;
  errorMsg = '';

  // Contexto del subsistema seleccionado (viene desde Subsistemas)
  subsistemaId: number | null = null;
  subsistemaNombre = '';

  // Filtros
  filtroMes: number | '' = '';
  filtroAnio: number | '' = '';
  filtroEstado = '';

  // Paginación server-side (el backend puede o no implementarla)
  page = 1;
  perPage = 25;
  total = 0;

  // ----- Asistente de generación -----
  generarVisible = false;
  generando = false;
  generacionError = '';

  readonly meses = [
    { valor: 1, nombre: 'Enero' }, { valor: 2, nombre: 'Febrero' },
    { valor: 3, nombre: 'Marzo' }, { valor: 4, nombre: 'Abril' },
    { valor: 5, nombre: 'Mayo' }, { valor: 6, nombre: 'Junio' },
    { valor: 7, nombre: 'Julio' }, { valor: 8, nombre: 'Agosto' },
    { valor: 9, nombre: 'Septiembre' }, { valor: 10, nombre: 'Octubre' },
    { valor: 11, nombre: 'Noviembre' }, { valor: 12, nombre: 'Diciembre' }
  ];

  tiposLiquidacion: LiquidacionTipo[] = [];
  genModel = {
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
    tipo_liquidacion: '',
    todos: true,
    incluir_subsistemas: true
  };

  // ----- Selector de empleados -----
  padron: EmpleadoPadron[] = [];
  padronLoading = false;
  padronCargado = false;
  busquedaEmpleado = '';
  paginaPadron = 1;
  perPagePadron = 10;
  seleccionados = new Set<number>();

  // Vista previa
  preview: PreviewResponse | null = null;
  previewError = '';
  previsualizando = false;
  previewSelected: any | null = null;
  previewFiltro = '';
  previewSort: 'rem_desc' | 'rem_asc' = 'rem_desc';

  constructor(
    private svc: SicossService,
    private liquidacionesSvc: LiquidacionesService,
    private auth: AuthService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  private has(alias: string): boolean {
    const perms: any[] = this.auth.getPermissions() || [];
    return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
  }

  get puedeCrear(): boolean { return this.has('sicoss_crear'); }
  get puedeExportar(): boolean { return this.has('sicoss_exportar'); }
  get puedeConfigurarSicoss(): boolean {
    return this.has('sicoss_editar') || this.has('grupos_rela_conceptos') || this.has('grupos_editar');
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.subsistemaId = qp.get('subsistema_id') ? Number(qp.get('subsistema_id')) : null;
    this.subsistemaNombre = qp.get('subsistema') || '';
    this.previewRefreshSub = this.svc.previewRefreshRequested$.subscribe(() => {
      if (this.preview && !this.previsualizando) {
        this.previsualizar();
      }
    });
    if (this.svc.consumePreviewRefreshRequested()) {
      this.restaurarUltimaVistaPrevia();
      if (this.buildRequest()) {
        setTimeout(() => this.previsualizar(), 0);
      }
    }
    this.cargarTiposLiquidacion();
    this.cargar();
  }

  ngOnDestroy(): void {
    this.previewRefreshSub?.unsubscribe();
  }

  /** Catálogo de tipos de liquidación (endpoint existente de liquidaciones). */
  private cargarTiposLiquidacion(): void {
    this.liquidacionesSvc.liquidacionTipos().subscribe((res: any) => {
      const raw: any = Array.isArray(res) ? res : (res?.data || res?.items || res?.liquidacion_tipos || []);
      const lista = Array.isArray(raw) ? raw : [];
      this.tiposLiquidacion = lista
        .map((x: any) => ({
          id: Number(x?.liquidacion_tipo_id ?? x?.id ?? 0),
          nombre: String(x?.nombre ?? x?.descripcion ?? '').trim()
        }))
        .filter((x: LiquidacionTipo) => x.id > 0 && x.nombre);
      this.refresh();
    });
  }

  /** Generaciones ya filtradas por el backend (el filtro de estado va al request). */
  get generacionesFiltradas(): GeneracionHeader[] {
    return this.generaciones;
  }

  cargar(): void {
    this.loading = true;
    this.errorMsg = '';
    this.svc.generaciones({
      mes: this.filtroMes,
      anio: this.filtroAnio,
      estado: this.filtroEstado === 'todos' ? '' : this.filtroEstado,
      subsistema_id: this.subsistemaId,
      page: this.page,
      perPage: this.perPage
    }).pipe(finalize(() => {
      this.loading = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error) {
        this.errorMsg = this.msgError(res.error, 'No se pudieron cargar las generaciones SICOS.');
        this.generaciones = [];
        this.total = 0;
      } else {
        this.generaciones = res.data.items;
        this.total = res.data.total;
      }
      this.refresh();
    });
  }

  get totalPaginas(): number {
    return this.perPage > 0 ? Math.max(1, Math.ceil(this.total / this.perPage)) : 1;
  }

  irPagina(delta: number): void {
    const destino = this.page + delta;
    if (destino < 1 || destino > this.totalPaginas) return;
    this.page = destino;
    this.cargar();
  }

  buscar(): void {
    this.page = 1;
    this.cargar();
  }

  limpiarFiltros(): void {
    this.filtroMes = '';
    this.filtroAnio = '';
    this.filtroEstado = '';
    this.page = 1;
    this.cargar();
  }

  // ---------- Navegación ----------

  verGeneracion(g: GeneracionHeader): void {
    if (!g.generacion_id) {
      this.toast.error('La generación no tiene un identificador válido.');
      return;
    }
    this.router.navigate(['/admin/impositivos/sicoss/generaciones', g.generacion_id]);
  }

  /** Período legible de una generación. */
  periodoLegible(g: GeneracionHeader): string {
    const nombres = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
      'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mes = Number(g?.mes ?? 0);
    const anio = Number(g?.anio ?? 0);
    if (mes >= 1 && mes <= 12 && anio) return `${nombres[mes]} ${anio}`;
    return anio ? String(anio) : '-';
  }

  /** Clase CSS del badge de estado. */
  estadoClass(estado: string | undefined): string {
    return String(estado || '').trim().toLowerCase().replace(/\s+/g, '_') || 'sin_estado';
  }

  fecha(v: string | null | undefined): string {
    if (!v) return '-';
    return String(v).slice(0, 16).replace('T', ' ');
  }

  // ---------- Asistente de generación ----------

  abrirGenerar(): void {
    if (!this.puedeCrear) return;
    this.router.navigate(['/admin/impositivos/sicoss/nueva']);
  }

  cerrarGenerar(): void {
    if (this.generando) return;
    this.generarVisible = false;
    this.preview = null;
    this.previewError = '';
    this.generacionError = '';
  }

  // ----- Padrón de empleados -----

  private cargarPadron(): void {
    if (this.padronCargado || this.padronLoading) return;
    this.padronLoading = true;
    this.svc.empleados().pipe(finalize(() => {
      this.padronLoading = false;
      this.refresh();
    })).subscribe((res) => {
      this.padron = res.error ? [] : res.data;
      this.padronCargado = true;
      if (res.error) { try { this.cdr.detectChanges(); } catch { /* ignore */ } }
    });
  }

  private restaurarUltimaVistaPrevia(): void {
    const request = this.svc.getLastPreviewRequest();
    if (!request) return;
    this.genModel.mes = Number(request.mes || this.genModel.mes);
    this.genModel.anio = Number(request.anio || this.genModel.anio);
    this.genModel.tipo_liquidacion = String(request.tipo_liquidacion || this.genModel.tipo_liquidacion || '');
    this.genModel.incluir_subsistemas = request.incluir_subsistemas != null ? !!request.incluir_subsistemas : this.genModel.incluir_subsistemas;
    this.genModel.todos = request.empleados === 'all';
    this.seleccionados.clear();
    if (Array.isArray(request.empleados)) {
      request.empleados.forEach((id) => {
        const n = Number(id);
        if (Number.isFinite(n) && n > 0) this.seleccionados.add(n);
      });
    }
  }

  /** Padrón filtrado por búsqueda (legajo, CUIL, apellido, nombre). */
  get padronFiltrado(): EmpleadoPadron[] {
    const q = String(this.busquedaEmpleado || '').trim().toLowerCase();
    if (!q) return this.padron;
    return this.padron.filter((e) =>
      `${e.legajo} ${e.cuil} ${e.apellido} ${e.nombre}`.toLowerCase().includes(q)
    );
  }

  /** Página visible del padrón. */
  get padronPagina(): EmpleadoPadron[] {
    const inicio = (this.paginaPadron - 1) * this.perPagePadron;
    return this.padronFiltrado.slice(inicio, inicio + this.perPagePadron);
  }

  get padronTotalPaginas(): number {
    return Math.max(1, Math.ceil(this.padronFiltrado.length / this.perPagePadron));
  }

  irPaginaPadron(delta: number): void {
    const destino = this.paginaPadron + delta;
    if (destino < 1 || destino > this.padronTotalPaginas) return;
    this.paginaPadron = destino;
  }

  buscarEmpleado(): void {
    this.paginaPadron = 1;
  }

  estaSeleccionado(id: number): boolean {
    return this.seleccionados.has(Number(id));
  }

  toggleEmpleado(id: number): void {
    const n = Number(id);
    if (!n) return;
    if (this.seleccionados.has(n)) this.seleccionados.delete(n);
    else this.seleccionados.add(n);
  }

  /** Todos los visibles en la página actual están seleccionados. */
  get todosPaginaSeleccionados(): boolean {
    const pagina = this.padronPagina;
    return pagina.length > 0 && pagina.every((e) => this.seleccionados.has(e.empleado_id));
  }

  /** Selecciona/deselecciona todos los visibles en la página actual. */
  toggleTodosPagina(): void {
    const pagina = this.padronPagina;
    const marcar = !this.todosPaginaSeleccionados;
    pagina.forEach((e) => {
      if (marcar) this.seleccionados.add(e.empleado_id);
      else this.seleccionados.delete(e.empleado_id);
    });
  }

  /** Selecciona todos los resultados del filtro actual (todas las páginas). */
  seleccionarTodosFiltrados(): void {
    this.padronFiltrado.forEach((e) => this.seleccionados.add(e.empleado_id));
  }

  limpiarSeleccion(): void {
    this.seleccionados.clear();
  }

  nombreEmpleado(e: EmpleadoPadron): string {
    return [e.apellido, e.nombre].filter(Boolean).join(', ') || '-';
  }

  /** Empleados seleccionados (ids válidos). */
  private get empleadosSeleccionados(): number[] {
    return Array.from(this.seleccionados).filter((n) => Number.isFinite(n) && n > 0);
  }

  /** Arma el request de generación/preview con la selección actual. */
  private buildRequest(): GenerationRequest | null {
    this.previewError = '';
    if (!this.genModel.mes) { this.previewError = 'Seleccione el mes del período.'; return null; }
    if (!this.genModel.anio) { this.previewError = 'Seleccione el año del período.'; return null; }
    if (!String(this.genModel.tipo_liquidacion || '').trim()) {
      this.previewError = 'Seleccione el tipo de liquidación.';
      return null;
    }

    const empleados = this.genModel.todos ? 'all' : this.empleadosSeleccionados;
    if (!this.genModel.todos && (!Array.isArray(empleados) || empleados.length === 0)) {
      this.previewError = 'Indique al menos un empleado o marque "Todos los empleados".';
      return null;
    }

    return {
      mes: Number(this.genModel.mes),
      anio: Number(this.genModel.anio),
      tipo_liquidacion: String(this.genModel.tipo_liquidacion).trim(),
      empleados,
      incluir_subsistemas: !!this.genModel.incluir_subsistemas
    };
  }

  /** Paso de vista previa: el backend arma las filas desde las liquidaciones. */
  previsualizar(): void {
    if (this.previsualizando) return;
    this.previewError = '';
    this.preview = null;

    const body = this.buildRequest();
    if (!body) { this.refresh(); return; }

    this.previsualizando = true;
    this.svc.preview(body).pipe(finalize(() => {
      this.previsualizando = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.previewError = this.msgError(res.error, 'No se pudo obtener la vista previa de la generación.');
        return;
      }
      this.preview = res.data;
      this.previewSelected = null;
      this.previewFiltro = '';
      this.syncPreviewSelection();
    });
  }

  /** Paso de confirmación: persiste la generación en el backend. */
  confirmarGenerar(): void {
    if (this.generando) return;
    this.generacionError = '';

    const body = this.buildRequest();
    if (!body) { this.refresh(); return; }

    this.generando = true;
    this.svc.generar(body).pipe(finalize(() => {
      this.generando = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.generacionError = this.msgError(res.error, 'No se pudo generar la información de Seguridad Social.');
        return;
      }
      this.generarVisible = false;
      this.preview = null;
      this.previewSelected = null;
      this.toast.success(`Generación SICOS creada (N° ${res.data.generacion_id}).`);
      this.cargar();
    });
  }

  // ---------- Helpers de la vista previa ----------

  get previewRows(): any[] {
    const raw = this.preview?.items || this.preview?.simulated_generaciones_detalle || [];
    const q = String(this.previewFiltro || '').trim().toLowerCase();
    const rows = Array.isArray(raw) ? raw.slice() : [];
    const filtered = !q ? rows : rows.filter((item) => {
      const hay = [
        item.legajo,
        item.nombre,
        item.cuil,
        item.remuneracion_total,
        item.rem_total
      ].map((v) => String(v ?? '')).join(' ').toLowerCase();
      return hay.includes(q);
    });
    return filtered.sort((a, b) => {
      const ar = Number(a?.remuneracion_total_cents ?? a?.rem_total_cents ?? (Number(a?.remuneracion_total ?? a?.rem_total ?? 0) * 100));
      const br = Number(b?.remuneracion_total_cents ?? b?.rem_total_cents ?? (Number(b?.remuneracion_total ?? b?.rem_total ?? 0) * 100));
      return this.previewSort === 'rem_desc' ? (br - ar) : (ar - br);
    });
  }

  get previewSummary(): any {
    return this.preview?.summary || {};
  }

  get previewWarnings(): any[] {
    return Array.isArray(this.preview?.warnings) ? this.preview.warnings : [];
  }
  get previewMissingDatosCount(): number {
    return Number(this.preview?.['missing_datos_count'] ?? this.preview?.diagnostico?.['missing_datos_count'] ?? this.previewMissingDatosPreview.length ?? 0);
  }
  get previewMissingDatosPreview(): any[] {
    const raw = this.preview?.['missing_datos_preview'] ?? this.preview?.diagnostico?.['missing_datos_preview'] ?? [];
    return Array.isArray(raw) ? raw : [];
  }
  get previewConfiguracionActual(): any {
    return this.preview?.['configuracion_actual'] || this.preview?.diagnostico?.['configuracion_actual'] || {};
  }
  get previewDiagnostico(): any {
    return this.preview?.diagnostico || {};
  }

  get previewIncludedCount(): number {
    return Number(this.previewSummary?.empleados_incluidos ?? this.previewSummary?.count ?? this.previewRows.length ?? 0);
  }

  get previewExcludedClosed(): number {
    return Number(this.previewSummary?.empleados_excluidos_por_no_cerrada ?? 0);
  }

  get previewExcludedZero(): number {
    return Number(this.previewSummary?.empleados_excluidos_por_rem_cero ?? 0);
  }

  get previewTotalRemCents(): number {
    const cents = this.previewSummary?.total_remuneraciones_cents;
    if (cents != null && !Number.isNaN(Number(cents))) return Number(cents);
    const total = this.previewSummary?.total_remuneraciones ?? this.previewSummary?.total_rem ?? 0;
    return Math.round(Number(total ?? 0) * 100);
  }

  get previewHasFallbackWarning(): boolean {
    return this.previewRows.some((row) => !!row.used_row?.used_convenio_categoria_fallback);
  }

  previewNombre(item: any): string {
    return [item?.legajo, item?.nombre].filter(Boolean).join(' - ') || String(item?.nombre ?? '').trim() || '-';
  }

  previewAdvertencias(item: any): string[] {
    const warnings = Array.isArray(item?.warnings) ? item.warnings.slice() : [];
    const diagnosticoWarnings = Array.isArray(item?.diagnostico?.warnings) ? item.diagnostico.warnings : [];
    const detalleWarnings = Array.isArray(item?.detalle_sicoss?.warnings) ? item.detalle_sicoss.warnings : [];
    if (!item?.cuil || String(item.cuil).replace(/\D/g, '').trim() === '') {
      warnings.push('Falta número de documento / CUIL.');
    }
    if (item?.used_row?.used_convenio_categoria_fallback) {
      warnings.push('Se usó sueldo de la categoría (convenio) por falta de sueldo básico vigente.');
    }
    return warnings.concat(diagnosticoWarnings, detalleWarnings).filter((w: any) => !!String(w ?? '').trim());
  }

  previewKey(item: any): number {
    return Number(item?.empleado_id ?? 0);
  }

  openPreviewDetail(item: any): void {
    this.previewSelected = item || null;
  }

  closePreviewDetail(): void {
    this.previewSelected = null;
  }

  isPreviewSelected(item: any): boolean {
    return this.previewKey(this.previewSelected) === this.previewKey(item);
  }

  syncPreviewSelection(): void {
    const rows = this.previewRows;
    if (rows.length === 0) {
      this.previewSelected = null;
      return;
    }
    if (!this.previewSelected) {
      this.previewSelected = rows[0];
      return;
    }
    const key = this.previewKey(this.previewSelected);
    if (!rows.some((row) => this.previewKey(row) === key)) {
      this.previewSelected = rows[0];
    }
  }

  previewSelectedConceptos(): any[] {
    return this.previewSelected ? this.previewConceptos(this.previewSelected) : [];
  }

  togglePreviewExpanded(item: any): void {
    const key = this.previewKey(item);
    if (!key) return;
    if (this.isPreviewSelected(item)) this.previewSelected = null;
    else this.previewSelected = item;
  }

  isPreviewExpanded(item: any): boolean {
    return this.isPreviewSelected(item);
  }

  previewMoneda(v: any): string {
    const n = Number(v ?? 0);
    return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  previewConceptos(item: any): any[] {
    const raw = item?.conceptos_simulados ?? item?.conceptos ?? item?.detalle_sicoss?.conceptos ?? item?.detalle_sicoss?.items ?? item?.detalle_sicoss ?? [];
    return Array.isArray(raw) ? raw : [];
  }

  previewDetalleJson(item: any): string {
    return JSON.stringify(item, null, 2);
  }

  downloadPreviewJson(): void {
    if (!this.preview) return;
    this.downloadTextFile('sicoss-preview.json', JSON.stringify(this.preview, null, 2), 'application/json;charset=utf-8');
  }

  downloadPreviewTxt(): void {
    if (!this.preview) return;
    const rows = this.previewRows;
    const lines = [
      `PREVIEW SICOS ${this.genModel.mes}/${this.genModel.anio}`,
      `Incluidos: ${this.previewIncludedCount}`,
      `Excluidos sin cerrada: ${this.previewExcludedClosed}`,
      `Excluidos rem 0: ${this.previewExcludedZero}`,
      `Total remuneraciones: ${this.previewMoneda(this.previewTotalRemCents / 100)}`,
      '',
      ...rows.map((r) => [
        `${r.legajo || '-'} | ${r.nombre || '-'} | ${r.cuil || '-'}`,
        `Rem. total: ${this.previewMoneda(r.remuneracion_total_cents != null ? Number(r.remuneracion_total_cents) / 100 : r.remuneracion_total)}`,
        `Conceptos: ${this.previewConceptos(r).length}`,
        `Warnings: ${this.previewAdvertencias(r).join(' ; ') || '-'}`
      ].join('\n'))
    ];
    this.downloadTextFile('sicoss-preview.txt', lines.join('\n\n'), 'text/plain;charset=utf-8');
  }

  money(v: any): string {
    const n = Number(v ?? 0);
    return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatCuil(item: any): string {
    const raw = String(item?.cuil ?? '').replace(/\D/g, '');
    if (!raw) return '-';
    if (raw.length === 11) return `${raw.slice(0, 2)}-${raw.slice(2, 10)}-${raw.slice(10)}`;
    return raw;
  }

  private downloadTextFile(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // ---------- Helpers ----------

  private refresh(): void {
    try { this.cdr.detectChanges(); } catch { /* ignore */ }
  }

  private msgError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'El recurso solicitado no fue encontrado.';
    if (status === 409) return 'La operación entra en conflicto con el estado actual del registro.';
    if (status === 422) return 'Los datos enviados no superaron las validaciones.';

    const payload = err?.error;
    if (payload && typeof payload === 'object') {
      const cand = [payload.message, payload.mensaje, payload.error, payload.detail]
        .filter((x) => typeof x === 'string' && x.trim());
      if (cand.length) return String(cand[0]);
    }
    if (typeof payload === 'string' && payload.trim() && !payload.startsWith('<')) return payload.trim();
    return err?.message || fallback;
  }
}
