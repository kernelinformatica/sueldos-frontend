import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { SucursalesService } from './sucursales.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../auth/auth.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';

@Component({
  selector: 'app-sucursal-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './sucursal-form.component.html',
  styleUrls: ['./sucursal-form.component.scss']
})
export class SucursalFormComponent implements OnInit {
  form: any;
  loading = false;
  saving = false;
  sucursalId: number | null = null;
  resultVisible = false;
  resultTitle = '';
  resultMessage = '';
  errorVisible = false;
  errorTitle = '';
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private svc: SucursalesService,
    private toast: ToastService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      sucursal_id: [null],
      nombre: ['', Validators.required],
      orden: [0, Validators.required]
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParams['id'] || 0);
    this.sucursalId = id || null;
    if (id) this.load(id);
  }

  get canSave(): boolean { return this.hasPerm(this.sucursalId ? 'sucursales_editar' : 'sucursales_agregar'); }

  private hasPerm(alias: string): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === alias : p?.alias === alias)); } catch { return false; }
  }

  load(id: number): void {
    this.loading = true;
    this.svc.get(id).pipe(finalize(() => { this.loading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = res?.data || res || {};
      this.form.patchValue({
        sucursal_id: data?.sucursal_id ?? data?.id ?? null,
        nombre: data?.nombre ?? data?.razon_social ?? '',
        orden: data?.orden ?? 0
      });
    }, (err) => this.showError(this.mapError(err, 'No se pudo cargar la sucursal')));
  }

  save(): void {
    if (!this.canSave) { this.showError('No tiene permisos para guardar sucursales'); return; }
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const payload = {
      sucursal_id: this.sucursalId ?? this.form.get('sucursal_id')?.value ?? null,
      nombre: String(this.form.get('nombre')?.value || '').trim(),
      orden: Number(this.form.get('orden')?.value ?? 0)
    };
    this.saving = true;
    const req = this.sucursalId ? this.svc.update(this.sucursalId, payload) : this.svc.create(payload);
    req.pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      this.resultTitle = 'Sucursal guardada';
      this.resultMessage = res?.data?.message || res?.message || 'La sucursal se guardó correctamente.';
      this.resultVisible = true;
      this.toast.success('Sucursal guardada');
    }, (err) => this.showError(this.mapError(err, 'No se pudo guardar la sucursal')));
  }

  closeResult(): void { this.resultVisible = false; this.router.navigate(['/admin/sucursales']); }
  closeError(): void { this.errorVisible = false; }

  private showError(message: string, title = 'Error'): void {
    this.errorTitle = title;
    this.errorMessage = message;
    this.errorVisible = true;
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    const apiMessage = err?.error?.message || err?.error?.mensaje || err?.error?.detail || err?.message;
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'La sucursal solicitada no fue encontrada.';
    if (status === 409) return 'La sucursal ya existe o entra en conflicto.';
    if (status === 400 && apiMessage) return String(apiMessage);
    if (status >= 500) return 'Error interno del servidor.';
    return fallback;
  }
}