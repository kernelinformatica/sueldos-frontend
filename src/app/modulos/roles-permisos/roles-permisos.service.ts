import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse, CopiarPermisosPayload, PermisoDto, RolDto, RolPermisosPayload } from './roles-permisos.types';

@Injectable({ providedIn: 'root' })
export class RolesPermisosService {
  private readonly baseUrl = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient) {}

  listRoles(): Observable<ApiResponse<RolDto[]>> {
    return this.http.get<ApiResponse<RolDto[]>>(`${this.baseUrl}/roles`);
  }

  getRol(id: number): Observable<ApiResponse<RolDto>> {
    return this.http.get<ApiResponse<RolDto>>(`${this.baseUrl}/roles/${id}`);
  }

  createRol(payload: Partial<RolDto>): Observable<ApiResponse<RolDto>> {
    return this.http.post<ApiResponse<RolDto>>(`${this.baseUrl}/roles`, payload);
  }

  updateRol(id: number, payload: Partial<RolDto>): Observable<ApiResponse<RolDto>> {
    return this.http.put<ApiResponse<RolDto>>(`${this.baseUrl}/roles/${id}`, payload);
  }

  deleteRol(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.baseUrl}/roles/${id}`);
  }

  listPermisos(): Observable<ApiResponse<PermisoDto[]>> {
    return this.http.get<ApiResponse<PermisoDto[]>>(`${this.baseUrl}/permisos`);
  }

  getPermiso(id: number): Observable<ApiResponse<PermisoDto>> {
    return this.http.get<ApiResponse<PermisoDto>>(`${this.baseUrl}/permisos/${id}`);
  }

  createPermiso(payload: Partial<PermisoDto>): Observable<ApiResponse<PermisoDto>> {
    return this.http.post<ApiResponse<PermisoDto>>(`${this.baseUrl}/permisos`, payload);
  }

  updatePermiso(id: number, payload: Partial<PermisoDto>): Observable<ApiResponse<PermisoDto>> {
    return this.http.put<ApiResponse<PermisoDto>>(`${this.baseUrl}/permisos/${id}`, payload);
  }

  deletePermiso(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.baseUrl}/permisos/${id}`);
  }

  getPermisosByRol(rolId: number): Observable<ApiResponse<PermisoDto[]>> {
    return this.http.get<ApiResponse<PermisoDto[]>>(`${this.baseUrl}/roles/${rolId}/permisos`);
  }

  addPermisoToRol(rolId: number, permisoId: number): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.baseUrl}/roles/${rolId}/permisos`, { permiso_id: permisoId });
  }

  removePermisoFromRol(rolId: number, permisoId: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.baseUrl}/roles/${rolId}/permisos/${permisoId}`);
  }

  addPermisosMasivo(rolId: number, permisoIds: number[]): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.baseUrl}/roles/${rolId}/permisos/masivo`, { permisoIds });
  }

  removePermisosMasivo(rolId: number, permisoIds: number[]): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.baseUrl}/roles/${rolId}/permisos/masivo`, { body: { permisoIds } });
  }

  replacePermisos(rolId: number, permisoIds: number[]): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${this.baseUrl}/roles/${rolId}/permisos/reemplazar`, { permisos: permisoIds });
  }

  copiarPermisos(payload: CopiarPermisosPayload): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.baseUrl}/roles/copiar-permisos`, payload);
  }
}
