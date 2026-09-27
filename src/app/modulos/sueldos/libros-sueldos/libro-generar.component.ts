import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { AuthService } from '../../../auth/auth.service';
import { LibrosSueldosService, PrevisualizacionLibro, PrevisualizacionDetalle } from './libros-sueldos.service';
import { LiquidacionesService } from '../liquidaciones.service';

@Component({
  selector: 'app-libro-sueldo-generar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './libro-generar.component.html',
  styleUrls: ['./libros-sueldos.component.scss']
})
export class LibroGenerarComponent {
  anio = new Date().getFullYear();
  mes = new Date().getMonth() + 1;
  liquidacionTipos: Array<{ id: number; nombre: string }> = [];
  tipoSeleccionado: number | null = null;
  numeroLibro = '';

  previa: PrevisualizacionLibro | null = null;
  detallePrevia: PrevisualizacionDetalle[] = [];
  qPrevia = '';
  validando = false;
  generando = false;
  errorMsg = '';

  constructor(
    private svc: LibrosSueldosService,
    private liquidacionesSvc: LiquidacionesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.cargarTipos();
  }

  get puedeAgregar(): boolean {
    const perms: any[] = this.auth.getPermissions() || [];
    return Array.isArray(perms) && perms.some((p: any) =>
      (typeof p === 'string' ? p === 'libro_sueldos_agregar' : p?.alias === 'libro_sueldos_agregar'));
  }

  readonly meses = [
    { valor: 1, nombre: 'Enero' }, { valor: 2, nombre: 'Febrero' },
    { valor: 3, nombre: 'Marzo' }, { valor: 4, nombre: 'Abril' },
    { valor: 5, nombre: 'Mayo' }, { valor: 6, nombre: 'Junio' },
    { valor: 7, nombre: 'Julio' }, { valor: 8, nombre: 'Agosto' },
    { valor: 9, nombre: 'Septiembre' }, { valor: 10, nombre: 'Octubre' },
    { valor: 11, nombre: 'Noviembre' }, { valor: 12, nombre: 'Diciembre' }
  ];

  errores: Array<{ texto: string; empleadoId: number | null }> = [];
  avisos: Array<{ texto: string; empleadoId: number | null; legajo: string | null }> = [];

  private cargarTipos(): void {
    this.liquidacionesSvc.liquidacionTipos().subscribe((res: any) => {
      if (res?.error) {
        console.error('[libros] error cargando tipos de liquidacion', res.error);
        this.liquidacionTipos = [];
        return;
      }
      // Tolera: array plano, { data }, { items }, { liquidacion_tipos }
      const raw: any = Array.isArray(res) ? res
        : (res?.data || res?.items || res?.liquidacion_tipos || []);
      const lista = Array.isArray(raw) ? raw : [];

      this.liquidacionTipos = lista
        .map((x: any) => ({
          id: Number(x?.liquidacion_tipo_id ?? x?.id ?? 0),
          nombre: String(x?.nombre ?? x?.descripcion ?? x?.name ?? '').trim()
        }))
        .filter((x: any) => x.id > 0 && x.nombre);
    });
  }

  /** Inicio y fin del mes elegido, para armar el rango del período. */
  get periodoDesde(): string {
    return `${this.anio}-${String(this.mes).padStart(2, '0')}-01`;
  }

  get periodoHasta(): string {
    const ultimo = new Date(this.anio, this.mes, 0).getDate();
    return `${this.anio}-${String(this.mes).padStart(2, '0')}-${ultimo}`;
  }

  validar(): void {
    this.errorMsg = '';
    this.previa = null;
    this.detallePrevia = [];
    this.qPrevia = '';
    this.errores = [];
    this.avisos = [];
    if (!this.anio || !this.mes) {
      this.errorMsg = 'Indique el año y el mes del período.';
      return;
    }

    this.validando = true;
    this.svc.previsualizar({
      periodo_desde: this.periodoDesde,
      periodo_hasta: this.periodoHasta,
      liquidacion_tipo_id: this.tipoSeleccionado
    }).pipe(finalize(() => {
      this.validando = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.errorMsg = this.msgError(res.error, 'No se pudo validar el período.');
        return;
      }
      this.previa = res.data;
      this.detallePrevia = Array.isArray(res.data?.detalle) ? res.data!.detalle! : [];
      this.procesarValidaciones(res.data);
    });
  }

