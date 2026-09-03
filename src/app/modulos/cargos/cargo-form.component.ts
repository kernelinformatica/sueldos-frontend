import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, forkJoin, finalize, map, of } from 'rxjs';
import { CargosService } from './cargos.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../auth/auth.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { environment } from '../../environments/environment';

interface EmpleadoSuggestion {
  id: number;
  empleado_id?: number;
  texto?: string;
  nombre?: string;
  apellido?: string;
  legajo?: string;
  documento?: string;
  estado?: string | number;
  foto?: string | null;
}

@Component({
  selector: 'app-cargo-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './cargo-form.component.html',
  styleUrls: ['./cargo-form.component.scss']
})
export class CargoFormComponent implements OnInit {
  form: any;
  loading = false;
  catalogLoading = false;
  saving = false;
  cargoId: number | null = null;
  secciones: any[] = [];
  sucursales: any[] = [];
  responsableQuery = '';
  responsableLoading = false;
  responsableError = '';
  responsableResultados: EmpleadoSuggestion[] = [];
  responsableSeleccionado: EmpleadoSuggestion | null = null;
  private responsableLastQuery = '';
  private responsableSearch$ = new Subject<string>();
  resultVisible = false;
  resultTitle = '';
  resultMessage = '';
  errorVisible = false;
  errorTitle = '';
  errorMessage = '';

