import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../auth/auth.service';
import { SucursalesService } from './sucursales.service';
import { SeccionesService } from '../secciones/secciones.service';

@Component({
  selector: 'app-sucursales',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './sucursales.component.html',
  styleUrls: ['./sucursales.component.scss']
})
export class SucursalesComponent implements OnInit {
  sucursales: any[] = [];
  allSucursales: any[] = [];
  seccionesDisponibles: any[] = [];
  loading = false;
  seccionesLoading = false;
  relationSaving = false;
  expanded = new Set<number>();
  filtros = { q: '' };
  relationModalVisible = false;
  relationModalTitle = 'Relacionar secciones';
  relationModalMessage = '';
  relationSucursal: any = null;
  relationSearch = '';
  selectedSeccionIds = new Set<number>();
  deleteModalVisible = false;
  deleteModalTitle = 'Confirmar eliminación';
  deleteModalMessage = '';
  private deleteTargetId: number | null = null;

  constructor(
    private router: Router,
    private svc: SucursalesService,
    private seccionesSvc: SeccionesService,
    private auth: AuthService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadSeccionesDisponibles();
    this.loadSucursales();
  }

  get canCreate(): boolean { return this.hasPerm('sucursales_agregar'); }
  get canEdit(): boolean { return this.hasPerm('sucursales_editar'); }
  get canDelete(): boolean { return this.hasPerm('sucursales_borrar'); }
  get canRelacionar(): boolean { return this.hasPerm('sucursales_relacionar'); }

