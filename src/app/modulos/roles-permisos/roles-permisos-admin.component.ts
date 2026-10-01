import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { RolesPermisosService } from './roles-permisos.service';
import { PermisoDto, RolDto } from './roles-permisos.types';

type TabKey = 'roles' | 'permisos';

@Component({
  selector: 'app-roles-permisos-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './roles-permisos-admin.component.html',
  styleUrls: ['./roles-permisos-admin.component.scss']
})
export class RolesPermisosAdminComponent implements OnInit {
  activeTab: TabKey = 'roles';
  loadingRoles = false;
  loadingPermisos = false;
  loadingRolPermisos = false;
  saving = false;
  searchRoles = '';
  searchPermisos = '';
  selectedRolId: number | null = null;
  selectedPermisoId: number | null = null;
  rolPermisos: PermisoDto[] = [];
  expandedGrupoPermisos = new Set<string>();
  roles: RolDto[] = [];
  permisos: PermisoDto[] = [];
  roleForm: FormGroup;
  permisoForm: FormGroup;
  copyForm: FormGroup;
  deleteModalVisible = false;
  deleteModalTitle = 'Confirmar eliminación';
  deleteModalMessage = '';
  private deleteContext: { type: 'rol' | 'permiso' | 'rol-permiso'; id: number; rolId?: number } | null = null;

