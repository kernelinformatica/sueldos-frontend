import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from '../../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class LiquidacionesAnaliticaService {
  private resumenCache$?: Observable<any>;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getResumen(filters?: { periodo_desde?: string; periodo_hasta?: string; liquidacion_tipo_id?: number | string | null }): Observable<any> {
    let params = new HttpParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        params = params.set(key, String(value));
      }
    });

    if (!this.resumenCache$) {
      this.resumenCache$ = this.http.get<any>(`${environment.apiUrl}/api/liquidaciones/analitica`, { headers: this.headers(), params }).pipe(
        catchError((err) => of({ error: err, top_salarios: [], promedio: 0, mediana: 0, maximo: 0, minimo: 0, diferencia: 0, por_sector: [] })),
        shareReplay(1)
      );
    }

    return this.resumenCache$;
  }
}