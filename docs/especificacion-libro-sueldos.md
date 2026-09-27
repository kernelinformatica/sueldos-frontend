# Especificación Funcional y Técnica — Libro de Sueldos y Jornales Digital (LSJ / LSD)

**Proyecto:** Sistema de Sueldos y Jornales
**Versión:** 1.0
**Alcance:** Módulo de Libro de Sueldos y Jornales, integrado sobre el motor de liquidaciones existente.

---

## 0. Advertencia sobre la base normativa

Este documento fue redactado con mi conocimiento de normativa laboral argentina, que tiene
corte en **principios de 2025**. Antes de ponerlo en producción **verificá contra el texto
vigente** los siguientes puntos, porque son los que más cambian y donde no quiero que te
confíes a ciegas:

| Punto a verificar | Dónde |
|---|---|
| Número y vigencia de la RG que habilita el Libro de Sueldos Digital | Boletín Oficial / ARCA |
| Estructura exacta del archivo XML o TXT de exportación del LSD | Anexo de la RG |
| Plazos de presentación y el formato de los archivos del LSD | Anexo de la RG |
| Reformas al art. 52 LCT sobre el contenido mínimo del Libro Especial | texto actualizado LCT |
| Vigencia del artículo 245 LCT (suspensión del pago de aportes en ART) | LCT / Ley 27.541 |

Lo que sí es estructural y estable: el **art. 52 LCT** obliga al empleador a llevar un
libro especial donde constan **día a día** los datos del trabajo (cantidad y clase de trabajo,
remuneración, nombre y apellido de los trabajadores) — eso no cambió. Y el **art. 58**
regula la conservación de libros y documentación por el plazo de prescripción. La
digitalización es una **facilitación administrativa** sobre esa obligación preexistente, no una
obligación nueva que pueda eximir del libro.

**Principio de diseño que deriva de esto:** el LSD es un **formato de exportación e
intercambio**, no un sustituto de guardar los datos. Por eso este diseño pone el libro
como una **materialización inmutable y versionada** de datos que ya existen, y no como
una fuente de verdad paralela. Eso además te protege si mañana la RG cambia de formato.

---

## 1. Análisis de requisitos

### 1.1 Datos obligatorios por trabajador (art. 52 LCT + LSD)

| Campo | Origen | Obligatoriedad |
|---|---|---|
| Legajo | interno | Sí |
| CUIL | LCT art. 5 (identificación laboral) | Sí, 11 dígitos con prefijo |
| Apellido y nombre | — | Sí |
| Fecha de ingreso | — | Sí |
| Fecha de egreso | — | Condicional (solo si egresó) |
| Estado civil | — | Sí |
| Nacionalidad | — | Sí |
| Categoría / puesto | — | Sí |
| Convenio colectivo | sindicato o CUIL (sindicato) | Sí |
| Situación laboral (permanente/temporal/eventual) | art. 4 LCT | Sí |
| Sucursal / centro de trabajo | registro de la empresa | Sí |
| Remuneración asignada | — | Sí |
| Jornada (horas semanales / % tiempo completo) | LCT 153–157 | Sí |
| Forma de pago, cuenta bancaria/CBU | art. 59 LCT (pago en efectivo ≤ otros) | Sí |

### 1.2 Datos obligatorios por período

- Identificación: empresa, CUIT, domicilio del establecimiento
- Período liquidado (mes/año y fecha de pago real)
- Tipo de liquidación (mensual/quincenal/final/SAC/vacaciones/retroactivo/ajuste)
- Total remuneraciones, total descuentos, total aportes, total contribuciones, total neto
- Cantidad de trabajadores del período
- Responsable de la liquidación (apellido, nombre, CUIL y firma)

### 1.3 Conservación histórica

| Elemento | Plazo |
|---|---|
| Libro de Sueldos y Jornales | 5 años (prescripción general) |
| Planillas de liquidación y recibos | 5 años |
| Registros de adicionales, horas extra, vacaciones | 5 años |
| Registros de ART | según Ley 24.557 y Leg. 245 (sin plazo para accidentes) |

**Implementación:** nada de lo que toca el Libro se borra físicamente en el flujo normal.
Toda anulación es una baja lógica con motivo obligatorio, y el libro ya generado es
inmutable.

---

## 2. Modelo de datos

### 2.1 Entidades nuevas

#### `libros_sueldos`

