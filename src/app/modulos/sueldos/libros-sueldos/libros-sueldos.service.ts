import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';

/** Estado del libro segun catalogo /api/libros-estados. */
export interface LibroEstado {
  libro_estado_id: number;
  nombre: string;
  descripcion: string;
  es_activo: number;
}

export interface LibroSueldo {
  libro_sueldo_id: number;
  empresa_id: number;
  periodo_desde: string;
  periodo_hasta: string;
  anio: number;
  mes: number;
  liquidacion_tipo_id: number | null;
  numero_libro: string;
  version: number;
  estado: string;
  total_trabajadores: number;
  total_remuneraciones: number | string;
  total_no_remunerativo: number | string;
  total_descuentos: number | string;
  total_aportes: number | string;
  total_contribuciones: number | string;
  total_neto: number | string;
  hash_contenido: string | null;
  generado_por_usuario_id: number | null;
  generado_en: string | null;
  presentado_en: string | null;
  presentacion_numero: string | null;
  archivo_lsd_path: string | null;
}

export interface LibroSueldoDetalle {
  libro_sueldo_detalle_id: number;
  libro_sueldo_id: number;
  empresa_id: number;
  empleado_id: number;
  legajo: string;
  cuil: string;
  apellido: string;
  nombre: string;
  estado_civil: string | null;
  nacionalidad: string | null;
  fecha_ingreso: string | null;
  fecha_egreso: string | null;
  categoria: string | null;
  convenio_nombre: string | null;
  situacion_laboral: string | null;
  jornada_porcentaje: number | null;
  horas_semanales: number | null;
  sucursal_nombre: string | null;
  remuneracion_base: number | string;
  total_remunerativo: number | string;
  total_no_remunerativo: number | string;
  total_remunerado: number | string;
  total_descuentos: number | string;
  total_aportes: number | string;
  total_contribuciones: number | string;
  total_neto: number | string;
  observaciones: string | null;
}

/** El backend puede devolver strings sueltos o objetos con detalle. */
export type MensajeValidacion = string | { mensaje?: string; detalle?: string; [k: string]: any };

/** Fila de la previsualizacion: un trabajador con sus totales del periodo. */
export interface PrevisualizacionDetalle {
  empleado_id: number;
  legajo: string;
  cuil: string;
  apellido: string;
  nombre: string;
  fecha_ingreso: string | null;
  categoria: string | null;
  remuneracion_base: number | string;
  total_remunerativo: number | string;
  total_no_remunerativo: number | string;
  total_descuentos: number | string;
  total_aportes: number | string;
  total_contribuciones: number | string;
  total_neto: number | string;
  observaciones: string | null;
}

/** Resultado del dry-run: valida sin escribir nada. */
export interface PrevisualizacionLibro {
  valido: boolean;
  errores: MensajeValidacion[];
  warnings: MensajeValidacion[];
  /** El backend también puede mandar las advertencias bajo esta clave. */
  advertencias?: Array<{ empleado_id?: number; legajo?: string; detalle?: string }>;
  total_trabajadores: number;
  totales: Record<string, number>;
  /** Detalle por trabajador, para revisar antes de generar. */
  detalle?: PrevisualizacionDetalle[];
}

/** El backend puede devolver el libro plano, en {data}, en {libro} o en {data:{libro}}. */
function extraerLibro(res: any): LibroSueldo | null {
  if (!res) return null;
  const candidatos = [res.libro, res.data, res.data?.libro, res.item, res];
  for (const c of candidatos) {
    if (c && !Array.isArray(c) && (c.libro_sueldo_id || c.numero_libro)) return c as LibroSueldo;
  }
  return null;
}

/** Concepto del desglose de un empleado dentro de un libro. */
export interface LibroConcepto {
  liquidacion_id?: number;
  concepto_id?: number;
  codigo: string;
  nombre: string;
  /** tipo de formula o categoria: BASICO, FIJO, ANTIGUEDAD, PORCENTAJE_*, SUMA_GRUPO... */
  tipo: string;
  /** S suma, R resta */
  suma_resta: string;
  cantidad: number;
  base_calculo: number;
  porcentaje: number;
  importe: number;
  importe_original: number;
  requiere_revision: number;
  advertencia: string | null;
  orden: number;
  descripcion: string;
}

@Injectable({ providedIn: 'root' })
export class LibrosSueldosService {
  private readonly baseUrl = `${environment.apiUrl}/api/libros-sueldos`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private estadosCache$?: Observable<LibroEstado[]>;

