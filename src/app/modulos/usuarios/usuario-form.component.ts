import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../core/toast.service';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { UsuariosService } from './usuarios.service';
import { Rol, Usuario } from './usuarios.types';

@Component({
  selector: 'app-usuario-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './usuario-form.component.html',
  styleUrls: ['./usuario-form.component.scss']
})
export class UsuarioFormComponent implements OnInit {
  loading = true;
  saving = false;
  error = '';
  usuarioId: number | null = null;
  isEditMode = false;
  roles: Rol[] = [];
  private usuarioBase: Usuario | null = null;
  resultVisible = false;
  resultTitle = '';
  resultMessage = '';
  errorVisible = false;
  errorTitle = '';
  errorMessage = '';
  form: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
    private readonly usuariosSvc: UsuariosService,
    private readonly loadingService: LoadingService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      empresa_id: [null as number | null, [Validators.required]],
      rol_id: [null as number | null, [Validators.required]],
      username: ['', [Validators.required, Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      apellido: ['', [Validators.required, Validators.maxLength(100)]],
      password: ['', []],
      confirm_password: ['', []],
      estado_id: [1, [Validators.required]]
    }, { validators: [this.passwordMatchValidator.bind(this)] });
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.usuarioId = idParam ? Number(idParam) : null;
    this.isEditMode = Number.isFinite(this.usuarioId as number);
    this.lockEmpresa();

