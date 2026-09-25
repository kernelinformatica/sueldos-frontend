export interface EmpleadoBasico {
  empleado_basico_id: number;
  empresa_id: number;
  empleado_id: number;
  basico_personalizado: number;
  fecha_desde: string;
  fecha_hasta: string | null;
  activo: number;
  apellido?: string;
  nombre?: string;
  documento?: string;
  legajo?: string;
  contratacion_tipo_id?: number;
}

export interface EmpleadoBasicoResponse {
  success: boolean;
  data: EmpleadoBasico[];
}

export interface EmpleadoBasicoCreatePayload {
  empleado_id: number;
  basico_personalizado: number;
  fecha_desde: string;
  fecha_hasta: string | null;
  activo: number;
}

export interface EmpleadoBasicoUpdateMasivoItem {
  empleado_basico_id: number;
  basico_personalizado?: number;
  fecha_desde?: string;
  fecha_hasta?: string | null;
  activo?: number;
}

export interface EmpleadoOption {
  empleado_id?: number;
  id?: number;
  legajo?: string;
  apellido?: string;
  nombre?: string;
  numero_documento?: string;
  documento?: string;
  tipo_contratacion_id?: number;
  contratacion_tipo?: { contrataciones_tipos_id?: number; id?: number; nombre?: string };
  seccion_id?: number;
  seccion?: { seccion_id?: number; id?: number; nombre?: string };
  cargo_id?: number;
  cargo?: { cargo_id?: number; id?: number; nombre?: string };
  foto_url_publica?: string | null;
  url_publica?: string | null;
  foto?: string | null;
}

export interface CatalogoOption {
  id: number;
  nombre: string;
}
