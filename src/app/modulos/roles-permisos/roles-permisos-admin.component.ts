import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, timeout, takeUntil } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { RolesPermisosService } from './roles-permisos.service';
import { PermisoDto, RolDto } from './roles-permisos.types';

type TabKey = 'roles' | 'permisos';
type PermisosSubTabKey = 'catalogo' | 'asignacion';

@Component({
  selector: 'app-roles-permisos-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './roles-permisos-admin.component.html',
  styleUrls: ['./roles-permisos-admin.component.scss']
})
export class RolesPermisosAdminComponent implements OnInit {
  readonly permisoModuloOptions: Array<'admin' | 'public'> = ['admin', 'public'];
  readonly permisoEstadoOptions: Array<'todos' | 'activos' | 'inactivos'> = ['todos', 'activos', 'inactivos'];
  activeTab: TabKey = 'roles';
  permisosSubTab: PermisosSubTabKey = 'catalogo';
  loadingRoles = false;
  loadingPermisos = false;
  loadingRolPermisos = false;
  saving = false;
  deletingRolPermisos = false;
  searchRoles = '';
  searchPermisos = '';
  permisoEstadoFilter: 'todos' | 'activos' | 'inactivos' = 'todos';
  selectedRolId: number | null = null;
  selectedPermisoId: number | null = null;
  rolPermisos: PermisoDto[] = [];
  selectedRolPermisoIds = new Set<number>();
  selectedCatalogPermisoIds = new Set<number>();
  expandedGrupoPermisos = new Set<string>();
  collapsedGruposPermisosTab = new Set<string>();
  roles: RolDto[] = [];
  permisos: PermisoDto[] = [];
  roleForm: FormGroup;
  permisoForm: FormGroup;
  copyForm: FormGroup;
  deleteModalVisible = false;
  deleteModalTitle = 'Confirmar eliminación';
  deleteModalMessage = '';
  deleteErrorModalVisible = false;
  deleteErrorModalTitle = 'No se pudo eliminar';
  deleteErrorModalMessage = '';
  deleteErrorModalIcon = 'bi bi-exclamation-triangle-fill';
  permisoEstadoConfirmVisible = false;
  permisoEstadoConfirmTitle = 'Confirmar desactivación';
  permisoEstadoConfirmMessage = '';
  private permisoEstadoTarget: { id: number; nextEstado: 0 | 1 } | null = null;
  private deleteContext: { type: 'rol' | 'permiso' | 'rol-permiso'; id: number; rolId?: number; ids?: number[] } | null = null;
  private rolPermisosRequestCancel$ = new Subject<void>();
  private rolPermisosRequestSeq = 0;
  private rolPermisosLoadingTimeoutId: number | null = null;
  private rolPermisosLoadingHideTimeoutId: number | null = null;
  private rolPermisosLoadingStartedAt = 0;
  private readonly rolPermisosLoadingMinMs = 450;

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
      modulo: ['admin', [Validators.required]],
      estado_id: [1, [Validators.required]],
      es_menu: [0, [Validators.required]],
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

  get isBusy(): boolean {
    return this.loadingRoles || this.loadingPermisos || this.saving || this.deletingRolPermisos;
  }

  get visibleItemsCount(): number {
    if (this.activeTab === 'roles') {
      return this.filteredRoles.length;
    }
    if (this.permisosSubTab === 'catalogo') {
      return this.filteredPermisos.length;
    }
    return this.selectedRol ? this.rolPermisos.length : 0;
  }

  get busyLabel(): string {
    if (this.deletingRolPermisos) return 'Quitando permisos del rol...';
    if (this.saving) return 'Guardando cambios...';
    if (this.loadingRoles) return 'Cargando roles...';
    if (this.loadingPermisos) return 'Cargando permisos...';
    return 'Procesando...';
  }

  get heroTitle(): string {
    return this.activeTab === 'roles' ? 'Gestión de Roles' : 'Gestión de Permisos';
  }

  get heroSubtitle(): string {
    return 'Elegí Roles o Permisos para administrar sus elementos desde arriba.';
  }

  get heroSelectedRoleLabel(): string {
    if (this.activeTab !== 'roles') {
      return '';
    }
    if (!this.selectedRol) {
      return 'Rol seleccionado: ninguno';
    }
    const nombre = this.selectedRol.nombre || this.selectedRol.alias || 'Sin nombre';
    const alias = this.selectedRol.alias ? ` · ${this.selectedRol.alias}` : '';
    return `Rol seleccionado: ${nombre}${alias}`;
  }

  get copySourceRole(): RolDto | null {
    const sourceId = Number(this.copyForm.get('rolOrigenId')?.value || this.selectedRolId || 0);
    return this.roles.find((rol) => Number(rol?.id) === sourceId) || this.selectedRol;
  }

  get copyDestinationRole(): RolDto | null {
    const destinationId = Number(this.copyForm.get('rolDestinoId')?.value || 0);
    return this.roles.find((rol) => Number(rol?.id) === destinationId) || null;
  }

