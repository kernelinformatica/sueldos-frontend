import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, finalize, of, catchError, map } from 'rxjs';
import { SucursalesService } from './sucursales.service';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../auth/auth.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { Localidad, LocalidadService } from '../../core/localidad.service';
import { environment } from '../../environments/environment';
import { SeccionesService } from '../secciones/secciones.service';

interface EmpleadoSugestion {
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

interface SeccionSuggestion {
  id: number;
  seccion_id?: number;
  nombre?: string;
  descripcion?: string;
  orden?: number;
}

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
  localidadQuery = '';
  localidadLoading = false;
  localidadError = '';
  localidadResultados: Localidad[] = [];
  localidadSeleccionada: Localidad | null = null;
  private localidadSearch$ = new Subject<string>();
  responsableQuery = '';
  responsableLoading = false;
  responsableError = '';
  responsableResultados: EmpleadoSugestion[] = [];
  responsableSeleccionado: EmpleadoSugestion | null = null;
  responsableDisplayLabel = '';
  private responsableLastQuery = '';
  private responsableSearch$ = new Subject<string>();
  relationModalVisible = false;
  relationModalTitle = 'Relacionar secciones';
  relationModalMessage = '';
  relationSearch = '';
  sucursalesRelacionables: any[] = [];
  sucursalRelationSearch = '';
  sucursalRelationSelectedId: number | null = null;
  seccionesDisponibles: SeccionSuggestion[] = [];
  seccionRelationSearch = '';
  seccionesLoading = false;
  selectedSeccionIds = new Set<number>();
  relationSaving = false;
  estados: Array<{ value: number; label: string }> = [
    { value: 1, label: 'Activa' },
    { value: 2, label: 'Inactiva' }
  ];
  resultVisible = false;
  resultTitle = '';
  resultMessage = '';
  errorVisible = false;
  errorTitle = '';
  errorMessage = '';
  relationFeedbackVisible = false;
  relationFeedbackTitle = '';
  relationFeedbackMessage = '';
  relationFeedbackIcon = 'bi bi-check-circle-fill';
  relationFeedbackAccentColor = '#198754';
  relationFeedbackButtonColor = '#198754';
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private svc: SucursalesService,
    private http: HttpClient,
    private localidadSvc: LocalidadService,
    private seccionesSvc: SeccionesService,
    private toast: ToastService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      sucursal_id: [null],
      cod_interno: [0, Validators.required],
      empresa_id: [null],
      nombre: ['', Validators.required],
      direccion: [''],
      localidad_id: [null],
      latitud: [null],
      longitud: [null],
      resp_sucursal: [null],
      principal: [0, Validators.required],
      estado: [1, Validators.required],
      orden: [0, Validators.required]
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParams['id'] || 0);
    this.sucursalId = id || null;
    this.patchEmpresaId();
    this.setupLocalidadSearch();
    this.setupResponsableSearch();
    this.loadSucursalesRelacionables();
    this.loadSeccionesDisponibles();
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
        cod_interno: Number(data?.cod_interno ?? 0) || 0,
        empresa_id: Number(data?.empresa_id ?? this.form.get('empresa_id')?.value ?? 0) || null,
        nombre: data?.nombre ?? data?.razon_social ?? '',
        direccion: data?.direccion ?? '',
        localidad_id: data?.localidad_id ?? null,
        latitud: data?.latitud ?? null,
        longitud: data?.longitud ?? null,
        resp_sucursal: data?.resp_sucursal ?? null,
        principal: Number(data?.principal ?? 0) || 0,
        estado: Number(data?.estado ?? 1) || 1,
        orden: data?.orden ?? 0
      });
      this.localidadSeleccionada = this.toLocalidad(data?.localidad_id, data?.localidad_nombre ?? data?.localidad?.nombre ?? null, data?.localidad_codigo_postal ?? data?.codigo_postal ?? null);
      if (this.localidadSeleccionada) {
        this.localidadQuery = this.formatLocalidadLabel(this.localidadSeleccionada);
      }
      const responsableData = data?.resp_sucursal && typeof data.resp_sucursal === 'object' ? data.resp_sucursal : null;
      const responsableId = responsableData?.empleado_id ?? responsableData?.id ?? data?.resp_sucursal ?? data?.responsable_id ?? data?.encargado_id ?? data?.encargado?.id ?? data?.empleado?.id ?? null;
      const responsableNombre = responsableData?.nombre ?? data?.responsable_nombre ?? data?.encargado_nombre ?? data?.encargado?.nombre ?? data?.empleado?.nombre ?? null;
      const responsableApellido = responsableData?.apellido ?? data?.responsable_apellido ?? data?.encargado_apellido ?? data?.encargado?.apellido ?? data?.empleado?.apellido ?? null;
      const responsableLegajo = responsableData?.legajo ?? data?.responsable_legajo ?? data?.encargado_legajo ?? data?.encargado?.legajo ?? data?.empleado?.legajo ?? null;
      this.responsableSeleccionado = this.toEmpleadoSuggestion(responsableId, responsableNombre, responsableApellido, responsableLegajo);
      this.responsableDisplayLabel = this.buildResponsableDisplayLabel(responsableId, responsableNombre, responsableApellido, responsableLegajo);
      if (this.responsableSeleccionado) {
        this.responsableQuery = this.formatEmpleadoLabel(this.responsableSeleccionado);
      } else if (responsableId) {
        this.loadResponsableSeleccionado(Number(responsableId));
      }
    }, (err) => this.showError(this.mapError(err, 'No se pudo cargar la sucursal')));
  }

  save(): void {
    if (!this.canSave) { this.showError('No tiene permisos para guardar sucursales'); return; }
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const payload = {
      sucursal_id: this.sucursalId ?? this.form.get('sucursal_id')?.value ?? null,
      cod_interno: Number(this.form.get('cod_interno')?.value ?? 0),
      empresa_id: Number(this.form.get('empresa_id')?.value ?? 0),
      nombre: String(this.form.get('nombre')?.value || '').trim(),
      direccion: String(this.form.get('direccion')?.value || '').trim() || null,
      localidad_id: this.toNumberOrNull(this.form.get('localidad_id')?.value),
      latitud: this.toDecimalOrNull(this.form.get('latitud')?.value),
      longitud: this.toDecimalOrNull(this.form.get('longitud')?.value),
      resp_sucursal: this.toNumberOrNull(this.form.get('resp_sucursal')?.value),
      principal: Number(this.form.get('principal')?.value ?? 0),
      estado: Number(this.form.get('estado')?.value ?? 1),
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

  get canRelacionar(): boolean { return this.hasPerm('sucursales_relacionar') && !!this.sucursalId; }

  loadSucursalesRelacionables(): void {
    if (!this.canRelacionar) return;
    this.svc.all().pipe(finalize(() => { try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      const data = this.extractArrayResponse(res, ['data', 'sucursales', 'items', 'result']);
      this.sucursalesRelacionables = data.map((s:any) => this.normalizeSucursal(s)).sort((a:any, b:any) => {
        const principalA = Number(a?.principal ?? 0) === 1 ? 0 : 1;
        const principalB = Number(b?.principal ?? 0) === 1 ? 0 : 1;
        return principalA - principalB || this.compareSucursal(a, b);
      });
      const currentId = Number(this.form.get('sucursal_id')?.value || this.sucursalId || 0);
      if (!this.sucursalRelationSelectedId && currentId) {
        this.selectRelationSucursal(currentId);
      }
    }, () => {
      this.sucursalesRelacionables = [];
    });
  }

  get filteredSeccionesDisponibles(): SeccionSuggestion[] {
    const q = String(this.seccionRelationSearch || '').trim().toLowerCase();
    if (!q) return this.seccionesDisponibles;
    return this.seccionesDisponibles.filter((seccion) => this.seccionLabel(seccion).toLowerCase().includes(q));
  }

  get filteredSucursalesRelacionables(): any[] {
    const q = String(this.sucursalRelationSearch || '').trim().toLowerCase();
    if (!q) return this.sucursalesRelacionables;
    return this.sucursalesRelacionables.filter((sucursal) => this.sucursalLabel(sucursal).toLowerCase().includes(q));
  }

  selectRelationSucursal(sucursalId: number | null): void {
    const id = Number(sucursalId || 0);
    if (!id) return;
    const sucursal = this.sucursalesRelacionables.find((item) => Number(item?.sucursal_id ?? item?.id ?? 0) === id);
    if (!sucursal) return;
    this.sucursalRelationSelectedId = id;
    this.selectedSeccionIds = new Set<number>((sucursal?.secciones || []).map((x:any) => Number(x?.seccion_id ?? x?.id ?? 0)).filter((value:number) => value > 0));
    this.sucursalRelationSearch = this.sucursalLabel(sucursal);
  }

  toggleSeccionSelection(seccionId: number): void {
    const id = Number(seccionId || 0);
    if (!id) return;
    if (this.selectedSeccionIds.has(id)) this.selectedSeccionIds.delete(id); else this.selectedSeccionIds.add(id);
    this.selectedSeccionIds = new Set(this.selectedSeccionIds);
  }

  isSelectedSeccion(seccionId: number): boolean {
    return this.selectedSeccionIds.has(Number(seccionId || 0));
  }

  guardarRelacion(): void {
    const sucursalId = Number(this.sucursalRelationSelectedId || this.form.get('sucursal_id')?.value || this.sucursalId || 0);
    if (!sucursalId) return;
    const ids = Array.from(this.selectedSeccionIds).filter((id) => Number(id) > 0);
    this.relationSaving = true;
    this.svc.relacionarSecciones(sucursalId, { seccion_ids: ids }).pipe(finalize(() => {
      this.relationSaving = false;
      try { this.cdr.detectChanges(); } catch {}
    })).subscribe(() => {
      this.loadSucursalesRelacionables();
      const sucursalLabel = this.sucursalLabel(this.sucursalesRelacionables.find((item) => Number(item?.sucursal_id ?? item?.id ?? 0) === sucursalId) || this.form.value || {});
      const count = ids.length;
      this.relationFeedbackTitle = count > 0 ? 'Relación guardada' : 'Desasignación guardada';
      this.relationFeedbackMessage = count > 0
        ? `Se asignaron ${count} sección${count === 1 ? '' : 'es'} a ${sucursalLabel}.`
        : `Se quitaron todas las secciones de ${sucursalLabel}.`;
      this.relationFeedbackIcon = count > 0 ? 'bi bi-check-circle-fill' : 'bi bi-x-circle-fill';
      this.relationFeedbackAccentColor = count > 0 ? '#198754' : '#6c757d';
      this.relationFeedbackButtonColor = this.relationFeedbackAccentColor;
      this.relationFeedbackVisible = true;
    }, (err) => {
      this.relationFeedbackTitle = 'No se pudo guardar la relación';
      this.relationFeedbackMessage = this.mapError(err, 'No se pudieron relacionar las secciones');
      this.relationFeedbackIcon = 'bi bi-exclamation-triangle-fill';
      this.relationFeedbackAccentColor = '#d32f2f';
      this.relationFeedbackButtonColor = '#d32f2f';
      this.relationFeedbackVisible = true;
    });
  }

  closeRelationFeedback(): void {
    this.relationFeedbackVisible = false;
  }

  onLocalidadInputChange(value: string): void {
    this.localidadQuery = value;
    if (String(value || '').trim().length < 2) {
      this.localidadResultados = [];
      this.localidadLoading = false;
      this.localidadError = '';
      return;
    }
    this.localidadSearch$.next(value);
  }

  selectLocalidad(localidad: Localidad): void {
    this.localidadSeleccionada = localidad;
    this.localidadQuery = this.formatLocalidadLabel(localidad);
    this.form.patchValue({ localidad_id: localidad.id });
    this.localidadResultados = [];
    this.localidadError = '';
  }

  clearLocalidad(): void {
    this.localidadSeleccionada = null;
    this.localidadQuery = '';
    this.form.patchValue({ localidad_id: null });
    this.localidadResultados = [];
    this.localidadError = '';
  }

  onResponsableInputChange(value: string): void {
    const normalized = String(value || '').trim();
    if (normalized === this.responsableQuery && normalized === this.responsableLastQuery) {
      return;
    }
    this.responsableQuery = value;
    if (normalized.length < 2) {
      this.responsableResultados = [];
      this.responsableLoading = false;
      this.responsableError = '';
      this.responsableLastQuery = '';
      return;
    }
    this.responsableSearch$.next(normalized);
  }

  selectResponsable(empleado: EmpleadoSugestion): void {
    this.responsableSeleccionado = empleado;
    this.responsableQuery = this.formatEmpleadoLabel(empleado);
    this.form.patchValue({ resp_sucursal: empleado.id });
    this.responsableResultados = [];
    this.responsableError = '';
  }

  clearResponsable(): void {
    this.responsableSeleccionado = null;
    this.responsableQuery = '';
    this.form.patchValue({ resp_sucursal: null });
    this.responsableResultados = [];
    this.responsableError = '';
    this.responsableLastQuery = '';
  }

  private patchEmpresaId(): void {
    const empresaId = this.getEmpresaIdFromContext();
    if (empresaId) {
      this.form.patchValue({ empresa_id: empresaId });
    }
  }

  private setupLocalidadSearch(): void {
    this.localidadSearch$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((query) => {
      const normalized = String(query || '').trim();
      if (normalized.length < 2) {
        this.localidadResultados = [];
        return;
      }
      const token = this.auth.getToken();
      if (!token) {
        this.localidadError = 'No hay sesión activa para buscar localidades.';
        return;
      }
      this.localidadLoading = true;
      this.localidadError = '';
      this.localidadSvc.search(normalized, token).pipe(finalize(() => {
        this.localidadLoading = false;
        try { this.cdr.detectChanges(); } catch {}
      })).subscribe({
        next: (items) => {
          this.localidadResultados = (items || [])
            .slice(0, 50)
            .sort((a, b) => this.formatLocalidadLabel(a).localeCompare(this.formatLocalidadLabel(b), 'es', { sensitivity: 'base' }));
        },
        error: () => {
          this.localidadResultados = [];
          this.localidadError = 'No se pudieron buscar localidades.';
        }
      });
    });
  }

  private setupResponsableSearch(): void {
    this.responsableSearch$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((query) => {
      const normalized = String(query || '').trim();
      if (normalized.length < 2) {
        this.responsableResultados = [];
        return;
      }
      if (normalized === this.responsableLastQuery) {
        return;
      }
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
          return (items || []).map((item: any) => this.normalizeEmpleadoSuggestion(item)).filter((item: EmpleadoSugestion) => item.id > 0);
        }),
        catchError(() => of([] as EmpleadoSugestion[])),
        finalize(() => {
          this.responsableLoading = false;
          try { this.cdr.detectChanges(); } catch {}
        })
      ).subscribe({
        next: (items) => {
          const responsables = (items || []) as EmpleadoSugestion[];
          this.responsableLastQuery = normalized;
          this.responsableResultados = responsables
            .slice(0, 50)
            .sort((a: EmpleadoSugestion, b: EmpleadoSugestion) =>
              this.formatEmpleadoLabel(a).localeCompare(this.formatEmpleadoLabel(b), 'es', { sensitivity: 'base' })
            );
        }
      });
    });
  }

  private loadResponsableSeleccionado(empleadoId: number): void {
    const token = this.auth.getToken();
    if (!token || !empleadoId) return;
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http.get<any>(`${environment.apiUrl}/api/empleados/${empleadoId}`, { headers }).pipe(
      map((res) => {
        const data = res?.data || res || {};
        return this.normalizeEmpleadoSuggestion({
          id: data?.empleado_id ?? data?.id ?? empleadoId,
          empleado_id: data?.empleado_id ?? data?.id ?? empleadoId,
          texto: data?.texto,
          nombre: data?.nombre,
          apellido: data?.apellido,
          legajo: data?.legajo,
          estado: data?.estado,
          foto: data?.foto ?? data?.foto_url_publica ?? null,
          documento: data?.numero_documento ?? data?.documento ?? ''
        });
      }),
      catchError(() => of(null)),
      finalize(() => {
        try { this.cdr.detectChanges(); } catch {}
      })
    ).subscribe((empleado) => {
      if (!empleado || !empleado.id) return;
      this.responsableSeleccionado = empleado;
      this.responsableQuery = this.formatEmpleadoLabel(empleado);
      this.responsableDisplayLabel = this.formatEmpleadoLabel(empleado);
    });
  }

  private loadSeccionesDisponibles(): void {
    this.seccionesLoading = true;
    this.seccionesSvc.all().pipe(finalize(() => {
      this.seccionesLoading = false;
      try { this.cdr.detectChanges(); } catch {}
    })).subscribe({
      next: (res: any) => {
        const data = Array.isArray(res?.data) ? res.data : Array.isArray(res?.secciones) ? res.secciones : Array.isArray(res) ? res : [];
        this.seccionesDisponibles = (data || [])
          .map((s: any) => ({
            id: Number(s?.seccion_id ?? s?.id ?? 0) || 0,
            seccion_id: Number(s?.seccion_id ?? s?.id ?? 0) || 0,
            nombre: s?.nombre ?? s?.descripcion ?? '',
            descripcion: s?.descripcion ?? '',
            orden: Number(s?.orden ?? 0) || 0,
            sucursal_id: Number(s?.sucursal_id ?? s?.sucursal?.sucursal_id ?? s?.sucursal?.id ?? 0) || null,
            sucursal_nombre: s?.sucursal_nombre ?? s?.sucursal?.nombre ?? s?.sucursal?.razon_social ?? s?.sucursal?.descripcion ?? s?.sucursal?.cod_interno ?? null,
            sucursal: s?.sucursal ?? null
          }))
          .filter((s: SeccionSuggestion) => s.id > 0)
          .sort((a: SeccionSuggestion, b: SeccionSuggestion) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre || a.descripcion || '').localeCompare(String(b.nombre || b.descripcion || '')));
      },
      error: () => {
        this.seccionesDisponibles = [];
        this.toast.error('No se pudieron cargar las secciones disponibles');
      }
    });
  }

  formatLocalidadLabel(localidad: Localidad): string {
    if (String(localidad.texto || '').trim()) {
      return String(localidad.texto).trim();
    }
    const postal = localidad.codigo_postal || localidad.codigoPostal;
    return postal ? `${localidad.nombre} (${postal})` : localidad.nombre;
  }

  formatEmpleadoLabel(empleado: EmpleadoSugestion): string {
    return String(empleado.texto || '').trim() || this.buildEmpleadoTexto(empleado);
  }

  sucursalLabel(sucursal: any): string {
    return String(sucursal?.nombre || sucursal?.razon_social || sucursal?.descripcion || sucursal?.cod_interno || sucursal?.sucursal_id || sucursal?.id || 'Sin nombre').trim();
  }

  isSucursalActiva(sucursal: any): boolean {
    return Number(sucursal?.estado ?? 1) === 1;
  }

  seccionLabel(seccion: SeccionSuggestion): string {
    return String(seccion.nombre || seccion.descripcion || 'Sin nombre').trim();
  }

  seccionSucursalLabel(seccion: any): string {
    const nested = seccion?.sucursal || {};
    const label = nested?.nombre || seccion?.sucursal_nombre || nested?.razon_social || nested?.descripcion || nested?.cod_interno || (nested?.sucursal_id || nested?.id ? `Sucursal ${nested.sucursal_id ?? nested.id}` : '') || (seccion?.sucursal_id ? `Sucursal ${seccion.sucursal_id}` : '');
    return String(label || 'Sin sucursal');
  }

  private buildEmpleadoTexto(empleado: EmpleadoSugestion): string {
    const parts = [empleado.apellido, empleado.nombre].filter(Boolean).join(', ') || empleado.nombre || empleado.apellido || 'Empleado';
    return empleado.legajo ? `${parts} · Legajo ${empleado.legajo}` : parts;
  }

  private buildResponsableDisplayLabel(id: any, nombre?: string | null, apellido?: string | null, legajo?: string | null): string {
    const summary = this.buildEmpleadoTexto({ id: Number(id ?? 0), nombre: nombre || undefined, apellido: apellido || undefined, legajo: legajo || undefined });
    const numericId = Number(id ?? 0);
    return summary || (numericId ? `Responsable ID ${numericId}` : '');
  }

  private toLocalidad(id: any, nombre?: string | null, codigoPostal?: string | null): Localidad | null {
    const numericId = Number(id ?? 0);
    if (!numericId) return null;
    return {
      id: numericId,
      id_localidad: numericId,
      texto: this.buildLocalidadTexto({ nombre: nombre || undefined, codigo_postal: codigoPostal || undefined }),
      nombre: nombre || '',
      codigo_postal: codigoPostal || undefined,
      codigoPostal: codigoPostal || undefined
    };
  }

  private buildLocalidadTexto(localidad: { nombre?: string; codigo_postal?: string; codigoPostal?: string }): string {
    const nombre = String(localidad.nombre || '').trim() || 'Localidad';
    const postal = localidad.codigo_postal || localidad.codigoPostal;
    return postal ? `${nombre} (${postal})` : nombre;
  }

  private toEmpleadoSuggestion(id: any, nombre?: string | null, apellido?: string | null, legajo?: string | null): EmpleadoSugestion | null {
    const numericId = Number(id ?? 0);
    if (!numericId) return null;
    return {
      id: numericId,
      empleado_id: numericId,
      texto: this.buildEmpleadoTexto({ id: numericId, nombre: nombre || undefined, apellido: apellido || undefined, legajo: legajo || undefined }),
      nombre: nombre || undefined,
      apellido: apellido || undefined,
      legajo: legajo || undefined
    };
  }

  private normalizeEmpleadoSuggestion(item: any): EmpleadoSugestion {
    const empleadoId = Number(item?.empleado_id ?? item?.id ?? 0);
    const nombre = item?.nombre ?? '';
    const apellido = item?.apellido ?? '';
    const legajo = item?.legajo ?? '';
    const texto = String(item?.texto || '').trim() || this.buildEmpleadoTexto({ id: empleadoId, nombre, apellido, legajo });
    return {
      id: empleadoId,
      empleado_id: empleadoId,
      texto,
      nombre,
      apellido,
      legajo,
      estado: item?.estado,
      foto: item?.foto ?? item?.foto_url_publica ?? null,
      documento: item?.numero_documento ?? item?.documento ?? ''
    };
  }

  private getEmpresaIdFromContext(): number | null {
    try {
      const empresaRaw = localStorage.getItem('empresa');
      if (empresaRaw) {
        const empresa = JSON.parse(empresaRaw);
        const fromEmpresa = Number(empresa?.empresa_id ?? empresa?.id ?? 0) || null;
        if (fromEmpresa) return fromEmpresa;
      }
    } catch {}

    const candidates = [
      localStorage.getItem('empresaId'),
      localStorage.getItem('empresa_id'),
      localStorage.getItem('sitioEmpresaId')
    ];
    for (const candidate of candidates) {
      const value = Number(candidate ?? 0);
      if (value) return value;
    }

    try {
      const user = this.auth.getUser();
      const value = Number(user?.empresa_id ?? user?.empresa?.empresa_id ?? user?.sitio?.empresa_id ?? 0);
      return value || null;
    } catch {
      return null;
    }
  }

  private toNumberOrNull(value: any): number | null {
    const n = Number(value);
    return Number.isFinite(n) && String(value).trim() !== '' ? n : null;
  }

  private extractArrayResponse(res: any, keys: string[]): any[] {
    if (Array.isArray(res)) return res;
    for (const key of keys) {
      if (Array.isArray(res?.[key])) return res[key];
    }
    return [];
  }

  private normalizeSucursal(item: any): any {
    const sucursalId = Number(item?.sucursal_id ?? item?.id ?? 0) || 0;
    return {
      ...item,
      id: sucursalId,
      sucursal_id: sucursalId,
      nombre: item?.nombre ?? item?.razon_social ?? item?.descripcion ?? '',
      orden: Number(item?.orden ?? 0) || 0,
      principal: Number(item?.principal ?? 0) || 0,
      estado: Number(item?.estado ?? 1) || 1,
      secciones: Array.isArray(item?.secciones) ? item.secciones : []
    };
  }

  private compareSucursal(a: any, b: any): number {
    const nameA = String(a?.nombre || a?.razon_social || a?.descripcion || '').toLowerCase();
    const nameB = String(b?.nombre || b?.razon_social || b?.descripcion || '').toLowerCase();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  }

  private toDecimalOrNull(value: any): number | null {
    const n = Number(value);
    return Number.isFinite(n) && String(value).trim() !== '' ? n : null;
  }

  private showError(message: string, title = 'Error'): void {
    this.errorTitle = title;
    this.errorMessage = message;
    this.errorVisible = true;
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    const apiMessage =
      err?.error?.error ||
      err?.error?.message ||
      err?.error?.mensaje ||
      err?.error?.detail ||
      err?.error?.descripcion ||
      err?.error?.title ||
      err?.message;

    if (status === 400 || status === 403 || status === 404 || status >= 500) {
      if (typeof err?.error === 'string' && String(err.error).trim()) return String(err.error).trim();
      if (apiMessage && String(apiMessage).trim()) return String(apiMessage).trim();
    }
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 409) return 'La sucursal ya existe o entra en conflicto.';
    return fallback;
  }
}