  constructor(
    private fb: FormBuilder,
    private svc: RolesPermisosService,
    private auth: AuthService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {
    this.roleForm = this.fb.group({
      id: [null],
      nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
      alias: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80), Validators.pattern(/^[a-z0-9_]+$/i)]],
      descripcion: ['', [Validators.maxLength(255)]]
    });

    this.permisoForm = this.fb.group({
      id: [null],
      nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
      alias: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120), Validators.pattern(/^[a-z0-9_]+$/i)]],
      descripcion: ['', [Validators.maxLength(255)]],
      modulo: ['', [Validators.maxLength(80)]],
      grupo: ['', [Validators.maxLength(80)]]
    });

    this.copyForm = this.fb.group({
      rolOrigenId: [null, [Validators.required, Validators.min(1)]],
      rolDestinoId: [null, [Validators.required, Validators.min(1)]]
    });
  }

  ngOnInit(): void {
    if (!this.auth.canAccessRolesPermisos()) {
      this.toast.error('403 Forbidden: no tiene acceso a Roles y Permisos');
      return;
    }

    this.loadRoles();
    this.loadPermisos();
  }

  get canManage(): boolean {
    return this.auth.canAccessRolesPermisos();
  }

  get selectedRol(): RolDto | null {
    return this.roles.find((rol) => Number(rol?.id) === Number(this.selectedRolId)) || null;
  }

  get selectedPermiso(): PermisoDto | null {
    return this.permisos.find((permiso) => Number(permiso?.id) === Number(this.selectedPermisoId)) || null;
  }

  get filteredRoles(): RolDto[] {
    const q = String(this.searchRoles || '').trim().toLowerCase();
    const list = [...this.roles].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
    if (!q) return list;
    return list.filter((rol) => [rol.nombre, rol.alias, rol.descripcion].filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  get filteredPermisos(): PermisoDto[] {
    const q = String(this.searchPermisos || '').trim().toLowerCase();
    const list = [...this.permisos].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
    if (!q) return list;
    return list.filter((permiso) => [permiso.nombre, permiso.alias, permiso.descripcion, permiso.grupo, permiso.modulo].filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  get groupedRolPermisos(): Array<{ grupo: string; permisos: PermisoDto[] }> {
    const grupos = new Map<string, PermisoDto[]>();
    for (const permiso of this.rolPermisos) {
      const grupo = String(permiso?.grupo || 'Sin grupo').trim() || 'Sin grupo';
      if (!grupos.has(grupo)) {
        grupos.set(grupo, []);
      }
      grupos.get(grupo)!.push(permiso);
    }

    return Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .map(([grupo, permisos]) => ({ grupo, permisos: [...permisos].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' })) }));
  }

  isGrupoExpanded(grupo: string): boolean {
    const key = String(grupo || 'Sin grupo').trim() || 'Sin grupo';
    return this.expandedGrupoPermisos.has(key);
  }

  toggleGrupoPermisos(grupo: string): void {
    const key = String(grupo || 'Sin grupo').trim() || 'Sin grupo';
    if (this.expandedGrupoPermisos.has(key)) {
      this.expandedGrupoPermisos.delete(key);
    } else {
      this.expandedGrupoPermisos.add(key);
    }
    this.expandedGrupoPermisos = new Set(this.expandedGrupoPermisos);
  }

  private normalizeId(value: any): number {
    return Number(value?.id ?? value?.rol_id ?? value?.permiso_id ?? value?.rolId ?? value?.permisoId ?? 0) || 0;
  }

  private extractList<T>(res: any, keys: string[]): T[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    for (const key of keys) {
      const value = res?.[key];
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.data)) return value.data;
      if (Array.isArray(value?.items)) return value.items;
      if (Array.isArray(value?.result)) return value.result;
    }
    return [];
  }

  private normalizePermisoPayload(permiso: any): PermisoDto {
    const effective = permiso?.permiso && typeof permiso.permiso === 'object' ? permiso.permiso : permiso;

    return {
      ...effective,
      id: this.normalizeId(effective),
      nombre: String(
        effective?.nombre
        || effective?.name
        || effective?.descripcion
        || effective?.titulo
        || effective?.router
        || effective?.ruta
        || effective?.alias
        || ''
      ).trim(),
      alias: String(
        effective?.alias
        || effective?.codigo
        || effective?.router
        || effective?.ruta
        || ''
      ).trim(),
      descripcion: effective?.descripcion ?? null,
      modulo: effective?.modulo ?? null,
      grupo: effective?.grupo ?? null,
      router: effective?.router ?? effective?.ruta ?? null,
      es_menu: Boolean(effective?.es_menu ?? effective?.esMenu ?? false)
    } as PermisoDto;
  }

  loadRoles(): void {
    this.loadingRoles = true;
    this.svc.listRoles().pipe(finalize(() => { this.loadingRoles = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.roles = this.extractList<RolDto>(res?.data ?? res, ['roles', 'items', 'result']).map((rol: any) => ({
          ...rol,
          id: this.normalizeId(rol),
          nombre: String(rol?.nombre || rol?.name || '').trim(),
          alias: String(rol?.alias || '').trim(),
          descripcion: rol?.descripcion ?? null,
          es_super_admin: Boolean(rol?.es_super_admin ?? rol?.esSuperAdmin ?? false)
        }));
        if (!this.selectedRolId && this.roles.length) {
          this.selectedRolId = this.roles[0].id ?? null;
          this.loadRolPermisos();
        }
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron cargar los roles'))
    });
  }

  loadPermisos(): void {
    this.loadingPermisos = true;
    this.svc.listPermisos().pipe(finalize(() => { this.loadingPermisos = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.permisos = this.extractList<PermisoDto>(res?.data ?? res, ['permisos', 'items', 'result']).map((permiso: any) => ({
          ...permiso,
          id: this.normalizeId(permiso),
          nombre: String(permiso?.nombre || permiso?.name || '').trim(),
          alias: String(permiso?.alias || '').trim(),
          descripcion: permiso?.descripcion ?? null,
          modulo: permiso?.modulo ?? null,
          grupo: permiso?.grupo ?? null,
          ruta: permiso?.ruta ?? permiso?.router ?? null,
          es_menu: Boolean(permiso?.es_menu ?? permiso?.esMenu ?? false)
        }));
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron cargar los permisos'))
    });
  }

  loadRolPermisos(): void {
    const rolId = Number(this.selectedRolId || 0);
    if (!rolId) {
      this.rolPermisos = [];
      return;
    }

    this.loadingRolPermisos = true;
    this.svc.getPermisosByRol(rolId).pipe(finalize(() => { this.loadingRolPermisos = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        const data = (res?.data ?? res ?? {}) as { rol?: unknown; permisos?: unknown[] };
        const permisos = Array.isArray(data.permisos) ? data.permisos : [];
        this.rolPermisos = permisos.map((permiso: any) => this.normalizePermisoPayload(permiso));
      },
      error: (err) => {
        this.rolPermisos = [];
        this.toast.error(this.mapError(err, 'No se pudieron cargar los permisos del rol'));
      }
    });
  }

  selectRol(rol: RolDto): void {
    this.selectedRolId = rol?.id ?? null;
    this.roleForm.reset({ id: rol?.id ?? null, nombre: rol?.nombre ?? '', alias: rol?.alias ?? '', descripcion: rol?.descripcion ?? '' });
    this.loadRolPermisos();
  }

  selectPermiso(permiso: PermisoDto): void {
    this.selectedPermisoId = permiso?.id ?? null;
    this.permisoForm.reset({ id: permiso?.id ?? null, nombre: permiso?.nombre ?? '', alias: permiso?.alias ?? '', descripcion: permiso?.descripcion ?? '', modulo: permiso?.modulo ?? '', grupo: permiso?.grupo ?? '' });
  }

  newRol(): void {
    this.roleForm.reset({ id: null, nombre: '', alias: '', descripcion: '' });
  }

  newPermiso(): void {
    this.permisoForm.reset({ id: null, nombre: '', alias: '', descripcion: '', modulo: '', grupo: '' });
  }

  saveRol(): void {
    if (!this.canManage) return;
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    const raw = this.roleForm.getRawValue();
    const payload = {
      nombre: String(raw.nombre || '').trim(),
      alias: String(raw.alias || '').trim(),
      descripcion: String(raw.descripcion || '').trim() || null
    };

    if (this.isSuperAdminRolAlias(payload.alias) && raw.id) {
      this.toast.error('No se puede editar el rol super_administrador');
      return;
    }

    if (this.isDuplicateRolAlias(payload.alias, raw.id)) {
      this.toast.error('El alias del rol ya existe');
      return;
    }

    this.saving = true;
    const req = raw.id ? this.svc.updateRol(Number(raw.id), payload) : this.svc.createRol(payload);
    req.pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Operación realizada correctamente');
        this.loadRoles();
        this.newRol();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudo guardar el rol'))
    });
  }

  savePermiso(): void {
    if (!this.canManage) return;
    if (this.permisoForm.invalid) {
      this.permisoForm.markAllAsTouched();
      return;
    }

    const raw = this.permisoForm.getRawValue();
    const payload = {
      nombre: String(raw.nombre || '').trim(),
      alias: String(raw.alias || '').trim(),
      descripcion: String(raw.descripcion || '').trim() || null,
      modulo: String(raw.modulo || '').trim() || null,
      grupo: String(raw.grupo || '').trim() || null
    };

    if (this.isDuplicatePermisoAlias(payload.alias, raw.id)) {
      this.toast.error('El alias del permiso ya existe');
      return;
    }

    this.saving = true;
    const req = raw.id ? this.svc.updatePermiso(Number(raw.id), payload) : this.svc.createPermiso(payload);
    req.pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Operación realizada correctamente');
        this.loadPermisos();
        this.loadRolPermisos();
        this.newPermiso();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudo guardar el permiso'))
    });
  }

  assignSelectedPermiso(): void {
    const rolId = Number(this.selectedRolId || 0);
    const permisoId = Number(this.selectedPermisoId || 0);
    if (!rolId || !permisoId) return;
    if (this.rolPermisos.some((permiso) => Number(permiso.id) === permisoId)) {
      this.toast.info('El permiso ya estaba asignado');
      return;
    }
    this.saving = true;
    this.svc.addPermisoToRol(rolId, permisoId).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Operación realizada correctamente');
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudo asignar el permiso'))
    });
  }

  assignManySelected(): void {
    const rolId = Number(this.selectedRolId || 0);
    if (!rolId) return;
    const ids = Array.from(new Set(this.permisos.filter((permiso) => this.selectedPermisoIds.has(Number(permiso.id))).map((permiso) => Number(permiso.id)).filter((id) => id > 0)));
    if (!ids.length) {
      this.toast.error('Seleccione al menos un permiso');
      return;
    }
    this.saving = true;
    this.svc.addPermisosMasivo(rolId, ids).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Operación realizada correctamente');
        this.selectedPermisoIds.clear();
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron asignar los permisos'))
    });
  }

  removeManySelected(): void {
    const rolId = Number(this.selectedRolId || 0);
    if (!rolId) return;
    const ids = Array.from(new Set(this.permisos.filter((permiso) => this.selectedPermisoIds.has(Number(permiso.id))).map((permiso) => Number(permiso.id)).filter((id) => id > 0)));
    if (!ids.length) {
      this.toast.error('Seleccione al menos un permiso');
      return;
    }
    this.confirmDelete('rol-permiso', ids[0], rolId, `¿Quitar los permisos seleccionados del rol ${this.selectedRol?.nombre || ''}?`);
  }

  replacePermisos(): void {
    const rolId = Number(this.selectedRolId || 0);
    if (!rolId) return;
    const ids = Array.from(new Set(this.selectedPermisoIds.size ? Array.from(this.selectedPermisoIds) : this.rolPermisos.map((permiso) => Number(permiso.id)).filter((id) => id > 0)));
    if (!ids.length) {
      this.toast.error('Seleccione permisos para reemplazar');
      return;
    }
    this.saving = true;
    this.svc.replacePermisos(rolId, ids).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Operación realizada correctamente');
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron reemplazar los permisos'))
    });
  }

  openCopyAction(): void {
    const origen = this.copyForm.get('rolOrigenId')?.value;
    const destino = this.copyForm.get('rolDestinoId')?.value;
    if (!origen || !destino || Number(origen) === Number(destino)) {
      this.toast.error('Seleccione dos roles distintos');
      return;
    }
    this.saving = true;
    this.svc.copiarPermisos({ rolOrigenId: Number(origen), rolDestinoId: Number(destino) }).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Operación realizada correctamente');
        this.loadRoles();
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron copiar los permisos'))
    });
  }

  togglePermisoSelection(permisoId: number): void {
    const id = Number(permisoId || 0);
    if (!id) return;
    if (this.selectedPermisoIds.has(id)) {
      this.selectedPermisoIds.delete(id);
    } else {
      this.selectedPermisoIds.add(id);
    }
    this.selectedPermisoIds = new Set(this.selectedPermisoIds);
  }

 

  isGrupoPermisosExpanded(grupo: string): boolean {
    const key = String(grupo || 'Sin grupo').trim() || 'Sin grupo';
    return this.expandedGrupoPermisos.has(key);
  }

  isGrupoPermisosDefaultExpanded(grupo: string): boolean {
    const key = String(grupo || 'Sin grupo').trim() || 'Sin grupo';
    return !this.expandedGrupoPermisos.size || this.expandedGrupoPermisos.has(key);
  }

  selectedPermisoIds = new Set<number>();

  isSelectedPermiso(id: number): boolean {
    return this.selectedPermisoIds.has(Number(id));
  }

  confirmDelete(type: 'rol' | 'permiso' | 'rol-permiso', id: number, rolId?: number, message?: string): void {
    if (type === 'rol' && this.isSuperAdminRol(this.roles.find((rol) => Number(rol.id) === Number(id)))) {
      this.toast.error('No se puede eliminar el rol super_administrador');
      return;
    }
    if (type === 'permiso' && this.isProtectedPermiso(this.permisos.find((permiso) => Number(permiso.id) === Number(id)))) {
      this.toast.error('No se puede eliminar el permiso permisos_abm');
      return;
    }
    this.deleteContext = { type, id, rolId };
    this.deleteModalMessage = message || '¿Está seguro de eliminar el registro?';
    this.deleteModalVisible = true;
  }

  onDeleteModalClose(confirmado: boolean): void {
    this.deleteModalVisible = false;
    if (!confirmado || !this.deleteContext) {
      this.deleteContext = null;
      return;
    }

    const ctx = this.deleteContext;
    this.deleteContext = null;
    if (ctx.type === 'rol') {
      this.svc.deleteRol(ctx.id).subscribe({
        next: (res) => {
          this.toast.success(res?.message || 'Operación realizada correctamente');
          this.loadRoles();
        },
        error: (err) => this.toast.error(this.mapError(err, 'No se pudo eliminar el rol'))
      });
      return;
    }

    if (ctx.type === 'permiso') {
      this.svc.deletePermiso(ctx.id).subscribe({
        next: (res) => {
          this.toast.success(res?.message || 'Operación realizada correctamente');
          this.loadPermisos();
        },
        error: (err) => this.toast.error(this.mapError(err, 'No se pudo eliminar el permiso'))
      });
      return;
    }

    const rolId = Number(ctx.rolId || this.selectedRolId || 0);
    if (!rolId) return;
    const ids = Array.from(new Set(this.selectedPermisoIds.size ? Array.from(this.selectedPermisoIds) : [ctx.id])).filter((value) => Number(value) > 0);
    this.svc.removePermisosMasivo(rolId, ids).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Operación realizada correctamente');
        this.selectedPermisoIds.clear();
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron quitar los permisos'))
    });
  }

  removePermisoFromRol(permiso: PermisoDto): void {
    const rolId = Number(this.selectedRolId || 0);
    const permisoId = Number(permiso?.id || 0);
    if (!rolId || !permisoId) return;
    this.confirmDelete('rol-permiso', permisoId, rolId, `¿Quitar el permiso ${permiso?.nombre || ''} del rol ${this.selectedRol?.nombre || ''}?`);
  }

  selectAllFilteredPermisos(checked: boolean): void {
    if (!checked) {
      this.selectedPermisoIds.clear();
      this.selectedPermisoIds = new Set(this.selectedPermisoIds);
      return;
    }

    this.selectedPermisoIds = new Set(this.filteredPermisos.map((permiso) => Number(permiso.id)).filter((id) => id > 0));
  }

  copyRolOrigenControl() {
    return this.copyForm.get('rolOrigenId');
  }

  copyRolDestinoControl() {
    return this.copyForm.get('rolDestinoId');
  }

  private isSuperAdminRol(rol: RolDto | undefined | null): boolean {
    return this.isSuperAdminRolAlias(String(rol?.alias || ''));
  }

  private isSuperAdminRolAlias(alias: string): boolean {
    return String(alias || '').trim().toLowerCase() === 'super_administrador';
  }

  private isProtectedPermiso(permiso: PermisoDto | undefined | null): boolean {
    return String(permiso?.alias || '').trim().toLowerCase() === 'permisos_abm';
  }

  private isDuplicateRolAlias(alias: string, currentId: any): boolean {
    const normalized = String(alias || '').trim().toLowerCase();
    return this.roles.some((rol) => Number(rol.id) !== Number(currentId) && String(rol.alias || '').trim().toLowerCase() === normalized);
  }

  private isDuplicatePermisoAlias(alias: string, currentId: any): boolean {
    const normalized = String(alias || '').trim().toLowerCase();
    return this.permisos.some((permiso) => Number(permiso.id) !== Number(currentId) && String(permiso.alias || '').trim().toLowerCase() === normalized);
  }

  private mapError(err: any, fallback: string): string {
    const message = err?.error?.message || err?.error?.error || err?.message || fallback;
    const status = Number(err?.status ?? 0);
    if (status === 403) return '403 Forbidden: no tiene permisos para realizar esta operación';
    if (status === 409) return String(message || 'Conflicto de datos');
    return String(message || fallback);
  }
}
