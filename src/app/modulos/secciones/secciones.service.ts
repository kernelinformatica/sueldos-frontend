import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SeccionesService {
  constructor(private http: HttpClient) {}

  list(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/secciones`);
  }

  all(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/secciones/all`);
  }

  bySucursal(sucursalId: number): Observable<any> {
    const params = new HttpParams().set('sucursal_id', String(sucursalId));
    return this.http.get(`${environment.apiUrl}/api/secciones/by-sucursal`, { params });
  }

  get(id: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/secciones/${id}`);
  }

  create(payload: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/secciones`, payload);
  }

  update(id: number, payload: any): Observable<any> {
    return this.http.put(`${environment.apiUrl}/api/secciones/${id}`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/api/secciones/${id}`);
  }

  listSucursales(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/sucursales`);
  }

  listEstados(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/estados`);
  }
}