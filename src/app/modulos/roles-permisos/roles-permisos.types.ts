export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
}

export interface RolDto {
  id?: number;
  nombre: string;
  alias: string;
  descripcion?: string | null;
  estado?: number | boolean;
  es_super_admin?: boolean;
  permisos?: PermisoDto[];
}

export interface PermisoDto {
  id?: number;
  nombre: string;
  alias: string;
  descripcion?: string | null;
  modulo?: string | null;
  grupo?: string | null;
  ruta?: string | null;
  es_menu?: boolean | number;
  estado_id?: number;
  estado?: number | boolean;
}

export interface RolPermisosPayload {
  permisos?: number[];
  permisoIds?: number[];
  permiso_ids?: number[];
}

export interface CopiarPermisosPayload {
  rolOrigenId: number;
  rolDestinoId: number;
}
