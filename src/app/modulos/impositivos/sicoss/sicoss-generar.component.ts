import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { ToastService } from '../../../core/toast.service';
import { LiquidacionesService } from '../../sueldos/liquidaciones.service';
import { SicossService } from './sicoss.service';
import {
  EmpleadoPadron,
  GenerationRequest,
  LiquidacionTipo,
  PreviewResponse
} from './sicoss.model';

@Component({
  selector: 'app-sicoss-generar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './sicoss-generar.component.html',
  styleUrls: ['./sicoss-generar.component.scss']
})
export class SicossGenerarComponent implements OnInit, OnDestroy {
  private previewRefreshSub?: Subscription;

  loadingTipos = false;
  previsualizando = false;
  generando = false;
  previewError = '';
  generacionError = '';

  tiposLiquidacion: LiquidacionTipo[] = [];
  padron: EmpleadoPadron[] = [];
  padronLoading = false;
  padronCargado = false;
  busquedaEmpleado = '';
  paginaPadron = 1;
  perPagePadron = 10;
  seleccionados = new Set<number>();

  preview: PreviewResponse | null = null;
  previewFiltro = '';
  previewSort: 'rem_desc' | 'rem_asc' = 'rem_desc';
  previewSelected: any | null = null;
  previewSelectedKey: number | null = null;
  previewDetailTab: 'resumen' | 'trazabilidad' | 'conceptos' | 'diagnostico' | 'json' = 'resumen';
  collapseDatos = false;
  collapseEmpleados = false;
  collapsePreview = false;
  collapsePreviewDetail = false;
  compactPreview = false;

  genModel = {
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
    tipo_liquidacion: '',
    todos: true,
    incluir_subsistemas: true
  };

  readonly meses = [
    { valor: 1, nombre: 'Enero' }, { valor: 2, nombre: 'Febrero' },
    { valor: 3, nombre: 'Marzo' }, { valor: 4, nombre: 'Abril' },
    { valor: 5, nombre: 'Mayo' }, { valor: 6, nombre: 'Junio' },
    { valor: 7, nombre: 'Julio' }, { valor: 8, nombre: 'Agosto' },
    { valor: 9, nombre: 'Septiembre' }, { valor: 10, nombre: 'Octubre' },
    { valor: 11, nombre: 'Noviembre' }, { valor: 12, nombre: 'Diciembre' }
  ];

  constructor(
    private svc: SicossService,
    private liquidacionesSvc: LiquidacionesService,
    private auth: AuthService,
    private toast: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarTiposLiquidacion();
    this.cargarPadron();
    this.previewRefreshSub = this.svc.previewRefreshRequested$.subscribe(() => {
      if (this.preview && !this.previsualizando) {
        this.previsualizar();
      }
    });
    if (this.svc.consumePreviewRefreshRequested()) {
      this.restaurarUltimoPreview();
      if (this.buildRequest()) {
        setTimeout(() => this.previsualizar(), 0);
      }
    }
  }

  ngOnDestroy(): void {
    this.previewRefreshSub?.unsubscribe();
  }

