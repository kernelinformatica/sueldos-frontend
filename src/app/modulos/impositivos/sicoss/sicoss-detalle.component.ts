import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../../shared/modal-alerta.component';
import { ToastService } from '../../../core/toast.service';
import { AuthService } from '../../../auth/auth.service';
import { SicossService } from './sicoss.service';
import {
  ExportRequest,
  ExportacionItem,
  GeneracionDetalleFull,
  GeneracionHeader,
  GeneracionPreviewItem
} from './sicoss.model';

/**
 * Detalle de una generación SICOS (GET /api/sicoss/generaciones/:id).
 *
 * Muestra el encabezado, la tabla de empleados y permite subir el archivo
 * ARCA ya serializado (POST /api/sicoss/:id/export).
 */
@Component({
  selector: 'app-sicoss-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './sicoss-detalle.component.html',
  styleUrls: ['./sicoss-detalle.component.scss']
})
export class SicossDetalleComponent implements OnInit {
  generacionId = 0;
  header: GeneracionHeader | null = null;
  items: GeneracionPreviewItem[] = [];
  loading = false;
  errorMsg = '';

  // Exportación ARCA
  exportVisible = false;
  exportando = false;
  exportError = '';
  exportNombreArchivo = '';
  exportContenido = '';
  exportVersionLayout = 'v1';
  exportResultado: { hash: string; nombre_archivo: string; exportacion_id?: number } | null = null;

  // Historial de archivos exportados
  exportaciones: ExportacionItem[] = [];
  exportacionesLoading = false;
  descargandoId: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private svc: SicossService,
    private auth: AuthService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  private has(alias: string): boolean {
    const perms: any[] = this.auth.getPermissions() || [];
    return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
  }

  get puedeExportar(): boolean { return this.has('sicoss_exportar'); }
  get puedeConfigurarConceptos(): boolean { return this.has('sicoss_editar') || this.has('sicoss'); }

  ngOnInit(): void {
    this.generacionId = Number(this.route.snapshot.paramMap.get('id') || 0);
    if (!this.generacionId) {
      this.errorMsg = 'Generación inválida.';
      return;
    }
    this.cargar();
    this.cargarExportaciones();
  }

  cargar(): void {
    this.loading = true;
    this.errorMsg = '';
    this.svc.generacion(this.generacionId).pipe(finalize(() => {
      this.loading = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.errorMsg = this.msgError(res.error, 'No se pudo cargar la generación.');
        return;
      }
      const det: GeneracionDetalleFull = res.data;
      this.header = det.header;
      this.items = det.items;
    });
  }

  get periodoLegible(): string {
    const h = this.header;
    if (!h || !h.mes || !h.anio) return '-';
    const nombres = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
      'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${nombres[h.mes] || h.mes} ${h.anio}`;
  }

  get totalAdvertencias(): number {
    return this.items.filter((i) => (i.warnings || []).length > 0).length;
  }

  suma(campo: keyof GeneracionPreviewItem): number {
    return this.items.reduce((acc, i) => acc + Number((i as any)[campo] ?? 0), 0);
  }

  advertencias(item: GeneracionPreviewItem): string[] {
    return Array.isArray(item?.warnings) ? item.warnings : [];
  }

