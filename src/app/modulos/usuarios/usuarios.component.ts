import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subject, debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { EmpresaService } from '../../core/empresa.service';
import { UsuariosService } from './usuarios.service';
import { Empresa, Rol, Usuario, UsuariosListParams } from './usuarios.types';

type PendingAction = 'activar' | 'desactivar' | 'desbloquear' | 'eliminar' | null;

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './usuarios.component.html',
  styleUrls: ['./usuarios.component.scss']
})
export class UsuariosComponent implements OnInit {
  usuarios: Usuario[] = [];
  empresas: Empresa[] = [];
  roles: Rol[] = [];
  loading = true;
  loadingCatalogos = false;
  error = '';
  search = '';
  empresaIdFiltro: number | null = null;
  rolIdFiltro: number | null = null;
  estadoFiltro: number | null = null;
  page = 1;
  limit = 10;
  total = 0;
  totalPages = 0;
  pendingAction: PendingAction = null;
  pendingUser: Usuario | null = null;
  confirmVisible = false;
  confirmTitle = '';
  confirmMessage = '';
  confirmIcon = 'bi bi-exclamation-triangle-fill';
  confirmAccentColor = '#d32f2f';
  confirmButtonColor = '#d32f2f';
  confirmSpinner = false;
  confirmSpinnerText = 'Procesando...';
  private readonly search$ = new Subject<string>();

  constructor(
    private readonly usuariosSvc: UsuariosService,
    private readonly empresasSvc: EmpresaService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly loadingService: LoadingService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setupSearch();
    this.setDefaultEmpresaFiltro();
    this.cargarCatalogos();
    this.cargarUsuarios(1);
  }

  get canCreate(): boolean { return this.hasPerm('usuarios_crear'); }
  get canEdit(): boolean { return this.hasPerm('usuarios_editar'); }
  get canChangeStatus(): boolean { return this.hasPerm('usuarios_baja'); }
  get canResetPassword(): boolean { return this.hasPerm('usuarios_reset_password'); }
  get canUnlock(): boolean { return this.hasPerm('usuarios_desbloquear'); }
  get canViewModule(): boolean { return this.hasAnyUsersPerm(); }
  get canChangeEmpresa(): boolean { return this.auth.isSuperAdmin() || this.hasPerm('usuarios_cambiar_empresa') || this.hasPerm('usuarios_empresa'); }

  get filtrosActivosCount(): number {
    return [this.search, this.empresaIdFiltro, this.rolIdFiltro, this.estadoFiltro]
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length;
  }

  get estadoLabelSeleccionado(): string {
    return this.estadoFiltro === null ? 'Todos' : (this.estadoFiltro === 1 ? 'Activo' : 'Inactivo');
  }

  onSearchInput(value: string): void {
    this.search = value;
    this.search$.next(value || '');
  }

  onEmpresaChange(value: string | number | null): void {
    const empresaId = this.toNumberOrNull(value);
    this.empresaIdFiltro = empresaId;
    this.rolIdFiltro = null;
    this.cargarRoles(empresaId);
    this.cargarUsuarios(1);
  }

  onRolChange(value: string | number | null): void {
    this.rolIdFiltro = this.toNumberOrNull(value);
    this.cargarUsuarios(1);
  }

  onEstadoChange(value: string | number | null): void {
    const estado = this.toNumberOrNull(value);
    this.estadoFiltro = estado;
    this.cargarUsuarios(1);
  }

  limpiarFiltros(): void {
    this.search = '';
    this.empresaIdFiltro = this.canChangeEmpresaFromSession() ? null : this.getLoggedEmpresaId();
    this.rolIdFiltro = null;
    this.estadoFiltro = null;
    this.cargarRoles(this.empresaIdFiltro);
    this.cargarUsuarios(1);
  }

  irPagina(pagina: number): void {
    if (pagina < 1 || (this.totalPages && pagina > this.totalPages) || pagina === this.page) {
      return;
    }
    this.cargarUsuarios(pagina);
  }

  cambiarLimite(value: string | number | null): void {
    const limit = this.toNumberOrNull(value) ?? 10;
    this.limit = Math.max(5, limit);
    this.cargarUsuarios(1);
  }

  recargar(): void {
    this.cargarUsuarios(this.page);
  }

  crearUsuario(): void {
    this.router.navigate(['/admin/usuarios/nuevo']);
  }

  editarUsuario(usuario: Usuario): void {
    const id = this.usuarioId(usuario);
    if (!id) return;
    this.router.navigate(['/admin/usuarios', id, 'editar']);
  }

