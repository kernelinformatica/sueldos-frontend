/**
 * Modelos del módulo SICOS / Seguridad Social / ARCA.
 *
 * Contrato HTTP (backend /api/sicoss):
 *  - Todas las operaciones son tenant-scoped: la empresa se toma del token JWT.
 *    NUNCA se envía `empresa_id` en el body; en las respuestas es solo display.
 */

/** Registro SICOS devuelto por el backend. */
export interface SicossItem {
  id: number;
  codigo: string;
  nombre: string;
  prioridad: number;
  activo: boolean;
  /** Solo lectura: lo establece el backend desde el token. No editable. */
  empresa_id: number;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, any>;
}

/** Payload de creación (POST /api/sicoss). Sin empresa_id. */
export interface SicossCreate {
  codigo: string;
  nombre: string;
  prioridad?: number;
  activo?: boolean;
  metadata?: Record<string, any>;
}

/** Payload de actualización (PUT /api/sicoss/:id). Sin empresa_id. */
export interface SicossUpdate {
  codigo?: string;
  nombre?: string;
  prioridad?: number;
  activo?: boolean;
  metadata?: Record<string, any>;
}

/** Respuesta paginada de GET /api/sicoss. */
export interface SicossListResponse {
  items: SicossItem[];
  total: number;
  page: number;
  perPage: number;
}

/** Body de POST /api/sicoss/:id/export.
 *
 * El backend persiste el archivo ARCA ya serializado que envía el frontend.
 * Se admiten ambas variantes de payload:
 *  - `content`: texto plano utf-8 (recomendado por el contrato SICOS).
 *  - `contenido_base64`: contenido codificado en base64.
 */
export interface ExportRequest {
  /** ID de la generación a la que pertenece la exportación. */
  generacion_id?: number;
  nombre_archivo: string;
  /** Archivo ARCA ya serializado, como texto plano (utf-8). */
  content?: string;
  /** Archivo ARCA en base64 (alternativa a `content`). */
  contenido_base64?: string;
  /** Ej: 'ARCA'. */
  formato?: string;
  version_layout?: string;
  /** 'utf-8' por defecto. */
  codificacion?: string;
}

/** Respuesta de POST /api/sicoss/:id/export. */
export interface ExportResponse {
  exportacion_id: number;
  generacion_id?: number;
  nombre_archivo: string;
  /** El backend puede devolver `hash` o `hash_contenido`. */
  hash?: string;
  hash_contenido?: string;
  created_at: string;
}

/** Exportación persistida (item del historial de archivos). */
export interface ExportacionItem {
  exportacion_id: number;
  generacion_id?: number;
  nombre_archivo: string;
  hash?: string;
  hash_contenido?: string;
  formato?: string;
  created_at?: string;
}

/** Resultado normalizado que devuelven los métodos del servicio. */
export interface SicossResult<T> {
  data: T | null;
  error?: any;
}

/* =====================================================================
   Generación SICOS a partir de las liquidaciones existentes.

   Flujo recomendado (backend construye la generación desde el liquidador):
     1) POST /api/sicoss/generaciones/preview  → vista previa + warnings
     2) POST /api/sicoss/generaciones          → persiste la generación
     3) POST /api/sicoss/:id/export            → persiste archivo ARCA

   El frontend NO recalcula liquidaciones: sólo selecciona período, tipo de
   liquidación y ámbito (todos / selección de empleados).
   ===================================================================== */

/** Tipo de liquidación entendido por el backend (catálogo /api/liquidacion-tipos). */
export interface LiquidacionTipo {
  id: number;
  nombre: string;
}

/** Ámbito de la generación: todos los empleados o una selección por empleado_id. */
export type EmpleadosScope = 'all' | number[];

/** Request de preview / generación. La empresa la determina el token. */
export interface GenerationRequest {
  mes: number;
  anio: number;
  /** Enumeración entendida por el backend (ej. 'MENSUAL'). */
  tipo_liquidacion: string;
  empleados: EmpleadosScope;
  incluir_subsistemas?: boolean;
  opciones?: Record<string, any>;
}