| Campo | Tipo | Long | Obl. | Notas |
|---|---|---|---|---|
| `libro_sueldo_id` | INT | 10 | Sí | PK, AUTO_INCREMENT |
| `empresa_id` | INT | 10 | Sí | FK, del JWT |
| `periodo_desde` | DATE | 10 | Sí | |
| `periodo_hasta` | DATE | 10 | Sí | rango cubierto por este libro |
| `tipo_liquidacion` | VARCHAR | 20 | No | null = todos los tipos del rango |
| `numero_libro` | VARCHAR | 30 | Sí | correlativo por empresa+año |
| `estado` | ENUM | 15 | Sí | `borrador`,`generado`,`presentado`,`anulado` |
| `version` | INT | 10 | Sí | default 1, ver §2.3 |
| `total_trabajadores` | INT | 10 | Sí | |
| `total_remuneraciones` | DECIMAL | 14,2 | Sí | |
| `total_descuentos` | DECIMAL | 14,2 | Sí | |
| `total_neto` | DECIMAL | 14,2 | Sí | |
| `generado_por_usuario_id` | INT | 10 | Sí | FK usuarios |
| `generado_en` | TIMESTAMP | — | Sí | |
| `hash_contenido` | CHAR | 64 | Sí | SHA-256 del contenido; integridad |
| `presentado_en` | TIMESTAMP | — | No | |
| `archivo_lsd_path` | VARCHAR | 255 | No | export LSD generado |
| `created_at` | TIMESTAMP | — | Sí | |
| `updated_at` | TIMESTAMP | — | Sí | |

**PK:** `libro_sueldo_id`
**FK:** `empresa_id` → empresas; `generado_por_usuario_id` → usuarios
**Índices:** `UNIQUE(empresa_id, numero_libro, version)`; `INDEX(empresa_id, estado)`;
`INDEX(empresa_id, periodo_desde, periodo_hasta)`

#### `libros_sueldos_detalle`

Una fila por trabajador por libro.

| Campo | Tipo | Long | Obl. | Notas |
|---|---|---|---|---|
| `libro_detalle_id` | INT | 10 | Sí | PK |
| `libro_sueldo_id` | INT | 10 | Sí | FK |
| `empleado_id` | INT | 10 | Sí | FK |
| `legajo` | VARCHAR | 20 | Sí | **snapshot**, no FK al empleado actual |
| `cuil` | CHAR | 11 | Sí | **snapshot** |
| `apellido` | VARCHAR | 60 | Sí | **snapshot** |
| `nombre` | VARCHAR | 60 | Sí | **snapshot** |
| `estado_civil` | VARCHAR | 20 | Sí | snapshot |
| `nacionalidad` | VARCHAR | 30 | Sí | snapshot |
| `fecha_ingreso` | DATE | 10 | Sí | snapshot |
| `fecha_egreso` | DATE | 10 | No | snapshot |
| `categoria` | VARCHAR | 80 | Sí | snapshot |
| `convenio_collective_id` | INT | 10 | Sí | FK |
| `situacion_laboral` | VARCHAR | 30 | Sí | permanente/temporal/eventual |
| `jornada_porcentaje` | DECIMAL | 5,2 | Sí | ej. 100,00 |
| `horas_semanales` | DECIMAL | 5,2 | No | |
| `dias_trabajados` | DECIMAL | 5,2 | Sí | permite proporcionales |
| `remuneracion_bruta` | DECIMAL | 14,2 | Sí | |
| `total_remunerativo` | DECIMAL | 14,2 | Sí | |
| `total_no_remunerativo` | DECIMAL | 14,2 | Sí | |
| `total_descuentos` | DECIMAL | 14,2 | Sí | |
| `total_aportes` | DECIMAL | 14,2 | Sí | |
| `total_contribuciones` | DECIMAL | 14,2 | Sí | |
| `total_neto` | DECIMAL | 14,2 | Sí | |
| `observaciones` | VARCHAR | 255 | No | |

**PK:** `libro_detalle_id`
**FK:** `libro_sueldo_id` → libros_sueldos (ON DELETE RESTRICT);
`empleado_id` → empleados_salarios
**Índices:** `UNIQUE(libro_sueldo_id, empleado_id)`; `INDEX(empleado_id)`; `INDEX(cuil)`

> **Decisión de diseño importante:** los datos descriptivos (legajo, CUIL, apellido,
> categoría) se **copian como snapshot** en vez de leerse por join al empleado. Razón: si
> en 2030 corregís el apellido de alguien o cambia su categoría, el libro de 2026 debe
> seguir mostrando lo que se liquió en ese momento. Un join lo reescribiría retroactivamente
> y rompería la trazabilidad — que es exactamente lo que el inspector viene a verificar.

#### `libros_sueldos_conceptos`

Desglose por concepto, para poder exportar el LSD con detalle y para auditar.

