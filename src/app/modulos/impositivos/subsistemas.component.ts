import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../auth/auth.service';
import { SicossService } from './sicoss/sicoss.service';
import { Subsistema, SubsistemaCategoria } from './sicoss/sicoss.model';

type CategoriaTab = 'sicoss' | 'impositivo';
type EstadoFiltro = '' | '1' | '2';

/**
 * Catálogo de Subsistemas (Impositivos).
 *
 * Lista los subsistemas permitidos para la empresa filtrando por categoría
 * (GET /api/sicoss/subsistemas?categoria=...). Al elegir un subsistema de
 * categoría SICOSS se redirige al listado de generaciones de ese subsistema.
 */
@Component({
  selector: 'app-subsistemas',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './subsistemas.component.html',
  styleUrls: ['./subsistemas.component.scss']
})
export class SubsistemasComponent implements OnInit {
  categoria: CategoriaTab = 'sicoss';
  subsistemas: Subsistema[] = [];
  loading = false;
  errorMsg = '';
  buscar = '';
  estadoFiltro: EstadoFiltro = '1';
  editModalVisible = false;
  editModalSpinner = false;
  editModalTitle = 'Editar subsistema';
  editModalMessage = '';
  editForm: {
    subsistema_id: number | null;
    codigo: string;
    nombre: string;
    estado_id: 1 | 2;
  } = this.defaultEditForm();
  deleteModalVisible = false;
  deleteModalSpinner = false;
  deleteModalTitle = '';
  deleteModalMessage = '';
  private pendingDelete: Subsistema | null = null;

  constructor(
    private svc: SicossService,
    private auth: AuthService,
    private toast: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.cargar();
  }

  /** Permiso para operar el módulo de subsistemas SICOS. */
  get puedeUsarSicoss(): boolean {
    const perms: any[] = this.auth.getPermissions() || [];
    const has = (alias: string): boolean =>
      Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
    return has('sicoss') || has('sicoss_crear') || has('sicoss_editar') ||
      has('sicoss_eliminar') || has('sicoss_exportar');
  }

  cambiarCategoria(cat: CategoriaTab): void {
    if (this.categoria === cat) return;
    this.categoria = cat;
    this.buscar = '';
    this.estadoFiltro = '1';
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.errorMsg = '';
    this.svc.subsistemas(this.categoria as SubsistemaCategoria).pipe(finalize(() => {
      this.loading = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error) {
        this.errorMsg = this.msgError(res.error, 'No se pudieron cargar los subsistemas.');
        this.subsistemas = [];
      } else {
        this.subsistemas = res.data;
      }
      this.refresh();
    });
  }

  /** Filtro local por código/nombre. */
  get subsistemasFiltrados(): Subsistema[] {
    const q = String(this.buscar || '').trim().toLowerCase();
    const estado = String(this.estadoFiltro || '').trim();
    return this.subsistemas.filter((s) => {
      if (estado) {
        const activo = this.esActivo(s);
        if (estado === '1' && !activo) return false;
        if (estado === '2' && activo) return false;
      }
      if (!q) return true;
      return `${s.codigo} ${s.nombre}`.toLowerCase().includes(q);
    });
  }

  get puedeEditarSubsistemas(): boolean {
    return this.tienePermiso('sicoss_editar') || this.tienePermiso('sicoss');
  }

  get puedeEliminarSubsistemas(): boolean {
    return this.tienePermiso('sicoss_eliminar') || this.tienePermiso('sicoss');
  }

  get puedeConfigurarConceptos(): boolean {
    return this.tienePermiso('sicoss_editar') || this.tienePermiso('sicoss');
  }

  /** Es SICOS si la categoría o el código/nombre lo indican. */
  esSicoss(s: Subsistema): boolean {
    const cat = String(s.categoria ?? '').trim().toLowerCase();
    if (cat) return cat === 'sicoss' || cat === 'sicos';
    const txt = `${s.codigo} ${s.nombre}`.toLowerCase();
    return txt.includes('sicos') || txt.includes('sicoss') || txt.includes('seguridad social');
  }

  /**
   * Selecciona un subsistema. Si es SICOS, navega al listado de generaciones
   * de ese subsistema; si no, avisa que aún no hay flujo implementado.
   */
  usar(s: Subsistema): void {
    if (this.esSicoss(s)) {
      if (!this.puedeUsarSicoss) {
        this.toast.error('No tenés permiso para operar SICOS.');
        return;
      }
      this.router.navigate(['/admin/impositivos/sicoss'], {
        queryParams: { subsistema_id: s.subsistema_id, subsistema: s.codigo || s.nombre }
      });
      return;
    }
    this.toast.info(`El subsistema "${s.nombre || s.codigo}" todavía no tiene un flujo implementado.`);
  }

  editar(s: Subsistema): void {
    if (!this.puedeEditarSubsistemas) {
      this.toast.error('No tenés permiso para editar subsistemas.');
      return;
    }
    this.editForm = {
      subsistema_id: s.subsistema_id,
      codigo: s.codigo || '',
      nombre: s.nombre || '',
      estado_id: this.esActivo(s) ? 1 : 2
    };
    this.editModalMessage = `Editá el código, nombre o estado del subsistema "${s.nombre || s.codigo}".`;
    this.editModalVisible = true;
  }