  /** Detalle de la previsualización, filtrado por legajo/CUIL/apellido. */
  get detallePreviaFiltrado(): PrevisualizacionDetalle[] {
    const q = String(this.qPrevia || '').trim().toLowerCase();
    if (!q) return this.detallePrevia;
    return this.detallePrevia.filter(d => [d.legajo, d.cuil, d.apellido, d.nombre, d.categoria]
      .filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  /** Suma una columna del detalle filtrado. */
  sumaPrevia(campo: string): number {
    return this.detallePreviaFiltrado.reduce((acc, d) => acc + Number((d as any)[campo] ?? 0), 0);
  }

  nombreCompletoPrevia(d: PrevisualizacionDetalle): string {
    return [d.apellido, d.nombre].filter(Boolean).join(', ');
  }

  /** Los errores vienen como texto que ya menciona al empleado; la etiqueta es solo respaldo. */
  get erroresConEtiqueta(): Array<{ texto: string; empleadoId: number | null; conEtiqueta: boolean }> {
    return this.errores.map(e => ({
      ...e,
      conEtiqueta: !!e.empleadoId && !e.texto.toLowerCase().includes(`empleado ${e.empleadoId}`)
    }));
  }

  /**
   * El backend devuelve los errores como strings y las advertencias aparte
   * (warnings y/o advertencias). Se normalizan a objetos para poder mostrar
   * el empleado asociado y el detalle.
   */
  private procesarValidaciones(p: PrevisualizacionLibro | null): void {
    this.errores = [];
    this.avisos = [];
    if (!p) return;

    const extraer = (item: any): { texto: string; empleadoId: number | null } => {
      if (typeof item === 'string') {
        const m = item.match(/empleado\s+(\d+)/i);
        return { texto: item, empleadoId: m ? Number(m[1]) : null };
      }
      if (item && typeof item === 'object') {
        // Si el texto ya menciona al empleado, no se agrega el legajo de nuevo.
        const detalle = String(item.detalle || '').trim();
        const texto = String(item.mensaje || '').trim();
        const id = Number(item.empleado_id || item.id || 0) || null;
        const base = texto || detalle;
        const legajo = item.legajo && !base.includes(String(item.legajo))
          ? ` (legajo ${item.legajo})`
          : '';
        return { texto: `${base}${legajo}`, empleadoId: id };
      }
      return { texto: String(item ?? ''), empleadoId: null };
    };

    (p.errores || []).forEach(e => this.errores.push(extraer(e)));

    // Las advertencias pueden venir en "warnings" y/o en "advertencias".
    const todas = [...(p.warnings || []), ...(p.advertencias || [])];
    const vistas = new Set<string>();
    todas.forEach(a => {
      const item = extraer(a);
      if (!item.texto || vistas.has(item.texto)) return;
      vistas.add(item.texto);
      const legajo = typeof a === 'object' && (a as any)?.legajo ? String((a as any).legajo) : null;
      this.avisos.push({ texto: item.texto, empleadoId: item.empleadoId, legajo });
    });
  }

  /** Solo se habilita si la previsualización no tiene errores. */
  get puedeGenerar(): boolean {
    return !!this.previa && this.previa.valido && !this.generando && this.puedeAgregar;
  }

  generar(): void {
    if (!this.puedeGenerar) return;
    this.generando = true;
    this.errorMsg = '';
    this.svc.generar({
      periodo_desde: this.periodoDesde,
      periodo_hasta: this.periodoHasta,
      liquidacion_tipo_id: this.tipoSeleccionado,
      numero_libro: this.numeroLibro.trim() || undefined
    }).pipe(finalize(() => {
      this.generando = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.errorMsg = this.msgError(res.error, 'No se pudo generar el libro.');
        return;
      }

      const id = Number(res.data.libro_sueldo_id || 0);
      if (!id) {
        // El libro se creó pero la respuesta no trajo el id: no se puede ir al visor.
        this.errorMsg = 'El libro se generó pero la respuesta no incluye su identificador. Volvé al listado para abrirlo.';
        this.router.navigate(['/sueldos/libros']);
        return;
      }

      this.router.navigate(['/sueldos/libros', id]);
    });
  }

  volver(): void {
    this.router.navigate(['/sueldos/libros']);
  }

  money(v: any): string {
    return Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private msgError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    if (status === 404) return 'No hay liquidaciones para el período seleccionado.';
    if (status === 409) return 'Hay liquidaciones en estado edición o revisión. Ciérrelas antes de generar el libro.';
    if (status === 422) return 'Los totales no cuadran. Revisá las liquidaciones del período.';

    const p = err?.error;
    if (p && typeof p === 'object') {
      const c = [p.message, p.mensaje, p.error].filter(x => typeof x === 'string' && x.trim());
      if (c.length) return String(c[0]);
    }
    if (typeof p === 'string' && p.trim() && !p.startsWith('<')) return p.trim();
    return err?.message || fallback;
  }
}
