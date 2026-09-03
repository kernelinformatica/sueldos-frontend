import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CargosService {
  constructor(private http: HttpClient) {}

  all(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/cargos/all`);
  }

  list(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/cargos`);
  }

  get(id: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/cargos/${id}`);
  }

  create(payload: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/cargos`, payload);
  }

  update(id: number, payload: any): Observable<any> {
    return this.http.put(`${environment.apiUrl}/api/cargos/${id}`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/api/cargos/${id}`);
  }

  listSecciones(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/secciones/all`);
  }

  bySucursal(sucursalId: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/secciones/by-sucursal`, {
      params: { sucursal_id: String(sucursalId) } as any
    });
  }

  cargosBySeccion(seccionId: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/cargos/by-seccion`, {
      params: { seccion_id: String(seccionId) } as any
    });
  }

  cargosBySeccionPath(seccionId: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/cargos/seccion/${seccionId}`);
  }

  listSucursales(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/sucursales`);
  }
}