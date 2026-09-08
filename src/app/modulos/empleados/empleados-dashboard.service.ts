import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from '../../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class EmpleadosDashboardService {
  private resumenCache$?: Observable<any>;
  private resumenSnapshot: any = null;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getResumen(): Observable<any> {
    if (!this.resumenCache$) {
      this.resumenCache$ = this.http.get<any>(`${environment.apiUrl}/api/dashboard/empleados/resumen`, { headers: this.headers() }).pipe(
        timeout(15000),
        catchError((err) => of({ error: err, resumen: null, por_estado: [], por_genero: [], por_seccion: [], meta: null })),
        shareReplay(1)
      );

      this.resumenCache$.subscribe((value) => {
        if (!value?.error) {
          this.resumenSnapshot = value;
        }
      });
    }

    return this.resumenCache$;
  }

  getResumenSnapshot(): any {
    return this.resumenSnapshot;
  }
}