import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { CargosService } from './cargos.service';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../core/toast.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';

@Component({
  selector: 'app-cargos',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './cargos.component.html',
  styleUrls: ['./cargos.component.scss']
})
export class CargosComponent implements OnInit {
  cargos: any[] = [];
  allCargos: any[] = [];
  sucursales: any[] = [];
  secciones: any[] = [];
  allSecciones: any[] = [];
  loading = false;
  filtros = { q: '', sucursal_id: '', seccion_id: '' };
  deleteModalVisible = false;
  deleteModalTitle = 'Confirmar eliminación';
  deleteModalMessage = '';
  private deleteTargetId: number | null = null;

  constructor(private router: Router, private svc: CargosService, private auth: AuthService, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadCatalogos();
    this.loadCargos();
  }

  get canCreate(): boolean { return this.hasPerm('cargos_agregar'); }
  get canEdit(): boolean { return this.hasPerm('cargos_editar'); }
  get canDelete(): boolean { return this.hasPerm('cargos_borrar') || this.hasPerm('cargos_eliminar') || this.hasPerm('cargos_elliminar') || this.auth.isSuperAdmin(); }

  private hasPerm(alias: string): boolean {
    try {
      const target = String(alias || '').trim().toLowerCase();
      const perms = this.auth.getPermissions() || [];
      return Array.isArray(perms) && perms.some((p: any) => {
        const rawAlias = typeof p === 'string' ? p : p?.alias;
        return String(rawAlias || '').trim().toLowerCase() === target;
      });
    } catch {
      return false;
    }
  }

