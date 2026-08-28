import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class ModulosEmpresaService {
  constructor(private http: HttpClient) {}

  getModulosEmpresa(empresaId?: number): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    let url = environment.apiUrl + '/api/modulos-empresa';
    // Si se pasa empresaId, agregarlo como query param
    if (empresaId) {
      url += `?empresaId=${empresaId}`;
    }
    return this.http.get(url, { headers });
  }
}