  money(v: any): string {
    return Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fechaHora(v: string | null | undefined): string {
    if (!v) return '-';
    return String(v).slice(0, 16).replace('T', ' ');
  }

  volver(): void {
    this.router.navigate(['/admin/impositivos/sicoss']);
  }

  abrirConfiguracionConceptos(): void {
    if (!this.puedeConfigurarConceptos) return;
    this.router.navigate(['/admin/conceptos'], { queryParams: { origen: 'sicoss', generacion_id: this.generacionId } });
  }

  // ---------- Exportar ARCA ----------

  abrirExport(): void {
    if (!this.puedeExportar) return;
    this.exportVisible = true;
    this.exportando = false;
    this.exportError = '';
    this.exportResultado = null;
    this.exportVersionLayout = 'v1';
    this.exportContenido = '';
    this.exportNombreArchivo = `SICOS_${this.generacionId}.txt`;
  }

  cerrarExport(): void {
    if (this.exportando) return;
    this.exportVisible = false;
    this.exportResultado = null;
  }

  /** Lee el archivo ARCA (.txt) como texto plano utf-8. */
  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.exportContenido = String(reader.result || '');
      if (!this.exportNombreArchivo.trim()) this.exportNombreArchivo = file.name;
      this.exportError = '';
      this.refresh();
    };
    reader.onerror = () => { this.exportError = 'No se pudo leer el archivo seleccionado.'; this.refresh(); };
    reader.readAsText(file);
  }

  get exportVistaPrevia(): string[] {
    return String(this.exportContenido || '').split(/\r?\n/).slice(0, 10);
  }

  confirmarExport(): void {
    if (this.exportando) return;
    const nombre = String(this.exportNombreArchivo || '').trim();
    if (!nombre) { this.exportError = 'El nombre del archivo es obligatorio.'; return; }
    if (!String(this.exportContenido || '').trim()) {
      this.exportError = 'Debe seleccionar el archivo ARCA a exportar.';
      return;
    }

    const body: ExportRequest = {
      generacion_id: this.generacionId,
      nombre_archivo: nombre,
      content: this.exportContenido,
      formato: 'ARCA',
      version_layout: String(this.exportVersionLayout || 'v1').trim() || 'v1',
      codificacion: 'utf-8'
    };

    this.exportError = '';
    this.exportando = true;
    this.svc.export(this.generacionId, body).pipe(finalize(() => {
      this.exportando = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.exportError = this.msgError(res.error, 'No se pudo exportar el archivo ARCA.');
        return;
      }
      this.exportResultado = {
        hash: res.data.hash_contenido || res.data.hash || '',
        nombre_archivo: res.data.nombre_archivo,
        exportacion_id: res.data.exportacion_id
      };
      this.toast.success('Archivo ARCA exportado correctamente.');
      this.cargarExportaciones();
    });
  }

  // ---------- Historial de exportaciones ----------

  cargarExportaciones(): void {
    if (!this.generacionId) return;
    this.exportacionesLoading = true;
    this.svc.exportaciones(this.generacionId).pipe(finalize(() => {
      this.exportacionesLoading = false;
      this.refresh();
    })).subscribe((res) => {
      // Si el endpoint no existe todavía, se deja el historial vacío sin romper la pantalla.
      this.exportaciones = res.error ? [] : res.data;
    });
  }

  /**
   * Descarga el archivo ARCA persistido.
   * Requiere que el backend exponga GET /api/sicoss/exportaciones/:id/download.
   */
  descargar(exp: ExportacionItem): void {
    if (this.descargandoId !== null) return;
    if (!exp.exportacion_id) {
      this.toast.error('La exportación no tiene un identificador válido.');
      return;
    }

    this.descargandoId = exp.exportacion_id;
    this.svc.descargarExportacion(exp.exportacion_id).pipe(finalize(() => {
      this.descargandoId = null;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.blob) {
        this.toast.error(this.msgError(res.error, 'No se pudo descargar el archivo exportado.'));
        return;
      }
      this.guardarBlob(res.blob, res.headers, exp.nombre_archivo || `SICOS_${this.generacionId}.txt`);
    });
  }

  /** Guarda un blob usando el nombre del Content-Disposition si está disponible. */
  private guardarBlob(blob: Blob, headers: any, fallback: string): void {
    const leer = (n: string): string => {
      if (!headers) return '';
      if (typeof headers.get === 'function') return headers.get(n) || '';
      return headers[n] || '';
    };
    const disp = String(leer('content-disposition') || '');
    const m = disp ? disp.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/) : null;
    const filename = m ? decodeURIComponent(m[1] || m[2] || fallback) : fallback;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private refresh(): void {
    try { this.cdr.detectChanges(); } catch { /* ignore */ }
  }

  private msgError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'La generación solicitada no fue encontrada.';
    if (status >= 500) return 'Error interno del servidor. Reintente en unos minutos.';

    const payload = err?.error;
    if (payload && typeof payload === 'object') {
      const cand = [payload.message, payload.mensaje, payload.error, payload.detail]
        .filter((x) => typeof x === 'string' && x.trim());
      if (cand.length) return String(cand[0]);
    }
    if (typeof payload === 'string' && payload.trim() && !payload.startsWith('<')) return payload.trim();
    return err?.message || fallback;
  }
}
