import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import {
  ExportRequest,
  ExportResponse,
  SicossCreate,
  SicossItem,
  SicossListResponse,
  SicossResult,
  SicossUpdate
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

  constructor(private http: HttpClient, private auth: AuthService) { }

  private headers(): HttpHeaders {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /** Normaliza un registro crudo del backend a SicossItem. */
  private normalizar(x: any): SicossItem {
    return {
      id: Number(x?.id ?? 0),
      codigo: String(x?.codigo ?? '').trim(),
      nombre: String(x?.nombre ?? '').trim(),
      prioridad: Number(x?.prioridad ?? 0),
      activo: x?.activo === true || x?.activo === 1 || x?.activo === '1' || x?.activo === 'true',
      empresa_id: Number(x?.empresa_id ?? 0),
      created_by: x?.created_by != null ? Number(x.created_by) : undefined,
      created_at: x?.created_at ?? undefined,
      updated_at: x?.updated_at ?? undefined,
      metadata: x?.metadata ?? undefined
    };
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
}
