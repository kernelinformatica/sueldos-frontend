import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { SeccionesService } from './secciones.service';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../core/toast.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';

@Component({
  selector: 'app-secciones',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './secciones.component.html',
  styleUrls: ['./secciones.component.scss']
})
export class SeccionesComponent implements OnInit {
  secciones: any[] = [];
  allSecciones: any[] = [];
  loading = false;
  filtros = { sucursal_id: '', sucursal_nombre: '', estado: '' };
  sucursales: any[] = [];
  estados: any[] = [];
  estadosLoading = false;
  estadosError = '';
  deleteModalVisible = false;
  deleteModalTitle = 'Confirmar eliminación';
  deleteModalMessage = '';
  private deleteTargetId: number | null = null;

  constructor(private router: Router, private svc: SeccionesService, private auth: AuthService, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadSucursales();
    this.loadEstados();
    this.loadSecciones();
  }

  loadEstados() {
    this.estadosLoading = true;
    this.estadosError = '';
    this.svc.listEstados().pipe(finalize(() => { this.estadosLoading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = Array.isArray(res)
        ? res
        : (res?.data?.estados || res?.data || res?.estados || res?.result || res?.items || []);
      this.estados = data.map((e:any) => ({
        ...e,
        estado_id: Number(e?.estado_id ?? e?.id ?? 0) || null,
        nombre: e?.nombre ?? e?.descripcion ?? 'Sin nombre',
        descripcion: e?.descripcion ?? ''
      }));
      if (!this.estados.length) this.estadosError = 'No hay estados disponibles';
      try { this.cdr.detectChanges(); } catch {}
    }, () => {
      this.estados = [];
      this.estadosError = 'No se pudieron cargar los estados';
    });
  }
  loadSucursales() {
    this.svc.listSucursales().subscribe((res:any) => {
      const data = Array.isArray(res) ? res : (res?.data || []);
      this.sucursales = data.map((s:any) => ({
        ...s,
        sucursal_id: s?.sucursal_id ?? s?.id ?? null,
        nombre: s?.nombre ?? s?.razon_social ?? s?.descripcion ?? s?.cod_interno ?? 'Sin nombre'
      }));
    });
  }


  get canCreate(): boolean { return this.hasPerm('secciones_agregar'); }
  get canEdit(): boolean { return this.hasPerm('secciones_editar'); }
  get canDelete(): boolean { return this.hasPerm('secciones_borrar'); }

  private hasPerm(alias: string): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === alias : p?.alias === alias)); } catch { return false; }
  }

  loadSecciones() {
    this.loading = true;
    this.svc.all().pipe(finalize(() => { this.loading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = Array.isArray(res) ? res : (res?.data || []);
      this.allSecciones = data.map((s:any) => ({
        ...s,
        estado_id: Number(s?.estado_id ?? s?.estado?.estado_id ?? s?.estado?.id ?? 0) || null,
        estado_label: this.estadoLabelById(Number(s?.estado_id ?? s?.estado?.estado_id ?? s?.estado?.id ?? 0) || null)
      }));
      this.applyFilters();
    }, (err) => { console.error(err); this.toast.error('No se pudieron cargar las secciones'); });
  }

  createSeccion() {
    if (!this.canCreate) { this.toast.error('Sin permisos para crear secciones'); return; }
    this.router.navigate(['/admin/secciones/alta']);
  }

  editSeccion(seccion: any) {
    if (!this.canEdit) { this.toast.error('Sin permisos para editar secciones'); return; }
    const id = seccion?.seccion_id || seccion?.id;
    if (!id) return;
    this.router.navigate(['/admin/secciones/editar'], { queryParams: { id } });
  }

  deleteSeccion(seccion: any) {
    if (!this.canDelete) { this.toast.error('Sin permisos para eliminar secciones'); return; }
    const id = seccion?.seccion_id || seccion?.id;
    if (!id) return;
    this.deleteTargetId = Number(id);
    this.deleteModalMessage = `¿Estás seguro de eliminar lógicamente la sección "${seccion?.nombre || ''}"?`;
    this.deleteModalVisible = true;
  }

  onDeleteModalClose(confirmado: boolean) {
    this.deleteModalVisible = false;
    if (!confirmado || !this.deleteTargetId) {
      this.deleteTargetId = null;
      return;
    }
    const id = this.deleteTargetId;
    this.deleteTargetId = null;
    this.svc.delete(Number(id)).subscribe(() => {
      this.toast.success('Sección eliminada');
      this.loadSecciones();
    }, (err) => {
      console.error(err);
      this.toast.error(this.mapError(err, 'No se pudo eliminar la sección'));
    });
  }

  onFiltroChange() {
    this.applyFilters();
  }

  private applyFilters() {
    const sucursalId = String(this.filtros.sucursal_id || '');
    const nombreSeccion = String(this.filtros.sucursal_nombre || '').trim().toLowerCase();
    const estadoId = String(this.filtros.estado || '');
    this.secciones = (this.allSecciones || []).filter((s:any) => {
      if (sucursalId) {
        const current = String(s?.sucursal_id ?? s?.sucursal?.sucursal_id ?? s?.sucursal?.id ?? '');
        if (current !== sucursalId) return false;
      }
      if (nombreSeccion) {
        const nombre = String(s?.nombre || '').toLowerCase();
        if (!nombre.includes(nombreSeccion)) return false;
      }
      if (estadoId) {
        const currentEstadoId = String(s?.estado_id ?? s?.estado?.estado_id ?? s?.estado?.id ?? '');
        if (currentEstadoId !== estadoId) return false;
      }
      return true;
    });
  }

  estadoLabel(e: any): string {
    return String(e?.nombre || e?.descripcion || e?.estado_id || e?.id || 'Sin nombre');
  }

  estadoLabelById(estadoId: number | null): string {
    if (!estadoId) return '-';
    const estado = this.estados.find((item:any) => Number(item?.estado_id ?? item?.id ?? 0) === Number(estadoId));
    return this.estadoLabel(estado);
  }

  isInactiveSection(seccion: any): boolean {
    return Number(seccion?.estado_id ?? seccion?.estado?.estado_id ?? seccion?.estado?.id ?? 0) === 2;
  }

  estadoIconClass(seccion: any): string {
    return this.isInactiveSection(seccion) ? 'bi bi-slash-circle-fill text-danger' : 'bi bi-check-circle-fill text-success';
  }

  estadoText(seccion: any): string {
    return this.isInactiveSection(seccion) ? 'Inactiva' : (seccion?.estado_label || this.estadoLabelById(seccion?.estado_id));
  }

  seccionCodigo(s: any): string {
    const sucursal = this.sectionSucursal(s);
    return String(sucursal?.cod_interno ?? s?.cod_interno ?? s?.codigo ?? this.seccionId(s));
  }

  seccionId(s: any): string {
    return String(s?.seccion_id ?? s?.id ?? '-');
  }

  sucursalNombre(s: any): string {
    const sucursal = this.sectionSucursal(s);
    return String(sucursal?.nombre || s?.sucursal_nombre || '-');
  }

  sucursalFilterValue(s: any): string | number {
    return s?.sucursal_id ?? s?.id ?? '';
  }

  sucursalDisplayName(s: any): string {
    return String(
      s?.nombre ||
      s?.razon_social ||
      s?.descripcion ||
      s?.sucursal_nombre ||
      s?.cod_interno ||
      s?.sucursal_id ||
      s?.id ||
      '-'
    );
  }

  private sectionSucursal(seccion: any): any {
    if (!seccion) return null;
    if (Array.isArray(seccion?.sucursales) && seccion.sucursales.length) return seccion.sucursales[0];
    return seccion?.sucursal || seccion?.sucursales || null;
  }

  normalizeEstado(estado: any): string {
    if (Number(estado) === 1) return 'Activa';
    if (Number(estado) === 2) return 'Inactiva';
    return String(estado ?? '-');
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    const apiMessage = err?.error?.message || err?.error?.mensaje || err?.error?.detail || err?.message;
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'El recurso solicitado no fue encontrado.';
    if (status === 400 && apiMessage) return String(apiMessage);
    if (status >= 500) return 'Error interno del servidor.';
    return fallback;
  }
}