  get puedeCrear(): boolean {
    const perms: any[] = this.auth.getPermissions() || [];
    return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === 'sicoss_crear' : p?.alias === 'sicoss_crear'));
  }

  volver(): void {
    this.router.navigate(['/admin/impositivos/sicoss']);
  }

  toggleCollapse(section: 'datos' | 'empleados' | 'preview' | 'detalle'): void {
    if (section === 'datos') this.collapseDatos = !this.collapseDatos;
    if (section === 'empleados') this.collapseEmpleados = !this.collapseEmpleados;
    if (section === 'preview') this.collapsePreview = !this.collapsePreview;
    if (section === 'detalle') this.collapsePreviewDetail = !this.collapsePreviewDetail;
  }

  get previewSummaryCollapsedLabel(): string {
    return this.collapsePreview ? 'Expandir' : 'Colapsar';
  }

  private cargarTiposLiquidacion(): void {
    this.loadingTipos = true;
    this.liquidacionesSvc.liquidacionTipos().pipe(finalize(() => {
      this.loadingTipos = false;
      this.refresh();
    })).subscribe((res: any) => {
      const raw: any = Array.isArray(res) ? res : (res?.data || res?.items || res?.liquidacion_tipos || []);
      const lista = Array.isArray(raw) ? raw : [];
      this.tiposLiquidacion = lista
        .map((x: any) => ({
          id: Number(x?.liquidacion_tipo_id ?? x?.id ?? 0),
          nombre: String(x?.nombre ?? x?.descripcion ?? '').trim()
        }))
        .filter((x: LiquidacionTipo) => x.id > 0 && x.nombre);
    });
  }

  private cargarPadron(): void {
    if (this.padronCargado || this.padronLoading) return;
    this.padronLoading = true;
    this.svc.empleados().pipe(finalize(() => {
      this.padronLoading = false;
      this.refresh();
    })).subscribe((res) => {
      this.padron = res.error ? [] : res.data;
      this.padronCargado = true;
      this.syncPreviewSelection();
    });
  }

  private restaurarUltimoPreview(): void {
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

  get padronFiltrado(): EmpleadoPadron[] {
    const q = String(this.busquedaEmpleado || '').trim().toLowerCase();
    if (!q) return this.padron;
    return this.padron.filter((e) => `${e.legajo} ${e.cuil} ${e.apellido} ${e.nombre}`.toLowerCase().includes(q));
  }

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

  nombreEmpleado(e: EmpleadoPadron): string {
    return [e.apellido, e.nombre].filter(Boolean).join(', ') || '-';
  }

  estaSeleccionado(id: number): boolean { return this.seleccionados.has(Number(id)); }

  toggleEmpleado(id: number): void {
    const n = Number(id);
    if (!n) return;
    if (this.seleccionados.has(n)) this.seleccionados.delete(n);
    else this.seleccionados.add(n);
  }

  get todosPaginaSeleccionados(): boolean {
    const pagina = this.padronPagina;
    return pagina.length > 0 && pagina.every((e) => this.seleccionados.has(e.empleado_id));
  }

  toggleTodosPagina(): void {
    const marcar = !this.todosPaginaSeleccionados;
    this.padronPagina.forEach((e) => {
      if (marcar) this.seleccionados.add(e.empleado_id);
      else this.seleccionados.delete(e.empleado_id);
    });
  }

  seleccionarTodosFiltrados(): void {
    this.padronFiltrado.forEach((e) => this.seleccionados.add(e.empleado_id));
  }

  limpiarSeleccion(): void {
    this.seleccionados.clear();
  }

  private get empleadosSeleccionados(): number[] {
    return Array.from(this.seleccionados).filter((n) => Number.isFinite(n) && n > 0);
  }

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

  previsualizar(): void {
    if (this.previsualizando) return;
    this.previewError = '';
    const body = this.buildRequest();
    if (!body) return;

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

  confirmarGenerar(): void {
    if (this.generando) return;
    this.generacionError = '';
    const body = this.buildRequest();
    if (!body) return;

    this.generando = true;
    this.svc.generar(body).pipe(finalize(() => {
      this.generando = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.generacionError = this.msgError(res.error, 'No se pudo generar la información de Seguridad Social.');
        return;
      }
      this.toast.success(`Generación SICOS creada (N° ${res.data.generacion_id}).`);
      this.router.navigate(['/admin/impositivos/sicoss/generaciones', res.data.generacion_id]);
    });
  }

  get previewRows(): any[] {
    const raw = this.preview?.items || this.preview?.simulated_generaciones_detalle || [];
    const q = String(this.previewFiltro || '').trim().toLowerCase();
    const rows = Array.isArray(raw) ? raw.slice() : [];
    const filtered = !q ? rows : rows.filter((item) => {
      const hay = [item.legajo, item.nombre, item.cuil, item.remuneracion_total, item.rem_total].map((v) => String(v ?? '')).join(' ').toLowerCase();
      return hay.includes(q);
    });
    return filtered.sort((a, b) => {
      const ar = Number(a?.remuneracion_total_cents ?? a?.rem_total_cents ?? (Number(a?.remuneracion_total ?? a?.rem_total ?? 0) * 100));
      const br = Number(b?.remuneracion_total_cents ?? b?.rem_total_cents ?? (Number(b?.remuneracion_total ?? b?.rem_total ?? 0) * 100));
      return this.previewSort === 'rem_desc' ? (br - ar) : (ar - br);
    });
  }

  get previewSummary(): any { return this.preview?.summary || {}; }
  get previewWarnings(): any[] { return Array.isArray(this.preview?.warnings) ? this.preview.warnings : []; }
  get previewIncludedCount(): number { return Number(this.previewSummary?.empleados_incluidos ?? this.previewSummary?.count ?? this.previewRows.length ?? 0); }
  get previewExcludedClosed(): number { return Number(this.previewSummary?.empleados_excluidos_por_no_cerrada ?? 0); }
  get previewExcludedZero(): number { return Number(this.previewSummary?.empleados_excluidos_por_rem_cero ?? 0); }
  get previewTotalRemCents(): number {
    const cents = this.previewSummary?.total_remuneraciones_cents;
    if (cents != null && !Number.isNaN(Number(cents))) return Number(cents);
    const total = this.previewSummary?.total_remuneraciones ?? this.previewSummary?.total_rem ?? 0;
    return Math.round(Number(total ?? 0) * 100);
  }
  get previewMissingDatosCount(): number {
    const preview = this.preview as PreviewResponse & {
      missing_datos_count?: number;
      diagnostico?: {
        missing_datos_count?: number;
        missing_datos_preview?: any[];
        configuracion_actual?: any;
      } | null;
    } | null;
    return Number(preview?.missing_datos_count ?? preview?.diagnostico?.missing_datos_count ?? this.previewMissingDatosPreview.length ?? 0);
  }
  get previewMissingDatosPreview(): any[] {
    const preview = this.preview as PreviewResponse & {
      missing_datos_preview?: any[];
      diagnostico?: {
        missing_datos_preview?: any[];
        configuracion_actual?: any;
      } | null;
    } | null;
    const raw = preview?.missing_datos_preview ?? preview?.diagnostico?.missing_datos_preview ?? [];
    return Array.isArray(raw) ? raw : [];
  }
  get previewConfiguracionActual(): any {
    const preview = this.preview as PreviewResponse & {
      configuracion_actual?: any;
      diagnostico?: {
        configuracion_actual?: any;
      } | null;
    } | null;
    return preview?.configuracion_actual || preview?.diagnostico?.configuracion_actual || {};
  }
  get previewDiagnostico(): any {
    return this.preview?.diagnostico || {};
  }
  get previewHasFallbackWarning(): boolean { return this.previewRows.some((row) => !!row.used_row?.used_convenio_categoria_fallback); }

  previewNombre(item: any): string { return [item?.legajo, item?.nombre].filter(Boolean).join(' - ') || String(item?.nombre ?? '').trim() || '-'; }
  previewAdvertencias(item: any): string[] {
    const warnings = Array.isArray(item?.warnings) ? item.warnings.slice() : [];
    const diagnosticoWarnings = Array.isArray(item?.diagnostico?.warnings) ? item.diagnostico.warnings : [];
    const detalleWarnings = Array.isArray(item?.detalle_sicoss?.warnings) ? item.detalle_sicoss.warnings : [];
    const friendly = warnings.map((w: any) => {
      const txt = String(w ?? '').trim();
      if (txt === 'used_convenio_categoria_fallback') return 'Se usó sueldo de la categoría (convenio) por falta de sueldo básico vigente.';
      if (txt === 'missing_sicoss_empleados_datos') return 'Faltan datos SICOSS del empleado.';
      if (txt === 'missing_sicoss_empleados') return 'Faltan datos SICOSS del empleado.';
      return txt;
    }).filter((x: string) => !!x);
    const merged = friendly.slice();
    diagnosticoWarnings.forEach((w: any) => merged.push(String(w ?? '').trim()));
    detalleWarnings.forEach((w: any) => merged.push(String(w ?? '').trim()));
    if (!item?.cuil || String(item.cuil).replace(/\D/g, '').trim() === '') warnings.push('Falta número de documento / CUIL.');
    if (item?.used_row?.used_convenio_categoria_fallback || item?.fallback_from_categoria) merged.push('Se usó sueldo de la categoría (convenio) por falta de sueldo básico vigente.');
    if (item?.used_source) merged.push('Fuente usada: ' + String(item.used_source));
    if (item?.source_id != null) merged.push('Source ID: ' + String(item.source_id));
    if (!item?.cuil || String(item.cuil).replace(/\D/g, '').trim() === '') merged.push('Falta número de documento / CUIL.');
    return Array.from(new Set(merged));
  }
  previewKey(item: any): number { return Number(item?.empleado_id ?? 0); }
  isPreviewSelected(item: any): boolean { return this.previewSelectedKey === this.previewKey(item); }
  openPreviewDetail(item: any): void {
    this.previewSelected = item || null;
    this.previewSelectedKey = this.previewKey(item);
    this.previewDetailTab = 'resumen';
  }
  closePreviewDetail(): void {
    this.previewSelected = null;
    this.previewDetailTab = 'resumen';
  }
  setPreviewDetailTab(tab: 'resumen' | 'trazabilidad' | 'conceptos' | 'diagnostico' | 'json'): void {
    this.previewDetailTab = tab;
  }
  syncPreviewSelection(): void {
    const rows = this.previewRows;
    if (rows.length === 0) {
      this.previewSelectedKey = null;
      if (!this.previewSelected) this.previewDetailTab = 'resumen';
      return;
    }

    if (this.previewSelectedKey === null || !rows.some((row) => this.previewKey(row) === this.previewSelectedKey)) {
      this.previewSelectedKey = this.previewKey(rows[0]);
    }
  }
  previewSelectedConceptos(): any[] { return this.previewSelected ? this.previewConceptos(this.previewSelected) : []; }
  previewMoneda(v: any): string { const n = Number(v ?? 0); return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  previewConceptos(item: any): any[] {
    const raw = item?.conceptos_simulados ?? item?.conceptos ?? item?.detalle_sicoss?.conceptos ?? item?.detalle_sicoss?.items ?? item?.detalle_sicoss ?? [];
    return Array.isArray(raw) ? raw : [];
  }
  previewConfiguracionLabel(): string {
    const cfg = this.previewConfiguracionActual;
    if (!cfg || typeof cfg !== 'object') return '-';
    const partes = [
      cfg.tipo_liquidacion,
      cfg.mes != null ? `Mes ${cfg.mes}` : '',
      cfg.anio != null ? `Año ${cfg.anio}` : ''
    ].filter((v) => !!String(v || '').trim());
    return partes.length ? partes.join(' · ') : '-';
  }
  previewDiagnosticoLabel(): string {
    const diag = this.previewDiagnostico;
    if (!diag || typeof diag !== 'object') return '-';
    const parts = [
      diag.estado,
      diag.resultado,
      diag.mensaje
    ].map((v) => String(v ?? '').trim()).filter((v) => !!v);
    return parts.length ? parts[0] : (this.previewMissingDatosCount > 0 ? `Faltan ${this.previewMissingDatosCount} dato(s)` : '-');
  }
  previewDetalleJson(item: any): string { return JSON.stringify(item, null, 2); }
  formatCuil(item: any): string {
    const raw = String(item?.cuil ?? '').replace(/\D/g, '');
    if (!raw) return '-';
    if (raw.length === 11) return `${raw.slice(0, 2)}-${raw.slice(2, 10)}-${raw.slice(10)}`;
    return raw;
  }

  previewTitleValue(item: any): string {
    const legajo = item?.legajo ? 'Legajo ' + item.legajo : 'Sin legajo';
    const empleado = item?.empleado_id != null ? 'Empleado #' + item.empleado_id : '';
    return [legajo, empleado].filter(Boolean).join(' · ');
  }

  previewField(item: any, key: string): string {
    const value = item ? item[key] : null;
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    return String(value);
  }

  previewMainFields(item: any): Array<{ label: string; value: string }> {
    return [
      { label: 'Empleado ID', value: this.previewField(item, 'empleado_id') },
      { label: 'Legajo', value: this.previewField(item, 'legajo') },
      { label: 'Nombre', value: this.previewField(item, 'nombre') },
      { label: 'Documento', value: this.previewField(item, 'numero_documento') },
      { label: 'CUIT', value: this.previewField(item, 'cuit') },
      { label: 'CUIL', value: this.previewField(item, 'cuil') },
      { label: 'Periodo ID', value: this.previewField(item, 'periodo_id') },
      { label: 'Empresa ID', value: this.previewField(item, 'empresa_id') },
      { label: 'Source ID', value: this.previewField(item, 'source_id') },
      { label: 'Used Source', value: this.previewField(item, 'used_source') },
      { label: 'Simulated', value: this.previewField(item, 'simulated') },
      { label: 'Fallback from categoria', value: this.previewField(item, 'fallback_from_categoria') },
      { label: 'Categoría código', value: this.previewField(item, 'categoria_codigo') },
      { label: 'Categoría nombre', value: this.previewField(item, 'categoria_nombre') },
      { label: 'Actividad', value: this.previewField(item, 'cod_actividad') },
      { label: 'Condición', value: this.previewField(item, 'cod_condicion') },
      { label: 'Zona', value: this.previewField(item, 'cod_zona') },
      { label: 'Rem. total', value: this.previewMoneda(Number(item?.remuneracion_total_cents ?? item?.rem_total_cents ?? (item?.remuneracion_total ?? item?.rem_total ?? 0) * 100) / 100) },
      { label: 'Asig. fam.', value: this.previewMoneda(Number(item?.asig_fam_pagadas ?? item?.asignaciones_familiares_pagadas ?? 0)) },
      { label: 'Aporte vol.', value: this.previewMoneda(Number(item?.aporte_voluntario ?? item?.imp_aporte_voluntario ?? 0)) },
      { label: 'Aporte adic. OS', value: this.previewMoneda(Number(item?.aporte_adicional_os ?? item?.imp_adicional_os ?? 0)) },
      { label: 'Configuración actual', value: this.previewConfiguracionLabel() },
      { label: 'Diagnóstico', value: this.previewDiagnosticoLabel() },
      { label: 'Datos faltantes', value: String(this.previewMissingDatosCount) }
    ];
  }

  previewFieldsByLabels(item: any, labels: string[]): Array<{ label: string; value: string }> {
    const fields = this.previewMainFields(item);
    return labels.map((label) => fields.find((field) => field.label === label)).filter((field): field is { label: string; value: string } => !!field);
  }

  readonly previewResumenLabels = ['Empleado ID', 'Legajo', 'Nombre', 'Documento', 'CUIT', 'CUIL'];
  readonly previewTrazabilidadLabels = ['Periodo ID', 'Empresa ID', 'Source ID', 'Used Source', 'Simulated', 'Fallback from categoria', 'Categoría código', 'Categoría nombre', 'Configuración actual', 'Diagnóstico', 'Datos faltantes'];
  readonly previewImportesLabels = ['Actividad', 'Condición', 'Zona', 'Rem. total', 'Asig. fam.', 'Aporte vol.', 'Aporte adic. OS'];

  previewConceptSummary(item: any): Array<{ label: string; value: string; raw: any }> {
    return this.previewConceptos(item).map((c: any) => ({
      label: c?.label || c?.descripcion || c?.code || c?.codigo || '-',
      value: this.previewMoneda(Number(c?.amount_cents ?? (c?.amount ?? 0) * 100) / 100),
      raw: c
    }));
  }

  downloadPreviewJson(): void {
    if (!this.preview) return;
    this.downloadTextFile('sicoss-preview.json', JSON.stringify(this.preview, null, 2), 'application/json;charset=utf-8');
  }

  downloadPreviewTxt(): void {
    if (!this.preview) return;
    const lines = [
      `PREVIEW SICOS ${this.genModel.mes}/${this.genModel.anio}`,
      `Incluidos: ${this.previewIncludedCount}`,
      `Excluidos sin cerrada: ${this.previewExcludedClosed}`,
      `Excluidos rem 0: ${this.previewExcludedZero}`,
      `Total remuneraciones: ${this.previewMoneda(this.previewTotalRemCents / 100)}`,
      '',
      ...this.previewRows.map((r) => [
        `${r.legajo || '-'} | ${r.nombre || '-'} | ${r.cuil || '-'}`,
        `Rem. total: ${this.previewMoneda(r.remuneracion_total_cents != null ? Number(r.remuneracion_total_cents) / 100 : r.remuneracion_total)}`,
        `Conceptos: ${this.previewConceptos(r).length}`,
        `Warnings: ${this.previewAdvertencias(r).join(' ; ') || '-'}`
      ].join('\n'))
    ];
    this.downloadTextFile('sicoss-preview.txt', lines.join('\n\n'), 'text/plain;charset=utf-8');
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

  private refresh(): void { try { this.cdr.detectChanges(); } catch { /* ignore */ } }

  private msgError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'El recurso solicitado no fue encontrado.';
    if (status === 409) return 'La operación entra en conflicto con el estado actual del registro.';
    if (status === 422) return 'Los datos enviados no superaron las validaciones.';
    const payload = err?.error;
    if (payload && typeof payload === 'object') {
      const cand = [payload.message, payload.mensaje, payload.error, payload.detail].filter((x) => typeof x === 'string' && x.trim());
      if (cand.length) return String(cand[0]);
    }
    if (typeof payload === 'string' && payload.trim() && !payload.startsWith('<')) return payload.trim();
    return err?.message || fallback;
  }
}
