import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { SeccionesService } from './secciones.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../auth/auth.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';

@Component({
  selector: 'app-seccion-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './seccion-form.component.html',
  styleUrls: ['./seccion-form.component.scss']
})
export class SeccionFormComponent implements OnInit {
  form: any;
  loading = false;
  estadosLoading = false;
  estadosError = '';
  saving = false;
  seccionId: number | null = null;
  sucursales: any[] = [];
  estados: any[] = [];
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
    private svc: SeccionesService,
    private toast: ToastService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      seccion_id: [null],
      sucursal_id: [null, Validators.required],
      nombre: ['', Validators.required],
      orden: [0, Validators.required],
      estado_id: [null, Validators.required]
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParams['id'] || 0);
    this.seccionId = id || null;
    this.loadSucursales();
    this.loadEstados();
    if (id) this.load(id);
  }

  get canSave(): boolean { return this.hasPerm(this.seccionId ? 'secciones_editar' : 'secciones_agregar'); }

  private hasPerm(alias: string): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === alias : p?.alias === alias)); } catch { return false; }
  }

  loadSucursales() {
    this.svc.listSucursales().subscribe((res:any) => {
      const data = Array.isArray(res)
        ? res
        : (res?.data?.sucursales || res?.data || res?.sucursales || res?.result || res?.items || []);
      this.sucursales = data.map((s:any) => ({
        ...s,
        sucursal_id: Number(s?.sucursal_id ?? s?.id ?? 0) || null,
        nombre: s?.nombre ?? s?.razon_social ?? s?.descripcion ?? s?.cod_interno ?? 'Sin nombre'
      }));
      try { this.cdr.detectChanges(); } catch {}
    });
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
      if (!this.seccionId && !this.form.get('estado_id')?.value && this.estados.length) {
        this.form.patchValue({ estado_id: this.estados[0].estado_id });
      }
      if (!this.estados.length) this.estadosError = 'No hay estados disponibles';
      try { this.cdr.detectChanges(); } catch {}
    }, () => {
      this.estados = [];
      this.estadosError = 'No se pudieron cargar los estados';
    });
  }

  load(id:number) {
    this.loading = true;
    this.svc.get(id).pipe(finalize(() => { this.loading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = res?.data || res || {};
      this.form.patchValue({
        seccion_id: data?.seccion_id ?? data?.id ?? null,
        sucursal_id: Number(data?.sucursal_id ?? data?.sucursal?.sucursal_id ?? data?.sucursal?.id ?? 0) || null,
        nombre: data?.nombre ?? '',
        orden: data?.orden ?? 0,
        estado_id: Number(data?.estado_id ?? data?.estado?.estado_id ?? data?.estado?.id ?? data?.estado ?? 0) || null
      });
    }, (err) => this.showError(this.mapError(err, 'No se pudo cargar la sección')));
  }

  sucursalLabel(s: any): string {
    return String(
      s?.nombre ||
      s?.razon_social ||
      s?.descripcion ||
      s?.cod_interno ||
      s?.sucursal_id ||
      s?.id ||
      'Sin nombre'
    );
  }

  estadoLabel(e: any): string {
    return String(e?.nombre || e?.descripcion || e?.estado_id || e?.id || 'Sin nombre');
  }

  save() {
    if (!this.canSave) { this.showError('No tiene permisos para guardar secciones'); return; }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const payload = {
      seccion_id: this.seccionId ?? this.form.get('seccion_id')?.value ?? null,
      sucursal_id: Number(this.form.get('sucursal_id')?.value ?? 0),
      nombre: String(this.form.get('nombre')?.value || '').trim(),
      orden: Number(this.form.get('orden')?.value ?? 0),
      estado_id: Number(this.form.get('estado_id')?.value ?? 0)
    };
    if (!Number.isInteger(payload.estado_id) || payload.estado_id <= 0) {
      this.showError('Debe seleccionar un estado válido');
      return;
    }
    this.saving = true;
    const req = this.seccionId ? this.svc.update(this.seccionId, payload) : this.svc.create(payload);
    req.pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const backend = res?.data || res || {};
      this.resultTitle = 'Sección guardada';
      this.resultMessage = backend?.message || backend?.mensaje || 'La sección se guardó correctamente.';
      this.resultVisible = true;
      this.toast.success('Sección guardada');
    }, (err) => this.showError(this.mapError(err, 'No se pudo guardar la sección')));
  }

  closeResult() {
    this.resultVisible = false;
    this.router.navigate(['/admin/secciones']);
  }

  closeError() {
    this.errorVisible = false;
  }

  private showError(message: string, title = 'Error') {
    this.errorTitle = title;
    this.errorMessage = message;
    this.errorVisible = true;
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    const apiMessage = err?.error?.message || err?.error?.mensaje || err?.error?.detail || err?.message;
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'La sección o sucursal solicitada no fue encontrada.';
    if (status === 409) return 'La sección ya existe o entra en conflicto.';
    if (status === 400 && apiMessage) return String(apiMessage);
    if (status >= 500) return 'Error interno del servidor.';
    return fallback;
  }
}
