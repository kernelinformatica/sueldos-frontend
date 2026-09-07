import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from '../../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class LiquidacionesService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  list(paramsObj?: Record<string, string | number | null | undefined>): Observable<any> {
    let params = new HttpParams();
    Object.entries(paramsObj || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && String(value).trim() !== '') params = params.set(key, String(value));
    });
    return this.http.get<any>(`${environment.apiUrl}/api/liquidaciones`, { headers: this.headers(), params }).pipe(catchError((err) => of({ error: err, data: [] })));
  }

  liquidacionTipos(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/liquidacion-tipos`, { headers: this.headers() }).pipe(catchError((err) => of({ error: err, data: [] })));
  }

  estadosLiquidaciones(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/estados-liquidaciones`, { headers: this.headers() }).pipe(catchError((err) => of({ error: err, data: [] })));
  }

  get(id: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/liquidaciones/${id}`, { headers: this.headers() }).pipe(catchError((err) => of({ error: err, data: null })));
  }

  detalleBasico(id: number): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/api/liquidaciones/${id}/detalle-basico`, {}, { headers: this.headers() }).pipe(catchError((err) => of({ error: err, data: null })));
  }

  calcularMensual(payload: any): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/api/liquidaciones/calcular-mensual`, payload, { headers: this.headers() }).pipe(catchError((err) => of({ error: err, data: null })));
  }

  changeEstado(liquidacionId: number, estadoLiquidacionId: number, razon?: string): Observable<any> {
    const body: any = { estado_liquidacion_id: estadoLiquidacionId };
    if (razon && String(razon).trim()) body.razon_override = String(razon).trim();
    return this.http.patch<any>(`${environment.apiUrl}/api/liquidaciones/${liquidacionId}/estado`, body, { headers: this.headers() }).pipe(catchError((err) => of({ error: err, data: null })));
  }

  cambiarEstado(liquidacionId: number, estadoLiquidacionId: number, razon?: string): Observable<any> {
    return this.changeEstado(liquidacionId, estadoLiquidacionId, razon);
  }

  deleteLiquidacion(liquidacionId: number, razon?: string): Observable<any> {
    const options: any = { headers: this.headers() };
    if (razon && String(razon).trim()) options.body = { razon_override: String(razon).trim() };
    return this.http.delete<any>(`${environment.apiUrl}/api/liquidaciones/${liquidacionId}`, options).pipe(catchError((err) => of({ error: err, data: null })));
  }

  delete(liquidacionId: number, razon?: string): Observable<any> {
    return this.deleteLiquidacion(liquidacionId, razon);
  }

  reabrirLiquidacion(liquidacionId: number, razon: string): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/api/liquidaciones/${liquidacionId}/reabrir`, { razon_override: String(razon || '').trim() }, { headers: this.headers() }).pipe(catchError((err) => of({ error: err, data: null })));
  }

  anularLiquidacion(liquidacionId: number, razon: string): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/api/liquidaciones/${liquidacionId}/anular`, { razon_override: String(razon || '').trim() }, { headers: this.headers() }).pipe(catchError((err) => of({ error: err, data: null })));
  }
}