/** Concepto calculado/devuelto por el preview SICOS. */
export interface PreviewConceptItem {
  codigo?: string;
  code?: string;
  descripcion?: string;
  label?: string;
  amount: number | string;
  amount_cents?: number | null;
  source?: string | null;
  source_id?: number | null;
  group?: string | null;
  conce_codigo_afip?: string | number | null;
  conce_descri_afip?: string | null;
  note?: string | null;
  [key: string]: any;
}

/** Configuración aplicada por el backend al calcular el preview. */
export interface PreviewConfiguracionActual {
  empresa_id?: number | null;
  mes?: number | null;
  anio?: number | null;
  tipo_liquidacion?: string | null;
  incluir_subsistemas?: boolean | null;
  empleados?: EmpleadosScope | null;
  configuracion_snapshot?: SicossConfiguracionSnapshot | null;
  [key: string]: any;
}

export type SicossBaseSicoss = 'TOTAL' | '1' | '2' | '3' | '4' | '5' | '8' | '9' | '10';
export type SicossClasificacionFuncional =
  | 'REMUNERATIVO_BASE'
  | 'ADICIONAL'
  | 'PREMIO'
  | 'HORA_EXTRA'
  | 'SAC'
  | 'ZONA_DESFAVORABLE'
  | 'MATERNIDAD'
  | 'RECTIFICACION_REMUNERATIVA'
  | 'NO_REMUNERATIVO'
  | 'IMPORTE_A_DETRAER'
  | 'OTRO';

export interface SicossConfiguracionSnapshot {
  importe_a_detraer_fijo?: number | null;
  remuneracion_10_components?: SicossBaseSicoss[];
  clasificacion_por_concepto?: Record<string, SicossClasificacionFuncional>;
  bases_por_concepto?: Record<string, SicossBaseSicoss[]>;
  observaciones?: string | null;
  version?: string | null;
  [key: string]: any;
}

export interface SicossConceptoConfiguracionItem {
  concepto_id: number;
  codigo?: string | null;
  descripcion?: string | null;
  base_sicoss?: SicossBaseSicoss | null;
  clasificacion_funcional?: SicossClasificacionFuncional | null;
  participa_remuneracion_10?: boolean | null;
  afecta_importe_a_detraer?: boolean | null;
  configurado?: boolean | null;
  observacion?: string | null;
  raw?: any;
}

export interface SicossConfiguracionPersistPayload {
  fecha_desde: string;
  fecha_hasta?: string | null;
  version?: string | null;
  configuracion_snapshot?: SicossConfiguracionSnapshot;
  importe_a_detraer_fijo?: number | null;
  remuneracion_10_components?: SicossBaseSicoss[];
  clasificacion_por_concepto?: Record<string, SicossClasificacionFuncional>;
  bases_por_concepto?: Record<string, SicossBaseSicoss[]>;
  observaciones?: string | null;
}

export interface SicossConfiguracionPersistResponse {
  ok: boolean;
  configuracion_id?: number;
  empresa_id?: number;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  version_reglas?: string | null;
  configuracion_snapshot?: SicossConfiguracionSnapshot | null;
  [key: string]: any;
}

/** Item de diagnóstico / advertencia del preview. */
export interface PreviewDiagnosticoItem {
  empleado_id?: number | null;
  cuil?: string | null;
  legajo?: string | null;
  nombre?: string | null;
  warning?: string | null;
  mensaje?: string | null;
  detail?: string | null;
  [key: string]: any;
}

/** Fila faltante o incompleta informada por el backend. */
export interface PreviewMissingDatoItem {
  empleado_id?: number | null;
  cuil?: string | null;
  legajo?: string | null;
  nombre?: string | null;
  motivo?: string | null;
  mensaje?: string | null;
  detail?: string | null;
  warnings?: string[];
  [key: string]: any;
}

