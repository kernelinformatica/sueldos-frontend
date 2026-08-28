import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ConceptosService {
  private topeCache: Map<number, { ts: number, data: any[] }> = new Map();
  private TOPE_TTL = 60 * 1000; // 60s

  constructor(private http: HttpClient, private auth: AuthService) {}

  private authHeaders() {
    let token = this.auth.getToken();
    if (!token) token = localStorage.getItem('token') || null;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  list(paramsObj?: any): Observable<any> {
    let params = new HttpParams();
    if (paramsObj) {
      Object.keys(paramsObj).forEach((k) => { if (paramsObj[k] !== undefined && paramsObj[k] !== null) params = params.set(k, String(paramsObj[k])); });
    }
    return this.http.get<any>(`${environment.apiUrl}/api/conceptos`, { headers: this.authHeaders(), params }).pipe(
      map((r) => Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : (r?.items || r?.conceptos || []))),
      catchError((err) => { console.error('[ConceptosService] list error', err); return of([]); })
    );
  }

  get(conceptoId: number) {
    return this.http.get<any>(`${environment.apiUrl}/api/conceptos/${conceptoId}`, { headers: this.authHeaders() }).pipe(catchError((err) => { console.error('get concepto err', err); return of(null); }));
  }

  preview(body: any) {
    return this.http.post<any>(`${environment.apiUrl}/api/conceptos/preview`, body, { headers: this.authHeaders() }).pipe(catchError((err) => { console.error('[ConceptosService] preview error', err); return of(null); }));
  }

  tiposList() {
    // Call the canonical endpoint /api/conceptos_tipos and normalize the response.
    // Support optional query params: q, page, per_page. Default per_page large to fetch full catalog.
    const params = new HttpParams().set('per_page', String(1000));
    return this.http.get<any>(`${environment.apiUrl}/api/conceptos_tipos`, { headers: this.authHeaders(), params }).pipe(
      map(r => {
        const arr = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : (r?.items || []));
        return (arr || []).map((it: any) => ({
          // keep original payload but normalize common keys
          ...it,
          id: it.conceptos_tipos_id ?? it.id ?? null,
          conceptos_tipos_id: it.conceptos_tipos_id ?? it.id ?? null,
          nombre: it.nombre ?? it.codigo ?? it.descripcion ?? null,
          prioridad: it.prioridad ?? null,
          codigo: it.codigo ?? null,
          descripcion: it.descripcion ?? null
        })).sort((a: any, b: any) => {
          const pa = (a.prioridad ?? 0) - (b.prioridad ?? 0);
          if (pa !== 0) return pa;
          return (a.codigo || '').localeCompare(b.codigo || '');
        });
      }),
      catchError((err) => { console.error('[ConceptosService] tiposList error', err); return of([]); })
    );
  }

  gruposList() {
    const params = new HttpParams().set('per_page', String(1000));
    return this.http.get<any>(`${environment.apiUrl}/api/grupos_conceptos_master`, { headers: this.authHeaders(), params }).pipe(
      map(r => {
        const arr = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : (r?.items || []));
        return (arr || []).map((it: any) => ({
          // keep full original payload and add normalized keys
          ...it,
          grupo_id: it.grupo_id ?? it.id ?? it.grupos_conceptos_id ?? null,
          id: it.grupo_id ?? it.id ?? it.grupos_conceptos_id ?? null,
          nombre: it.nombre ?? it.label ?? it.descripcion ?? null,
          descripcion: it.descripcion ?? null,
          permite_importe_fijo: it.permite_importe_fijo ?? it.permiteImporteFijo ?? it.permite_importe ?? null
        })).sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''));
      }),
      catchError((err) => { console.error('[ConceptosService] gruposList error', err); return of([]); })
    );
  }

  existsCodigo(codigo: string) {
    if (!codigo) return of(false);
    let params = new HttpParams().set('codigo', codigo);
    return this.http.get<any>(`${environment.apiUrl}/api/conceptos`, { headers: this.authHeaders(), params }).pipe(
      map((r) => {
        const items = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : (r?.items || r?.conceptos || []));
        return (items || []).length > 0;
      }),
      catchError((err) => { console.error('[ConceptosService] existsCodigo error', err); return of(false); })
    );
  }

  create(body: any) { return this.http.post(`${environment.apiUrl}/api/conceptos`, body, { headers: this.authHeaders() }); }
  update(conceptoId: number, body: any) { return this.http.put(`${environment.apiUrl}/api/conceptos/${conceptoId}`, body, { headers: this.authHeaders() }); }
  delete(conceptoId: number) { return this.http.delete(`${environment.apiUrl}/api/conceptos/${conceptoId}`, { headers: this.authHeaders() }); }

  // Fetch topes for a concepto. Uses short TTL cache to avoid many requests.
  getTopes(conceptoId: number) {
    if (!conceptoId) return of([]);
    const now = Date.now();
    const cached = this.topeCache.get(conceptoId);
    if (cached && (now - cached.ts) < this.TOPE_TTL) {
      return of(cached.data);
    }
    // Primary path: GET /api/conceptos/:id/topes
    return this.http.get<any>(`${environment.apiUrl}/api/conceptos/${conceptoId}/topes`, { headers: this.authHeaders() }).pipe(
      map(r => Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : (r?.items || r?.topes || []))),
      map(arr => arr || []),
      map(arr => { this.topeCache.set(conceptoId, { ts: Date.now(), data: arr }); return arr; }),
      catchError((err: any) => {
        // If backend doesn't provide the nested route, try fallback: GET /api/topes?concepto_id=ID
        if (err && err.status === 404) {
          const params = new HttpParams().set('concepto_id', String(conceptoId)).set('per_page', '1000');
          return this.http.get<any>(`${environment.apiUrl}/api/topes`, { headers: this.authHeaders(), params }).pipe(
            map(r => Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : (r?.items || r || []))),
            map(arr => arr || []),
            map(arr => { this.topeCache.set(conceptoId, { ts: Date.now(), data: arr }); return arr; }),
            catchError((e) => { console.error('[ConceptosService] getTopes fallback error', e); return of([]); })
          );
        }
        console.error('[ConceptosService] getTopes error', err);
        return of([]);
      })
    );
  }

  createTope(body: any) {
    return this.http.post(`${environment.apiUrl}/api/topes`, body, { headers: this.authHeaders() });
  }

  updateTope(topeId: number, body: any) {
    return this.http.put(`${environment.apiUrl}/api/topes/${topeId}`, body, { headers: this.authHeaders() });
  }

  deleteTope(topeId: number) {
    return this.http.delete(`${environment.apiUrl}/api/topes/${topeId}`, { headers: this.authHeaders() });
  }

  invalidateTopes(conceptoId?: number) {
    if (conceptoId) this.topeCache.delete(conceptoId);
    else this.topeCache.clear();
  }
}