| Campo | Tipo | Long | Obl. | Notas |
|---|---|---|---|---|
| `libro_concepto_id` | BIGINT | 20 | Sí | PK |
| `libro_sueldo_id` | INT | 10 | Sí | FK |
| `empleado_id` | INT | 10 | Sí | FK |
| `concepto_id` | INT | 10 | Sí | FK conceptos |
| `codigo` | VARCHAR | 30 | Sí | snapshot |
| `nombre` | VARCHAR | 120 | Sí | snapshot |
| `tipo_concepto` | ENUM | 20 | Sí | remunerativo/no_remun/descuento/aporte/contrib |
| `formula_tipo` | VARCHAR | 20 | No | snapshot |
| `cantidad` | DECIMAL | 10,4 | Sí | |
| `importe` | DECIMAL | 14,2 | Sí | |

**PK:** `libro_concepto_id`
**FK:** `libro_sueldo_id` → libros_sueldos; `empleado_id` → empleados_salarios;
`concepto_id` → conceptos
**Índices:** `INDEX(libro_sueldo_id, empleado_id)`; `INDEX(libro_sueldo_id, tipo_concepto)`

#### `auditoria_libros` (trazabilidad de cambios de estado)

| Campo | Tipo | Obl. | Notas |
|---|---|---|---|
| `auditoria_libro_id` | INT | Sí | PK |
| `libro_sueldo_id` | INT | Sí | FK |
| `usuario_id` | INT | Sí | FK |
| `accion` | VARCHAR(40) | Sí | generar/reimprimir/presentar/anular/exportar |
| `estado_anterior` | VARCHAR(15) | No | |
| `estado_nuevo` | VARCHAR(15) | No | |
| `motivo` | VARCHAR(255) | No | **obligatorio si accion=anular** |
| `created_at` | TIMESTAMP | Sí | |

### 2.2 Reutilización de tablas existentes

No duplico: `periodos_liquidacion`, `liquidaciones`, `liquidaciones_detalle`,
`liquidacion_tipo`, `conceptos`, `empleados_salarios`, `auditoria_global`.

El libro se alimenta de `liquidaciones` + `liquidaciones_detalle` filtrando por
`periodo_id IN (rango)` y el `estado_liquidacion_id` que corresponda a "liquidación
completa" (hoy tu enum ya tiene edición/revisión/cerrada/anulada).

### 2.3 Versionado

`libros_sueldos` no se actualiza: cada regenerate crea una fila nueva con `version = N+1`.
La versión anterior queda en `estado='anulado'` con su motivo. Se genera el libro una vez
cerrada; si el mismo período se vuelve a generar, es un libro distinto con hash distinto.

Esto se puede soportar con la `UNIQUE(empresa_id, numero_libro, version)`.

---

## 3. Reglas de negocio

### 3.1 Validaciones de entrada

| Regla | Mensaje |
|---|---|
| CUIT/CUIL con dígito verificador inválido | "CUIL inválido: el dígito verificador no coincide" |
| CUIT/CUIL no numérico o ≠ 11 dígitos | "CUIL debe tener 11 dígitos" |
| Fecha de egreso < fecha de ingreso | "La fecha de egreso no puede ser anterior a la de ingreso" |
| Empleado sin fecha_ingreso al momento del período | "El empleado {legajo} no tiene fecha de ingreso registrada" |
| Empleado con egreso anterior al inicio del período | "El empleado {legajo} egresó el {fecha}, fuera del período liquidado" |
| Empleado con ingreso posterior al cierre del período | "El ingreso del empleado {legajo} ({fecha}) es posterior al período" |
| Importe negativo en un concepto remunerativo | "No se permiten importes negativos en conceptos remunerativos" |
| `total_neto != total_haberes - total_descuentos` | "El total neto no cuadra con los totales de la liquidación" |
| Redondeos con diferencia > $0,01 | "Diferencia de redondeo mayor a un centavo" |

### 3.2 Validaciones de generación

1. **No generar libro con liquidaciones incompletas.** Todas las liquidaciones del rango
   deben estar en estado `cerrada`. Si alguna está en `edicion` o `revision`, se bloquea
   y se listan cuáles.
2. **No generar sobre un período sin liquidaciones.**
3. **Coherencia de totales:** los totales del libro se calculan desde el detalle, nunca
   desde un campo agregado. Se verifica que cuadre con el encabezado.
4. **Empleado sin remuneración en el período:** si tiene liquidación con total 0, se
   incluye con total 0 y observación, o se excluye según el parámetro. **Recomendación:
   incluir con observación**, porque omitir un trabajador de un libro es exactamente el tipo
   de error que se detecta en una inspección.