    if (!this.isEditMode) {
      this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8), Validators.maxLength(128)]);
      this.form.get('confirm_password')?.setValidators([Validators.required]);
      this.form.get('password')?.updateValueAndValidity({ emitEvent: false });
      this.form.get('confirm_password')?.updateValueAndValidity({ emitEvent: false });
    } else {
      this.form.get('password')?.clearValidators();
      this.form.get('confirm_password')?.clearValidators();
      this.form.get('password')?.updateValueAndValidity({ emitEvent: false });
      this.form.get('confirm_password')?.updateValueAndValidity({ emitEvent: false });
    }

    this.form.get('empresa_id')?.valueChanges.subscribe((value) => {
      const empresaId = this.toNumberOrNull(value) ?? this.getLoggedEmpresaId();
      this.form.patchValue({ rol_id: null }, { emitEvent: false });
      this.cargarRoles(empresaId);
    });

    if (this.isEditMode && this.usuarioId) {
      this.cargarUsuario(this.usuarioId);
    } else {
      this.cargarRoles(this.getLoggedEmpresaId());
      this.loading = false;
    }
  }

  get titulo(): string {
    return this.isEditMode ? 'Editar usuario' : 'Nuevo usuario';
  }

  get submitLabel(): string {
    return this.isEditMode ? 'Actualizar usuario' : 'Crear usuario';
  }

  get passwordControl(): AbstractControl | null {
    return this.form.get('password');
  }

  get confirmPasswordControl(): AbstractControl | null {
    return this.form.get('confirm_password');
  }

  guardar(): void {
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    // La empresa nunca se elige: es siempre la del usuario logueado.
    const empresaId = this.getLoggedEmpresaId();
    if (!empresaId) {
      this.error = 'No se pudo determinar la empresa del usuario logueado.';
      this.toast.error(this.error);
      return;
    }
    const payloadBase = {
      empresa_id: empresaId,
      rol_id: Number(raw.rol_id ?? 0),
      username: String(raw.username || '').trim().replace(/\s+/g, ''),
      email: String(raw.email || '').trim().toLowerCase(),
      nombre: String(raw.nombre || '').trim(),
      apellido: String(raw.apellido || '').trim(),
      estado_id: Number(raw.estado_id ?? 1)
    };

    if (!payloadBase.rol_id) {
      this.error = 'Debe seleccionar un rol válido.';
      return;
    }

    this.saving = true;
    this.error = '';
    this.loadingService.show();

    const request = this.isEditMode && this.usuarioId
      ? this.usuariosSvc.actualizar(this.usuarioId, payloadBase)
      : this.usuariosSvc.crear({
          ...payloadBase,
          password: String(raw.password || '')
        });

    request.pipe(finalize(() => {
      this.saving = false;
      this.loadingService.hide();
      try { this.cdr.detectChanges(); } catch {}
    })).subscribe({
      next: () => {
        this.toast.success(this.isEditMode ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
        this.router.navigate(['/admin/usuarios']);
      },
      error: (err) => {
        const mensaje = this.mapError(err, this.isEditMode ? 'No se pudo actualizar el usuario.' : 'No se pudo crear el usuario.');
        this.error = mensaje;
        this.toast.error(mensaje);
        this.showInlineError('Error al guardar usuario', mensaje);
      }
    });
  }

  volver(): void {
    this.router.navigate(['/admin/usuarios']);
  }

  compareRol = (a: Rol | null, b: Rol | null): boolean => this.rolId(a) === this.rolId(b);

  private lockEmpresa(): void {
    const empresaId = this.getLoggedEmpresaId();
    const control = this.form.get('empresa_id');
    if (!control) return;

    control.setValue(empresaId, { emitEvent: false });
    // Control deshabilitado: no se muestra ni puede alterarse desde la interfaz.
    control.disable({ emitEvent: false });
  }

  private cargarRoles(empresaId: number | null): void {
    this.usuariosSvc.obtenerRoles(empresaId).subscribe({
      next: (res) => {
        const roles = this.extractList<Rol>(res, ['roles', 'items', 'data', 'result']);
        this.roles = roles.filter((rol) => this.roleMatchesEmpresa(rol, empresaId));
      },
      error: () => {
        this.roles = [];
      }
    });
  }

  private cargarUsuario(id: number): void {
    this.loading = true;
    this.loadingService.show();
    this.usuariosSvc.obtenerPorId(id).pipe(finalize(() => {
      this.loading = false;
      this.loadingService.hide();
      try { this.cdr.detectChanges(); } catch {}
    })).subscribe({
      next: (res) => {
        const data = (res as any)?.data ?? res ?? {};
        this.usuarioBase = data as Usuario;
        const empresaId = this.getLoggedEmpresaId();
        this.form.patchValue({
          empresa_id: empresaId,
          rol_id: this.toNumberOrNull(data?.rol_id ?? data?.rol?.rol_id ?? data?.rol?.id),
          username: String(data?.username || '').trim(),
          email: String(data?.email || '').trim(),
          nombre: String(data?.nombre || '').trim(),
          apellido: String(data?.apellido || '').trim(),
          estado_id: this.toNumberOrNull(data?.estado_id ?? data?.estado) ?? 1
        }, { emitEvent: false });

        this.lockEmpresa();
        this.cargarRoles(empresaId);
      },
      error: (err) => {
        this.error = this.mapError(err, 'No se pudo cargar el usuario.');
        this.toast.error(this.error);
      }
    });
  }

  private passwordMatchValidator(control: AbstractControl) {
    const password = String(control.get('password')?.value || '');
    const confirm = String(control.get('confirm_password')?.value || '');
    if (!this.isEditMode) {
      return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
    }
    return null;
  };

  private showInlineError(title: string, message: string): void {
    this.errorTitle = title;
    this.errorMessage = message;
    this.errorVisible = true;
  }

  cerrarError(): void {
    this.errorVisible = false;
  }

  cerrarResultado(): void {
    this.resultVisible = false;
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? err?.error?.status ?? 0);
    const mensaje = String(err?.error?.mensaje || err?.error?.message || err?.message || '').trim();
    if (mensaje) return mensaje;
    if (status === 401) return 'La sesión expiró. Ingrese nuevamente.';
    if (status === 403) return 'No tiene permisos para realizar esta operación.';
    if (status === 404) return 'Usuario no encontrado.';
    if (status === 409) return 'Ya existe un usuario con esos datos.';
    if (status === 422) return 'Los datos enviados no son válidos.';
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

  private roleMatchesEmpresa(rol: Rol, empresaId: number | null): boolean {
    if (empresaId == null) {
      return true;
    }
    const rolEmpresa = Number(rol?.empresa_id ?? 0) || null;
    return rolEmpresa == null || Number(rolEmpresa) === Number(empresaId);
  }

  private rolId(rol: Rol | null | undefined): number | null {
    const value = Number(rol?.rol_id ?? rol?.id ?? 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private toNumberOrNull(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
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
      user?.sitio?.empresa?.empresa_id
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
}