/** Datos de trazabilidad usados por la fila del preview. */
export interface PreviewUsedRow {
  source?: string | null;
  source_id?: number | null;
  used_convenio_categoria_fallback?: boolean | null;
  used_source?: string | null;
  simulated?: boolean | null;
  [key: string]: any;
}

/** Fila auditable de la vista previa. */
export interface PreviewItem {
  empresa_id?: number | null;
  generacion_id?: number | null;
  periodo_id?: number | null;
  empleado_id: number;
  legajo?: string | null;
  nombre: string;
  numero_documento?: string | null;
  cuit?: string | null;
  cuil: string;
  remuneracion_total?: number | string;
  remuneracion_total_cents?: number | null;
  rem_total?: number | string;
  rem_total_cents?: number | null;
  asignaciones_familiares_pagadas?: number | string;
  aporte_voluntario?: number | string;
  aporte_adicional_os?: number | string;
  cod_actividad?: number | null;
  categoria_codigo?: string | null;
  categoria_nombre?: string | null;
  cod_condicion?: number | null;
  cod_zona?: number | null;
  used_source?: string | null;
  source_id?: number | null;
  simulated?: boolean | null;
  fallback_from_categoria?: boolean | null;
  used_row?: PreviewUsedRow | null;
  conceptos_simulados?: PreviewConceptItem[];
  conceptos?: PreviewConceptItem[];
  detalle_sicoss?: any;
  diagnostico?: PreviewDiagnosticoItem | Record<string, any> | null;
  warnings?: string[];
  excluded_reason?: string | null;
  [key: string]: any;
}

/** Respuesta de POST /api/sicoss/generaciones/preview. */
export interface PreviewResponse {
  preview_id?: string;
  simulated_generaciones_detalle?: PreviewItem[];
  items?: PreviewItem[];
  missing_datos_count?: number;
  missing_datos_preview?: PreviewMissingDatoItem[];
  configuracion_actual?: PreviewConfiguracionActual | null;
  diagnostico?: PreviewDiagnosticoItem | Record<string, any> | null;
  summary?: {
    count?: number;
    empleados_incluidos?: number;
    empleados_excluidos_por_no_cerrada?: number;
    empleados_excluidos_por_rem_cero?: number;
    total_rem?: number | string;
    total_remuneraciones?: number | string;
    total_remuneraciones_cents?: number | null;
    versionReglas?: string | null;
  };
  warnings?: Array<any>;
  [key: string]: any;
}

/** Respuesta de POST /api/sicoss/generaciones. */
export interface GenerateResponse {
  generacion_id: number;
  status: string;
}

/** Encabezado de una generación persistida (GET /api/sicoss/generaciones/:id). */
export interface GeneracionDetalle {
  generacion_id: number;
  mes: number;
  anio: number;
  tipo_liquidacion: string;
  status: string;
  total_empleados?: number;
  total_rem?: number | string;
  created_at?: string;
  items?: PreviewItem[];
}

/* =====================================================================
   Catálogo de Subsistemas y Generaciones SICOS.
   ===================================================================== */

/** Categoría del catálogo de subsistemas. */
export type SubsistemaCategoria = 'sicoss' | 'impositivo';

/** Subsistema permitido para la empresa (tenant-scoped por el token). */
export interface Subsistema {
  subsistema_id: number;
  codigo: string;
  nombre: string;
  categoria?: SubsistemaCategoria | string | null;
  estado_id?: number | null;
  estado?: string | null;
  activo?: boolean | null;
  /** Solo lectura: lo determina el backend. */
  empresa_id?: number | null;
}

/** Catálogo básico de conceptos usado por la pantalla de configuración SICOSS. */
export interface ConceptoCatalogoItem {
  concepto_id: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  grupo_id?: number | null;
  grupo_nombre?: string | null;
  activo?: boolean | null;
  empresa_id?: number | null;
  [key: string]: any;
}

