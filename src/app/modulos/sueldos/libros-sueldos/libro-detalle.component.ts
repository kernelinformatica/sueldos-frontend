import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../../shared/modal-alerta.component';
import { AuthService } from '../../../auth/auth.service';
import { LibrosSueldosService, LibroSueldo, LibroSueldoDetalle, LibroEstado, LibroConcepto } from './libros-sueldos.service';

@Component({
  selector: 'app-libro-sueldo-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './libro-detalle.component.html',
  styleUrls: ['./libros-sueldos.component.scss']
})
export class LibroDetalleComponent implements OnInit {
  libro: LibroSueldo | null = null;
  detalle: LibroSueldoDetalle[] = [];
  auditoria: any[] = [];
  estados: LibroEstado[] = [];
  loading = true;
  errorMsg = '';
  busy = false;
  q = '';

  constructor(
    private svc: LibrosSueldosService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private auth: AuthService
  ) {}

  private has(alias: string): boolean {
    const perms: any[] = this.auth.getPermissions() || [];
    return Array.isArray(perms) && perms.some((p: any) =>
      (typeof p === 'string' ? p === alias : p?.alias === alias));
  }

  /** Exportar el archivo LSD es una operación sensible: requiere editar. */
  get puedeExportarLsd(): boolean {
    return this.has('libro_sueldos_editar');
  }

  /** Confirmar el libro: de borrador a generado. */
  get puedeGenerarDefinitivo(): boolean {
    return this.has('libro_sueldos_agregar') && !this.confirmando;
  }

  /** Solo un borrador se puede confirmar. */
  get libroEsBorrador(): boolean {
    return String(this.libro?.estado || '').toLowerCase() === 'borrador';
  }

  modalConfirmarVisible = false;
  confirmando = false;

  pedirConfirmacion(): void {
    if (!this.puedeGenerarDefinitivo || !this.libroEsBorrador) return;
    this.modalConfirmarVisible = true;
  }