5. **Un empleado aparece una vez por libro** (`UNIQUE(libro_sueldo_id, empleado_id)`).
6. **Reintegros y'artículos fuera de período:** si un período tiene liquidaciones de tipo
   distinto al dominante, se agrupan por `tipo_liquidacion` en libros separados.

### 3.3 Inmutabilidad y trazabilidad

- Un libro en estado `generado` o `presentado` **no se modifica jamás**.
- Toda acción sobre libros va a `auditoria_libros`.
- El `hash_contenido` se recalcula y compara en cada relectura; si no coincide, es
  indicio de manipulación.
- El borrado físico de libros está prohibido a nivel de aplicación (soft delete
  únicamente, y solo en `borrador`).

---

## 4. Pantallas

### 4.1 Lista de libros (`/sueldos/libros`)

Filtros: período desde/hasta, tipo de liquidación, estado, año.
Columnas: número, período, tipo, trabajadores, bruto, neto, estado, versión, generado, usuario.
Acciones: ver, generar, exportar PDF, exportar LSD, reimprimir, anular.

### 4.2 Generador

- Paso 1: definir período y tipo.
- Paso 2: **previsualización con validaciones en pantalla.** Lista de errores y warnings
  antes de permitir generar.
- Paso 3: confirmar y generar.

### 4.3 Visor del libro

- Encabezado empresa
- Período, tipo, totals globales
- Tabla de trabajadores con columnas del §6
- Detalle por trabajador (modal con sus conceptos)
- Pie con responsable y hash

### 4.4 Exportación LSD

Pantalla que muestra el archivo generado, permite descargarlo y registrar la
presentación (fecha, número de presentación, responsable).

---

## 5. Reportes

| Reporte | Origen | Campos |
|---|---|---|
| **Libro de Sueldos y Jornales** | `libros_sueldos_detalle` | Ver §6 |
| Recibo de haberes | `liquidaciones` + `liquidaciones_detalle` | Ya existe (`GET /api/liquidaciones/:id/pdf`) |
| Liquidación mensual | Ídem | Periodo, haberes, descuentos, neto, costo empresa |
| Liquidación final | Ídem + `empleados_salarios.fecha_egreso` | Incluye vacaciones no gozadas, SAC proporcional, indemnity |
| SAC (Aguinaldo) | `periodo_liquidacion` tipo `sac` | 1/2 mejor remuneración, período de cómputo |
| Vacaciones | tipo `vacaciones` | Días gozados, remuneración, días trabajados |
| Resumen por trabajador | `liquidaciones` agregadas | Historial salarial completo |
| Exportación LSD | `libros_sueldos_conceptos` | Archivo con el formato normativo |

**Reportes adicionales recomendados:** Libro de adicionales y horas extra (art. 154 LCT),
registro de vacations (art. 146 LCT), y resumen de aportes/contribuciones por
convenio para el AFIP.

---

## 6. Formato del Libro de Sueldos

### 6.1 Columnas (en orden)

**Encabezado**
```
EMPRESA — Razón Social
CUIT
Domicilio del establecimiento
Actividad económica
Convenio colectivo aplicable

LIBRO DE SUELDOS Y JORNALES
Período: MM/AAAA
Tipo de liquidación
Número de libro: NNNN    Versión: N
Fecha de generación / Presentación

LEGAJO | CUIL | APELLIDO Y NOMBRE | ESTADO CIVIL | NACIONALIDAD | FECH. ING. | FECH. EGR. | CATEGORÍA | CONVENIO | SITUACIÓN | JORNADA | DÍAS TRAB. | SUELDO BASE | REMUNERATIVOS | NO REMUNERATIVOS | TOTAL REMUNERADO | DESCUENTOS | APORTES | CONTRIBUCIONES | NETO A PAGAR
```

**Totales al pie**
```
TOTAL TRABAJADORES:    N
TOTAL REMUNERACIONES:  $ X
TOTAL NO REMUNERAT.:   $ Y
TOTAL DESCUENTOS:      $ Z
TOTAL APORTES:         $ A
TOTAL CONTRIBUCIONES:  $ B
TOTAL NETO:            $ C

Responsable de la liquidación: Apellido, Nombre, CUIL
Hash de integridad: sha256:...
```