  loadCargos(): void {
    this.loading = true;
    this.svc.all().pipe(finalize(() => { this.loading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = Array.isArray(res) ? res : (res?.data?.cargos || res?.data || res?.cargos || res?.result || res?.items || []);
      this.allCargos = data.map((c:any) => this.normalizeCargo(c)).sort(this.compareCargo);
      this.sucursales = this.uniqueById(this.allCargos.map((c:any) => c?.sucursal).filter(Boolean), 'sucursal_id');
      this.secciones = this.uniqueById(this.allCargos.map((c:any) => c?.seccion).filter(Boolean), 'seccion_id');
      this.applyFilters();
    }, (err) => {
      console.error(err);
      this.toast.error('No se pudieron cargar los cargos');
    });
  }

  loadCatalogos(): void {
    forkJoin({
      sucursales: this.svc.listSucursales(),
      secciones: this.svc.listSecciones()
    }).subscribe(({ sucursales, secciones }: any) => {
      const sucData = Array.isArray(sucursales) ? sucursales : (sucursales?.data || sucursales?.sucursales || []);
      this.sucursales = sucData.map((s:any) => ({
        ...s,
        sucursal_id: Number(s?.sucursal_id ?? s?.id ?? 0) || null,
        nombre: s?.nombre ?? s?.razon_social ?? s?.descripcion ?? s?.cod_interno ?? 'Sin nombre'
      }));

      const secData = Array.isArray(secciones) ? secciones : (secciones?.data?.secciones || secciones?.data || secciones?.secciones || secciones?.items || []);
      this.allSecciones = secData.map((s:any) => ({
        ...s,
        seccion_id: Number(s?.seccion_id ?? s?.id ?? 0) || null,
        nombre: s?.nombre ?? s?.descripcion ?? 'Sin nombre',
        sucursal_id: Number(s?.sucursal_id ?? s?.sucursal?.sucursal_id ?? s?.sucursal?.id ?? 0) || null,
        sucursal_nombre: s?.sucursal_nombre ?? s?.sucursal?.nombre ?? s?.sucursal?.razon_social ?? null
      }));

      this.onSucursalChange();
      try { this.cdr.detectChanges(); } catch {}
    }, (err) => {
      console.error(err);
      this.toast.error('No se pudieron cargar sucursales y secciones');
    });
  }

  private normalizeCargo(c: any): any {
    const seccion = c?.seccion || null;
    const sucursal = c?.sucursal || seccion?.sucursal || null;
    return {
      ...c,
      cargo_id: Number(c?.cargo_id ?? c?.id ?? 0) || null,
      empresa_id: c?.empresa_id ?? null,
      seccion_id: Number(c?.seccion_id ?? seccion?.seccion_id ?? seccion?.id ?? seccion?.seccionId ?? seccion?.section_id ?? 0) || null,
      nombre: c?.nombre ?? c?.descripcion ?? 'Sin nombre',
      abreviatura: c?.abreviatura ?? '',
      responsable: c?.responsable ?? '',
      descripcion: c?.descripcion ?? '',
      estado_id: c?.estado_id ?? null,
      seccion,
      sucursal,
      seccionNombre: this.seccionLabel(seccion),
      sucursalNombre: this.sucursalLabel(sucursal)
    };
  }

  private compareCargo(a: any, b: any): number {
    const idA = Number(a?.cargo_id ?? a?.id ?? 0);
    const idB = Number(b?.cargo_id ?? b?.id ?? 0);
    return idA - idB;
  }

  private toId(value: any): number | null {
    const id = Number(value ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private cargoSucursalId(cargo: any): number | null {
    return this.toId(
      cargo?.sucursal?.sucursal_id ??
      cargo?.sucursal?.id ??
      cargo?.sucursal_id ??
      cargo?.seccion?.sucursal_id ??
      cargo?.seccion?.sucursal?.sucursal_id ??
      cargo?.seccion?.sucursal?.id ??
      cargo?.seccion?.sucursalId
    );
  }

  private cargoSeccionId(cargo: any): number | null {
    return this.toId(
      cargo?.seccion_id ??
      cargo?.seccion?.seccion_id ??
      cargo?.seccion?.id ??
      cargo?.seccion?.seccionId ??
      cargo?.seccion?.section_id
    );
  }

  onFiltroChange(): void { this.applyFilters(); }

  onSucursalChange(): void {
    this.filtros.seccion_id = '';
    const sucursalId = Number(this.filtros.sucursal_id ?? 0);
    this.secciones = sucursalId
      ? this.allSecciones.filter((seccion:any) => Number(seccion?.sucursal_id ?? seccion?.sucursal?.sucursal_id ?? seccion?.sucursal?.id ?? 0) === sucursalId)
      : [...this.allSecciones];
    this.applyFilters();
  }

  onSeccionChange(): void {
    this.applyFilters();
  }

  private uniqueById(items: any[], idField: string): any[] {
    const seen = new Set<string>();
    return (items || []).filter((item:any) => {
      const id = String(item?.[idField] ?? '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  private applyFilters(): void {
    const q = String(this.filtros.q || '').trim().toLowerCase();
    const sucursalId = this.toId(this.filtros.sucursal_id);
    const seccionId = this.toId(this.filtros.seccion_id);
    this.cargos = (this.allCargos || []).filter((c:any) => {
      if (q) {
        const haystack = [c?.nombre, c?.abreviatura, c?.responsable, c?.descripcion, this.seccionLabel(c?.seccion), this.sucursalLabel(c?.sucursal)]
          .filter(Boolean)
          .map((value:any) => String(value).toLowerCase())
          .join(' ');
        if (!haystack.includes(q)) return false;
      }
      const cargoSucursalId = this.cargoSucursalId(c);
      const cargoSeccionId = this.cargoSeccionId(c);
      if (sucursalId && cargoSucursalId !== sucursalId) return false;
      if (seccionId && cargoSeccionId !== seccionId) return false;
      if (sucursalId && seccionId) {
        const sectionMatch = this.allSecciones.find((seccion:any) => this.toId(seccion?.seccion_id ?? seccion?.id) === seccionId);
        const sectionSucursalId = this.toId(sectionMatch?.sucursal_id ?? sectionMatch?.sucursal?.sucursal_id ?? sectionMatch?.sucursal?.id);
        if (sectionSucursalId && cargoSucursalId !== sectionSucursalId) return false;
      }
      return true;
    });
  }

  get emptyStateMessage(): string {
    const seccionId = this.toId(this.filtros.seccion_id);
    if (seccionId) {
      const seccion = this.allSecciones.find((s:any) => this.toId(s?.seccion_id ?? s?.id) === seccionId) || this.allCargos.find((c:any) => this.cargoSeccionId(c) === seccionId)?.seccion;
      const label = seccion ? this.seccionLabel(seccion) : `Sección ${seccionId}`;
      return `La sección ${label} no posee cargos dados de alta aún.`;
    }

    const sucursalId = this.toId(this.filtros.sucursal_id);
    if (sucursalId) {
      const sucursal = this.sucursales.find((s:any) => this.toId(s?.sucursal_id ?? s?.id) === sucursalId) || this.allCargos.find((c:any) => this.cargoSucursalId(c) === sucursalId)?.sucursal;
      const label = sucursal ? this.sucursalLabel(sucursal) : `Sucursal ${sucursalId}`;
      return `La sucursal ${label} no posee cargos dados de alta aún.`;
    }

    return 'No hay cargos para mostrar.';
  }

  goTo(path: string): void {
    this.router.navigateByUrl(path);
  }

  cargoLabel(cargo: any): string {
    return String(cargo?.nombre || cargo?.descripcion || cargo?.codigo || cargo?.cargo_id || 'Sin nombre');
  }

  seccionLabel(seccion: any): string {
    return String(seccion?.nombre || seccion?.descripcion || seccion?.cod_interno || seccion?.seccion_id || '-');
  }

  sucursalLabel(sucursal: any): string {
    return String(sucursal?.nombre || sucursal?.razon_social || sucursal?.descripcion || sucursal?.cod_interno || sucursal?.sucursal_id || '-');
  }

  seccionOfCargo(cargo: any): string {
    return this.seccionLabel(cargo?.seccion || cargo?.seccion_nombre || cargo?.seccion_descripcion || cargo?.seccion_id || '-');
  }

  sucursalOfCargo(cargo: any): string {
    return this.sucursalLabel(cargo?.sucursal || cargo?.sucursal_nombre || cargo?.sucursal_descripcion || cargo?.sucursal_id || '-');
  }

  createCargo(): void {
    if (!this.canCreate) { this.toast.error('Sin permisos para crear cargos'); return; }
    this.router.navigate(['/admin/cargos/alta']);
  }

  editCargo(cargo: any): void {
    if (!this.canEdit) { this.toast.error('Sin permisos para editar cargos'); return; }
    const id = cargo?.cargo_id || cargo?.id;
    if (!id) return;
    this.router.navigate(['/admin/cargos/editar'], { queryParams: { id } });
  }

  deleteCargo(cargo: any): void {
    if (!this.canDelete) { this.toast.error('Sin permisos para eliminar cargos'); return; }
    const id = cargo?.cargo_id || cargo?.id;
    if (!id) return;
    this.deleteTargetId = Number(id);
    this.deleteModalMessage = `¿Estás seguro de eliminar el cargo "${cargo?.nombre || ''}"? Esta acción liberará el cargo de los empleados asociados.`;
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
    this.svc.delete(id).subscribe((res: any) => {
      const message = res?.message || `El cargo fue eliminado y se liberó de los empleados asociados.`;
      if (res?.ok === false) {
        this.toast.error(message);
        return;
      }
      this.toast.success(message);
      this.loadCargos();
    }, (err) => {
      console.error(err);
      this.toast.error('No se pudo eliminar el cargo');
    });
  }
}