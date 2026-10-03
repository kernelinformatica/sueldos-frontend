import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { UsuariosService } from './usuarios.service';
import { Usuario } from './usuarios.types';

@Component({
  selector: 'app-usuario-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './usuario-password.component.html',
  styleUrls: ['./usuario-password.component.scss']
})
export class UsuarioPasswordComponent implements OnInit {
  loading = true;
  saving = false;
  error = '';
  usuarioId: number | null = null;
  isSelfMode = true;
  usuarioBase: Usuario | null = null;
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
      current_password: [''],
      nueva_password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirm_password: ['', [Validators.required]]
    }, { validators: [this.passwordMatchValidator.bind(this)] });
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.usuarioId = idParam ? Number(idParam) : this.getLoggedUserId();
    this.isSelfMode = !idParam;

    if (this.isSelfMode) {
      this.form.get('current_password')?.setValidators([Validators.required]);
    } else {
      this.form.get('current_password')?.clearValidators();
      this.cargarUsuario(Number(idParam));
    }

    this.form.get('current_password')?.updateValueAndValidity({ emitEvent: false });
    this.loading = false;
  }

  get titulo(): string {
    return this.isSelfMode ? 'Cambiar contraseña' : 'Resetear contraseña';
  }

  get subtitulo(): string {
    return this.isSelfMode
      ? 'Ingrese su contraseña actual y defina una nueva contraseña.'
      : `Defina una nueva contraseña para ${this.usuarioNombre || 'el usuario seleccionado'}.`;
  }

  get submitLabel(): string {
    return this.isSelfMode ? 'Actualizar contraseña' : 'Resetear contraseña';
  }

  get currentPasswordControl(): AbstractControl | null {
    return this.form.get('current_password');
  }

  get usuarioNombre(): string {
    const user = this.usuarioBase || this.auth.getUser();
    const nombre = [user?.nombre, user?.apellido].filter(Boolean).join(' ').trim();
    return nombre || String(user?.username || user?.email || '');
  }

  guardar(): void {
    if (this.saving) return;
    if (this.form.invalid || !this.usuarioId) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload = {
      password_nueva: String(raw.nueva_password || ''),
      password_nueva_confirmacion: String(raw.confirm_password || '')
    };

    this.saving = true;
    this.error = '';
    this.loadingService.show();

    const request = this.isSelfMode
      ? this.usuariosSvc.cambiarPassword(this.usuarioId, {
          current_password: String(raw.current_password || ''),
          nueva_password: payload.password_nueva,
          password_nueva_confirmacion: payload.password_nueva_confirmacion
        })
      : this.usuariosSvc.resetPassword(this.usuarioId, payload);

    request.pipe(finalize(() => {
      this.saving = false;
      this.loadingService.hide();
      try { this.cdr.detectChanges(); } catch {}
    })).subscribe({
      next: () => {
        this.toast.success(this.isSelfMode ? 'Contraseña actualizada correctamente.' : 'Contraseña reseteada correctamente.');
        this.form.reset();
        if (this.isSelfMode) {
          this.router.navigate(['/modulos']);
        } else {
          this.router.navigate(['/admin/usuarios']);
        }
      },
      error: (err) => {
        const mensaje = this.mapError(err, this.isSelfMode ? 'No se pudo cambiar la contraseña.' : 'No se pudo resetear la contraseña.');
        this.error = mensaje;
        this.toast.error(mensaje);
        this.showInlineError('Error al cambiar contraseña', mensaje);
      }
    });
  }

  volver(): void {
    this.router.navigate(this.isSelfMode ? ['/modulos'] : ['/admin/usuarios']);
  }

  cerrarResultado(): void {
    this.resultVisible = false;
  }

  cerrarError(): void {
    this.errorVisible = false;
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
        this.usuarioBase = (res as any)?.data ?? res ?? {};
      },
      error: (err) => {
        const mensaje = this.mapError(err, 'No se pudo cargar el usuario.');
        this.error = mensaje;
        this.toast.error(mensaje);
      }
    });
  }

  private passwordMatchValidator(control: AbstractControl) {
    const nueva = String(control.get('nueva_password')?.value || '');
    const confirm = String(control.get('confirm_password')?.value || '');
    return nueva && confirm && nueva !== confirm ? { passwordMismatch: true } : null;
  }

  private showInlineError(title: string, message: string): void {
    this.errorTitle = title;
    this.errorMessage = message;
    this.errorVisible = true;
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? err?.error?.status ?? 0);
    const mensaje = String(err?.error?.mensaje || err?.error?.message || err?.message || '').trim();
    const campo = String(err?.error?.meta?.campo || '').trim();
    if (mensaje === 'Required' && campo === 'password_nueva') {
      return 'Debe ingresar la nueva contraseña.';
    }
    if (mensaje === 'Required' && campo === 'password_nueva_confirmacion') {
      return 'Debe confirmar la nueva contraseña.';
    }
    if (mensaje) return mensaje;
    if (status === 401) return 'La sesión expiró. Ingrese nuevamente.';
    if (status === 403) return 'No tiene permisos para realizar esta operación.';
    if (status === 404) return 'Usuario no encontrado.';
    if (status === 409) return 'Ya existe un usuario con esos datos.';
    if (status === 422) return 'Las contraseñas no coinciden o no cumplen la política.';
    return fallback;
  }

  private getLoggedUserId(): number | null {
    const user = this.auth.getUser();
    const candidates = [
      user?.usuario_id,
      user?.id,
      user?.user_id,
      user?.usuario?.usuario_id,
      user?.usuario?.id,
      user?.user?.usuario_id,
      user?.user?.id
    ];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return null;
  }
}
