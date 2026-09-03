import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SucursalesService {
  constructor(private http: HttpClient) {}

  list(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/sucursales`);
  }

  all(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/sucursales/all`);
  }

  get(id: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/sucursales/${id}`);
  }

  create(payload: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/sucursales`, payload);
  }

  update(id: number, payload: any): Observable<any> {
    return this.http.put(`${environment.apiUrl}/api/sucursales/${id}`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/api/sucursales/${id}`);
  }

  relacionarSecciones(id: number, payload: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/sucursales/${id}/relacionar-secciones`, payload);
  }
}