### 6.2 Plantilla visual de ejemplo

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  INDUSTRIAS ARGENTINAS S.A.                                                       ║
║  CUIT 30-71234567-9                                                                ║
║  Ruta Panamericana Km 32,5 - Pilar, Buenos Aires                                    ║
║  Actividad: Manufactura de productos metálicos                                        ║
║  Convenio Colectivo: UATRE - Rama convenio 216/75                                    ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║  LIBRO DE SUELDOS Y JORNALES            Libro N°: 0047      Versión: 1              ║
║  Período: 08/2026   ·   Tipo: MENSUAL   ·   Fecha de liquidación: 04/09/2026        ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║ LEG │ CUIL        │ APELLIDO Y NOMBRE     │ ING.     │ CATEGORÍA      │ JORN │ REMUN.  │ NETO A PAGAR ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║ 0001│ 20-30111222-3│ Gómez, Ana María     │ 12/03/21 │ Operario戏A    │ 100% │  845.000│   612.340   ║
║ 0002│ 20-33445566-7│ Ríos, Luis Alberto   │ 01/02/25 │ Auxiliar       │ 100% │  790.000│   571.250   ║
║ 0003│ 20-27778899-1│ Pérez, Sofía Elena   │ 15/07/26 │ Operario       │  50% │  412.500│   297.900   ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║ Total trabajadores: 3  │ Remuneraciones: 2.047.500 │ Desc.: 565.010 │ Neto: 1.482.490 ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

*(El carácter de más arriba es un artefacto de la maquetación del documento; en el
sistema se usa un PDF con fuente embebida.)*

---

## 7. Integración con tu motor de liquidaciones

Dado tu esquema actual:

```sql
-- ya existe
UNIQUE KEY uk_liquidaciones_empleado_periodo (empresa_id, empleado_id, periodo_id)
INDEX idx_liquidaciones_periodo_id (periodo_id)
FK_liquidaciones_periodos → periodos_liquidacion(periodo_id)
```

**El generador del libro necesita una consulta así:**

```sql
SELECT l.liquidacion_id, l.empleado_id, l.periodo_id, l.total_haberes,
       l.total_descuentos, l.total_neto, l.total_contribuciones,
       l.total_costo_empresa, l.requiere_revision,
       p.periodo, p.anio, p.mes
FROM liquidaciones l
JOIN periodos_liquidacion p ON p.periodo_id = l.periodo_id
WHERE l.empresa_id = :empresaId
  AND l.periodo_id IN (:rango)
  AND l.estado_liquidacion_id = :estadoCerrada
ORDER BY e.legajo;
```

Y el detalle por concepto desde `liquidaciones_detalle`, que ya tiene la trazabilidad
de tu migración `007_add_liquidaciones_detalle_trazabilidad.sql`.

**Punto de atención:** tu `UNIQUE(empresa_id, empleado_id, periodo_id)` implica que **no
puede haber dos liquidaciones del mismo empleado en el mismo período**. Eso está bien para
liquidaciones mensuales, pero **rompe con SAC, vacaciones y liquidaciones finales**, que
son adicionales sobre el mismo período. Vas a necesitar o bien un `tipo_liquidacion_id`
en la UNIQUE, o bien un `sub_tipo` / `secuencia` para diferenciar las adicionales. Es un
cambio de schema que conviene resolver **antes** de construir el libro, porque el libro
tiene que consolidar todas las liquidaciones del período.

---

## 8. Plan de implementación

| Fase | Alcance | Esfuerzo |
|---|---|---|
| 1 | Migraciones + entidad de detalle + generador + validación | 3-4 días |
| 2 | Pantallas lista, generador con previsualización, visor | 3 días |
| 3 | Reporte PDF con el formato del §6 | 2 días |
| 4 | Exportación LSD (formato a confirmar con la RG vigente) | 2-3 días |
| 5 | Endurecimiento: versionado, hash, auditoría, anonimización | 1-2 días |

**Antes de arrancar la fase 1, resolver:**
1. La UNIQUE de `liquidaciones` vs. adicionales (ver §7).
2. Confirmar el formato de exportación con la RG vigente.
3. Definir el circuito de quién "presenta" el LSD y si eso implica en tu flujo.

---

## 9. Qué no pude verificar

Para ser explícito sobre los límites de este documento:

- **Los números de Resolución General citados en el objetivo original** no los incluí
  porque no tengo certeza de cuáles siguen vigentes y no quiero que cites una derogada.
  Verificalos en el Boletín Oficial antes de ponerlos en un documento legal.
- **El formato técnico exacto del archivo LSD** (nombre, extensión, estructura de campos,
  firma digital) depende del anexo de la RG. El §6.1 define el libro; la exportación
  necesita ese anexo.
- **El plazo de conservación de 5 años** es el general por prescripción; hay plazos
  especiales o más largos para accidentes de trabajo (LCT art. 245 y ss.).
