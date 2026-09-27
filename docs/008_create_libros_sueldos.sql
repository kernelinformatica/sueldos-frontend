-- =====================================================================
-- 008_create_libros_sueldos.sql
-- Libro de Sueldos y Jornales (base del LSD - Libro de Sueldos Digital)
--
-- DISEÑO:
--   - 2 tablas: encabezado (libros_sueldos) + detalle snapshot por trabajador,
--     más una de auditoría.
--   - El detalle congela los datos descriptivos del trabajador (legajo, cuil,
--     apellido, categoria, convenio, etc.) y materializa los totales del
--     periodo. Es una foto inmutable: si en el futuro se corrige un apellido
--     o cambia una categoria, el libro de ese periodo NO se reescribe.
--   - No se duplica el desglose de conceptos: ese vive en liquidaciones_detalle.
--   - Multiempresa: toda FK incluye empresa_id, y el UNIQUE de libro_detalle
--     es compuesto (libro_sueldo_id, empresa_id, empleado_id) para que un libro
--     de una empresa nunca pueda contener empleados de otra.
--
-- MySQL 8 / InnoDB / utf8mb4
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1) libros_sueldos  — encabezado / version del libro
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS libros_sueldos (
  libro_sueldo_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id             INT UNSIGNED NOT NULL,

  -- Periodo cubierto. anio/mes desnormalizados para consulta rapida por anio.
  periodo_desde          DATE         NOT NULL,
  periodo_hasta          DATE         NOT NULL,
  anio                  SMALLINT     NOT NULL,
  mes                   TINYINT UNSIGNED NOT NULL,

  -- Tipo de liquidacion consolidado (NULL = todos los tipos del rango)
  liquidacion_tipo_id    INT UNSIGNED NULL,

  -- Correlativo por empresa + anio
  numero_libro           VARCHAR(30)  NOT NULL,
  version                INT UNSIGNED NOT NULL DEFAULT 1,

  -- borrador | generado | presentado | anulado
  estado                 ENUM('borrador','generado','presentado','anulado')
                         NOT NULL DEFAULT 'borrador',

  -- Totales del periodo (materializados desde el detalle)
  total_trabajadores     INT UNSIGNED NOT NULL DEFAULT 0,
  total_remuneraciones   DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_no_remunerativo  DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_descuentos       DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_aportes          DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_contribuciones   DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_neto             DECIMAL(15,2) NOT NULL DEFAULT 0.00,

  -- Integridad / trazabilidad
  hash_contenido         CHAR(64)     NULL,
  generado_por_usuario_id INT UNSIGNED NULL,
  generado_en            DATETIME     NULL,
  presentado_en          DATETIME     NULL,
  archivo_lsd_path       VARCHAR(255) NULL,
  presentacion_numero    VARCHAR(60)  NULL,

  creado_en              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (libro_sueldo_id),

  -- Correlativo: una empresa no puede repetir numero+version
  UNIQUE KEY uk_libros_sueldos_empresa_numero_version
    (empresa_id, numero_libro, version),

  -- Evita dos libros vivos del mismo periodo/tipo a la vez.
  -- Solo aplica a los estados que importan (borrador/generado/presentado);
  -- un libro anulado si puede coexistir con su reemplazo.
  UNIQUE KEY uk_libros_sueldos_periodo_vivo
    (empresa_id, anio, mes, liquidacion_tipo_id, estado),

  KEY idx_libros_sueldos_empresa_estado (empresa_id, estado),
  KEY idx_libros_sueldos_empresa_periodo (empresa_id, periodo_desde, periodo_hasta),
  KEY idx_libros_sueldos_hash (empresa_id, hash_contenido),

  CONSTRAINT FK_libros_sueldos_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas (empresa_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT FK_libros_sueldos_liquidacion_tipo
    FOREIGN KEY (liquidacion_tipo_id) REFERENCES liquidacion_tipo (liquidacion_tipo_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT FK_libros_sueldos_usuario
    FOREIGN KEY (generado_por_usuario_id) REFERENCES usuarios (usuario_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT ck_libros_sueldos_periodo
    CHECK (periodo_hasta >= periodo_desde),
  CONSTRAINT ck_libros_sueldos_mes
    CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT ck_libros_sueldos_version
    CHECK (version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2) libros_sueldos_detalle  — una fila por trabajador (SNAPSHOT inmutable)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS libros_sueldos_detalle (
  libro_sueldo_detalle_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  libro_sueldo_id          INT UNSIGNED NOT NULL,
  empresa_id               INT UNSIGNED NOT NULL,
  empleado_id              INT UNSIGNED NOT NULL,

  -- ===== SNAPSHOT: datos del trabajador al momento de liquidar =====
  legajo            VARCHAR(20)  NOT NULL,
  cuil              CHAR(11)     NOT NULL,
  apellido          VARCHAR(60)  NOT NULL,
  nombre            VARCHAR(60)  NOT NULL,
  estado_civil      VARCHAR(20)  NULL,
  nacionalidad      VARCHAR(30)  NULL,
  fecha_ingreso     DATE         NULL,
  fecha_egreso      DATE         NULL,
  categoria         VARCHAR(80)  NULL,
  convenio_id       INT UNSIGNED NULL,
  convenio_nombre   VARCHAR(120) NULL,
  situacion_laboral VARCHAR(30)  NULL,   -- permanente | temporal | eventual
  jornada_porcentaje DECIMAL(5,2) NULL,  -- 100.00 = tiempo completo
  horas_semanales   DECIMAL(5,2)  NULL,
  sucursal_id       INT UNSIGNED NULL,
  sucursal_nombre   VARCHAR(120)  NULL,

  -- Importes del periodo (materializados, no se recalculan al leer)
  remuneracion_base     DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_remunerativo    DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_no_remunerativo DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_remunerado      DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_descuentos      DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_aportes         DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_contribuciones  DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_neto            DECIMAL(15,2) NOT NULL DEFAULT 0.00,

  -- Liquidaciones que componen este registro (trazabilidad)
  liquidacion_ids       VARCHAR(255) NULL,   -- lista separada por comas

  observaciones    VARCHAR(255) NULL,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (libro_sueldo_detalle_id),

  -- Un trabajador una sola vez por libro, dentro de la misma empresa.
  UNIQUE KEY uk_libro_detalle_libro_empresa_empleado
    (libro_sueldo_id, empresa_id, empleado_id),

  -- Consultas tipicas: libro historico de un empleado, y busqueda por CUIL
  KEY idx_libro_detalle_empleado (empresa_id, empleado_id),
  KEY idx_libro_detalle_cuil (empresa_id, cuil),
  KEY idx_libro_detalle_periodo (libro_sueldo_id),

  CONSTRAINT FK_libro_detalle_libro
    FOREIGN KEY (libro_sueldo_id) REFERENCES libros_sueldos (libro_sueldo_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT FK_libro_detalle_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas (empresa_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT FK_libro_detalle_empleado
    FOREIGN KEY (empleado_id) REFERENCES empleados (empleado_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT FK_libro_detalle_convenio
    FOREIGN KEY (convenio_id) REFERENCES convenios (convenio_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT FK_libro_detalle_sucursal
    FOREIGN KEY (sucursal_id) REFERENCES sucursales (sucursal_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT ck_libro_detalle_fecha_egreso
    CHECK (fecha_egreso IS NULL OR fecha_ingreso IS NULL OR fecha_egreso >= fecha_ingreso),
  CONSTRAINT ck_libro_detalle_jornada
    CHECK (jornada_porcentaje IS NULL OR (jornada_porcentaje > 0 AND jornada_porcentaje <= 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3) auditoria_libros — trazabilidad de acciones sobre el libro
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria_libros (
  auditoria_libro_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  libro_sueldo_id     INT UNSIGNED NOT NULL,
  empresa_id          INT UNSIGNED NOT NULL,
  usuario_id          INT UNSIGNED NULL,
  accion              ENUM('generar','regenerar','exportar_lsd','exportar_pdf','presentar','anular')
                       NOT NULL,
  estado_anterior     VARCHAR(15) NULL,
  estado_nuevo        VARCHAR(15) NULL,
  motivo              VARCHAR(255) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (auditoria_libro_id),
  KEY idx_auditoria_libros_libro (libro_sueldo_id, created_at),
  KEY idx_auditoria_libros_empresa (empresa_id, created_at),

  CONSTRAINT FK_auditoria_libros_libro
    FOREIGN KEY (libro_sueldo_id) REFERENCES libros_sueldos (libro_sueldo_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT FK_auditoria_libros_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas (empresa_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT FK_auditoria_libros_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (usuario_id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
