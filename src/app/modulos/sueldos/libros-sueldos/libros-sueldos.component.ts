import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { AuthService } from '../../../auth/auth.service';
import { ModalAlertaComponent } from '../../../shared/modal-alerta.component';
import { LibrosSueldosService, LibroSueldo, LibroEstado } from './libros-sueldos.service';

@Component({
  selector: 'app-libros-sueldos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './libros-sueldos.component.html',
  styleUrls: ['./libros-sueldos.component.scss']
})
export class LibrosSueldosComponent implements OnInit {
  libros: LibroSueldo[] = [];
  estados: LibroEstado[] = [];
  loading = false;
  errorMsg = '';
  filtros = { anio: '', estado: '' };
  filtrosPlegados = false;

  // Acciones
  modalVisible = false;
  modalTitle = '';
  modalMessage = '';
  modalSpinner = false;
  motivoAnulacion = '';
  libroAnulando: LibroSueldo | null = null;
  descargandoId: number | null = null;

  // Presentación
  libroPresentando: LibroSueldo | null = null;
  presentacionNumero = '';
  presentingId: number | null = null;

  constructor(
    private svc: LibrosSueldosService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private auth: AuthService
  ) {}

  /** Permisos del módulo: ver / agregar / editar / eliminar. */
  private has(alias: string): boolean {
    const perms: any[] = this.auth.getPermissions() || [];
    return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
  }

  get puedeVer(): boolean { return this.has('libro_sueldos'); }
  get puedeAgregar(): boolean { return this.has('libro_sueldos_agregar'); }
  get puedeEliminar(): boolean { return this.has('libro_sueldos_eliminar'); }
  get puedeEditar(): boolean { return this.has('libro_sueldos_editar'); }

  /** Presentar el libro ante el organismo fiscal. */
  get puedePresentar(): boolean { return this.has('libro_sueldos_editar'); }

  /** Texto de ayuda del botón presentar, según el estado actual del libro. */
  tituloPresentar(libro: LibroSueldo): string {
    if (!this.puedePresentar) return 'Necesitás el permiso libro_sueldos_editar';
    if (String(libro.estado || '').toLowerCase() !== 'generado') {
      return 'Solo un libro generado puede presentarse';
    }
    return 'Presentar ante el organismo fiscal';
  }

  ngOnInit(): void {
    this.cargarEstados();
    this.cargar();
  }

  /** Catalogo de estados: solo los activos alimentan el filtro. */
  private cargarEstados(): void {
    this.svc.listEstados().subscribe((estados) => {
      this.estados = (estados || []).filter(e => Number(e.es_activo) === 1);
    });
  }

  /** Descripcion del estado para mostrar como texto de ayuda. */
  descripcionEstado(nombre: string | null | undefined): string {
    const n = String(nombre || '').trim();
    return this.estados.find(e => e.nombre === n)?.descripcion || '';
  }

  cargar(): void {
    this.loading = true;
    this.errorMsg = '';
    this.svc.list({
      anio: this.filtros.anio,
      estado: this.filtros.estado
    }).pipe(finalize(() => {
      this.loading = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error) {
        this.errorMsg = this.msgError(res.error, 'No se pudieron cargar los libros de sueldos.');
        this.libros = [];
      } else {
        this.libros = res.data;
        this.errorMsg = '';
      }
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    });
  }

  toggleFiltros(): void {
    this.filtrosPlegados = !this.filtrosPlegados;
    try { this.cdr.detectChanges(); } catch { /* ignore */ }
  }

  get filtrosActivos(): number {
    return Object.values(this.filtros).filter(v => String(v ?? '').trim() !== '').length;
  }

  limpiarFiltros(): void {
    this.filtros = { anio: '', estado: '' };
    this.cargar();
  }

  ver(libro: LibroSueldo): void {
    if (!this.puedeVer) return;
    this.router.navigate(['/sueldos/libros', libro.libro_sueldo_id]);
  }

  generar(): void {
    if (!this.puedeAgregar) return;
    this.router.navigate(['/sueldos/libros/generar']);
  }

  // ---------- Anulación ----------

  pedirAnulacion(libro: LibroSueldo): void {
    if (!this.puedeEliminar || this.librosGenerados.has(libro.libro_sueldo_id)) return;
    this.libroAnulando = libro;
    this.motivoAnulacion = '';
    this.modalTitle = 'Anular libro de sueldos';
    this.modalMessage = `Se anulará el libro N° ${libro.numero_libro} (versión ${libro.version}) del período ${this.periodoLegible(libro)}. Esta acción queda registrada en la auditoría y no se puede deshacer.`;
    this.modalVisible = true;
  }