  get copyPreviewLabel(): string {
    const origen = this.copySourceRole;
    const destino = this.copyDestinationRole;
    if (!origen && !destino) return 'Seleccione origen y destino para continuar.';
    if (!origen) return 'Seleccione el rol origen.';
    if (!destino) return 'Seleccione el rol destino.';
    return `${origen.nombre || origen.alias || 'Rol origen'} → ${destino.nombre || destino.alias || 'Rol destino'}`;
  }

  get canCopyPermisos(): boolean {
    const origen = this.copySourceRole;
    const destino = this.copyDestinationRole;
    return !!origen?.id && !!destino?.id && Number(origen.id) !== Number(destino.id);
  }

  get filteredRoles(): RolDto[] {
    const q = String(this.searchRoles || '').trim().toLowerCase();
    const list = [...this.roles].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
    if (!q) return list;
    return list.filter((rol) => [rol.nombre, rol.alias, rol.descripcion].filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  get filteredPermisos(): PermisoDto[] {
    const q = String(this.searchPermisos || '').trim().toLowerCase();
    const estadoFilter = String(this.permisoEstadoFilter || 'todos');
    const list = [...this.permisos].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
    return list.filter((permiso) => {
      const permisoEstado = this.permisoEstadoId(permiso);
      if (estadoFilter === 'activos' && permisoEstado !== 1) return false;
      if (estadoFilter === 'inactivos' && permisoEstado !== 0) return false;
      if (!q) return true;
      return [permiso.nombre, permiso.alias, permiso.descripcion, permiso.grupo, permiso.modulo].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
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

  get rolPermisosSelectedCount(): number {
    return this.selectedRolPermisoIds.size;
  }

  get rolPermisosSelectedRemovableCount(): number {
    return Array.from(this.selectedRolPermisoIds).filter((id) => this.isRolPermisoRemovable(id)).length;
  }

  get groupedFilteredPermisos(): Array<{ grupo: string; modulo: string; permisos: PermisoDto[] }> {
    const grupos = new Map<string, PermisoDto[]>();
    for (const permiso of this.filteredPermisos) {
      const grupo = String(permiso?.grupo || '').trim() || 'Sin grupo';
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo)!.push(permiso);
    }
    return Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .map(([grupo, permisos]) => ({
        grupo,
        modulo: String(permisos.find((p) => String(p?.modulo || '').trim())?.modulo || '').trim(),
        permisos
      }));
  }

  isPermisoGroupExpanded(grupo: string): boolean {
    const key = String(grupo || 'Sin grupo').trim() || 'Sin grupo';
    if (String(this.searchPermisos || '').trim()) return true;
    return this.collapsedGruposPermisosTab.has(key);
  }

  togglePermisoGroup(grupo: string): void {
    const key = String(grupo || 'Sin grupo').trim() || 'Sin grupo';
    if (this.collapsedGruposPermisosTab.has(key)) {
      this.collapsedGruposPermisosTab.delete(key);
    } else {
      this.collapsedGruposPermisosTab.add(key);
    }
    this.collapsedGruposPermisosTab = new Set(this.collapsedGruposPermisosTab);
  }

  rolIcon(rol: RolDto | null | undefined): string {
    const alias = String(rol?.alias || '').trim().toLowerCase();
    if (alias === 'super_administrador') return 'bi-shield-fill-check';
    if (alias.includes('admin')) return 'bi-person-gear';
    if (alias.includes('super') || alias.includes('seguridad')) return 'bi-shield-lock-fill';
    if (alias.includes('contad') || alias.includes('financ') || alias.includes('tesor')) return 'bi-cash-coin';
    if (alias.includes('rrhh') || alias.includes('recurso') || alias.includes('emplead')) return 'bi-people-fill';
    if (alias.includes('sueldo') || alias.includes('nomina') || alias.includes('pago')) return 'bi-wallet2';
    if (alias.includes('report') || alias.includes('consulta') || alias.includes('lectura')) return 'bi-clipboard-data-fill';
    if (alias.includes('edita') || alias.includes('oper')) return 'bi-pencil-fill';
    if (alias.includes('sistema') || alias.includes('tecnic') || alias.includes('soporte')) return 'bi-gear-fill';
    return 'bi-person-badge-fill';
  }

  rolIconFromAlias(alias: string | null | undefined): string {
    return this.rolIcon({ alias: String(alias || '') } as RolDto);
  }

  rolPermisosCount(rol: RolDto | null | undefined): number {
    const directCount = Number(
      (rol as any)?.permisos_count
      ?? (rol as any)?.permisosCount
      ?? (rol as any)?.total_permisos
      ?? (rol as any)?.totalPermisos
      ?? (rol as any)?.cantidad_permisos
      ?? (rol as any)?.cantidadPermisos
    );
    if (Number.isFinite(directCount) && directCount >= 0) {
      return directCount;
    }
    return Array.isArray(rol?.permisos) ? rol.permisos.length : 0;
  }

  permisoIconFromForm(grupo: any, modulo: any, alias: any): string {
    return this.permisoIcon({ grupo, modulo, alias } as PermisoDto);
  }

  permisoIcon(permiso: PermisoDto | null | undefined): string {
    const texto = [permiso?.grupo, permiso?.modulo, permiso?.alias, permiso?.nombre]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/sueldo|nomina|pago|liquid/.test(texto)) return 'bi-wallet2';
    if (/emplead|rrhh|recurso|personal/.test(texto)) return 'bi-people-fill';
    if (/rol|permiso|perfil|seguridad|acceso|admin/.test(texto)) return 'bi-shield-lock-fill';
    if (/report|consulta|reporte|dashboard|indicador/.test(texto)) return 'bi-clipboard-data-fill';
    if (/factur|cobro|pago|cuenta/.test(texto)) return 'bi-receipt-cutoff';
    if (/config|parametro|general|sistema/.test(texto)) return 'bi-gear-fill';
    if (/menu|navegacion/.test(texto)) return 'bi-list-nested';
    if (/seguridad|cuenta/.test(texto)) return 'bi-person-lock';
    if (/abm|edita|alta|baja|modifica/.test(texto)) return 'bi-pencil-square';
    return 'bi-key-fill';
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

  get currentRolTitle(): string {
    if (this.selectedRolId) {
      const selected = this.selectedRol;
      if (selected) {
        return String(selected.nombre || selected.alias || 'Rol seleccionado').trim();
      }
    }

    const raw = this.roleForm.getRawValue();
    const nombre = String(raw?.nombre || '').trim();
    const alias = String(raw?.alias || '').trim();
    if (nombre) return nombre;
    if (alias) return alias;
    return 'Nuevo rol';
  }

  get currentRolHeaderTitle(): string {
    const selected = this.selectedRol;
    if (selected) {
      return String(selected.nombre || selected.alias || 'Rol seleccionado').trim();
    }

    return this.currentRolTitle;
  }

  get currentRolHeaderIcon(): string {
    const selected = this.selectedRol;
    if (selected) {
      return this.rolIcon(selected);
    }

    return this.rolIconFromAlias(this.roleForm.get('alias')?.value);
  }

  get currentPermisoTitle(): string {
    const raw = this.permisoForm.getRawValue();
    const nombre = String(raw?.nombre || '').trim();
    const alias = String(raw?.alias || '').trim();
    if (nombre) return nombre;
    if (alias) return alias;
    return 'Nuevo permiso';
  }

  get currentPermisoModuloLabel(): string {
    return String(this.permisoForm.get('modulo')?.value || '').trim() || 'Sin módulo';
  }

  get currentPermisoEstadoLabel(): string {
    return Number(this.permisoForm.get('estado_id')?.value || 0) === 1 ? 'Activo' : 'Inactivo';
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
    const estadoId = Number(effective?.estado_id ?? effective?.estado ?? effective?.estadoId ?? 1) === 1 ? 1 : 0;

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
      es_menu: Boolean(effective?.es_menu ?? effective?.esMenu ?? false),
      estado_id: estadoId,
      estado: estadoId
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
        if (this.selectedRolId && !Number(this.copyForm.get('rolOrigenId')?.value || 0)) {
          this.copyForm.patchValue({ rolOrigenId: this.selectedRolId }, { emitEvent: false });
        }
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron cargar los roles'))
    });
  }

  loadPermisos(showLoading = true): void {
    if (showLoading) {
      this.loadingPermisos = true;
    }
    this.svc.listPermisos().pipe(finalize(() => { this.loadingPermisos = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        this.permisos = this.extractList<PermisoDto>(res?.data ?? res, ['permisos', 'items', 'result']).map((permiso: any) => this.normalizePermisoPayload(permiso));
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron cargar los permisos'))
    });
  }

  loadRolPermisos(showLoading = true): void {
    const rolId = Number(this.selectedRolId || 0);
    if (!rolId) {
      this.rolPermisos = [];
      this.selectedRolPermisoIds = new Set<number>();
      this.loadingRolPermisos = false;
      this.clearRolPermisosLoadingTimeout();
      this.clearRolPermisosLoadingHideTimeout();
      try { this.cdr.detectChanges(); } catch {}
      return;
    }

    this.rolPermisosRequestCancel$.next();
    const requestSeq = ++this.rolPermisosRequestSeq;
    const shouldShowLoading = showLoading;
    if (shouldShowLoading) {
      this.loadingRolPermisos = true;
      this.rolPermisosLoadingStartedAt = Date.now();
    }
    this.rolPermisos = [];
    this.clearRolPermisosLoadingTimeout();
    this.clearRolPermisosLoadingHideTimeout();
    if (shouldShowLoading) {
      this.rolPermisosLoadingTimeoutId = window.setTimeout(() => {
        if (requestSeq !== this.rolPermisosRequestSeq) return;
        if (!this.loadingRolPermisos) return;
        this.toast.warning('La carga de permisos del rol está tardando demasiado.');
        try { this.cdr.detectChanges(); } catch {}
      }, 10000);
    }
    this.svc.getPermisosByRol(rolId).pipe(
      takeUntil(this.rolPermisosRequestCancel$),
      timeout({ first: 15000 }),
      finalize(() => {
        this.clearRolPermisosLoadingTimeout();
        if (shouldShowLoading && requestSeq === this.rolPermisosRequestSeq) {
          const elapsed = Date.now() - this.rolPermisosLoadingStartedAt;
          const delay = Math.max(0, this.rolPermisosLoadingMinMs - elapsed);
          this.clearRolPermisosLoadingHideTimeout();
          this.rolPermisosLoadingHideTimeoutId = window.setTimeout(() => {
            if (requestSeq !== this.rolPermisosRequestSeq) return;
            this.loadingRolPermisos = false;
            try { this.cdr.detectChanges(); } catch {}
          }, delay);
        } else if (!shouldShowLoading && requestSeq === this.rolPermisosRequestSeq) {
          this.loadingRolPermisos = false;
        }
        try { this.cdr.detectChanges(); } catch {}
      })
    ).subscribe({
      next: (res) => {
        if (requestSeq !== this.rolPermisosRequestSeq) return;
        if (shouldShowLoading && !this.loadingRolPermisos) return;
        const data = (res?.data ?? res ?? {}) as { rol?: unknown; permisos?: unknown[] };
        const permisos = Array.isArray(data.permisos) ? data.permisos : [];
        this.rolPermisos = permisos.map((permiso: any) => this.normalizePermisoPayload(permiso));
        this.selectedRolPermisoIds = new Set<number>();
      },
      error: (err) => {
        if (requestSeq !== this.rolPermisosRequestSeq) return;
        this.rolPermisos = [];
        this.selectedRolPermisoIds = new Set<number>();
        this.toast.error(this.mapError(err, 'No se pudieron cargar los permisos del rol'));
      }
    });
  }

  private clearRolPermisosLoadingTimeout(): void {
    if (this.rolPermisosLoadingTimeoutId !== null) {
      window.clearTimeout(this.rolPermisosLoadingTimeoutId);
      this.rolPermisosLoadingTimeoutId = null;
    }
  }

  private clearRolPermisosLoadingHideTimeout(): void {
    if (this.rolPermisosLoadingHideTimeoutId !== null) {
      window.clearTimeout(this.rolPermisosLoadingHideTimeoutId);
      this.rolPermisosLoadingHideTimeoutId = null;
    }
  }

  selectRol(rol: RolDto): void {
    this.selectedRolId = rol?.id ?? null;
    this.roleForm.reset({ id: rol?.id ?? null, nombre: rol?.nombre ?? '', alias: rol?.alias ?? '', descripcion: rol?.descripcion ?? '' });
    this.selectedRolPermisoIds = new Set<number>();
    this.selectedPermisoIds = new Set<number>();
    this.copyForm.patchValue({ rolOrigenId: rol?.id ?? null }, { emitEvent: false });
    if (Number(this.copyForm.get('rolDestinoId')?.value || 0) === Number(rol?.id || 0)) {
      this.copyForm.patchValue({ rolDestinoId: null }, { emitEvent: false });
    }
    this.loadRolPermisos();
  }

  openPermisosCatalogo(): void {
    this.activeTab = 'permisos';
    this.permisosSubTab = 'catalogo';
  }

  openNuevoPermiso(): void {
    this.openPermisosCatalogo();
    this.newPermiso();
  }

  showRolesTab(): void {
    this.activeTab = 'roles';
    this.permisosSubTab = 'catalogo';
  }

  showPermisosTab(): void {
    this.activeTab = 'permisos';
    this.permisosSubTab = 'catalogo';
  }

  openAsignacionMasivaForRol(rol: RolDto): void {
    this.selectRol(rol);
    this.activeTab = 'permisos';
    this.permisosSubTab = 'asignacion';
  }

  selectPermiso(permiso: PermisoDto): void {
    this.selectedPermisoId = permiso?.id ?? null;
    this.permisoForm.reset({
      id: permiso?.id ?? null,
      nombre: permiso?.nombre ?? '',
      alias: permiso?.alias ?? '',
      descripcion: permiso?.descripcion ?? '',
      modulo: permiso?.modulo ?? 'admin',
      estado_id: this.permisoEstadoId(permiso) ? 1 : 0,
      es_menu: this.permisoEsMenu(permiso),
      grupo: permiso?.grupo ?? ''
    });
  }

  newRol(): void {
    this.selectedRolId = null;
    this.roleForm.reset({ id: null, nombre: '', alias: '', descripcion: '' });
    this.rolPermisos = [];
    this.selectedRolPermisoIds = new Set<number>();
  }

  newPermiso(): void {
    this.permisoForm.reset({ id: null, nombre: '', alias: '', descripcion: '', modulo: 'admin', estado_id: 1, es_menu: 0, grupo: '' });
    this.selectedPermisoId = null;
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
        if (!this.ok(res, raw.id ? 'Rol actualizado' : 'Rol creado')) return;
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
      this.toast.error('Complete nombre, alias y módulo antes de guardar el permiso');
      return;
    }

    const raw = this.permisoForm.getRawValue();
    const modulo = String(raw.modulo || '').trim().toLowerCase();
    if (modulo !== 'admin' && modulo !== 'public') {
      this.toast.error('El módulo debe ser admin o public');
      return;
    }
    const estadoId = Number(raw.estado_id ?? 1) === 1 ? 1 : 0;
    const alias = String(raw.alias || '').trim().toLowerCase();
    if (alias === 'permisos_abm' && estadoId === 0) {
      this.toast.error('No se puede desactivar el permiso permisos_abm desde la interfaz');
      return;
    }
    const payload = {
      nombre: String(raw.nombre || '').trim(),
      alias: String(raw.alias || '').trim(),
      descripcion: String(raw.descripcion || '').trim() || null,
      modulo,
      grupo: String(raw.grupo || '').trim() || null,
      estado: estadoId,
      es_menu: Number(raw.es_menu) === 1 ? 1 : 0
    };

    if (this.isDuplicatePermisoAlias(payload.alias, raw.id)) {
      this.toast.error('El alias del permiso ya existe');
      return;
    }

    this.saving = true;
    const req = raw.id ? this.svc.updatePermiso(Number(raw.id), payload) : this.svc.createPermiso(payload);
    req.pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        if (!this.ok(res, raw.id ? 'Permiso actualizado' : 'Permiso creado')) return;
        const savedPermiso = this.normalizePermisoPayload(res?.data ?? res);
        if (savedPermiso?.id) {
          this.upsertPermisoInCollections(savedPermiso);
        }
        this.loadPermisos(false);
        this.loadRolPermisos(false);
        this.newPermiso();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudo guardar el permiso'))
    });
  }