  confirmarGeneracion(): void {
    if (!this.libro || !this.libroEsBorrador || this.confirmando) return;
    this.confirmando = true;
    this.errorMsg = '';
    try { this.cdr.detectChanges(); } catch { /* ignore */ }

    this.svc.generarDefinitivo(this.libro.libro_sueldo_id).pipe(finalize(() => {
      this.confirmando = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      this.modalConfirmarVisible = false;
      if (!res.ok) {
        this.errorMsg = this.msgError(res.error, 'No se pudo confirmar el libro.');
        return;
      }
      const id = this.libro!.libro_sueldo_id;
      this.cargar(id);
    });
  }

  ngOnInit(): void {
    this.cargarEstados();
    const id = Number(this.route.snapshot.paramMap.get('id') || 0);
    if (!id) {
      this.errorMsg = 'Libro no válido.';
      this.loading = false;
      return;
    }
    this.cargar(id);
  }

  /** Catalogo de estados: solo los activos, cacheado en el servicio. */
  private cargarEstados(): void {
    this.svc.listEstados().subscribe((lista: LibroEstado[]) => {
      this.estados = (lista || []).filter((e: LibroEstado) => Number(e.es_activo) === 1);
    });
  }

  /** Descripcion del estado, mostrada como texto de ayuda junto al nombre. */
  descripcionEstado(nombre: string | null | undefined): string {
    const n = String(nombre || '').trim();
    return this.estados.find(e => e.nombre === n)?.descripcion || '';
  }

  cargar(id: number): void {
    this.loading = true;
    this.svc.get(id).pipe(finalize(() => {
      this.loading = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error || !res.libro) {
        this.errorMsg = this.msgError(res.error, 'No se pudo cargar el libro.');
        this.libro = null;
        this.detalle = [];
        return;
      }
      this.libro = res.libro;
      this.detalle = res.detalle;
      this.auditoria = res.auditoria;
      this.errorMsg = '';
    });
  }

  volver(): void {
    this.router.navigate(['/sueldos/libros']);
  }

  get detalleFiltrado(): LibroSueldoDetalle[] {
    const q = String(this.q || '').trim().toLowerCase();
    if (!q) return this.detalle;
    return this.detalle.filter(d => [d.legajo, d.cuil, d.apellido, d.nombre, d.categoria]
      .filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  descargarPdf(): void {
    this.menuPdfVisible = false;
    if (!this.libro || this.busy) return;
    this.busy = true;
    this.svc.pdf(this.libro.libro_sueldo_id).pipe(finalize(() => {
      this.busy = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error || !res.blob) {
        this.errorMsg = this.msgError(res.error, 'No se pudo generar el PDF.');
        return;
      }
      this.guardar(res.blob, res.headers, `libro_sueldos_${this.libro!.numero_libro}.pdf`);
    });
  }

  /** PDF del libro detallado: incluye el desglose de conceptos por empleado. */
  descargarPdfDetalle(): void {
    this.menuPdfVisible = false;
    if (!this.libro || this.busy) return;
    this.busy = true;
    this.svc.pdfDetalle(this.libro.libro_sueldo_id).pipe(finalize(() => {
      this.busy = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error || !res.blob) {
        this.errorMsg = this.msgError(res.error, 'No se pudo generar el PDF detallado.');
        return;
      }
      this.guardar(res.blob, res.headers, `libro_sueldos_detallado_${this.libro!.numero_libro}.pdf`);
    });
  }

  menuPdfVisible = false;

  toggleMenuPdf(): void {
    if (this.busy) return;
    this.menuPdfVisible = !this.menuPdfVisible;
  }

  cerrarMenuPdf(): void {
    this.menuPdfVisible = false;
  }

  descargarLsd(): void {
    if (!this.libro || this.busy || !this.puedeExportarLsd) return;
    this.busy = true;
    this.svc.exportarLsd(this.libro.libro_sueldo_id).pipe(finalize(() => {
      this.busy = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error || !res.blob) {
        this.errorMsg = this.msgError(res.error, 'No se pudo exportar el archivo LSD.');
        return;
      }
      this.guardar(res.blob, res.headers, `lsd_${this.libro!.numero_libro}.pdf`);
    });
  }

  private guardar(blob: Blob, headers: any, fallback: string): void {
    const leer = (n: string): string => {
      if (!headers) return '';
      if (typeof headers.get === 'function') return headers.get(n) || '';
      return headers[n] || '';
    };
    const disp = String(leer('content-disposition') || '');
    const m = disp ? disp.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/) : null;
    const filename = m ? decodeURIComponent(m[1] || m[2] || fallback) : fallback;
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Suma una columna numérica del detalle filtrado, para el pie de tabla. */
  sum(campo: string): number {
    return this.detalleFiltrado.reduce((acc, d) => acc + Number((d as any)[campo] ?? 0), 0);
  }

  // Modal de desglose de conceptos
  modalConceptosVisible = false;
  cargandoConceptos = false;
  conceptos: LibroConcepto[] = [];
  empleadoConceptos: LibroSueldoDetalle | null = null;
  errorConceptos = '';

  abrirConceptos(d: LibroSueldoDetalle): void {
    if (!this.libro) return;
    this.empleadoConceptos = d;
    this.conceptos = [];
    this.errorConceptos = '';
    this.modalConceptosVisible = true;

    this.cargandoConceptos = true;
    this.svc.conceptosEmpleado(this.libro.libro_sueldo_id, Number(d.empleado_id || 0))
      .pipe(finalize(() => {
        this.cargandoConceptos = false;
        try { this.cdr.detectChanges(); } catch { /* ignore */ }
      }))
      .subscribe((res) => {
        if (res.error) {
          this.errorConceptos = this.msgError(res.error, 'No se pudo cargar el desglose de conceptos.');
          return;
        }
        this.conceptos = res.data || [];
      });
  }

  cerrarConceptos(): void {
    this.modalConceptosVisible = false;
    this.empleadoConceptos = null;
    this.conceptos = [];
  }

  /** Etiqueta legible de un tipo de formula recibido desde el backend. */
  etiquetaTipo(t: string): string {
    const mapa: Record<string, string> = {
      basico: 'Básico',
      fijo: 'Concepto fijo',
      antiguedad: 'Antigüedad',
      porcentaje_remunerativo: 'Porcentaje remunerativo',
      porcentaje_no_remunerativo: 'Porcentaje no remunerativo',
      porcentaje_grupo: 'Porcentaje sobre grupo',
      suma_grupo: 'Sobre suma de grupo',
      resta_grupo: 'Resta sobre grupo',
      remunerativo: 'Haberes remunerativos',
      no_remunerativo: 'Haberes no remunerativos',
      descuento: 'Descuentos',
      aporte: 'Aportes',
      contribucion: 'Contribuciones'
    };
    return mapa[String(t || '').toLowerCase()] || String(t || '');
  }

  /** true si el concepto resta del neto (S suma / R resta). */
  esResta(c: LibroConcepto): boolean {
    return String(c?.suma_resta || 'S').toUpperCase().startsWith('R');
  }

  /** Total del empleado calculado desde el desglose. */
  get totalConceptos(): number {
    return (this.conceptos || []).reduce(
      (acc, c) => acc + (this.esResta(c) ? -1 : 1) * Number(c.importe ?? 0), 0
    );
  }

  /** Conceptos agrupados por tipo, en el orden de presentacion del libro. */
  get conceptosPorTipo(): Array<{ tipo: string; etiqueta: string; items: LibroConcepto[]; total: number; signo: string }> {
    // Si el backend manda el orden, se respeta; si no, se ordena por codigo.
    const conceptos = [...(this.conceptos || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const grupos = new Map<string, LibroConcepto[]>();
    conceptos.forEach(c => {
      const k = String(c?.tipo || 'remunerativo').toLowerCase();
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(c);
    });

    return [...grupos.entries()].map(([tipo, items]) => {
      const resta = items.every(c => this.esResta(c));
      return {
        tipo,
        etiqueta: this.etiquetaTipo(tipo),
        items,
        total: items.reduce((acc, c) => acc + (this.esResta(c) ? -1 : 1) * Number(c.importe ?? 0), 0),
        signo: resta ? '-' : ''
      };
    });
  }

  money(v: any): string {
    return Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fecha(v: string | null): string {
    if (!v) return '-';
    return String(v).slice(0, 10);
  }

  fechaHora(v: string | null): string {
    if (!v) return '-';
    return String(v).slice(0, 16).replace('T', ' ');
  }

  periodoLegible(l: LibroSueldo | any): string {
    if (!l) return '-';
    const anio = l.anio;
    const mes = Number(l.mes || 0);
    if (anio && mes >= 1 && mes <= 12) {
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return `${meses[mes - 1]} ${anio}`;
    }
    return l.periodo_desde || '-';
  }

  nombreCompleto(d: LibroSueldoDetalle): string {
    return [d.apellido, d.nombre].filter(Boolean).join(', ');
  }

  private msgError(err: any, fallback: string): string {
    const p = err?.error;
    if (p && typeof p === 'object') {
      const c = [p.message, p.mensaje, p.error].filter(x => typeof x === 'string' && x.trim());
      if (c.length) return String(c[0]);
    }
    if (typeof p === 'string' && p.trim() && !p.startsWith('<')) return p.trim();
    return err?.message || fallback;
  }
}
