import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';

interface ListResponse<T> { data: T[]; meta?: any }

@Injectable({ providedIn: 'root' })
export class EmpleadosConceptosService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  getSecciones(sucursalId: number, page?: number, perPage?: number): Observable<ListResponse<any>> {
    let params = new HttpParams().set('sucursal_id', String(sucursalId));
    if (page) params = params.set('page', String(page));
    if (perPage) params = params.set('per_page', String(Math.min(perPage, 500)));
    return this.http.get<ListResponse<any>>(`${environment.apiUrl}/api/secciones/all`, { params });
  }

  getCargos(seccionId: number, page?: number, perPage?: number): Observable<ListResponse<any>> {
    let params = new HttpParams().set('seccion_id', String(seccionId));
    if (page) params = params.set('page', String(page));
    if (perPage) params = params.set('per_page', String(Math.min(perPage, 500)));
    return this.http.get<ListResponse<any>>(`${environment.apiUrl}/api/cargos/all`, { params });
  }

  listAsignados(empleadoId: number): Observable<ListResponse<any>> {
    let token = this.auth.getToken();
    if (!token) token = localStorage.getItem('token') || null;
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();

    return this.http.get<ListResponse<any>>(`${environment.apiUrl}/api/empleados/${empleadoId}/conceptos`, { headers }).pipe(
      catchError((err) => {
        console.error('[EmpleadosConceptosService] listAsignados error', err);
        if (err?.status === 404) {
          return of({ data: [], meta: { total: 0 } });
        }
        return of({ data: [], meta: { total: 0 } });
      })
    );
  }

  /**
   * Obtiene conceptos disponibles para la empresa del usuario.
   * El backend responde un array (sin meta). Acepta filtros por query (p.ej. codigo, estado).
   */
  getConceptosDisponibles(filters?: { q?: string; codigo?: string; estado?: number; page?: number; per_page?: number }) {
    let params = new HttpParams();
    if (filters) {
      if (filters.q && String(filters.q).trim().length >= 2) params = params.set('q', String(filters.q).trim());
      if (filters.codigo) params = params.set('codigo', String(filters.codigo));
      if (filters.estado !== undefined && filters.estado !== null) params = params.set('estado', String(filters.estado));
      if (filters.page !== undefined && filters.page !== null) params = params.set('page', String(filters.page));
      if (filters.per_page !== undefined && filters.per_page !== null) {
        const per = Number(filters.per_page) || 0;
        params = params.set('per_page', String(Math.min(per || 500, 500)));
      }
    }

    let token = this.auth.getToken();
    if (!token) {
      token = localStorage.getItem('token') || null;
    }
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    console.debug('[EmpleadosConceptosService] getConceptosDisponibles headers', headers.keys());

    return this.http.get<{ data: any[]; meta?: any }>(`${environment.apiUrl}/api/conceptos`, { params, headers }).pipe(
      map((res) => {
        const items = Array.isArray(res?.data) ? res.data : [];
        const meta = res?.meta || { total: items.length, page: 1, per_page: items.length, returned: items.length };
        return { items, meta };
      }),
      catchError((err) => {
        console.error('[EmpleadosConceptosService] getConceptosDisponibles error', err);
        return of({ items: [], meta: { total: 0, page: 1, per_page: 0, returned: 0 } });
      })
    );
  }

  assignConceptos(
    empleadoId: number,
    conceptos: Array<number | { concepto_id?: number; empleado_concepto_id?: number; importe?: number | null; importe_fijo?: number | null; unidades?: number | null }>,
    usuarioOrigen = 'web',
    options: { includeConceptoIds?: boolean } = { includeConceptoIds: true }
  ) {
    const normalized = conceptos.map((item) => {
      if (typeof item === 'number') return { concepto_id: item };
      const conceptoId = item.concepto_id ?? undefined;
      const importe = item.importe ?? item.importe_fijo ?? null;
      return {
        ...(item.empleado_concepto_id != null ? { empleado_concepto_id: item.empleado_concepto_id } : {}),
        ...(conceptoId != null ? { concepto_id: conceptoId } : {}),
        ...(importe !== undefined ? { importe } : {}),
        ...(item.unidades != null ? { unidades: item.unidades } : {})
      };
    });

    const body: any = { conceptos: normalized, usuario_origen: usuarioOrigen };
    if (options.includeConceptoIds !== false) {
      body.concepto_ids = normalized.map((item: any) => item.concepto_id).filter((id: any) => id != null);
    }

    return this.http.post(`${environment.apiUrl}/api/empleados/${empleadoId}/conceptos`, body);
  }

  removeConcepto(empleadoId: number, conceptoId: number) {
    return this.http.delete(`${environment.apiUrl}/api/empleados/${empleadoId}/conceptos/${conceptoId}`);
  }

  updateOrden(empleadoId: number, empleadoConceptoId: number, orden: number) {
    const body = { orden };
    return this.http.patch(`${environment.apiUrl}/api/empleados/${empleadoId}/conceptos/${empleadoConceptoId}/orden`, body);
  }

  /**
   * Asigna conceptos masivamente a una lista de empleados.
   * Payload compatible con el endpoint propuesto para asignaciones masivas.
   */
  assignConceptosMasivos(payload: any) {
    let token = this.auth.getToken();
    if (!token) token = localStorage.getItem('token') || null;
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }) : new HttpHeaders({ 'Content-Type': 'application/json' });

    // Use observe: 'response' so we can inspect HTTP status and normalize body
    return this.http.post<any>(`${environment.apiUrl}/api/empleados/asignaciones-masivas`, payload, { headers, observe: 'response' as 'response' }).pipe(
      map((resp) => {
        // resp may have body or be empty; normalize to object
        return resp && resp.body ? resp.body : {};
      }),
      catchError((err) => {
        // err could contain parsed JSON in err.error or raw text
        const status = err?.status || 0;
        let body = null;
        try { body = err?.error ?? null; } catch { body = null; }
        const message = (body && body.message) ? body.message : err?.message || `HTTP ${status}`;
        const structured = { status, message, body };
        console.error('[EmpleadosConceptosService] assignConceptosMasivos error', structured);
        return throwError(() => structured);
      })
    );
  }
}
