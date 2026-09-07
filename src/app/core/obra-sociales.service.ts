import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface ObraSocialSuggestion {
  obra_social_id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  texto: string;
}

@Injectable({ providedIn: 'root' })
export class ObraSocialesService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  search(query: string): Observable<any> {
    const q = String(query || '').trim();
    if (!q) return of({ data: [], meta: { total: 0, query: '' } });
    return this.http.get<any>(`${environment.apiUrl}/api/obras-sociales/search?q=${encodeURIComponent(q)}`, { headers: this.headers() })
      .pipe(catchError((err) => of({ error: err, data: [], meta: { total: 0, query: q } })));
  }
}