  confirmarAnulacion(): void {
    const libro = this.libroAnulando;
    if (!libro) return;
    const motivo = String(this.motivoAnulacion || '').trim();
    if (!motivo) {
      this.errorMsg = 'El motivo de la anulación es obligatorio.';
      return;
    }

    this.modalSpinner = true;
    this.svc.anular(libro.libro_sueldo_id, motivo).pipe(finalize(() => {
      this.modalSpinner = false;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      this.modalVisible = false;
      this.modalSpinner = false;
      this.libroAnulando = null;
      if (!res.ok) {
        this.errorMsg = this.msgError(res.error, 'No se pudo anular el libro.');
        return;
      }
      this.errorMsg = '';
      this.cargar();
    });
  }

  // ---------- Presentación ----------

  /** Solo un libro generado puede presentarse. */
  puedePresentarLibro(libro: LibroSueldo): boolean {
    return this.puedePresentar && this.presentingId === null
      && String(libro.estado || '').toLowerCase() === 'generado';
  }

  pedirPresentacion(libro: LibroSueldo): void {
    if (!this.puedePresentarLibro(libro)) return;
    this.libroPresentando = libro;
    this.presentacionNumero = libro.presentacion_numero || '';
  }

  confirmarPresentacion(): void {
    const libro = this.libroPresentando;
    if (!libro || this.presentingId !== null) return;

    this.presentingId = libro.libro_sueldo_id;
    this.errorMsg = '';
    try { this.cdr.detectChanges(); } catch { /* ignore */ }

    this.svc.presentar(libro.libro_sueldo_id, this.presentacionNumero).pipe(finalize(() => {
      this.presentingId = null;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (!res.ok) {
        this.errorMsg = this.msgError(res.error, 'No se pudo presentar el libro.');
        return;
      }
      this.libroPresentando = null;
      this.presentacionNumero = '';
      this.cargar();
    });
  }

  onModalPresentarCerrar(): void {
    this.libroPresentando = null;
    this.presentacionNumero = '';
  }

  // ---------- Descargas ----------

  descargarPdf(libro: LibroSueldo): void {
    if (this.descargandoId) return;
    this.descargandoId = libro.libro_sueldo_id;
    this.svc.pdf(libro.libro_sueldo_id).pipe(finalize(() => {
      this.descargandoId = null;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error || !res.blob) {
        this.errorMsg = this.msgError(res.error, 'No se pudo generar el PDF del libro.');
        return;
      }
      this.guardarBlob(res.blob, res.headers, `libro_sueldos_${libro.numero_libro}.pdf`);
    });
  }

  descargarLsd(libro: LibroSueldo): void {
    if (this.descargandoId) return;
    this.descargandoId = libro.libro_sueldo_id;
    this.svc.exportarLsd(libro.libro_sueldo_id).pipe(finalize(() => {
      this.descargandoId = null;
      try { this.cdr.detectChanges(); } catch { /* ignore */ }
    })).subscribe((res) => {
      if (res.error || !res.blob) {
        this.errorMsg = this.msgError(res.error, 'No se pudo exportar el archivo LSD.');
        return;
      }
      this.guardarBlob(res.blob, res.headers, `lsd_${libro.numero_libro}.pdf`);
    });
  }

  private guardarBlob(blob: Blob, headers: any, fallback: string): void {
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

  // ---------- Helpers ----------

  /** Un libro generado o presentado no se puede anular desde la UI. */
  get librosGenerados(): Set<number> {
    return new Set(this.libros.filter(l => this.esInmutable(l.estado)).map(l => l.libro_sueldo_id));
  }

  puedeAnular(libro: LibroSueldo): boolean {
    return this.puedeEliminar && !this.esInmutable(libro.estado);
  }

  /** Exportar LSD es una operación sensible: requiere el permiso de editar. */
  puedeExportarLsd(libro: LibroSueldo): boolean {
    return this.puedeEditar && this.esInmutable(libro.estado);
  }

  /** Un libro generado o presentado ya no se anula desde la UI. */
  esInmutable(estado: string): boolean {
    const e = String(estado || '').toLowerCase();
    return e === 'generado' || e === 'presentado';
  }

  puedeExportarPdf(libro: LibroSueldo): boolean {
    return this.puedeVer && this.esInmutable(libro.estado);
  }

  periodoLegible(libro: LibroSueldo | any): string {
    if (!libro) return '';
    const anio = libro.anio;
    const mes = Number(libro.mes || 0);
    if (anio && mes >= 1 && mes <= 12) {
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      return `${meses[mes - 1]} ${anio}`;
    }
    return libro.periodo_desde || '-';
  }

  money(v: any): string {
    const n = Number(v ?? 0);
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fecha(v: string | null): string {
    if (!v) return '-';
    return String(v).slice(0, 10);
  }

  fechaHora(v: string | null): string {
    if (!v) return '-';
    return String(v).slice(0, 16).replace('T', ' ');
  }

  estadoClass(estado: string): string {
    return String(estado || '').toLowerCase();
  }
  onModalCerrar(confirmado: boolean): void {
    this.modalVisible = false;
    this.modalSpinner = false;
    if (confirmado) {
      this.confirmarAnulacion();
    } else {
      this.libroAnulando = null;
      this.motivoAnulacion = '';
    }
  }

  private msgError(err: any, fallback: string): string {
    const payload = err?.error;
    if (payload && typeof payload === 'object') {
      const cand = [payload.message, payload.mensaje, payload.error].filter(x => typeof x === 'string' && x.trim());
      if (cand.length) return String(cand[0]);
    }
    if (typeof payload === 'string' && payload.trim() && !payload.startsWith('<')) return payload.trim();
    return err?.message || fallback;
  }
}