  private hasPerm(alias: string): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === alias : p?.alias === alias)); } catch { return false; }
  }

  loadSeccionesDisponibles(): void {
    this.seccionesLoading = true;
    this.seccionesSvc.all().pipe(finalize(() => { this.seccionesLoading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = this.extractArrayResponse(res, ['data', 'secciones', 'items', 'result']);
      this.seccionesDisponibles = data
        .map((s:any) => ({
          ...s,
          seccion_id: Number(s?.seccion_id ?? s?.id ?? 0) || null,
          nombre: s?.nombre ?? s?.descripcion ?? 'Sin nombre',
          orden: Number(s?.orden ?? 0) || 0
        }))
        .sort((a:any, b:any) => a.orden - b.orden || String(a.nombre).localeCompare(String(b.nombre)));
    }, () => {
      this.seccionesDisponibles = [];
      this.toast.error('No se pudieron cargar las secciones disponibles');
    });
  }

  loadSucursales(): void {
    this.loading = true;
    this.svc.all().pipe(finalize(() => { this.loading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = this.extractArrayResponse(res, ['data', 'sucursales', 'items', 'result']);
      this.allSucursales = data.map((s:any) => this.normalizeSucursal(s)).sort(this.compareSucursal);
      this.applyFilters();
    }, (err) => {
      console.error(err);
      this.toast.error('No se pudieron cargar las sucursales');
    });
  }

  private extractArrayResponse(res: any, keys: string[]): any[] {
    if (Array.isArray(res)) return res;
    for (const key of keys) {
      const value = res?.[key];
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.data)) return value.data;
      if (Array.isArray(value?.items)) return value.items;
      if (Array.isArray(value?.sucursales)) return value.sucursales;
      if (Array.isArray(value?.secciones)) return value.secciones;
      if (Array.isArray(value?.result)) return value.result;
    }
    return [];
  }

  private normalizeSucursal(s: any): any {
    const secciones = this.normalizeSeccionesArray(s?.secciones || s?.seccion || s?.children || []);
    return {
      ...s,
      sucursal_id: Number(s?.sucursal_id ?? s?.id ?? 0) || null,
      nombre: s?.nombre ?? s?.razon_social ?? s?.descripcion ?? s?.cod_interno ?? 'Sin nombre',
      orden: Number(s?.orden ?? 0) || 0,
      secciones
    };
  }

  private normalizeSeccionesArray(value: any): any[] {
    const data = Array.isArray(value) ? value : (value ? [value] : []);
    return data
      .map((s:any) => ({
        ...s,
        seccion_id: Number(s?.seccion_id ?? s?.id ?? 0) || null,
        nombre: s?.nombre ?? s?.descripcion ?? 'Sin nombre',
        orden: Number(s?.orden ?? 0) || 0
      }))
      .sort((a:any, b:any) => a.orden - b.orden || String(a.nombre).localeCompare(String(b.nombre)));
  }

  private compareSucursal(a: any, b: any): number {
    return (Number(a?.orden ?? 0) - Number(b?.orden ?? 0)) || String(a?.nombre || '').localeCompare(String(b?.nombre || ''));
  }

  onFiltroChange(): void { this.applyFilters(); }

  private applyFilters(): void {
    const q = String(this.filtros.q || '').trim().toLowerCase();
    this.sucursales = (this.allSucursales || []).filter((s:any) => {
      if (!q) return true;
      const nombre = String(s?.nombre || '').toLowerCase();
      return nombre.includes(q);
    });
  }

  toggleExpand(sucursal: any): void {
    const id = Number(sucursal?.sucursal_id ?? sucursal?.id ?? 0);
    if (!id) return;
    if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
  }

  isExpanded(sucursal: any): boolean {
    const id = Number(sucursal?.sucursal_id ?? sucursal?.id ?? 0);
    return this.expanded.has(id);
  }

  createSucursal(): void {
    if (!this.canCreate) { this.toast.error('Sin permisos para crear sucursales'); return; }
    this.router.navigate(['/admin/sucursales/alta']);
  }

  editSucursal(sucursal: any): void {
    if (!this.canEdit) { this.toast.error('Sin permisos para editar sucursales'); return; }
    const id = sucursal?.sucursal_id || sucursal?.id;
    if (!id) return;
    this.router.navigate(['/admin/sucursales/editar'], { queryParams: { id } });
  }

  deleteSucursal(sucursal: any): void {
    if (!this.canDelete) { this.toast.error('Sin permisos para eliminar sucursales'); return; }
    const id = sucursal?.sucursal_id || sucursal?.id;
    if (!id) return;
    this.deleteTargetId = Number(id);
    this.deleteModalMessage = `¿Estás seguro de eliminar la sucursal "${sucursal?.nombre || ''}"?`;
    this.deleteModalVisible = true;
  }

  onDeleteModalClose(confirmado: boolean): void {
    this.deleteModalVisible = false;
    if (!confirmado || !this.deleteTargetId) {
      this.deleteTargetId = null;
      return;
    }
    const id = this.deleteTargetId;
    this.deleteTargetId = null;
    this.svc.delete(id).subscribe(() => {
      this.toast.success('Sucursal eliminada');
      this.loadSucursales();
    }, (err) => {
      console.error(err);
      this.toast.error(this.mapError(err, 'No se pudo eliminar la sucursal'));
    });
  }

  openRelateModal(sucursal: any): void {
    if (!this.canRelacionar) { this.toast.error('Sin permisos para relacionar secciones'); return; }
    this.relationSucursal = sucursal;
    this.relationModalTitle = 'Relacionar secciones';
    this.relationModalMessage = `Sucursal: ${sucursal?.nombre || ''}`;
    const currentIds = new Set<number>((sucursal?.secciones || []).map((x:any) => Number(x?.seccion_id ?? x?.id ?? 0)).filter((id:number) => id > 0));
    this.selectedSeccionIds = currentIds;
    this.relationSearch = '';
    this.relationModalVisible = true;
  }

  closeRelationModal(): void {
    this.relationModalVisible = false;
    this.relationSucursal = null;
    this.relationSearch = '';
  }

  get filteredSeccionesDisponibles(): any[] {
    const q = String(this.relationSearch || '').trim().toLowerCase();
    if (!q) return this.seccionesDisponibles;
    return this.seccionesDisponibles.filter((s:any) => String(s?.nombre || '').toLowerCase().includes(q));
  }

  toggleSeccionSelection(seccionId: number): void {
    if (!seccionId) return;
    if (this.selectedSeccionIds.has(seccionId)) this.selectedSeccionIds.delete(seccionId); else this.selectedSeccionIds.add(seccionId);
    this.selectedSeccionIds = new Set(this.selectedSeccionIds);
  }

  isSelectedSeccion(seccionId: number): boolean {
    return this.selectedSeccionIds.has(Number(seccionId));
  }

  guardarRelacion(): void {
    if (!this.relationSucursal) return;
    if (!this.canRelacionar) { this.toast.error('Sin permisos para relacionar secciones'); return; }
    const ids = Array.from(this.selectedSeccionIds).filter((id) => Number(id) > 0);
    if (!ids.length) {
      this.toast.error('Debes seleccionar al menos una sección');
      return;
    }
    const allowedIds = new Set(this.seccionesDisponibles.map((s:any) => Number(s?.seccion_id ?? s?.id ?? 0)).filter((id:number) => id > 0));
    const invalid = ids.find((id) => !allowedIds.has(id));
    if (invalid) {
      this.toast.error('Una o más secciones seleccionadas no pertenecen a la empresa');
      return;
    }
    const sucursalId = Number(this.relationSucursal?.sucursal_id ?? this.relationSucursal?.id ?? 0);
    if (!sucursalId) return;
    const payload = { seccion_ids: ids };
    this.relationSaving = true;
    this.svc.relacionarSecciones(sucursalId, payload).pipe(finalize(() => { this.relationSaving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const updated = this.normalizeSucursal(res?.data || res || {});
      this.allSucursales = this.allSucursales.map((s:any) => Number(s?.sucursal_id ?? s?.id ?? 0) === sucursalId ? updated : s);
      this.applyFilters();
      this.closeRelationModal();
      this.toast.success('Secciones relacionadas correctamente');
    }, (err) => {
      console.error(err);
      this.toast.error(this.mapError(err, 'No se pudieron relacionar las secciones'));
    });
  }

  sucursalSecciones(sucursal: any): any[] {
    return Array.isArray(sucursal?.secciones) ? sucursal.secciones : [];
  }

  seccionLabel(seccion: any): string {
    return String(seccion?.nombre || seccion?.descripcion || seccion?.seccion_id || seccion?.id || 'Sin nombre');
  }

  sucursalLabel(sucursal: any): string {
    return String(sucursal?.nombre || sucursal?.razon_social || sucursal?.descripcion || sucursal?.cod_interno || 'Sin nombre');
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