  cambiarPassword(usuario: Usuario): void {
    const id = this.usuarioId(usuario);
    if (!id) return;
    this.router.navigate(['/admin/usuarios', id, 'cambiar-password']);
  }

  abrirConfirmacion(usuario: Usuario, accion: Exclude<PendingAction, null>): void {
    this.pendingUser = usuario;
    this.pendingAction = accion;

    const nombre = this.usuarioNombreCompleto(usuario) || this.usuarioUsername(usuario);
    if (accion === 'desactivar') {
      this.confirmTitle = 'Desactivar usuario';
      this.confirmMessage = `¿Está seguro de desactivar al usuario <strong>${nombre}</strong>?`;
      this.confirmIcon = 'bi bi-slash-circle-fill';
      this.confirmAccentColor = '#d32f2f';
      this.confirmButtonColor = '#d32f2f';
    } else if (accion === 'eliminar') {
      this.confirmTitle = 'Eliminar usuario';
      this.confirmMessage = `¿Está seguro de eliminar al usuario <strong>${nombre}</strong>?`;
      this.confirmIcon = 'bi bi-trash-fill';
      this.confirmAccentColor = '#d32f2f';
      this.confirmButtonColor = '#d32f2f';
    } else if (accion === 'activar') {
      this.confirmTitle = 'Activar usuario';
      this.confirmMessage = `¿Está seguro de activar al usuario <strong>${nombre}</strong>?`;
      this.confirmIcon = 'bi bi-check-circle-fill';
      this.confirmAccentColor = '#198754';
      this.confirmButtonColor = '#198754';
    } else {
      this.confirmTitle = 'Desbloquear usuario';
      this.confirmMessage = `¿Desea desbloquear a <strong>${nombre}</strong>?`;
      this.confirmIcon = 'bi bi-unlock-fill';
      this.confirmAccentColor = '#198754';
      this.confirmButtonColor = '#198754';
    }

    this.confirmVisible = true;
  }

  cerrarConfirmacion(confirmado: boolean): void {
    if (!confirmado) {
      this.confirmVisible = false;
      this.pendingAction = null;
      this.pendingUser = null;
      return;
    }

    this.confirmVisible = false;
    this.ejecutarAccionPendiente();
  }

  private ejecutarAccionPendiente(): void {
    if (!this.pendingUser || !this.pendingAction) {
      return;
    }

    const id = this.usuarioId(this.pendingUser);
    if (!id) {
      return;
    }

    this.confirmSpinner = true;
    this.confirmSpinnerText = this.spinnerTextForAction(this.pendingAction);
    this.confirmVisible = true;
    this.loadingService.show();

    const action = this.pendingAction;
    const request$: Observable<unknown> = action === 'activar'
      ? this.usuariosSvc.cambiarEstado(id, 1) as unknown as Observable<unknown>
      : action === 'desactivar'
        ? this.usuariosSvc.cambiarEstado(id, 2) as unknown as Observable<unknown>
        : action === 'eliminar'
          ? this.usuariosSvc.eliminar(id) as unknown as Observable<unknown>
        : this.usuariosSvc.desbloquear(id) as unknown as Observable<unknown>;

    request$.pipe(finalize(() => {
      this.confirmSpinner = false;
      this.loadingService.hide();
      this.pendingAction = null;
      this.pendingUser = null;
      this.confirmVisible = false;
      try { this.cdr.detectChanges(); } catch {}
    })).subscribe({
      next: () => {
        this.toast.success(this.successMessageForAction(action));
        this.cargarUsuarios(this.page);
      },
      error: (err: any) => {
        this.toast.error(this.mapError(err, 'No se pudo completar la operación.'));
      }
    });
  }