  private upsertPermisoInCollections(permiso: PermisoDto): void {
    const id = Number(permiso?.id || 0);
    if (!id) return;
    const nextPermisos = this.permisos.map((item) => Number(item?.id) === id ? { ...item, ...permiso } : item);
    if (!nextPermisos.some((item) => Number(item?.id) === id)) {
      nextPermisos.unshift(permiso);
    }
    this.permisos = nextPermisos;
    this.rolPermisos = this.rolPermisos.map((item) => Number(item?.id) === id ? { ...item, ...permiso } : item);
  }

  permisoEsMenu(permiso: PermisoDto | null | undefined): 0 | 1 {
    const raw = permiso?.es_menu ?? (permiso as any)?.esMenu ?? (permiso as any)?.es_menu_id;
    return Number(raw) === 1 || raw === true ? 1 : 0;
  }

  permisoEsMenuLabel(permiso: PermisoDto | null | undefined): string {
    return this.permisoEsMenu(permiso) === 1 ? 'Sí' : 'No';
  }

  permisoEstadoId(permiso: PermisoDto | null | undefined): 0 | 1 {
    return Number(permiso?.estado_id ?? permiso?.estado ?? 1) === 1 ? 1 : 0;
  }

  permisoEstadoLabel(permiso: PermisoDto | null | undefined): string {
    return this.permisoEstadoId(permiso) === 1 ? 'Activo' : 'Inactivo';
  }

