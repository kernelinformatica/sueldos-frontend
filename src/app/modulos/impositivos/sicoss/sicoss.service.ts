import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of, Subject } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import {
  ConceptoCatalogoItem,
  EmpleadoPadron,
  EmpleadoPadronPaginado,
  ExportRequest,
  ExportResponse,
  ExportacionItem,
  GenerateResponse,
  GeneracionDetalleFull,
  GeneracionHeader,
  GeneracionPreviewItem,
  GeneracionesPaginadas,
  GenerationRequest,
  PreviewConfiguracionActual,
  PreviewConceptItem,
  PreviewDiagnosticoItem,
  PreviewMissingDatoItem,
  PreviewResponse,
  PreviewItem,
  PreviewUsedRow,
  SicossBaseSicoss,
  SicossClasificacionFuncional,
  SicossConfiguracionSnapshot,
  SicossCreate,
  SicossConceptoConfiguracionItem,
  SicossConfiguracionPersistPayload,
  SicossConfiguracionPersistResponse,
  SicossConceptoRemuneracionItem,
  SicossConceptoRemuneracionReplacePayload,
  SicossItem,
  SicossListResponse,
  SicossResult,
  SicossUpdate,
  LsdSegSocialConceptoItem,
  LsdSegSocialConceptoPayload,
  Subsistema,
  SubsistemaCategoria
} from './sicoss.model';

/**
 * Servicio del módulo SICOS / Seguridad Social / ARCA.
 *
 * Contrato: /api/sicoss. Todas las operaciones son tenant-scoped:
 * la empresa la determina el backend a partir del token JWT enviado en
 * la cabecera Authorization. NUNCA se envía `empresa_id` en el body.
 */
