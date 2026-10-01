/**
 * Normalización de rutas provenientes de permisos (BD).
 * Los permisos traen un campo `router` que puede venir como `empleados/conceptos`,
 * `empleados-conceptos`, `/admin/empleados/conceptos`, etc. Angular sólo conoce las
 * rutas declaradas en app.routes.ts, por lo que se mapearán los alias conocidos a su
 * ruta real y se aplicarán prefijos/nombres alternativos.
 */

/** Rutas canónicas de la aplicación (deben coincidir con app.routes.ts). */
const ALIAS_A_RUTA: Record<string, string> = {
  // Empleados
  empleados: '/admin/empleados',
  empleados_listado: '/admin/empleados/listado',
  empleados_alta: '/admin/empleados/alta',
  empleados_editar: '/admin/empleados/listado',
  empleados_conceptos: '/admin/empleados/conceptos',
  empleados_conceptos_masivos: '/admin/empleados/conceptos',
  conceptos_masivos: '/admin/empleados/conceptos',
  movimientos_masivos: '/admin/empleados/conceptos',
  movimientosMasivos: '/admin/empleados/conceptos',
  asignacion_masiva: '/admin/empleados/conceptos',
  basicos_personalizados: '/admin/empleados/basicos-personalizados',
  // Conceptos
  conceptos: '/admin/conceptos',
  conceptos_alta: '/admin/conceptos/alta',
  conceptos_editar: '/admin/conceptos/alta',
  conceptos_grupos: '/admin/conceptos/grupos',
  // Catálogos
  secciones: '/admin/secciones',
  cargos: '/admin/cargos',
  sucursales: '/admin/sucursales',
  roles_permisos: '/admin/roles-permisos',
  permisos_abm: '/admin/roles-permisos',
  // Sueldos
  sueldos: '/sueldos',
  liquidar: '/sueldos/liquidar',
  liquidaciones: '/sueldos/listado',
  libros_sueldos: '/sueldos/libros',
  sueldo_especial: '/sueldos/liquidar',
  modules: '/modulos'
};

/** Quita acentos, pasa a minúsculas y reemplaza espacios/guiones bajos por guion. */
function slug(valor: string): string {
  return (valor || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Devuelve una ruta navegable (con slash inicial) a partir del `router` o `alias`
 * de un permiso. Si no reconoce el valor, devuelve null para que el llamador
 * decida el fallback.
 */
export function normalizarRutaPermiso(permiso: { alias?: string; router?: string; nombre?: string } | null | undefined): string | null {
  if (!permiso) return null;

  const candidatos = [permiso.router, permiso.alias, permiso.nombre]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  for (const candidato of candidatos) {
    // 1) Ya viene como ruta de la app: admin/... o sueldos/...
    const crudo = candidato.replace(/^\/+/, '');
    if (/^admin\//i.test(crudo) || /^sueldos\//i.test(crudo)) {
      return `/${crudo.replace(/\/+$/, '')}`;
    }

    // 2) Coincidencia por alias normalizado
    const key = slug(candidato).replace(/-/g, '_');
    if (ALIAS_A_RUTA[key]) return ALIAS_A_RUTA[key];

    // 3) Coincidencia por nombre de ruta (p.ej. "empleados/conceptos", "empleados-conceptos")
    const partes = slug(crudo).split('-').filter(Boolean);
    if (partes.length) {
      const clavePartes = partes.join('_');
      if (ALIAS_A_RUTA[clavePartes]) return ALIAS_A_RUTA[clavePartes];
      if (ALIAS_A_RUTA[partes[0]]) return ALIAS_A_RUTA[partes[0]];
      // "empleados-conceptos-masivos" -> intentos decrecientes
      for (let i = partes.length - 1; i > 0; i--) {
        const intento = partes.slice(0, i).join('_');
        if (ALIAS_A_RUTA[intento]) return ALIAS_A_RUTA[intento];
      }
    }
  }

  return null;
}