  togglePermisoEstado(permiso: PermisoDto): void {
    const id = Number(permiso?.id || 0);
    if (!id || this.saving) return;

    const current = this.permisoEstadoId(permiso);
    const next = current === 1 ? 0 : 1;
    if (next === 0) {
      if (String(permiso?.alias || '').trim().toLowerCase() === 'permisos_abm') {
        this.toast.error('No se puede desactivar el permiso permisos_abm desde la interfaz');
        return;
      }
      this.permisoEstadoTarget = { id, nextEstado: next };
      this.permisoEstadoConfirmTitle = 'Confirmar desactivación';
      this.permisoEstadoConfirmMessage = `¿Desactivar el permiso <strong>${permiso?.nombre || permiso?.alias || 'seleccionado'}</strong>?<br>Esto afectará a todos los roles que tengan este permiso.`;
      this.permisoEstadoConfirmVisible = true;
      return;
    }

    this.applyPermisoEstadoChange(id, next);
  }

  onPermisoEstadoConfirmClose(confirmado: boolean): void {
    this.permisoEstadoConfirmVisible = false;
    const ctx = this.permisoEstadoTarget;
    this.permisoEstadoTarget = null;
    if (!confirmado || !ctx) return;
    this.applyPermisoEstadoChange(ctx.id, ctx.nextEstado);
  }