@Injectable({ providedIn: 'root' })
export class SicossService {
  private readonly baseUrl = `${environment.apiUrl}/api/sicoss`;
  private readonly previewRefreshRequestedSubject = new Subject<void>();
  readonly previewRefreshRequested$ = this.previewRefreshRequestedSubject.asObservable();

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: 'Bearer ' + token }) : new HttpHeaders();
  }

  private rememberPreviewRequest(request: GenerationRequest): void {
    try {
      localStorage.setItem('sicoss_last_preview_request', JSON.stringify(request));
    } catch {
      // ignore storage failures
    }
  }

  getLastPreviewRequest(): GenerationRequest | null {
    try {
      const raw = localStorage.getItem('sicoss_last_preview_request');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed as GenerationRequest : null;
    } catch {
      return null;
    }
  }

  notifyPreviewRefreshRequested(): void {
    try {
      localStorage.setItem('sicoss_preview_refresh_requested_at', String(Date.now()));
    } catch {
      // ignore storage failures
    }
    this.previewRefreshRequestedSubject.next();
  }

  consumePreviewRefreshRequested(): boolean {
    try {
      const raw = localStorage.getItem('sicoss_preview_refresh_requested_at');
      if (!raw) return false;
      localStorage.removeItem('sicoss_preview_refresh_requested_at');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normaliza un registro crudo del backend a SicossItem.
   *
   * El backend puede devolver la clave primaria bajo distintos nombres
   * (id, sicoss_id, sicos_id, ...). Se resuelve de forma defensiva para no
   * enviar nunca id=0 al eliminar/exportar.
   *
   * Estado: en la base 1 = activo, 2 = inactivo. Se contemplan además
   * booleanos y textos ('activo'/'inactivo') por robustez.
   */
  private normalizar(x: any): SicossItem {
    const idRaw = x?.id ?? x?.sicoss_id ?? x?.sicos_id ?? x?.id_sicoss ?? x?.id_sicos ?? x?.pk ?? x?.Id;
    return {
      id: Number(idRaw ?? 0),
      codigo: String(x?.codigo ?? x?.cod ?? '').trim(),
      nombre: String(x?.nombre ?? x?.descripcion ?? x?.desc ?? '').trim(),
      prioridad: Number(x?.prioridad ?? x?.orden ?? 0),
      activo: this.esActivo(x),
      empresa_id: Number(x?.empresa_id ?? 0),
      created_by: x?.created_by != null ? Number(x.created_by) : undefined,
      created_at: x?.created_at ?? undefined,
      updated_at: x?.updated_at ?? undefined,
      metadata: x?.metadata ?? undefined
    };
  }

  /**
   * Determina si el registro está activo según la convención de la base:
   * 1 = activo, 2 = inactivo. Acepta también booleanos y textos.
   */
  private esActivo(x: any): boolean {
    const raw = x?.activo ?? x?.estado ?? x?.estado_id ?? x?.estado_nombre ?? 1;

    if (typeof raw === 'boolean') return raw;

    const num = Number(raw);
    if (Number.isFinite(num) && String(raw).trim() !== '') {
      // 1 = activo; 2 = inactivo; 0 = también inactivo.
      return num === 1;
    }

    const txt = String(raw).trim().toLowerCase();
    return txt === 'activo' || txt === 'activa' || txt === 'true' || txt === '1';
  }

  /**
   * GET /api/sicoss?page&perPage&search
   * Devuelve los items paginados junto al total.
   */
  list(page = 1, perPage = 25, search?: string): Observable<{ data: SicossListResponse; error?: any }> {
    let params = new HttpParams().set('page', String(page)).set('perPage', String(perPage));
    const q = String(search ?? '').trim();
    if (q) params = params.set('search', q);

    return this.http.get<any>(this.baseUrl, { headers: this.headers(), params }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.items || res?.data || []);
        const items = (Array.isArray(raw) ? raw : []).map((x) => this.normalizar(x));
        return {
          data: {
            items,
            total: Number(res?.total ?? items.length),
            page: Number(res?.page ?? page),
            perPage: Number(res?.perPage ?? perPage)
          } as SicossListResponse
        };
      }),
      catchError((err) => of({
        data: { items: [], total: 0, page, perPage } as SicossListResponse,
        error: err
      }))
    );
  }

  /** GET /api/sicoss/:id */
  get(id: number): Observable<SicossResult<SicossItem>> {
    return this.http.get<any>(`${this.baseUrl}/${id}`, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: this.normalizar(res?.data || res) })),
      catchError((err) => of({ data: null, error: err } as SicossResult<SicossItem>))
    );
  }

  /** POST /api/sicoss. El body no incluye empresa_id. */
  create(payload: SicossCreate): Observable<SicossResult<SicossItem>> {
    return this.http.post<any>(this.baseUrl, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: this.normalizar(res?.data || res) })),
      catchError((err) => of({ data: null, error: err } as SicossResult<SicossItem>))
    );
  }

  /** PUT /api/sicoss/:id. El body no incluye empresa_id. */
  update(id: number, payload: SicossUpdate): Observable<SicossResult<SicossItem>> {
    return this.http.put<any>(`${this.baseUrl}/${id}`, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: this.normalizar(res?.data || res) })),
      catchError((err) => of({ data: null, error: err } as SicossResult<SicossItem>))
    );
  }

  /** DELETE /api/sicoss/:id */
  delete(id: number): Observable<{ ok: boolean; error?: any }> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.headers() }).pipe(
      map(() => ({ ok: true })),
      catchError((err) => of({ ok: false, error: err }))
    );
  }

  /**
   * POST /api/sicoss/:id/export
   * El backend solo persiste el archivo ARCA ya serializado que se envía.
   */
  export(id: number, body: ExportRequest): Observable<SicossResult<ExportResponse>> {
    return this.http.post<any>(`${this.baseUrl}/${id}/export`, body, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: (res?.data || res) as ExportResponse })),
      catchError((err) => of({ data: null, error: err } as SicossResult<ExportResponse>))
    );
  }

  /**
   * POST /api/sicoss/generaciones/preview
   * El backend arma la vista previa desde las liquidaciones existentes:
   * lista de empleados con totales y warnings. No persiste nada.
   */
  preview(body: GenerationRequest): Observable<SicossResult<PreviewResponse>> {
    this.rememberPreviewRequest(body);
    return this.http.post<any>(`${this.baseUrl}/generaciones/preview`, body, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: this.normalizarPreviewResponse(res?.data || res) })),
      catchError((err) => of({ data: null, error: err } as SicossResult<PreviewResponse>))
    );
  }

  /**
   * POST /api/sicoss/generaciones
   * Persiste la generación (y su detalle por empleado) en el backend.
   * Acepta el mismo body que el preview o bien { preview_id } para persistir
   * la vista previa ya calculada.
   */
  generar(body: GenerationRequest | { preview_id: string }): Observable<SicossResult<GenerateResponse>> {
    return this.http.post<any>(`${this.baseUrl}/generaciones`, body, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: (res?.data || res) as GenerateResponse })),
      catchError((err) => of({ data: null, error: err } as SicossResult<GenerateResponse>))
    );
  }

  /**
   * GET /api/sicoss/subsistemas?categoria=sicoss|impositivo
   * Catálogo de subsistemas permitidos para la empresa (tenant-scoped).
   */
  subsistemas(categoria?: SubsistemaCategoria | string): Observable<{ data: Subsistema[]; error?: any }> {
    let params = new HttpParams();
    const cat = String(categoria ?? '').trim();
    if (cat) params = params.set('categoria', cat);

    return this.http.get<any>(`${this.baseUrl}/subsistemas`, { headers: this.headers(), params }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.items || res?.data || []);
        const lista = (Array.isArray(raw) ? raw : []) as any[];
        return {
          data: lista
            .map((x: any): Subsistema => ({
              subsistema_id: Number(x?.subsistema_id ?? x?.id ?? 0),
              codigo: String(x?.codigo ?? x?.cod ?? '').trim(),
              nombre: String(x?.nombre ?? x?.descripcion ?? '').trim(),
              categoria: x?.categoria ?? null,
              estado_id: x?.estado_id != null ? Number(x.estado_id) : (x?.estado != null && Number(x.estado) > 0 ? Number(x.estado) : null),
              estado: this.etiquetaEstadoSubsistema(x),
              activo: this.esActivoSubsistema(x),
              empresa_id: x?.empresa_id != null ? Number(x.empresa_id) : null
            }))
            .filter((s: Subsistema) => s.subsistema_id > 0 && (!!s.codigo || !!s.nombre))
        };
      }),
      catchError((err) => of({ data: [] as Subsistema[], error: err }))
    );
  }

  /** PUT /api/sicoss/subsistemas/:id */
  updateSubsistema(id: number, payload: Partial<Pick<Subsistema, 'codigo' | 'nombre' | 'categoria' | 'estado_id' | 'activo'>>): Observable<{ data: Subsistema | null; error?: any }> {
    return this.http.put<any>(`${this.baseUrl}/subsistemas/${id}`, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({
        data: this.subsistemaFromResponse(res?.data || res)
      })),
      catchError((err) => of({ data: null, error: err }))
    );
  }

  /** DELETE /api/sicoss/subsistemas/:id */
  deleteSubsistema(id: number): Observable<{ ok: boolean; error?: any }> {
    return this.http.delete<void>(`${this.baseUrl}/subsistemas/${id}`, { headers: this.headers() }).pipe(
      map(() => ({ ok: true })),
      catchError((err) => of({ ok: false, error: err }))
    );
  }

  /** GET /api/conceptos */
  conceptosCatalogo(search?: string): Observable<{ data: ConceptoCatalogoItem[]; error?: any }> {
    let params = new HttpParams();
    const q = String(search ?? '').trim();
    if (q) params = params.set('search', q);
    params = params.set('page', '1').set('perPage', '1000');

    return this.http.get<any>(`${environment.apiUrl}/api/conceptos`, { headers: this.headers(), params }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.items || res?.data || []);
        const items = (Array.isArray(raw) ? raw : []).map((x: any) => ({
          concepto_id: Number(x?.concepto_id ?? x?.id ?? x?.conceptoId ?? 0),
          codigo: String(x?.codigo ?? x?.cod ?? x?.concepto_codigo ?? x?.nombre ?? '').trim(),
          nombre: String(x?.nombre ?? x?.descripcion ?? x?.detalle ?? '').trim(),
          descripcion: x?.descripcion ?? x?.detalle ?? null,
          grupo_id: x?.grupo_id != null ? Number(x.grupo_id) : (x?.grupo?.grupo_id != null ? Number(x.grupo.grupo_id) : null),
          grupo_nombre: x?.grupo?.nombre ?? x?.grupo_nombre ?? null,
          activo: x?.activo != null ? this.esActivo(x) : null,
          empresa_id: x?.empresa_id != null ? Number(x.empresa_id) : null,
          raw: x
        })).filter((x: ConceptoCatalogoItem) => x.concepto_id > 0);
        return { data: items };
      }),
      catchError((err) => of({ data: [], error: err }))
    );
  }

  /** GET /api/sicoss/conceptos-remuneraciones */
  sicossConceptosRemuneracionesList(conceptoId?: number): Observable<{ data: SicossConceptoRemuneracionItem[]; error?: any }> {
    let params = new HttpParams();
    if (conceptoId != null) params = params.set('concepto_id', String(conceptoId));

    return this.http.get<any>(`${this.baseUrl}/conceptos-remuneraciones`, { headers: this.headers(), params }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.items || res?.data || []);
        return {
          data: (Array.isArray(raw) ? raw : []).map((row: any) => ({
            empresa_id: row?.empresa_id != null ? Number(row.empresa_id) : null,
            concepto_id: Number(row?.concepto_id ?? 0),
            remuneracion: String(row?.remuneracion ?? '').trim(),
            fecha_desde: row?.fecha_desde ?? null,
            fecha_hasta: row?.fecha_hasta ?? null,
            activo: row?.activo != null ? row.activo : null,
            concepto_codigo: row?.concepto_codigo ?? null,
            concepto_nombre: row?.concepto_nombre ?? null,
            raw: row
          })).filter((row: SicossConceptoRemuneracionItem) => row.concepto_id > 0 && !!row.remuneracion)
        };
      }),
      catchError((err) => of({ data: [], error: err }))
    );
  }

  /** PUT /api/sicoss/conceptos-remuneraciones/replace */
  sicossConceptosRemuneracionesReplace(payload: SicossConceptoRemuneracionReplacePayload): Observable<SicossResult<any>> {
    return this.http.put<any>(`${this.baseUrl}/conceptos-remuneraciones/replace`, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: res?.data || res })),
      catchError((err) => of({ data: null, error: err } as SicossResult<any>))
    );
  }

  /** GET /api/sicoss/lsd-conceptos */
  lsdSegSocialConceptosList(conceptoId?: number): Observable<{ data: LsdSegSocialConceptoItem[]; error?: any }> {
    let params = new HttpParams();
    if (conceptoId != null) params = params.set('concepto_id', String(conceptoId));

    return this.http.get<any>(`${this.baseUrl}/lsd-conceptos`, { headers: this.headers(), params }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.items || res?.data || []);
        return {
          data: (Array.isArray(raw) ? raw : []).map((row: any) => ({
            concepto_seg_social_id: row?.concepto_seg_social_id != null ? Number(row.concepto_seg_social_id) : null,
            empresa_id: row?.empresa_id != null ? Number(row.empresa_id) : null,
            concepto_id: Number(row?.concepto_id ?? 0),
            subsistema_id: Number(row?.subsistema_id ?? 0),
            afecta_base: row?.afecta_base ?? null,
            es_aporte: row?.es_aporte ?? null,
            es_contribucion: row?.es_contribucion ?? null,
            estado_id: row?.estado_id != null ? Number(row.estado_id) : null,
            concepto_codigo: row?.concepto_codigo ?? null,
            concepto_nombre: row?.concepto_nombre ?? null,
            subsistema_codigo: row?.subsistema_codigo ?? null,
            subsistema_nombre: row?.subsistema_nombre ?? null,
            raw: row
          })).filter((row: LsdSegSocialConceptoItem) => row.concepto_id > 0 && row.subsistema_id > 0)
        };
      }),
      catchError((err) => of({ data: [], error: err }))
    );
  }

  /** POST /api/sicoss/lsd-conceptos */
  lsdSegSocialConceptosCreate(payload: LsdSegSocialConceptoPayload): Observable<SicossResult<LsdSegSocialConceptoItem>> {
    return this.http.post<any>(`${this.baseUrl}/lsd-conceptos`, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: res?.data || res })),
      catchError((err) => of({ data: null, error: err } as SicossResult<LsdSegSocialConceptoItem>))
    );
  }

  /** PUT /api/sicoss/lsd-conceptos/:id */
  lsdSegSocialConceptosUpdate(id: number, payload: Partial<LsdSegSocialConceptoPayload>): Observable<SicossResult<LsdSegSocialConceptoItem>> {
    return this.http.put<any>(`${this.baseUrl}/lsd-conceptos/${id}`, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: res?.data || res })),
      catchError((err) => of({ data: null, error: err } as SicossResult<LsdSegSocialConceptoItem>))
    );
  }

  /** DELETE /api/sicoss/lsd-conceptos/:id */
  lsdSegSocialConceptosDelete(id: number): Observable<SicossResult<{ ok: boolean }>> {
    return this.http.delete<any>(`${this.baseUrl}/lsd-conceptos/${id}`, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: res?.data || res || { ok: true } })),
      catchError((err) => of({ data: null, error: err } as SicossResult<{ ok: boolean }>))
    );
  }

  /** GET /api/sicoss/conceptos-configuracion */
  conceptosConfiguracionList(): Observable<{ data: SicossConceptoConfiguracionItem[]; error?: any }> {
    return this.http.get<any>(`${this.baseUrl}/conceptos-configuracion`, { headers: this.headers() }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.items || res?.data || []);
        return {
          data: (Array.isArray(raw) ? raw : []).map((row: any) => ({
            concepto_id: Number(row?.concepto_id ?? 0),
            codigo: row?.codigo ?? null,
            descripcion: row?.descripcion ?? null,
            base_sicoss: row?.base_sicoss ?? null,
            clasificacion_funcional: row?.clasificacion_funcional ?? null,
            participa_remuneracion_10: row?.participa_remuneracion_10 != null ? this.esVerdadero(row.participa_remuneracion_10) : null,
            afecta_importe_a_detraer: row?.afecta_importe_a_detraer != null ? this.esVerdadero(row.afecta_importe_a_detraer) : null,
            configurado: row?.configurado != null ? this.esVerdadero(row.configurado) : null,
            observacion: row?.observacion ?? null,
            raw: row
          })).filter((row: SicossConceptoConfiguracionItem) => row.concepto_id > 0)
        };
      }),
      catchError((err) => of({ data: [], error: err }))
    );
  }

  /** POST /api/sicoss/configuracion */
  guardarConfiguracion(payload: SicossConfiguracionPersistPayload): Observable<SicossResult<SicossConfiguracionPersistResponse>> {
    return this.http.post<any>(`${this.baseUrl}/configuracion`, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: res?.data || res })),
      catchError((err) => of({ data: null, error: err } as SicossResult<SicossConfiguracionPersistResponse>))
    );
  }

  private subsistemaFromResponse(x: any): Subsistema {
    return {
      subsistema_id: Number(x?.subsistema_id ?? x?.id ?? 0),
      codigo: String(x?.codigo ?? x?.cod ?? '').trim(),
      nombre: String(x?.nombre ?? x?.descripcion ?? '').trim(),
      categoria: x?.categoria ?? null,
      estado_id: x?.estado_id != null ? Number(x.estado_id) : (x?.estado != null && Number(x.estado) > 0 ? Number(x.estado) : null),
      estado: this.etiquetaEstadoSubsistema(x),
      activo: this.esActivoSubsistema(x),
      empresa_id: x?.empresa_id != null ? Number(x.empresa_id) : null
    };
  }

  private numeroDocumentoComoCuil(x: any): string {
    const candidato = String(x?.numero_documento ?? x?.cuil ?? x?.cuit ?? '').trim();
    if (!candidato) return '';
    return candidato.replace(/[^\d]/g, '');
  }

  private normalizarPreviewResponse(res: any): PreviewResponse {
    const diagnosticoRaw = this.normalizarObject(res?.diagnostico ?? res?.diagnostic ?? null);
    const configuracionRaw = res?.configuracion_actual ?? diagnosticoRaw?.configuracion_actual ?? null;
    const detalleRaw = this.firstArray(
      res?.items,
      res?.simulated_generaciones_detalle,
      res?.detalle_sicoss,
      res?.preview_items
    );
    const warningsRaw = this.firstArray(res?.warnings, diagnosticoRaw?.warnings, diagnosticoRaw?.advertencias);
    const missingDatosRaw = this.firstArray(
      res?.missing_datos_preview,
      diagnosticoRaw?.missing_datos_preview,
      diagnosticoRaw?.missing_datos,
      res?.missing_datos
    );
    const summary = this.normalizarPreviewSummary(res?.summary ?? diagnosticoRaw?.summary);
    const rows = detalleRaw.map((item: any) => this.normalizarPreviewItem(item));
    return {
      ...res,
      preview_id: res?.preview_id ?? res?.id ?? undefined,
      simulated_generaciones_detalle: rows,
      items: rows,
      missing_datos_count: Number(res?.missing_datos_count ?? diagnosticoRaw?.missing_datos_count ?? missingDatosRaw.length ?? 0),
      missing_datos_preview: missingDatosRaw.map((item: any) => this.normalizarMissingDatoItem(item)),
      configuracion_actual: this.normalizarConfiguracionActual(configuracionRaw),
      diagnostico: this.normalizarDiagnostico(diagnosticoRaw, summary, missingDatosRaw, configuracionRaw, warningsRaw),
      summary,
      warnings: warningsRaw.map((w: any) => this.normalizarPreviewWarning(w))
    };
  }

  private normalizarPreviewSummary(summary: any): PreviewResponse['summary'] {
    if (!summary || typeof summary !== 'object') {
      return {
        empleados_incluidos: 0,
        empleados_excluidos_por_no_cerrada: 0,
        empleados_excluidos_por_rem_cero: 0,
        total_remuneraciones: 0,
        total_remuneraciones_cents: 0
      };
    }
    return {
      count: summary.count != null ? Number(summary.count) : undefined,
      empleados_incluidos: summary.empleados_incluidos != null ? Number(summary.empleados_incluidos) : Number(summary.count ?? 0),
      empleados_excluidos_por_no_cerrada: summary.empleados_excluidos_por_no_cerrada != null ? Number(summary.empleados_excluidos_por_no_cerrada) : 0,
      empleados_excluidos_por_rem_cero: summary.empleados_excluidos_por_rem_cero != null ? Number(summary.empleados_excluidos_por_rem_cero) : 0,
      total_rem: summary.total_rem ?? summary.total_remuneraciones ?? 0,
      total_remuneraciones: summary.total_remuneraciones ?? summary.total_rem ?? 0,
      total_remuneraciones_cents: summary.total_remuneraciones_cents != null ? Number(summary.total_remuneraciones_cents) : null,
      versionReglas: summary.versionReglas ?? summary.version_reglas ?? null
    };
  }

  private normalizarPreviewWarning(w: any): any {
    if (!w || typeof w !== 'object') return w;
    return {
      ...w,
      empleado_id: w.empleado_id != null ? Number(w.empleado_id) : null,
      warning: String(w.warning ?? w.mensaje ?? w.message ?? '').trim()
    };
  }

  private normalizarConfiguracionActual(configuracion: any): PreviewConfiguracionActual | null {
    if (!configuracion || typeof configuracion !== 'object') return null;
    return {
      ...configuracion,
      empresa_id: configuracion.empresa_id != null ? Number(configuracion.empresa_id) : null,
      mes: configuracion.mes != null ? Number(configuracion.mes) : null,
      anio: configuracion.anio != null ? Number(configuracion.anio) : null,
      tipo_liquidacion: configuracion.tipo_liquidacion != null ? String(configuracion.tipo_liquidacion).trim() : null,
      incluir_subsistemas: configuracion.incluir_subsistemas != null ? this.esVerdadero(configuracion.incluir_subsistemas) : null
    };
  }

  private normalizarDiagnostico(
    diagnostico: any,
    summary: PreviewResponse['summary'],
    missingDatosRaw: any[],
    configuracionRaw: any,
    warningsRaw: any[]
  ): PreviewDiagnosticoItem | Record<string, any> | null {
    if (!diagnostico || typeof diagnostico !== 'object') {
      if (!configuracionRaw && !missingDatosRaw.length && !warningsRaw.length && !summary) return null;
      return {
        summary,
        configuracion_actual: this.normalizarConfiguracionActual(configuracionRaw),
        missing_datos_count: Number(missingDatosRaw.length ?? 0),
        missing_datos_preview: missingDatosRaw.map((item: any) => this.normalizarMissingDatoItem(item)),
        warnings: warningsRaw.map((w: any) => this.normalizarPreviewWarning(w))
      };
    }

    return {
      ...diagnostico,
      summary: diagnostico.summary ?? summary,
      configuracion_actual: this.normalizarConfiguracionActual(diagnostico.configuracion_actual ?? configuracionRaw),
      missing_datos_count: Number(diagnostico.missing_datos_count ?? missingDatosRaw.length ?? 0),
      missing_datos_preview: this.firstArray(diagnostico.missing_datos_preview, missingDatosRaw).map((item: any) => this.normalizarMissingDatoItem(item)),
      warnings: this.firstArray(diagnostico.warnings, warningsRaw).map((w: any) => this.normalizarPreviewWarning(w))
    };
  }

  private normalizarMissingDatoItem(item: any): PreviewMissingDatoItem | any {
    if (!item || typeof item !== 'object') return item;
    return {
      ...item,
      empleado_id: item?.empleado_id != null ? Number(item.empleado_id) : null,
      cuil: item?.cuil != null ? String(item.cuil).trim() : null,
      legajo: item?.legajo != null ? String(item.legajo).trim() : null,
      nombre: item?.nombre != null ? String(item.nombre).trim() : null,
      motivo: item?.motivo != null ? String(item.motivo).trim() : null,
      mensaje: item?.mensaje != null ? String(item.mensaje).trim() : (item?.message != null ? String(item.message).trim() : null),
      detail: item?.detail != null ? String(item.detail).trim() : null,
      warnings: Array.isArray(item?.warnings) ? item.warnings.map((w: any) => String(w).trim()).filter((w: string) => !!w) : undefined
    };
  }

  private normalizarObject(value: any): any {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  private firstArray(...candidates: any[]): any[] {
    let emptyArray: any[] | null = null;
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        if (candidate.length > 0) return candidate;
        if (emptyArray === null) emptyArray = candidate;
      }
    }
    return emptyArray || [];
  }

  private normalizarPreviewItem(x: any): PreviewItem {
    const remTotal = x?.remuneracion_total ?? x?.rem_total ?? 0;
    const remTotalCents = x?.remuneracion_total_cents ?? x?.rem_total_cents ?? null;
    const conceptosRaw = Array.isArray(x?.conceptos_simulados)
      ? x.conceptos_simulados
      : (Array.isArray(x?.conceptos) ? x.conceptos : []);
    return {
      ...x,
      empresa_id: x?.empresa_id != null ? Number(x.empresa_id) : null,
      generacion_id: x?.generacion_id != null ? Number(x.generacion_id) : null,
      periodo_id: x?.periodo_id != null ? Number(x.periodo_id) : null,
      empleado_id: Number(x?.empleado_id ?? 0),
      legajo: x?.legajo != null ? String(x.legajo).trim() : null,
      nombre: String(x?.nombre ?? '').trim(),
      numero_documento: x?.numero_documento != null ? String(x.numero_documento).trim() : null,
      cuit: x?.cuit != null ? String(x.cuit).trim() : null,
      cuil: String(x?.cuil ?? x?.numero_documento ?? x?.cuit ?? '').trim(),
      remuneracion_total: remTotal,
      remuneracion_total_cents: remTotalCents != null ? Number(remTotalCents) : null,
      rem_total: remTotal,
      rem_total_cents: remTotalCents != null ? Number(remTotalCents) : null,
      asignaciones_familiares_pagadas: x?.asignaciones_familiares_pagadas ?? x?.asig_fam_pagadas ?? 0,
      aporte_voluntario: x?.aporte_voluntario ?? x?.imp_aporte_voluntario ?? 0,
      aporte_adicional_os: x?.aporte_adicional_os ?? x?.imp_adicional_os ?? 0,
      cod_actividad: x?.cod_actividad ?? null,
      categoria_codigo: x?.categoria_codigo ?? null,
      categoria_nombre: x?.categoria_nombre ?? null,
      cod_condicion: x?.cod_condicion ?? null,
      cod_zona: x?.cod_zona ?? null,
      used_source: x?.used_source ?? null,
      source_id: x?.source_id != null ? Number(x.source_id) : null,
      simulated: this.esVerdadero(x?.simulated),
      fallback_from_categoria: this.esVerdadero(x?.fallback_from_categoria),
      used_row: this.normalizarUsedRow(x?.used_row ?? x?.usedRow),
      conceptos_simulados: conceptosRaw.map((c: any) => this.normalizarConceptoSimulado(c)),
      conceptos: conceptosRaw.map((c: any) => this.normalizarConceptoSimulado(c)),
      detalle_sicoss: x?.detalle_sicoss ?? x?.detalleSicoss ?? null,
      diagnostico: x?.diagnostico ?? null,
      warnings: this.normalizarWarnings(x?.warnings ?? x?.diagnostico?.warnings ?? x?.detalle_sicoss?.warnings),
      excluded_reason: x?.excluded_reason ?? x?.motivo_exclusion ?? null
    };
  }

  private normalizarWarnings(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((w: any) => {
          if (w === null || w === undefined) return '';
          if (typeof w === 'string') return w.trim();
          if (typeof w === 'object') return String(w.warning ?? w.mensaje ?? w.message ?? w.detail ?? '').trim();
          return String(w).trim();
        })
        .filter((w: string) => !!w);
    }
    if (typeof value === 'string') {
      const txt = value.trim();
      return txt ? [txt] : [];
    }
    return [];
  }

  private normalizarUsedRow(x: any): PreviewUsedRow | null {
    if (!x || typeof x !== 'object') return null;
    return {
      ...x,
      source: x?.source ?? null,
      source_id: x?.source_id != null ? Number(x.source_id) : null,
      used_convenio_categoria_fallback: this.esVerdadero(x?.used_convenio_categoria_fallback)
    };
  }

  private normalizarConceptoSimulado(x: any): PreviewConceptItem {
    return {
      ...x,
      codigo: x?.codigo != null ? String(x.codigo).trim() : (x?.code != null ? String(x.code).trim() : undefined),
      code: x?.code != null ? String(x.code).trim() : undefined,
      descripcion: x?.descripcion != null ? String(x.descripcion).trim() : (x?.label != null ? String(x.label).trim() : undefined),
      label: x?.label != null ? String(x.label).trim() : undefined,
      amount: x?.amount ?? 0,
      amount_cents: x?.amount_cents != null ? Number(x.amount_cents) : null,
      source: x?.source ?? null,
      source_id: x?.source_id != null ? Number(x.source_id) : null,
      group: x?.group ?? null
    };
  }

  private esVerdadero(value: any): boolean {
    if (typeof value === 'boolean') return value;
    const num = Number(value);
    if (Number.isFinite(num) && String(value).trim() !== '') return num === 1;
    return String(value ?? '').trim().toLowerCase() === 'true';
  }

  private esActivoSubsistema(x: any): boolean {
    const raw = x?.activo ?? x?.estado ?? x?.estado_id ?? 1;
    if (typeof raw === 'boolean') return raw;
    const num = Number(raw);
    if (Number.isFinite(num) && String(raw).trim() !== '') {
      return num === 1;
    }
    const txt = String(raw ?? '').trim().toLowerCase();
    return txt === 'activo' || txt === 'activa' || txt === '1' || txt === 'true';
  }

  private etiquetaEstadoSubsistema(x: any): string | null {
    const raw = x?.estado ?? x?.estado_nombre ?? x?.estado_label ?? x?.activo ?? x?.estado_id;
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'boolean') return raw ? 'Activo' : 'Inactivo';
    const num = Number(raw);
    if (Number.isFinite(num) && String(raw).trim() !== '') return num === 1 ? 'Activo' : 'Inactivo';
    const txt = String(raw).trim();
    if (!txt) return null;
    return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
  }

  /**
   * GET /api/sicoss/generaciones?mes=&anio=&estado=&subsistema_id=&page=&perPage=
   * Listado de generaciones de la empresa. Soporta paginación server-side
   * (si el backend no la implementa, se devuelve el array completo y los
   * valores de página calculados localmente).
   */
  generaciones(params?: Record<string, string | number | null | undefined>): Observable<{ data: GeneracionesPaginadas; error?: any }> {
    let query = new HttpParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined && String(v).trim() !== '') query = query.set(k, String(v));
    });

    const page = Number(params?.['page'] ?? 1) || 1;
    const perPage = Number(params?.['perPage'] ?? 25) || 25;

    return this.http.get<any>(`${this.baseUrl}/generaciones`, { headers: this.headers(), params: query }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.items || res?.data || []);
        const lista = (Array.isArray(raw) ? raw : []).map((x) => this.normalizarGeneracion(x));
        return {
          data: {
            items: lista,
            total: Number(res?.total ?? lista.length),
            page: Number(res?.page ?? page),
            perPage: Number(res?.perPage ?? perPage)
          } as GeneracionesPaginadas
        };
      }),
      catchError((err) => of({
        data: { items: [], total: 0, page, perPage } as GeneracionesPaginadas,
        error: err
      }))
    );
  }

  /**
   * GET /api/empleados
   * Padrón de empleados de la empresa para el selector de la generación.
   * Se pagina en el cliente porque el endpoint devuelve el plantel completo.
   */
  empleados(): Observable<{ data: EmpleadoPadron[]; error?: any }> {
    return this.http.get<any>(`${environment.apiUrl}/api/empleados`, { headers: this.headers() }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.empleados || res?.items || res?.data || []);
        const lista = (Array.isArray(raw) ? raw : []).map((x: any): EmpleadoPadron => ({
          empleado_id: Number(x?.empleado_id ?? x?.id ?? 0),
          legajo: String(x?.legajo ?? '').trim(),
          cuil: this.numeroDocumentoComoCuil(x),
          apellido: String(x?.apellido ?? '').trim(),
          nombre: String(x?.nombre ?? '').trim(),
          estado: x?.estado ?? null
        })).filter((e: EmpleadoPadron) => e.empleado_id > 0);
        return { data: lista };
      }),
      catchError((err) => of({ data: [] as EmpleadoPadron[], error: err }))
    );
  }

  /**
   * GET /api/sicoss/generaciones/:id/exportaciones
   * Historial de archivos exportados de una generación.
   */
  exportaciones(generacionId: number): Observable<{ data: ExportacionItem[]; error?: any }> {
    return this.http.get<any>(`${this.baseUrl}/generaciones/${generacionId}/exportaciones`, {
      headers: this.headers()
    }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.items || res?.data || []);
        const lista = (Array.isArray(raw) ? raw : []) as any[];
        return {
          data: lista.map((x: any): ExportacionItem => ({
            exportacion_id: Number(x?.exportacion_id ?? x?.id ?? 0),
            generacion_id: x?.generacion_id != null ? Number(x.generacion_id) : undefined,
            nombre_archivo: String(x?.nombre_archivo ?? x?.nombre ?? '').trim(),
            hash: x?.hash ?? undefined,
            hash_contenido: x?.hash_contenido ?? undefined,
            formato: x?.formato ?? undefined,
            created_at: x?.created_at ?? undefined
          }))
        };
      }),
      catchError((err) => of({ data: [] as ExportacionItem[], error: err }))
    );
  }

  /**
   * GET /api/sicoss/exportaciones/:id/download
   * Descarga el archivo ARCA persistido como blob.
   */
  descargarExportacion(exportacionId: number): Observable<{ blob: Blob | null; headers: any; error?: any }> {
    return this.http.get(`${this.baseUrl}/exportaciones/${exportacionId}/download`, {
      headers: this.headers(), responseType: 'blob' as 'json', observe: 'response' as 'body'
    }).pipe(
      map((resp: any) => ({ blob: resp?.body || null, headers: resp?.headers || {} })),
      catchError((err) => of({ blob: null as any, headers: {}, error: err }))
    );
  }

  /**
   * GET /api/sicoss/generaciones/:id
   * Devuelve el encabezado y el detalle por empleado de una generación.
   */
  generacion(id: number): Observable<SicossResult<GeneracionDetalleFull>> {
    return this.http.get<any>(`${this.baseUrl}/generaciones/${id}`, { headers: this.headers() }).pipe(
      map((res: any) => {
        const payload: any = res?.data || res;
        const headerRaw = payload?.header || payload?.generacion || payload;
        const itemsRaw: any[] = Array.isArray(payload?.items) ? payload.items
          : (Array.isArray(payload?.detalle) ? payload.detalle : []);
        return {
          data: {
            header: headerRaw ? this.normalizarGeneracion(headerRaw) : null,
            items: itemsRaw.map((x) => this.normalizarGeneracionPreviewItem(x))
          } as GeneracionDetalleFull
        };
      }),
      catchError((err) => of({ data: null, error: err } as SicossResult<GeneracionDetalleFull>))
    );
  }

  /** Normaliza el encabezado de una generación. */
  private normalizarGeneracion(x: any): GeneracionHeader {
    return {
      generacion_id: Number(x?.generacion_id ?? x?.id ?? 0),
      empresa_id: x?.empresa_id != null ? Number(x.empresa_id) : undefined,
      mes: Number(x?.mes ?? 0),
      anio: Number(x?.anio ?? 0),
      nombre: String(x?.nombre ?? '').trim() || undefined,
      tipo_liquidacion: String(x?.tipo_liquidacion ?? '').trim() || undefined,
      estado: String(x?.estado ?? x?.status ?? '').trim() || undefined,
      total_empleados: x?.total_empleados != null ? Number(x.total_empleados) : undefined,
      total_rem: x?.total_rem ?? undefined,
      created_at: x?.created_at ?? undefined
    };
  }

  /** Normaliza una fila de detalle/preview. */
  private normalizarGeneracionPreviewItem(x: any): GeneracionPreviewItem {
    const conceptosRaw = Array.isArray(x?.conceptos_simulados)
      ? x.conceptos_simulados
      : (Array.isArray(x?.conceptos) ? x.conceptos : []);
    return {
      empleado_id: Number(x?.empleado_id ?? 0),
      cuil: String(x?.cuil ?? '').trim(),
      nombre: String(x?.nombre ?? '').trim(),
      legajo: x?.legajo ?? null,
      rem_total: x?.rem_total ?? 0,
      asig_fam_pagadas: x?.asig_fam_pagadas ?? 0,
      imp_aporte_voluntario: x?.imp_aporte_voluntario ?? 0,
      imp_adicional_os: x?.imp_adicional_os ?? 0,
      imp_exedente_ap_ss: x?.imp_exedente_ap_ss ?? 0,
      importe_exedenete_ap_os: x?.importe_exedenete_ap_os ?? 0,
      cod_actividad: x?.cod_actividad ?? null,
      cod_condicion: x?.cod_condicion ?? null,
      cod_zona: x?.cod_zona ?? null,
      warnings: this.normalizarWarnings(x?.warnings ?? x?.diagnostico?.warnings),
      conceptos: conceptosRaw.map((c: any) => this.normalizarConceptoSimulado(c)),
      conceptos_simulados: conceptosRaw.map((c: any) => this.normalizarConceptoSimulado(c)),
      used_row: this.normalizarUsedRow(x?.used_row ?? x?.usedRow),
      detalle_sicoss: x?.detalle_sicoss ?? x?.detalleSicoss ?? null,
      diagnostico: x?.diagnostico ?? null
    };
  }
}
