import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import {
  ApiResponse,
  CambiarPasswordRequest,
  Empresa,
  ResetPasswordRequest,
  Rol,
  Usuario,
  UsuarioCreateRequest,
  UsuarioListadoResponse,
  UsuarioUpdateRequest,
  UsuariosListParams
} from './usuarios.types';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly baseUrl = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient) {}

  listar(params: UsuariosListParams = {}): Observable<ApiResponse<UsuarioListadoResponse> | UsuarioListadoResponse | Usuario[]> {
    let httpParams = new HttpParams();
    if (params.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params.limit != null) httpParams = httpParams.set('limit', String(params.limit));
    if (params.search != null && String(params.search).trim()) httpParams = httpParams.set('search', String(params.search).trim());
    if (params.empresa_id != null && params.empresa_id !== undefined) httpParams = httpParams.set('empresa_id', String(params.empresa_id));
    if (params.rol_id != null && params.rol_id !== undefined) httpParams = httpParams.set('rol_id', String(params.rol_id));
    if (params.estado_id != null && params.estado_id !== undefined) httpParams = httpParams.set('estado_id', String(params.estado_id));
    return this.http.get<ApiResponse<UsuarioListadoResponse> | UsuarioListadoResponse | Usuario[]>(`${this.baseUrl}/usuarios`, { params: httpParams });
  }

  obtenerPorId(id: number): Observable<ApiResponse<Usuario> | Usuario> {
    return this.http.get<ApiResponse<Usuario> | Usuario>(`${this.baseUrl}/usuarios/${id}`);
  }

  crear(body: UsuarioCreateRequest): Observable<ApiResponse<Usuario> | Usuario> {
    return this.http.post<ApiResponse<Usuario> | Usuario>(`${this.baseUrl}/usuarios`, body);
  }

  actualizar(id: number, body: UsuarioUpdateRequest): Observable<ApiResponse<Usuario> | Usuario> {
    return this.http.put<ApiResponse<Usuario> | Usuario>(`${this.baseUrl}/usuarios/${id}`, body);
  }

  cambiarEstado(id: number, estadoId: number): Observable<ApiResponse<Usuario> | Usuario> {
    return this.http.patch<ApiResponse<Usuario> | Usuario>(`${this.baseUrl}/usuarios/${id}/estado`, { estado_id: estadoId });
  }

  eliminar(id: number): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.baseUrl}/usuarios/${id}`);
  }

  cambiarPassword(id: number, body: CambiarPasswordRequest): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/usuarios/${id}/cambiar-password`, body);
  }

  resetPassword(id: number, body: ResetPasswordRequest): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/usuarios/${id}/reset-password`, body);
  }

  desbloquear(id: number): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/usuarios/${id}/desbloquear`, {});
  }

  obtenerRoles(empresaId?: number | null): Observable<ApiResponse<Rol[]> | Rol[]> {
    let params = new HttpParams();
    if (empresaId != null && empresaId !== undefined) {
      params = params.set('empresa_id', String(empresaId));
    }
    return this.http.get<ApiResponse<Rol[]> | Rol[]>(`${this.baseUrl}/usuarios/roles`, { params });
  }

  obtenerEmpresas(): Observable<ApiResponse<Empresa[]> | Empresa[]> {
    return this.http.get<ApiResponse<Empresa[]> | Empresa[]>(`${this.baseUrl}/empresa`);
  }
}