  private applyPermisoEstadoChange(id: number, nextEstado: 0 | 1): void {
    if (!id || this.saving) return;
    this.saving = true;
    this.svc.updatePermiso(id, { estado: nextEstado }).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        if (!this.ok(res, nextEstado === 1 ? 'Permiso activado' : 'Permiso desactivado')) return;
        this.loadPermisos();
        this.loadRolPermisos();
        if (this.selectedPermisoId === id) {
          this.permisoForm.patchValue({ estado_id: nextEstado }, { emitEvent: false });
        }
      },
      error: (err) => {
        this.showDeleteErrorModal(nextEstado === 1 ? 'No se pudo activar el permiso' : 'No se pudo desactivar el permiso', err, 'bi bi-exclamation-triangle-fill');
      }
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
        if (!this.ok(res, 'Permiso asignado')) return;
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudo asignar el permiso'))
    });
  }

  bulkSearch = '';
  bulkFilter: 'todos' | 'sin' | 'con' = 'con';
  bulkCollapsed = new Set<string>();

  isAssignedToSelectedRol(permiso: PermisoDto | null | undefined): boolean {
    const id = Number(permiso?.id || 0);
    if (!id) return false;
    return this.rolPermisos.some((p) => Number(p?.id) === id);
  }

  get bulkRolId(): number {
    return Number(this.selectedRolId || 0);
  }

  get bulkHasRol(): boolean {
    return this.bulkRolId > 0;
  }

  get bulkAsignadoIds(): Set<number> {
    return new Set(this.rolPermisos.map((permiso) => Number(permiso.id)).filter((id) => id > 0));
  }

  get bulkPermisosBase(): PermisoDto[] {
    const q = String(this.bulkSearch || '').trim().toLowerCase();
    const asignados = this.bulkAsignadoIds;
    const base = this.permisos.filter((permiso) => {
      if (this.bulkFilter === 'sin' && asignados.has(Number(permiso.id))) return false;
      if (this.bulkFilter === 'con' && !asignados.has(Number(permiso.id))) return false;
      if (!q) return true;
      return [permiso.nombre, permiso.alias, permiso.descripcion, permiso.grupo, permiso.modulo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    return [...base].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
  }

  get bulkGroups(): Array<{ grupo: string; permisos: PermisoDto[] }> {
    const map = new Map<string, PermisoDto[]>();
    for (const permiso of this.bulkPermisosBase) {
      const grupo = String(permiso?.grupo || '').trim() || 'Sin grupo';
      if (!map.has(grupo)) map.set(grupo, []);
      map.get(grupo)!.push(permiso);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .map(([grupo, permisos]) => ({ grupo, permisos }));
  }

  isBulkGroupExpanded(grupo: string): boolean {
    const key = this.bulkKey(grupo);
    if (String(this.bulkSearch || '').trim()) return true;
    return this.bulkCollapsed.has(key);
  }

  toggleBulkGroup(grupo: string): void {
    const key = this.bulkKey(grupo);
    if (this.bulkCollapsed.has(key)) this.bulkCollapsed.delete(key);
    else this.bulkCollapsed.add(key);
    this.bulkCollapsed = new Set(this.bulkCollapsed);
  }

  bulkSelectedInGroup(grupo: string): { total: number; selected: number } {
    const items = this.bulkGroups.find((g) => this.bulkKey(g.grupo) === this.bulkKey(grupo))?.permisos || [];
    const total = items.length;
    const selected = items.filter((p) => this.selectedPermisoIds.has(Number(p.id))).length;
    return { total, selected };
  }

  isBulkGroupChecked(grupo: string): boolean {
    const { total, selected } = this.bulkSelectedInGroup(grupo);
    return total > 0 && selected === total;
  }

  isBulkGroupIndeterminate(grupo: string): boolean {
    const { total, selected } = this.bulkSelectedInGroup(grupo);
    return selected > 0 && selected < total;
  }

  toggleBulkGroupSelection(grupo: string, checked: boolean): void {
    const items = this.bulkGroups.find((g) => this.bulkKey(g.grupo) === this.bulkKey(grupo))?.permisos || [];
    const next = new Set(this.selectedPermisoIds);
    for (const permiso of items) {
      const id = Number(permiso.id);
      if (!id) continue;
      if (checked) next.add(id);
      else next.delete(id);
    }
    this.selectedPermisoIds = next;
  }

  toggleAllBulkPermisos(checked: boolean): void {
    const next = new Set(this.selectedPermisoIds);
    for (const grupo of this.bulkGroups) {
      for (const permiso of grupo.permisos) {
        const id = Number(permiso.id);
        if (!id) continue;
        if (checked) next.add(id);
        else next.delete(id);
      }
    }
    this.selectedPermisoIds = next;
  }

  get bulkSelectedCount(): number {
    return this.selectedPermisoIds.size;
  }

  get bulkToAssignCount(): number {
    const asignados = this.bulkAsignadoIds;
    return Array.from(this.selectedPermisoIds).filter((id) => !asignados.has(id)).length;
  }

  get bulkToRemoveCount(): number {
    const asignados = this.bulkAsignadoIds;
    return Array.from(this.selectedPermisoIds).filter((id) => asignados.has(id)).length;
  }

  clearBulkSelection(): void {
    this.selectedPermisoIds = new Set<number>();
  }

  private bulkKey(grupo: string): string {
    return String(grupo || 'Sin grupo').trim() || 'Sin grupo';
  }

  assignManySelected(): void {
    const rolId = this.bulkRolId;
    if (!rolId) return;
    const asignados = this.bulkAsignadoIds;
    const ids = Array.from(this.selectedPermisoIds).filter((id) => id > 0 && !asignados.has(id));
    if (!ids.length) {
      this.toast.warning('No hay permisos nuevos seleccionados para asignar');
      return;
    }
    this.saving = true;
    this.svc.addPermisosMasivo(rolId, ids).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        if (!this.ok(res, 'Permisos asignados')) return;
        this.selectedPermisoIds = new Set<number>();
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron asignar los permisos'))
    });
  }

  removeManySelected(): void {
    const rolId = this.bulkRolId;
    if (!rolId) return;
    const asignados = this.bulkAsignadoIds;
    const ids = Array.from(this.selectedPermisoIds).filter((id) => id > 0 && asignados.has(id));
    if (!ids.length) {
      this.toast.warning('No hay permisos asignados seleccionados para quitar');
      return;
    }
    this.confirmDelete('rol-permiso', ids[0], rolId, `¿Quitar ${ids.length} permiso(s) del rol ${this.selectedRol?.nombre || ''}?`);
  }

  replacePermisos(): void {
    const rolId = this.bulkRolId;
    if (!rolId) return;
    const ids = Array.from(this.selectedPermisoIds).filter((id) => id > 0);
    this.saving = true;
    this.svc.replacePermisos(rolId, ids).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        if (!this.ok(res, 'Permisos reemplazados')) return;
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron reemplazar los permisos'))
    });
  }

  openCopyAction(): void {
    const origen = this.copyForm.get('rolOrigenId')?.value || this.selectedRolId;
    const destino = this.copyForm.get('rolDestinoId')?.value;
    if (!origen || !destino || Number(origen) === Number(destino)) {
      this.toast.error('Seleccione dos roles distintos');
      return;
    }
    this.saving = true;
    this.svc.copiarPermisos({ rolOrigenId: Number(origen), rolDestinoId: Number(destino) }).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        if (!this.ok(res, 'Permisos copiados')) return;
        this.loadRoles();
        this.loadRolPermisos();
      },
      error: (err) => this.toast.error(this.mapError(err, 'No se pudieron copiar los permisos'))
    });
  }

  toggleCatalogPermisoSelection(permisoId: number): void {
    const id = Number(permisoId || 0);
    if (!id) return;
    if (this.selectedCatalogPermisoIds.has(id)) {
      this.selectedCatalogPermisoIds.delete(id);
    } else {
      this.selectedCatalogPermisoIds.add(id);
    }
    this.selectedCatalogPermisoIds = new Set(this.selectedCatalogPermisoIds);
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

  isCatalogPermisoSelected(id: number): boolean {
    return this.selectedCatalogPermisoIds.has(Number(id));
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
    this.deleteModalTitle = type === 'permiso' ? 'Eliminar permiso' : 'Confirmar eliminación';
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
      this.saving = true;
      this.svc.deleteRol(ctx.id).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
        next: (res) => {
                if (!this.ok(res, 'Rol eliminado')) return;
                this.saving = false;
                try { this.cdr.detectChanges(); } catch {}
                this.loadRoles();
              },
        error: (err) => {
          this.saving = false;
          try { this.cdr.detectChanges(); } catch {}
          this.showDeleteErrorModal('No se pudo eliminar el rol', err, 'bi bi-trash3-fill');
        }
      });
      return;
    }

    if (ctx.type === 'permiso') {
      this.saving = true;
      this.svc.deletePermiso(ctx.id).pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
        next: (res) => {
                if (!this.ok(res, 'Permiso eliminado')) return;
                this.saving = false;
                try { this.cdr.detectChanges(); } catch {}
                this.loadPermisos();
              },
        error: (err) => {
          this.saving = false;
          try { this.cdr.detectChanges(); } catch {}
          this.showDeleteErrorModal('No se pudo eliminar el permiso', err, 'bi bi-trash3-fill');
        }
      });
      return;
    }

    const rolId = Number(ctx.rolId || this.selectedRolId || 0);
    if (!rolId) return;
    const ids = Array.from(new Set(ctx.ids && ctx.ids.length ? ctx.ids : (this.selectedRolPermisoIds.size ? Array.from(this.selectedRolPermisoIds) : [ctx.id]))).filter((value) => Number(value) > 0 && this.isRolPermisoRemovable(Number(value)));
    this.deletingRolPermisos = true;
    this.svc.removePermisosMasivo(rolId, ids).pipe(finalize(() => { this.deletingRolPermisos = false; try { this.cdr.detectChanges(); } catch {} })).subscribe({
      next: (res) => {
        if (!this.ok(res, 'Permisos quitados')) return;
        this.selectedRolPermisoIds = new Set<number>();
        window.setTimeout(() => this.loadRolPermisos(), 0);
      },
      error: (err) => {
        this.showDeleteErrorModal('No se pudieron quitar los permisos', err, 'bi bi-dash-circle-fill');
      }
    });
  }

  removePermisoFromRol(permiso: PermisoDto): void {
    const rolId = Number(this.selectedRolId || 0);
    const permisoId = Number(permiso?.id || 0);
    if (!rolId || !permisoId) return;
    this.confirmDelete('rol-permiso', permisoId, rolId, `¿Quitar el permiso ${permiso?.nombre || ''} del rol ${this.selectedRol?.nombre || ''}?`);
  }

  isRolPermisoSelected(id: number): boolean {
    return this.selectedRolPermisoIds.has(Number(id));
  }

  toggleRolPermisoSelection(permisoId: number): void {
    const id = Number(permisoId || 0);
    if (!id) return;
    if (this.selectedRolPermisoIds.has(id)) {
      this.selectedRolPermisoIds.delete(id);
    } else {
      this.selectedRolPermisoIds.add(id);
    }
    this.selectedRolPermisoIds = new Set(this.selectedRolPermisoIds);
  }

  clearRolPermisoSelection(): void {
    this.selectedRolPermisoIds = new Set<number>();
  }

  rolPermisosGroupSelected(grupo: string): { total: number; selected: number; removable: number } {
    const items = this.groupedRolPermisos.find((g) => this.bulkKey(g.grupo) === this.bulkKey(grupo))?.permisos || [];
    const ids = items.map((permiso) => Number(permiso.id)).filter((id) => id > 0);
    const selected = ids.filter((id) => this.selectedRolPermisoIds.has(id)).length;
    const removable = ids.filter((id) => this.selectedRolPermisoIds.has(id) && this.isRolPermisoRemovable(id)).length;
    return { total: ids.length, selected, removable };
  }

  isRolPermisosGroupChecked(grupo: string): boolean {
    const { total, selected } = this.rolPermisosGroupSelected(grupo);
    return total > 0 && selected === total;
  }

  isRolPermisosGroupIndeterminate(grupo: string): boolean {
    const { total, selected } = this.rolPermisosGroupSelected(grupo);
    return selected > 0 && selected < total;
  }

  toggleRolPermisosGroupSelection(grupo: string, checked: boolean): void {
    const items = this.groupedRolPermisos.find((g) => this.bulkKey(g.grupo) === this.bulkKey(grupo))?.permisos || [];
    const next = new Set(this.selectedRolPermisoIds);
    for (const permiso of items) {
      const id = Number(permiso.id);
      if (!id) continue;
      if (checked) next.add(id);
      else next.delete(id);
    }
    this.selectedRolPermisoIds = next;
  }

  removeSelectedRolPermisos(): void {
    const rolId = Number(this.selectedRolId || 0);
    if (!rolId) return;
    const ids = Array.from(this.selectedRolPermisoIds).filter((id) => this.isRolPermisoRemovable(id));
    if (!ids.length) {
      this.toast.warning('Seleccione permisos del rol para quitar');
      return;
    }
    this.deleteContext = { type: 'rol-permiso', id: ids[0], rolId, ids };
    this.deleteModalTitle = 'Confirmar eliminación';
    this.deleteModalMessage = `¿Quitar ${ids.length} permiso(s) del rol ${this.selectedRol?.nombre || ''}?`;
    this.deleteModalVisible = true;
  }

  removeRolPermisosByGroup(grupo: string): void {
    const rolId = Number(this.selectedRolId || 0);
    if (!rolId) return;
    const items = this.groupedRolPermisos.find((g) => this.bulkKey(g.grupo) === this.bulkKey(grupo))?.permisos || [];
    const ids = items.map((permiso) => Number(permiso.id)).filter((id) => id > 0 && this.isRolPermisoRemovable(id));
    if (!ids.length) {
      this.toast.warning('No hay permisos removibles en este grupo');
      return;
    }
    this.deleteContext = { type: 'rol-permiso', id: ids[0], rolId, ids };
    this.deleteModalTitle = 'Confirmar eliminación';
    this.deleteModalMessage = `¿Quitar ${ids.length} permiso(s) del grupo ${grupo} del rol ${this.selectedRol?.nombre || ''}?`;
    this.deleteModalVisible = true;
  }

  selectAllFilteredPermisos(checked: boolean): void {
    if (!checked) {
      this.selectedCatalogPermisoIds.clear();
      this.selectedCatalogPermisoIds = new Set(this.selectedCatalogPermisoIds);
      return;
    }

    this.selectedCatalogPermisoIds = new Set(this.filteredPermisos.map((permiso) => Number(permiso.id)).filter((id) => id > 0));
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

  private isRolPermisoRemovable(id: number): boolean {
    return !this.isProtectedPermiso(this.rolPermisos.find((permiso) => Number(permiso.id) === Number(id)));
  }

  private isDuplicateRolAlias(alias: string, currentId: any): boolean {
    const normalized = String(alias || '').trim().toLowerCase();
    return this.roles.some((rol) => Number(rol.id) !== Number(currentId) && String(rol.alias || '').trim().toLowerCase() === normalized);
  }

  private isDuplicatePermisoAlias(alias: string, currentId: any): boolean {
    const normalized = String(alias || '').trim().toLowerCase();
    return this.permisos.some((permiso) => Number(permiso.id) !== Number(currentId) && String(permiso.alias || '').trim().toLowerCase() === normalized);
  }

  private ok(res: any, fallback: string): boolean {
    const mensaje = String(res?.message || res?.error || '').trim();
    if (res && typeof res === 'object' && 'success' in res && !res.success) {
      this.toast.error(mensaje || `${fallback}: el servidor rechazó la operación`);
      return false;
    }
    if (/nan|undefined|null|expected number/i.test(mensaje)) {
      this.toast.error(mensaje);
      return false;
    }
    this.toast.success(mensaje || fallback);
    return true;
  }

  private mapError(err: any, fallback: string): string {
    const message = err?.error?.message || err?.error?.error || err?.message || fallback;
    const status = Number(err?.status ?? 0);
    if (status === 403) return '403 Forbidden: no tiene permisos para realizar esta operación';
    if (status === 409) return String(message || 'Conflicto de datos');
    return String(message || fallback);
  }

  private showDeleteErrorModal(title: string, err: any, icon: string): void {
    this.deleteErrorModalTitle = title;
    this.deleteErrorModalMessage = this.mapError(err, title);
    this.deleteErrorModalIcon = icon;
    this.deleteErrorModalVisible = true;
  }

  closeDeleteErrorModal(): void {
    this.deleteErrorModalVisible = false;
  }
}