/** Cabecera de grupo de conceptos. */
export interface GrupoConceptoItem {
  grupo_id: number;
  nombre: string;
  descripcion?: string | null;
  es_default_sistema?: boolean | number | null;
  activo?: boolean | null;
  empresa_id?: number | null;
  [key: string]: any;
}

/** Relación de un concepto dentro de un grupo. */
export interface GrupoConceptoDetalleItem {
  grupo_detalle_id: number;
  grupo_id: number;
  concepto_id: number;
  codigo?: string | null;
  descripcion?: string | null;
  nombre?: string | null;
  [key: string]: any;
}

/** Relación de un concepto con una base de remuneración SICOSS. */
export interface SicossConceptoRemuneracionItem {
  empresa_id?: number | null;
  concepto_id: number;
  remuneracion: string;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  activo?: boolean | number | string | null;
  concepto_codigo?: string | null;
  concepto_nombre?: string | null;
  [key: string]: any;
}

export interface SicossConceptoRemuneracionReplacePayload {
  concepto_id: number;
  remuneraciones: string[];
  fecha_desde?: string | null;
}

/** Relación de un concepto con un subsistema LSD. */
export interface LsdSegSocialConceptoItem {
  concepto_seg_social_id?: number | null;
  empresa_id?: number | null;
  concepto_id: number;
  subsistema_id: number;
  afecta_base?: boolean | number | string | null;
  es_aporte?: boolean | number | string | null;
  es_contribucion?: boolean | number | string | null;
  estado_id?: number | null;
  concepto_codigo?: string | null;
  concepto_nombre?: string | null;
  subsistema_codigo?: string | null;
  subsistema_nombre?: string | null;
  [key: string]: any;
}

export interface LsdSegSocialConceptoPayload {
  concepto_id: number;
  subsistema_id: number;
  afecta_base?: boolean | number | string | null;
  es_aporte?: boolean | number | string | null;
  es_contribucion?: boolean | number | string | null;
  estado_id?: number | null;
}

/** Fila ampliada de la vista previa (contrato SICOS completo). */
export interface GeneracionPreviewItem {
  empleado_id: number;
  cuil: string;
  nombre: string;
  legajo?: string | null;
  rem_total: number | string;
  asig_fam_pagadas?: number | string;
  imp_aporte_voluntario?: number | string;
  imp_adicional_os?: number | string;
  imp_exedente_ap_ss?: number | string;
  importe_exedenete_ap_os?: number | string;
  cod_actividad?: string | number | null;
  cod_condicion?: string | number | null;
  cod_zona?: string | number | null;
  warnings?: string[];
  conceptos?: PreviewConceptItem[];
  conceptos_simulados?: PreviewConceptItem[];
  used_row?: PreviewUsedRow | null;
  detalle_sicoss?: any;
  diagnostico?: PreviewDiagnosticoItem | Record<string, any> | null;
}

/** Encabezado de una generación persistida. */
export interface GeneracionHeader {
  generacion_id: number;
  empresa_id?: number;
  mes: number;
  anio: number;
  nombre?: string;
  tipo_liquidacion?: string;
  estado?: string;
  total_empleados?: number;
  total_rem?: number | string;
  created_at?: string;
}

/** Detalle completo de una generación (header + items). */
export interface GeneracionDetalleFull {
  header: GeneracionHeader | null;
  items: GeneracionPreviewItem[];
}

/** Respuesta paginada de generaciones (si el backend expone page/perPage/total). */
export interface GeneracionesPaginadas {
  items: GeneracionHeader[];
  total: number;
  page: number;
  perPage: number;
}

/** Fila del padrón de empleados para el selector de la generación. */
export interface EmpleadoPadron {
  empleado_id: number;
  legajo: string;
  cuil: string;
  apellido: string;
  nombre: string;
  estado?: string | number | null;
}

/** Respuesta paginada del padrón de empleados. */
export interface EmpleadoPadronPaginado {
  items: EmpleadoPadron[];
  total: number;
  page: number;
  perPage: number;
}
