import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
@Injectable({ providedIn: 'root' })
export class GruposService {
  constructor(private http: HttpClient) {



  }

  list(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/grupos_conceptos_master`);
  }

  get(id: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/grupos_conceptos_master/${id}`);
  }

  create(payload: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/grupos_conceptos_master`, payload);
  }

  update(id: number, payload: any): Observable<any> {
    return this.http.put(`${environment.apiUrl}/api/grupos_conceptos_master/${id}`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/api/grupos_conceptos_master/${id}`);
  }

  listAsignaciones(grupoId: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/grupos_conceptos_detalle/grupo/${grupoId}`);
  }

  assignConcepto(grupoId: number, conceptoId: number): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/grupos_conceptos_detalle`, { grupo_id: grupoId, concepto_id: conceptoId });
  }

  removeAsignacion(detalleId: number): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/api/grupos_conceptos_detalle/${detalleId}`);
  }

  listTopesByGrupo(grupoId: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/api/topes?grupo_id=${grupoId}`);
  }

  createTope(payload: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/topes`, payload);
  }

  deleteTope(id: number): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/api/topes/${id}`);
  }
}