  /**
   * Catalogo de estados del libro (GET /api/libros-estados).
   * Se cachea en el servicio con shareReplay para no pedirlo en cada render.
   */
  listEstados(): Observable<LibroEstado[]> {
    if (!this.estadosCache$) {
      this.estadosCache$ = this.http.get<any>(`${environment.apiUrl}/api/libros-estados`, { headers: this.headers() }).pipe(
        map((res: any) => {
          const raw: any = Array.isArray(res) ? res : (res?.data || res?.items || []);
          return (Array.isArray(raw) ? raw : [])
            .map((x: any) => ({
              libro_estado_id: Number(x?.libro_estado_id ?? x?.id ?? 0),
              nombre: String(x?.nombre ?? '').trim(),
              descripcion: String(x?.descripcion ?? '').trim(),
              es_activo: Number(x?.es_activo ?? 1)
            }))
            .filter((x: LibroEstado) => x.libro_estado_id > 0 && x.nombre);
        }),
        catchError(() => of([] as LibroEstado[])),
        shareReplay(1)
      );
    }
    return this.estadosCache$;
  }

  list(params?: Record<string, string | number | null | undefined>): Observable<{ data: LibroSueldo[]; error?: any }> {
    let query = new HttpParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined && String(v).trim() !== '') query = query.set(k, String(v));
    });
    return this.http.get<any>(this.baseUrl, { headers: this.headers(), params: query }).pipe(
      map((res: any) => ({ data: Array.isArray(res) ? res : (res?.data || res?.items || []) })),
      catchError((err) => of({ data: [] as LibroSueldo[], error: err }))
    );
  }

  get(id: number): Observable<{ libro: LibroSueldo | null; detalle: LibroSueldoDetalle[]; auditoria: any[]; error?: any }> {
    return this.http.get<any>(`${this.baseUrl}/${id}`, { headers: this.headers() }).pipe(
      map((res: any) => ({
        libro: extraerLibro(res),
        detalle: Array.isArray(res?.detalle) ? res.detalle : (res?.data?.detalle || res?.data?.items || []),
        auditoria: Array.isArray(res?.auditoria) ? res.auditoria : (res?.data?.auditoria || [])
      })),
      catchError((err) => of({ libro: null, detalle: [], auditoria: [], error: err }))
    );
  }

  /** Dry-run: devuelve errores y warnings sin escribir nada. GET con query params. */
  previsualizar(params: {
    periodo_desde: string; periodo_hasta: string; liquidacion_tipo_id?: number | null;
  }): Observable<{ data: PrevisualizacionLibro | null; error?: any }> {
    let query = new HttpParams()
      .set('periodo_desde', params.periodo_desde)
      .set('periodo_hasta', params.periodo_hasta);
    if (params.liquidacion_tipo_id !== null && params.liquidacion_tipo_id !== undefined) {
      query = query.set('liquidacion_tipo_id', String(params.liquidacion_tipo_id));
    }

    return this.http.get<any>(`${this.baseUrl}/previsualizar`, { headers: this.headers(), params: query }).pipe(
      map((res: any) => ({ data: (res?.data || res) as PrevisualizacionLibro })),
      catchError((err) => of({ data: null, error: err }))
    );
  }

  generar(payload: {
    periodo_desde: string; periodo_hasta: string; liquidacion_tipo_id?: number | null; numero_libro?: string;
  }): Observable<{ data: LibroSueldo | null; error?: any }> {
    return this.http.post<any>(this.baseUrl, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: extraerLibro(res) })),
      catchError((err) => of({ data: null, error: err }))
    );
  }

  /** Confirma un libro borrador y lo vuelve 'generado' (inmutable). */
  generarDefinitivo(id: number): Observable<{ ok: boolean; libro: LibroSueldo | null; error?: any }> {
    return this.http.post<any>(`${this.baseUrl}/${id}/generar`, {}, { headers: this.headers() }).pipe(
      map((res: any) => ({
        ok: res?.ok !== false && res?.success !== false,
        libro: extraerLibro(res)
      })),
      catchError((err) => of({ ok: false, libro: null, error: err }))
    );
  }

  /** Desglose de conceptos de un empleado dentro del libro. */
  conceptosEmpleado(libroId: number, empleadoId: number): Observable<{ data: LibroConcepto[]; error?: any }> {
    return this.http.get<any>(`${this.baseUrl}/${libroId}/conceptos`, {
      headers: this.headers(),
      params: { empleado_id: String(empleadoId) }
    }).pipe(
      map((res: any) => {
        // El endpoint puede responder plano, {data}, {items} o {libro_sueldo_id, conceptos}.
        const raw: any = Array.isArray(res) ? res
          : (res?.conceptos || res?.data?.conceptos || res?.data || res?.items || []);
        const lista: any[] = Array.isArray(raw) ? raw : [];
        const num = (v: any): number => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };
        return {
          data: lista.map((x: any): LibroConcepto => ({
            liquidacion_id: num(x?.liquidacion_id),
            concepto_id: num(x?.concepto_id),
            codigo: String(x?.codigo_concepto ?? x?.codigo ?? '').trim(),
            nombre: String(x?.nombre_concepto ?? x?.nombre ?? '').trim(),
            tipo: String(x?.tipo ?? x?.formula_tipo ?? x?.categoria ?? '').trim().toLowerCase(),
            suma_resta: String(x?.suma_resta ?? 'S').trim().toUpperCase(),
            cantidad: num(x?.cantidad),
            base_calculo: num(x?.base_calculo),
            porcentaje: num(x?.porcentaje),
            importe: num(x?.importe),
            importe_original: num(x?.importe_original ?? x?.importe),
            requiere_revision: num(x?.requiere_revision),
            advertencia: x?.advertencia ?? null,
            orden: num(x?.orden),
            descripcion: String(x?.descripcion ?? x?.nombre ?? '').trim()
          })).filter((c: LibroConcepto) => !!c.nombre || !!c.codigo)
        };
      }),
      catchError((err) => of({ data: [] as LibroConcepto[], error: err }))
    );
  }

  /** Pasa el libro al estado 'presentado'. A partir de ahí es inmutable. */
  presentar(id: number, presentacionNumero?: string): Observable<{ ok: boolean; libro: LibroSueldo | null; error?: any }> {
    const body: { presentacion_numero?: string } = {};
    const numero = String(presentacionNumero || '').trim();
    if (numero) body.presentacion_numero = numero;

    return this.http.post<any>(`${this.baseUrl}/${id}/presentar`, body, { headers: this.headers() }).pipe(
      map((res: any) => ({
        ok: res?.ok !== false && res?.success !== false,
        libro: extraerLibro(res)
      })),
      catchError((err) => of({ ok: false, libro: null, error: err }))
    );
  }

  anular(id: number, motivo: string): Observable<{ ok: boolean; error?: any }> {
    return this.http.post<any>(`${this.baseUrl}/${id}/anular`, { motivo }, { headers: this.headers() }).pipe(
      map((res: any) => ({ ok: res?.ok !== false && res?.success !== false })),
      catchError((err) => of({ ok: false, error: err }))
    );
  }

  /** PDF del libro, como blob + headers para leer Content-Disposition. */
  pdf(id: number): Observable<{ blob: Blob | null; headers: any; error?: any }> {
    return this.http.get(`${this.baseUrl}/${id}/pdf`, {
      headers: this.headers(), responseType: 'blob' as 'json', observe: 'response' as 'body'
    }).pipe(
      map((resp: any) => ({ blob: resp?.body || null, headers: resp?.headers || {} })),
      catchError((err) => of({ blob: null as any, headers: {}, error: err }))
    );
  }

  /** PDF del libro detallado (con desglose de conceptos), mismo formato inline. */
  pdfDetalle(id: number): Observable<{ blob: Blob | null; headers: any; error?: any }> {
    return this.http.get(`${this.baseUrl}/${id}/pdf-detalle`, {
      headers: this.headers(), responseType: 'blob' as 'json', observe: 'response' as 'body'
    }).pipe(
      map((resp: any) => ({ blob: resp?.body || null, headers: resp?.headers || {} })),
      catchError((err) => of({ blob: null as any, headers: {}, error: err }))
    );
  }

  /** Archivo LSD (Libro de Sueldos Digital). */
  exportarLsd(id: number): Observable<{ blob: Blob | null; headers: any; error?: any }> {
    return this.http.get(`${this.baseUrl}/${id}/exportar-lsd`, {
      headers: this.headers(), responseType: 'blob' as 'json', observe: 'response' as 'body'
    }).pipe(
      map((resp: any) => ({ blob: resp?.body || null, headers: resp?.headers || {} })),
      catchError((err) => of({ blob: null as any, headers: {}, error: err }))
    );
  }
}