  eliminar(s: Subsistema): void {
    if (!this.puedeEliminarSubsistemas) {
      this.toast.error('No tenés permiso para eliminar subsistemas.');
      return;
    }
    this.pendingDelete = s;
    this.deleteModalTitle = 'Eliminar subsistema';
    this.deleteModalMessage = `¿Eliminar "${s.nombre || s.codigo}"? Esta acción afectará el catálogo de subsistemas de la empresa actual.`;
    this.deleteModalVisible = true;
  }

  toggleEditEstado(): void {
    this.editForm.estado_id = this.editForm.estado_id === 1 ? 2 : 1;
  }

  onEditModalClose(confirmado = false): void {
    if (!this.editModalVisible) return;
    if (!confirmado) {
      this.editModalVisible = false;
      return;
    }
    if (!this.editForm.subsistema_id || !String(this.editForm.codigo || '').trim() || !String(this.editForm.nombre || '').trim()) {
      this.toast.error('Completá código y nombre del subsistema.');
      return;
    }
    this.editModalSpinner = true;
    const payload = {
      codigo: String(this.editForm.codigo).trim(),
      nombre: String(this.editForm.nombre).trim(),
      estado_id: this.editForm.estado_id,
      activo: this.editForm.estado_id === 1,
      categoria: this.categoria
    };
    this.svc.updateSubsistema(this.editForm.subsistema_id, payload).pipe(finalize(() => {
      this.editModalSpinner = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.toast.error(this.msgError(res.error, 'No se pudo guardar el subsistema.'));
        return;
      }
      this.toast.success('Subsistema actualizado.');
      this.editModalVisible = false;
      this.applyUpdatedSubsistema(res.data);
    });
  }

  onDeleteModalClose(confirmado = false): void {
    if (!this.deleteModalVisible) return;
    if (!confirmado) {
      this.deleteModalVisible = false;
      this.pendingDelete = null;
      return;
    }
    if (!this.pendingDelete) {
      this.deleteModalVisible = false;
      return;
    }
    const id = this.pendingDelete.subsistema_id;
    this.deleteModalSpinner = true;
    this.svc.deleteSubsistema(id).pipe(finalize(() => {
      this.deleteModalSpinner = false;
      this.refresh();
    })).subscribe((res) => {
      if (!res.ok) {
        this.toast.error(this.msgError(res.error, 'No se pudo eliminar el subsistema.'));
        return;
      }
      this.toast.success('Subsistema eliminado.');
      this.deleteModalVisible = false;
      this.pendingDelete = null;
      this.subsistemas = this.subsistemas.filter((x) => x.subsistema_id !== id);
    });
  }

  abrirConceptos(s?: Subsistema): void {
    if (!this.puedeConfigurarConceptos) {
      this.toast.error('No tenés permiso para configurar conceptos.');
      return;
    }
    const params: any = { origen: 'subsistemas' };
    if (s && s.subsistema_id) {
      params.subsistema_id = s.subsistema_id;
      params.subsistema_nombre = s.nombre || s.codigo || '';
    }
    this.router.navigate(['/admin/impositivos/conceptos-afip'], { queryParams: params });
  }

  private refresh(): void {
    try { this.cdr.detectChanges(); } catch { /* ignore */ }
  }

  private tienePermiso(alias: string): boolean {
    const perms: any[] = this.auth.getPermissions() || [];
    return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
  }

  private esActivo(s: Subsistema): boolean {
    if (typeof s.activo === 'boolean') return s.activo;
    const estadoId = Number(s.estado_id ?? 0);
    if (estadoId > 0) return estadoId === 1;
    const estado = String(s.estado || '').trim().toLowerCase();
    if (!estado) return true;
    return estado === 'activo' || estado === 'activa' || estado === '1' || estado === 'true';
  }

  etiquetaEstado(s: Subsistema): string {
    if (typeof s.activo === 'boolean') return s.activo ? 'Activo' : 'Inactivo';
    const estadoId = Number(s.estado_id ?? 0);
    if (estadoId > 0) return estadoId === 1 ? 'Activo' : 'Inactivo';
    const estado = String(s.estado || '').trim();
    return estado ? estado : 'Activo';
  }

  estadoClass(s: Subsistema): string {
    return this.esActivo(s) ? 'activo' : 'inactivo';
  }

  private msgError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'No se encontró el catálogo de subsistemas.';
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

  private defaultEditForm(): { subsistema_id: number | null; codigo: string; nombre: string; estado_id: 1 | 2 } {
    return { subsistema_id: null, codigo: '', nombre: '', estado_id: 1 };
  }

  private applyUpdatedSubsistema(item: Subsistema): void {
    const idx = this.subsistemas.findIndex((x) => x.subsistema_id === item.subsistema_id);
    if (idx >= 0) {
      this.subsistemas[idx] = item;
      this.subsistemas = [...this.subsistemas];
    }
  }
}