  constructor(private fb: FormBuilder, private route: ActivatedRoute, private router: Router, private svc: CargosService, private http: HttpClient, private toast: ToastService, private auth: AuthService, private cdr: ChangeDetectorRef) {
    this.form = this.fb.group({
      cargo_id: [null],
      empresa_id: [null],
      seccion_id: [null, Validators.required],
      nombre: ['', Validators.required],
      abreviatura: [''],
      responsable: [''],
      descripcion: [''],
      estado_id: [1, Validators.required],
      orden: [0, Validators.required]
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParams['id'] || 0);
    this.cargoId = id || null;
    this.setupResponsableSearch();
    this.loadCatalogos();
    if (id) this.load(id);
  }

  get canSave(): boolean { return this.hasPerm(this.cargoId ? 'cargos_editar' : 'cargos_agregar'); }

  get currentSeccion(): any {
    const seccionId = Number(this.form.get('seccion_id')?.value ?? 0);
    return this.secciones.find((s:any) => Number(s?.seccion_id ?? s?.id ?? 0) === seccionId) || null;
  }

  get currentSucursal(): any {
    return this.currentSeccion?.sucursal || null;
  }

  get currentSucursalLabel(): string {
    return this.currentSucursal ? this.sucursalLabel(this.currentSucursal) : '-';
  }

  private hasPerm(alias: string): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === alias : p?.alias === alias)); } catch { return false; }
  }

  loadCatalogos(): void {
    this.catalogLoading = true;
    forkJoin({
      secciones: this.svc.listSecciones(),
      sucursales: this.svc.listSucursales()
    }).pipe(finalize(() => { this.catalogLoading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe(({ secciones, sucursales }: any) => {
      const seccionData = Array.isArray(secciones) ? secciones : (secciones?.data?.secciones || secciones?.data || secciones?.secciones || secciones?.items || []);
      this.secciones = seccionData.map((s:any) => ({
        ...s,
        seccion_id: Number(s?.seccion_id ?? s?.id ?? 0) || null,
        nombre: s?.nombre ?? s?.descripcion ?? 'Sin nombre',
        sucursal: s?.sucursal || s?.sucursal_data || null
      }));

      const sucData = Array.isArray(sucursales) ? sucursales : (sucursales?.data || sucursales?.sucursales || []);
      this.sucursales = sucData.map((s:any) => ({
        ...s,
        sucursal_id: Number(s?.sucursal_id ?? s?.id ?? 0) || null,
        nombre: s?.nombre ?? s?.razon_social ?? s?.descripcion ?? s?.cod_interno ?? 'Sin nombre'
      }));

      try { this.cdr.detectChanges(); } catch {}
    });
  }

  load(id: number): void {
    this.loading = true;
    this.svc.get(id).pipe(finalize(() => { this.loading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = res?.data || res || {};
      const seccionId = Number(data?.seccion_id ?? data?.seccion?.seccion_id ?? data?.seccion?.id ?? 0) || null;
      this.form.patchValue({
        cargo_id: data?.cargo_id ?? data?.id ?? null,
        empresa_id: data?.empresa_id ?? null,
        seccion_id: seccionId,
        nombre: data?.nombre ?? '',
        abreviatura: data?.abreviatura ?? '',
        responsable: data?.responsable ?? '',
        descripcion: data?.descripcion ?? '',
        estado_id: data?.estado_id ?? 1,
        orden: data?.orden ?? 0
      });
      const responsableText = String(data?.responsable ?? '').trim();
      this.responsableQuery = responsableText;
      this.form.patchValue({ responsable: responsableText || '' });
      if (responsableText) {
        this.responsableSeleccionado = null;
      }
      if (data?.seccion) {
        const exists = this.secciones.some((s:any) => Number(s?.seccion_id ?? s?.id ?? 0) === seccionId);
        if (!exists) {
          this.secciones = [{ ...data.seccion, seccion_id: seccionId, sucursal: data?.sucursal || data?.seccion?.sucursal || null }, ...this.secciones];
        }
      }
      if (data?.sucursal && this.secciones.length) {
        const current = this.secciones.find((s:any) => Number(s?.seccion_id ?? s?.id ?? 0) === seccionId);
        if (current && !current.sucursal) current.sucursal = data.sucursal;
      }
    }, (err) => this.showError(this.mapError(err, 'No se pudo cargar el cargo')));
  }

  seccionLabel(s: any): string {
    return String(s?.nombre || s?.descripcion || s?.cod_interno || s?.seccion_id || '-');
  }

  sucursalLabel(s: any): string {
    return String(s?.nombre || s?.razon_social || s?.descripcion || s?.cod_interno || s?.sucursal_id || '-');
  }

  cargoLabel(cargo: any): string {
    return String(cargo?.nombre || cargo?.descripcion || cargo?.codigo || cargo?.cargo_id || 'Sin nombre');
  }

  seccionOfCargo(cargo: any): string {
    return this.seccionLabel(cargo?.seccion || cargo?.seccion_nombre || cargo?.seccion_descripcion || cargo?.seccion_id || '-');
  }

  save(): void {
    if (!this.canSave) { this.showError('No tiene permisos para guardar cargos'); return; }
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const payload = {
      cargo_id: this.cargoId ?? this.form.get('cargo_id')?.value ?? null,
      empresa_id: this.form.get('empresa_id')?.value ?? null,
      seccion_id: Number(this.form.get('seccion_id')?.value ?? 0),
      nombre: String(this.form.get('nombre')?.value || '').trim(),
      abreviatura: String(this.form.get('abreviatura')?.value || '').trim(),
      responsable: String(this.form.get('responsable')?.value || this.responsableQuery || '').trim() || null,
      descripcion: String(this.form.get('descripcion')?.value || '').trim() || null,
      estado_id: Number(this.form.get('estado_id')?.value ?? 0),
      orden: Number(this.form.get('orden')?.value ?? 0)
    };
    this.saving = true;
    const req = this.cargoId ? this.svc.update(this.cargoId, payload) : this.svc.create(payload);
    req.pipe(finalize(() => { this.saving = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const backend = res?.data || res || {};
      this.resultTitle = 'Cargo guardado';
      this.resultMessage = backend?.message || backend?.mensaje || 'El cargo se guardó correctamente.';
      this.resultVisible = true;
      this.toast.success('Cargo guardado');
    }, (err) => this.showError(this.mapError(err, 'No se pudo guardar el cargo')));
  }

  closeResult(): void { this.resultVisible = false; this.router.navigate(['/admin/cargos']); }
  closeError(): void { this.errorVisible = false; }

  onResponsableInputChange(value: string): void {
    const normalized = String(value || '').trim();
    if (normalized === this.responsableQuery && normalized === this.responsableLastQuery) return;
    this.responsableQuery = value;
    this.form.patchValue({ responsable: normalized });
    if (normalized.length < 2) {
      this.responsableResultados = [];
      this.responsableLoading = false;
      this.responsableError = '';
      this.responsableLastQuery = '';
      return;
    }
    this.responsableSearch$.next(normalized);
  }

  selectResponsable(empleado: EmpleadoSuggestion): void {
    const label = this.formatEmpleadoLabel(empleado);
    this.responsableSeleccionado = empleado;
    this.responsableQuery = label;
    this.form.patchValue({ responsable: label });
    this.responsableResultados = [];
    this.responsableError = '';
    this.responsableLastQuery = label;
  }

  clearResponsable(): void {
    this.responsableSeleccionado = null;
    this.responsableQuery = '';
    this.form.patchValue({ responsable: '' });
    this.responsableResultados = [];
    this.responsableError = '';
    this.responsableLastQuery = '';
  }

  private showError(message: string, title = 'Error'): void {
    this.errorTitle = title;
    this.errorMessage = message;
    this.errorVisible = true;
  }

  private setupResponsableSearch(): void {
    this.responsableSearch$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((query) => {
      const normalized = String(query || '').trim();
      if (normalized.length < 2) {
        this.responsableResultados = [];
        return;
      }
      if (normalized === this.responsableLastQuery) return;
      const token = this.auth.getToken();
      if (!token) {
        this.responsableError = 'No hay sesión.';
        return;
      }
      this.responsableLoading = true;
      this.responsableError = '';
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      this.http.get<any>(`${environment.apiUrl}/api/empleados/search?q=${encodeURIComponent(normalized)}`, { headers }).pipe(
        map((res) => {
          const items = Array.isArray(res?.data) ? res.data : Array.isArray(res?.empleados) ? res.empleados : Array.isArray(res) ? res : [];
          return (items || []).map((item: any) => this.normalizeEmpleadoSuggestion(item)).filter((item: EmpleadoSuggestion) => item.id > 0);
        }),
        catchError(() => of([] as EmpleadoSuggestion[])),
        finalize(() => {
          this.responsableLoading = false;
          try { this.cdr.detectChanges(); } catch {}
        })
      ).subscribe({
        next: (items) => {
          this.responsableLastQuery = normalized;
          this.responsableResultados = (items || [])
            .slice(0, 50)
            .sort((a: EmpleadoSuggestion, b: EmpleadoSuggestion) => this.formatEmpleadoLabel(a).localeCompare(this.formatEmpleadoLabel(b), 'es', { sensitivity: 'base' }));
        }
      });
    });
  }

  private normalizeEmpleadoSuggestion(item: any): EmpleadoSuggestion {
    const id = Number(item?.empleado_id ?? item?.id ?? 0) || 0;
    const suggestion: EmpleadoSuggestion = {
      id,
      empleado_id: id,
      texto: item?.texto ?? '',
      nombre: item?.nombre ?? '',
      apellido: item?.apellido ?? '',
      legajo: item?.legajo ?? '',
      documento: item?.documento ?? item?.numero_documento ?? '',
      estado: item?.estado ?? '',
      foto: item?.foto ?? item?.foto_url_publica ?? null
    };
    if (!suggestion.texto) suggestion.texto = this.formatEmpleadoLabel(suggestion);
    return suggestion;
  }

  formatEmpleadoLabel(empleado: EmpleadoSuggestion | null): string {
    if (!empleado) return '';
    return String(empleado.texto || '').trim() || [empleado.apellido, empleado.nombre].filter(Boolean).join(', ') || empleado.nombre || empleado.apellido || 'Empleado';
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    const apiMessage = err?.error?.error || err?.error?.message || err?.error?.mensaje || err?.error?.detail || err?.message;
    if (status === 400 || status === 403 || status === 404 || status >= 500) {
      if (typeof err?.error === 'string' && String(err.error).trim()) return String(err.error).trim();
      if (apiMessage && String(apiMessage).trim()) return String(apiMessage).trim();
    }
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 409) return 'El cargo ya existe o entra en conflicto.';
    return fallback;
  }
}