  private setupSearch(): void {
    this.search$
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => this.cargarUsuarios(1));
  }

  private cargarCatalogos(): void {
    this.loadingCatalogos = true;
    this.empresasSvc.getEmpresas()
      .pipe(finalize(() => {
        this.loadingCatalogos = false;
        try { this.cdr.detectChanges(); } catch {}
      }))
      .subscribe({
        next: (res) => {
          this.empresas = this.extractList<Empresa>(res, ['empresas', 'items', 'data', 'result']);
          this.cargarRoles(this.empresaIdFiltro ?? this.getLoggedEmpresaId());
        },
        error: () => {
          this.empresas = [];
          this.cargarRoles(this.empresaIdFiltro ?? this.getLoggedEmpresaId());
        }
      });
  }

  private cargarRoles(empresaId: number | null): void {
    this.usuariosSvc.obtenerRoles(empresaId)
      .subscribe({
        next: (res) => {
          const roles = this.extractList<Rol>(res, ['roles', 'items', 'data', 'result']);
          this.roles = roles.filter((rol) => this.roleMatchesEmpresa(rol, empresaId));
          if (this.rolIdFiltro && !this.roles.some((rol) => this.rolId(rol) === this.rolIdFiltro)) {
            this.rolIdFiltro = null;
          }
          try { this.cdr.detectChanges(); } catch {}
        },
        error: () => {
          this.roles = [];
        }
      });
  }

  private cargarUsuarios(page: number): void {
    this.page = page;
    this.loading = true;
    this.error = '';
    this.loadingService.show();

    const params: UsuariosListParams = {
      page: this.page,
      limit: this.limit,
      search: this.search,
      empresa_id: this.empresaIdFiltro,
      rol_id: this.rolIdFiltro,
      estado_id: this.estadoFiltro
    };

    this.usuariosSvc.listar(params)
      .pipe(finalize(() => {
        this.loading = false;
        this.loadingService.hide();
        try { this.cdr.detectChanges(); } catch {}
      }))
      .subscribe({
        next: (res) => {
          const payload = res as any;
          const data = payload?.data ?? payload ?? {};
          const listado = this.extractList<Usuario>(data, ['usuarios', 'items', 'data', 'result']);
          this.usuarios = listado;
          this.total = Number(data?.total ?? listado.length ?? 0) || 0;
          this.totalPages = Number(data?.totalPages ?? data?.total_pages ?? (this.total && this.limit ? Math.ceil(this.total / this.limit) : 0)) || 0;
          if (!this.totalPages && this.limit) {
            this.totalPages = Math.max(1, Math.ceil((this.total || listado.length || 0) / this.limit));
          }
          if (!this.usuarios.length && this.page > 1 && this.totalPages && this.page > this.totalPages) {
            this.cargarUsuarios(this.totalPages);
          }
        },
        error: (err) => {
          this.usuarios = [];
          this.error = this.mapError(err, 'No se pudieron cargar los usuarios.');
          this.toast.error(this.error);
        }
      });
  }

  private spinnerTextForAction(action: PendingAction): string {
    switch (action) {
      case 'activar': return 'Activando usuario...';
      case 'desactivar': return 'Desactivando usuario...';
      case 'eliminar': return 'Eliminando usuario...';
      case 'desbloquear': return 'Desbloqueando usuario...';
      default: return 'Procesando...';
    }
  }

  private successMessageForAction(action: PendingAction): string {
    switch (action) {
      case 'activar': return 'Usuario activado correctamente.';
      case 'desactivar': return 'Usuario desactivado correctamente.';
      case 'eliminar': return 'Usuario eliminado correctamente.';
      case 'desbloquear': return 'Usuario desbloqueado correctamente.';
      default: return 'Operación realizada correctamente.';
    }
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? err?.error?.status ?? 0);
    const mensaje = String(err?.error?.mensaje || err?.error?.message || err?.message || '').trim();

    if (mensaje) {
      return mensaje;
    }

    if (status === 401) return 'La sesión expiró. Ingrese nuevamente.';
    if (status === 403) return 'No tiene permisos para realizar esta operación.';
    if (status === 404) return 'Usuario no encontrado.';
    if (status === 409) return 'Ya existe un registro con esos datos.';
    if (status === 422) return 'Los datos enviados no son válidos.';
    if (mensaje === 'El estado debe ser 1 (Activo) o 2 (Inactivo)') {
      return 'El estado seleccionado no es válido.';
    }
    if (mensaje.includes('estado_id')) {
      return 'No se pudo actualizar el estado del usuario.';
    }
    return fallback;
  }

  private extractList<T>(source: any, keys: string[]): T[] {
    if (Array.isArray(source)) {
      return source as T[];
    }

    for (const key of keys) {
      const value = source?.[key];
      if (Array.isArray(value)) {
        return value as T[];
      }
    }

    return [];
  }

  private hasPerm(alias: string): boolean {
    try {
      const perms = this.auth.getPermissions() || [];
      return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
    } catch {
      return false;
    }
  }

  private hasAnyUsersPerm(): boolean {
    return [
      'usuarios',
      'usuarios_crear',
      'usuarios_editar',
      'usuarios_baja',
      'usuarios_password',
      'usuarios_reset_password',
      'usuarios_desbloquear'
    ].some((alias) => this.hasPerm(alias));
  }

  private usuarioId(usuario: Usuario): number | null {
    const value = Number(usuario?.usuario_id ?? usuario?.id ?? 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  usuarioUsername(usuario: Usuario): string {
    return String(usuario?.username || '-');
  }

  usuarioNombreCompleto(usuario: Usuario): string {
    const nombre = [usuario?.nombre, usuario?.apellido].filter(Boolean).join(' ').trim();
    return nombre || this.usuarioUsername(usuario);
  }

  empresaLabel(usuario: Usuario): string {
    return String(usuario?.empresa?.nombre || usuario?.empresa?.nombre_fantasia || this.empresaNombre(usuario?.empresa_id) || '-');
  }

  rolLabel(usuario: Usuario): string {
    return String(usuario?.rol?.nombre || this.rolNombre(usuario?.rol_id) || '-');
  }

  estadoLabel(usuario: Usuario): string {
    const estadoId = this.estadoId(usuario?.estado_id ?? usuario?.estado);
    return estadoId === 1 ? 'Activo' : 'Inactivo';
  }

  isActive(usuario: Usuario): boolean {
    const estadoId = this.estadoId(usuario?.estado_id ?? usuario?.estado);
    return estadoId === 1;
  }

  isBlocked(usuario: Usuario): boolean {
    const bloqueado = usuario?.bloqueado;
    if (typeof bloqueado === 'boolean') return bloqueado;
    return Number(bloqueado ?? 0) === 1;
  }

  puedeEditar(usuario: Usuario): boolean {
    return this.canEdit && !!this.usuarioId(usuario);
  }

  puedeCambiarEstado(usuario: Usuario): boolean {
    return this.canChangeStatus && !!this.usuarioId(usuario);
  }

  puedeResetear(usuario: Usuario): boolean {
    return this.canResetPassword && !!this.usuarioId(usuario);
  }

  puedeDesbloquear(usuario: Usuario): boolean {
    return this.canUnlock && this.isBlocked(usuario) && !!this.usuarioId(usuario);
  }

  puedeActivar(usuario: Usuario): boolean {
    return this.puedeCambiarEstado(usuario) && !this.isActive(usuario);
  }

  puedeDesactivar(usuario: Usuario): boolean {
    return this.puedeCambiarEstado(usuario) && this.isActive(usuario);
  }

  private empresaNombre(empresaId: number | null | undefined): string {
    if (!empresaId) return '';
    const found = this.empresas.find((empresa) => this.empresaId(empresa) === Number(empresaId));
    return String(found?.nombre || found?.nombre_fantasia || '');
  }

  private rolNombre(rolId: number | null | undefined): string {
    if (!rolId) return '';
    const found = this.roles.find((rol) => this.rolId(rol) === Number(rolId));
    return String(found?.nombre || '');
  }

  private empresaId(empresa: Empresa | null | undefined): number | null {
    const value = Number(empresa?.empresa_id ?? empresa?.id ?? 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private rolId(rol: Rol | null | undefined): number | null {
    const value = Number(rol?.rol_id ?? rol?.id ?? 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private estadoId(value: any): number {
    if (value == null) return 1;
    if (typeof value === 'object') {
      return Number(value?.estado_id ?? value?.id ?? (String(value?.nombre || '').toLowerCase().includes('inact') ? 2 : 1)) || 1;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const normalized = String(value).toLowerCase();
    return normalized.includes('inact') ? 2 : 1;
  }

  private roleMatchesEmpresa(rol: Rol, empresaId: number | null): boolean {
    if (empresaId == null) {
      return true;
    }
    const rolEmpresa = Number(rol?.empresa_id ?? 0) || null;
    return rolEmpresa == null || Number(rolEmpresa) === Number(empresaId);
  }

  private canChangeEmpresaFromSession(): boolean {
    return this.canChangeEmpresa;
  }

  private setDefaultEmpresaFiltro(): void {
    const loggedEmpresaId = this.getLoggedEmpresaId();
    if (!this.canChangeEmpresaFromSession() && loggedEmpresaId) {
      this.empresaIdFiltro = loggedEmpresaId;
    }
  }

  private getLoggedEmpresaId(): number | null {
    const user = this.auth.getUser();
    const candidates = [
      user?.empresa_id,
      user?.empresa?.empresa_id,
      user?.empresa?.id,
      user?.user?.empresa_id,
      user?.user?.empresa?.empresa_id,
      user?.sitio?.empresa_id,
      user?.sitio?.empresa?.empresa_id,
      user?.empresa
    ];

    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }

    try {
      const stored = localStorage.getItem('empresaId') || localStorage.getItem('empresa_id');
      const value = Number(stored);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    } catch {}

    return null;
  }

  private toNumberOrNull(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
}
