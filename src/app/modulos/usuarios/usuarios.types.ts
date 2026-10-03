export interface ApiResponse<T> {
  codigo?: number;
  estado?: string;
  mensaje?: string;
  data?: T;
}

export interface Empresa {
  empresa_id?: number;
  id?: number;
  nombre?: string;
  nombre_fantasia?: string;
  codigo_empresa?: string;
  codigo?: string;
  estado_id?: number;
  estado?: number | string;
}

export interface Rol {
  rol_id?: number;
  id?: number;
  nombre?: string;
  alias?: string;
  descripcion?: string;
  empresa_id?: number | null;
  estado_id?: number;
  estado?: number | string;
  activo?: number | boolean;
}

export interface Usuario {
  usuario_id?: number;
  id?: number;
  empresa_id?: number | null;
  rol_id?: number | null;
  username?: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  estado_id?: number;
  estado?: number | string | { estado_id?: number; id?: number; nombre?: string; descripcion?: string; es_activo?: number | boolean };
  ultimo_acceso?: string | null;
  password_fecha_cambio?: string | null;
  bloqueado?: number | boolean;
  intentos_fallidos?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  empresa?: Empresa | null;
  rol?: Rol | null;
}

export interface UsuarioListadoResponse {
  items?: Usuario[];
  usuarios?: Usuario[];
  data?: Usuario[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface UsuarioCreateRequest {
  empresa_id: number;
  rol_id: number;
  username: string;
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  estado_id: number;
}

export interface UsuarioUpdateRequest {
  empresa_id: number;
  rol_id: number;
  username: string;
  email: string;
  nombre: string;
  apellido: string;
  estado_id: number;
}

export interface CambiarPasswordRequest {
  current_password?: string;
  nueva_password: string;
  password_nueva_confirmacion: string;
}

export interface ResetPasswordRequest {
  password_nueva: string;
  password_nueva_confirmacion: string;
}

export interface UsuariosListParams {
  page?: number;
  limit?: number;
  search?: string;
  empresa_id?: number | null;
  rol_id?: number | null;
  estado_id?: number | null;
}
