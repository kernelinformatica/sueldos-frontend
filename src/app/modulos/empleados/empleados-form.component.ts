import { CommonModule } from '@angular/common';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { environment } from '../../environments/environment';

interface CatalogoItem {
  id?: number;
  estado_empleado_id?: number;
  contrataciones_tipos_id?: number;
  forma_pago_id?: number;
  banco_id?: number;
  sucursal_id?: number;
  cargo_id?: number;
  seccion_id?: number;
  convenio_id?: number;
  categoria_id?: number;
  nombre?: string;
  descripcion?: string;
  estado?: number;
  requiere_banco?: number | boolean;
  requiere_cbu?: number | boolean;
  requiere_cuenta?: number | boolean;
  sueldo_min?: number;
  sueldo_max?: number;
  salario?: number;
  sueldo_actual?: number;
}

interface ProvinciaItem {
  provincia_id?: number;
  id?: number;
  nombre?: string;
}

interface EmpleadoFormResponse {
  id?: number;
  empleado_id?: number;
  empresa_id?: number;
  sucursal_id?: number;
  seccion_id?: number;
  cargo_id?: number;
  legajo?: string;
  tipo_documento?: string;
  numero_documento?: string;
  nombre?: string;
  apellido?: string;
  fecha_nacimiento?: string | null;
  sexo?: string;
  estado_civil?: string;
  nacionalidad?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  telefono?: string;
  email?: string;
  fecha_ingreso?: string | null;
  fecha_egreso?: string | null;
  foto?: string | null;
  url_publica?: string | null;
  foto_url_publica?: string | null;
  habilitado?: number;
  estado?: number | string | {
    estado_id?: number;
    id?: number;
    nombre?: string;
    descripcion?: string | null;
    es_activo?: number | boolean;
  };
  tipo_contratacion_id?: number;
  convenio_categoria_id?: number;
  dias_trabajados?: string;
  forma_pago_id?: number;
  cuenta_bancaria_principal?: {
    banco_id?: number | null;
    cbu?: string | null;
    numero_cuenta?: string | null;
  };
}

interface ArchivoEmpleadoItem {
  archivo_id?: number;
  tipo?: string;
  alias?: string;
  descripcion?: string;
  es_principal?: number | boolean;
  nombre_archivo?: string;
  ruta?: string;
  url?: string;
  url_publica?: string;
  mime_type?: string;
  tamano_bytes?: number;
  fecha_carga?: string;
}

interface ArchivoFormState {
  tipo: string;
  alias: string;
  descripcion: string;
  es_principal: number;
  archivo: File | null;
}

@Component({
  selector: 'app-empleados-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './empleados-form.component.html',
  styleUrls: ['./empleados-form.component.scss']
})
export class EmpleadosFormComponent implements OnInit {
  secciones: CatalogoItem[] = [];
  cargos: CatalogoItem[] = [];
  private allCargos: CatalogoItem[] = [];
  // caches for session
  private seccionesCache = new Map<number, CatalogoItem[]>();
  private cargosCache = new Map<number, CatalogoItem[]>();
  loadingSecciones = false;
  loadingCargos = false;
  seccionesError = '';
  cargosError = '';
  private lastFetchedSucursalId: number | null = null;
  private lastFetchedSeccionId: number | null = null;
  sucursales: CatalogoItem[] = [];
  provincias: ProvinciaItem[] = [];
  contratacionesTipos: CatalogoItem[] = [];
  formasPago: CatalogoItem[] = [];
  convenios: CatalogoItem[] = [];
  convenioCategorias: CatalogoItem[] = [];
  estadosEmpleados: CatalogoItem[] = [];
  bancos: CatalogoItem[] = [];
  archivosAdjuntos: ArchivoEmpleadoItem[] = [];
  fotoPreviewUrl = '';
  fotoPrincipalError = false;
  fotoArchivo: File | null = null;
  fotoArchivoNombre = '';
  fotoSaving = false;
  fotoError = '';
  adjuntoPreviewUrl = '';
  adjuntoPreviewType = '';
  adjuntoPreviewName = '';
  archivoPreviewName = '';
  archivoError = '';
  archivoSaving = false;
  imageViewerOpen = false;
  imageViewerUrl = '';
  imageViewerTitle = '';
  legajoChecking = false;
  archivoMaxSize = 10 * 1024 * 1024;
  archivoForm: ArchivoFormState = {
    tipo: 'foto',
    alias: '',
    descripcion: '',
    es_principal: 1,
    archivo: null
  };
  fotoCardCollapsed = true;
  archivosCardCollapsed = true;
  loading = true;
  saving = false;
  error = '';
  errorModalOpen = false;
  errorModalMessage = '';
  loadingCatalogos = false;
  isEditMode = false;
  empleadoId: number | null = null;
  pendingEstadoId: number | null = null;
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private loadingService: LoadingService
  ) {
    this.form = this.createForm();
    this.setLoggedEmpresa();
    // When sección changes, filtrar cargos asociados
    this.form.get('seccion_id')?.valueChanges.subscribe((val) => {
      this.onSeccionChange(val);
    });
    // When convenio changes, load categorias for that convenio
    this.form.get('convenio_id')?.valueChanges.subscribe((val) => {
      const id = Number(val ?? null);
      try { this.form.get('convenio_categoria_id')?.setValue(null); } catch {}
      if (id) {
        this.getCategoriasByConvenio(id);
      } else {
        this.convenioCategorias = [];
      }
    });
    // When sucursal changes, load secciones for that sucursal
    this.form.get('sucursal_id')?.valueChanges.subscribe((val) => {
      const id = Number(val ?? null);
      console.debug('[EmpleadosForm] sucursal_id valueChanges ->', id);
      if (id) {
        this.getSeccionesBySucursal(id);
      } else {
        this.secciones = [];
        this.cargos = [];
      }
    });
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.empleadoId = idParam ? Number(idParam) : null;
    this.isEditMode = Number.isFinite(this.empleadoId as number);

    this.cargarCatalogos();

    if (this.isEditMode && this.empleadoId) {
      this.cargarEmpleado(this.empleadoId);
      this.cargarArchivosAdjuntos(this.empleadoId);
    } else {
      this.loading = false;
    }
  }

  private setLoggedEmpresa(): void {
    const user = this.auth.getUser();
    const empresaId = this.extractEmpresaId(user);

    if (empresaId) {
      this.form.patchValue({ empresa_id: empresaId });
      return;
    }

    this.error = 'No se pudo determinar la empresa del usuario logueado.';
  }

  private extractEmpresaId(user: any): number | null {
    const candidates = [
      user?.empresa_id,
      user?.empresaId,
      user?.empresa?.empresa_id,
      user?.empresa?.id,
      user?.user?.empresa_id,
      user?.user?.empresa?.empresa_id,
      user?.sitio?.empresa_id,
      user?.sitio?.empresa?.empresa_id
    ];

    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  cargarCatalogos(): void {
    this.loadingCatalogos = true;

    // Note: secciones are loaded on-demand per sucursal via `getSeccionesBySucursal`.
    // Load all cargos as a fallback/source list but don't populate the form cargos until a sección is selected.
    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; cargos?: CatalogoItem[] }>(`${environment.apiUrl}/api/cargos/all`)
      .pipe(catchError(() => of([] as CatalogoItem[])))
      .subscribe((res) => {
        this.allCargos = Array.isArray(res) ? res : (res?.cargos || res?.data || []);
      });

    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; sucursales?: CatalogoItem[] }>(`${environment.apiUrl}/api/sucursales`)
      .pipe(catchError(() => of([] as CatalogoItem[])))
      .subscribe((res) => {
        this.sucursales = Array.isArray(res) ? res : (res?.sucursales || res?.data || []);
      });

    this.http.get<ProvinciaItem[] | { data?: ProvinciaItem[]; provincias?: ProvinciaItem[] }>(`${environment.apiUrl}/api/provincias`)
      .pipe(catchError(() => of([] as ProvinciaItem[])))
      .subscribe((res) => {
        this.provincias = Array.isArray(res) ? res : (res?.provincias || res?.data || []);
      });

    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; contrataciones_tipos?: CatalogoItem[] }>(`${environment.apiUrl}/api/contrataciones-tipos`)
      .pipe(catchError(() => of([] as CatalogoItem[])))
      .subscribe((res) => {
        this.contratacionesTipos = Array.isArray(res) ? res : (res?.contrataciones_tipos || res?.data || []);
      });

    const conveniosParams: any = {};
    if (this.empresaId) { conveniosParams.empresa_id = String(this.empresaId); }
    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; convenios?: CatalogoItem[] }>(`${environment.apiUrl}/api/convenios`, { params: conveniosParams })
      .pipe(catchError((err) => {
        console.error('[EmpleadosForm] cargarCatalogos convenios error', err);
        return of([] as CatalogoItem[]);
      }))
      .subscribe((res) => {
        this.convenios = Array.isArray(res) ? res : (res?.convenios || res?.data || []);
        console.debug('[EmpleadosForm] convenios loaded', (this.convenios || []).length);
        // If a convenio is already selected (e.g. edit mode or prefilled), load its categorias
        const selectedConvenio = Number(this.form.get('convenio_id')?.value ?? null);
        if (selectedConvenio) {
          this.getCategoriasByConvenio(selectedConvenio);
        }
      });

    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; formas_pago?: CatalogoItem[] }>(`${environment.apiUrl}/api/formas-pago`)
      .pipe(catchError(() => of([] as CatalogoItem[])))
      .subscribe((res) => {
        this.formasPago = Array.isArray(res) ? res : (res?.formas_pago || res?.data || []);
      });

    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; estados_empleados?: CatalogoItem[] }>(`${environment.apiUrl}/api/estados-empleados`)
      .pipe(
        catchError(() => of([] as CatalogoItem[])),
        finalize(() => {
          this.loadingCatalogos = false;
        })
      )
      .subscribe((res) => {
        this.estadosEmpleados = Array.isArray(res) ? res : (res?.estados_empleados || res?.data || []);
        this.aplicarEstadoPendiente();
      });

    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; bancos?: CatalogoItem[] }>(`${environment.apiUrl}/api/bancos`)
      .pipe(catchError(() => of([] as CatalogoItem[])))
      .subscribe((res) => {
        this.bancos = Array.isArray(res) ? res : (res?.bancos || res?.data || []);
      });
  }

  cargarEmpleado(id: number): void {
    console.debug('[EmpleadosForm] cargarEmpleado start id=', id);
    this.loading = true;
    this.loadingService.show();
    this.http.get<EmpleadoFormResponse>(`${environment.apiUrl}/api/empleados/${id}`)
      .pipe(
        catchError((err) => {
          console.error('[EmpleadosForm] cargarEmpleado error', err);
          this.error = err?.error?.mensaje || 'No se pudo cargar el empleado.';
          this.loading = false;
          try { this.loadingService.hide(); } catch {}
          try { this.cdr.detectChanges(); } catch {}
          return of(null);
        }),
        finalize(() => {
          this.loading = false;
          try { this.loadingService.hide(); } catch {}
          try { this.cdr.detectChanges(); } catch { /* ignore */ }
        })
      )
      .subscribe((res) => {
        console.debug('[EmpleadosForm] cargarEmpleado response', res);
        if (!res) {
          // response empty/null — ensure spinner hidden
          try { this.loadingService.hide(); } catch {}
          try { this.cdr.detectChanges(); } catch {}
          return;
        }

        const resolvedCargoId = (res as any).cargo_id ?? (res as any).cargo?.cargo_id ?? (res as any).cargo?.id ?? null;

        this.form.patchValue({
          legajo: res.legajo || '',
          empresa_id: res.empresa_id ?? null,
          sucursal_id: res.sucursal_id ?? null,
          seccion_id: res.seccion_id ?? (res as any).seccion?.seccion_id ?? (res as any).seccion?.id ?? null,
          cargo_id: resolvedCargoId ?? null,
          tipo_documento: res.tipo_documento || 'DNI',
          numero_documento: res.numero_documento || '',
          nombre: res.nombre || '',
          apellido: res.apellido || '',
          fecha_nacimiento: this.toInputDate(res.fecha_nacimiento),
          sexo: res.sexo || '',
          estado_civil: res.estado_civil || '',
          nacionalidad: res.nacionalidad || '',
          direccion: res.direccion || '',
          localidad: res.localidad || '',
          provincia: res.provincia || '',
          telefono: res.telefono || '',
          email: res.email || '',
          fecha_ingreso: this.toInputDate(res.fecha_ingreso),
          fecha_egreso: this.toInputDate(res.fecha_egreso),
          foto: this.resolvePublicUrl(res.url_publica || res.foto_url_publica || res.foto || ''),
          sueldo_basico: (res as any).sueldo_actual ?? (res as any).sueldo_basico ?? (res as any).salario_base ?? (res as any).salario ?? (res as any).sueldo ?? null,
          convenio_id: (res as any).convenio_id ?? (res as any).convenio?.convenio_id ?? (res as any).convenio?.id ?? null,
          habilitado: res.habilitado ?? 0,
          estado: this.getEstadoControlValue(res.estado),
          tipo_contratacion_id: res.tipo_contratacion_id ?? null,
          convenio_categoria_id: res.convenio_categoria_id ?? null,
          dias_trabajados: res.dias_trabajados || '30',
          forma_pago_id: res.forma_pago_id ?? null,
          banco_id: res.cuenta_bancaria_principal?.banco_id ?? null,
          cbu: res.cuenta_bancaria_principal?.cbu ?? '',
          numero_cuenta: res.cuenta_bancaria_principal?.numero_cuenta ?? ''
        });

        // Load dependent catalogs for edit mode: secciones by sucursal, cargos by seccion
        const sucId = Number(this.form.get('sucursal_id')?.value ?? null);
        const secId = Number(this.form.get('seccion_id')?.value ?? null);
        if (sucId) {
          this.getSeccionesBySucursal(sucId);
        }
        if (secId) {
          this.getCargosBySeccion(secId);
        }

        // Convenio y categorias
        const convenioId = Number((res as any).convenio_id ?? (res as any).convenio?.convenio_id ?? (res as any).convenio?.id ?? null);
        if (convenioId) {
          this.getCategoriasByConvenio(convenioId);
        }

        const normalizedEstadoCivil = this.normalizeEstadoCivil(res.estado_civil);
        if (normalizedEstadoCivil !== this.form.get('estado_civil')?.value) {
          this.form.get('estado_civil')?.setValue(normalizedEstadoCivil);
        }

        const fotoPublica = this.resolvePublicUrl(res.url_publica || res.foto_url_publica || res.foto || '');
        if (fotoPublica) {
          this.fotoPreviewUrl = fotoPublica;
          this.fotoPrincipalError = false;
          // If the empleado already has a photo, show the photo panel expanded
          this.fotoCardCollapsed = false;
        } else {
          // No photo: keep it collapsed
          this.fotoCardCollapsed = true;
        }

        // Ensure internal identifiers and edit mode are set
        this.empleadoId = (res.empleado_id ?? res.id) ?? this.empleadoId;
        this.isEditMode = true;

        this.pendingEstadoId = this.getEstadoControlValue(res.estado);
        this.aplicarEstadoPendiente();

        // Hide spinner and update view immediately
        this.loading = false;
        try { this.loadingService.hide(); } catch {}
        try { this.cdr.detectChanges(); } catch { /* ignore */ }
      });
  }

  cargarArchivosAdjuntos(empleadoId: number): void {
    this.http.get<ArchivoEmpleadoItem[] | { data?: ArchivoEmpleadoItem[]; archivos?: ArchivoEmpleadoItem[] }>(`${environment.apiUrl}/api/empleados/${empleadoId}/archivos`)
      .pipe(catchError(() => of([] as ArchivoEmpleadoItem[])))
      .subscribe((res) => {
        this.archivosAdjuntos = Array.isArray(res) ? res : (res?.archivos || res?.data || []);
      });
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Revisá los campos obligatorios antes de guardar.';
      return;
    }

    this.verificarLegajoDuplicado()
      .then((duplicado) => {
        if (duplicado) {
          this.form.get('legajo')?.setErrors({ ...(this.form.get('legajo')?.errors || {}), duplicate: true });
          this.form.get('legajo')?.markAsTouched();
          this.error = 'El número de legajo ya existe. Debe agregar otro.';
          return;
        }

        this.guardarEmpleado();
      })
      .catch(() => {
        this.error = 'No se pudo validar el legajo. Intentá nuevamente.';
      });
  }

  private guardarEmpleado(): void {

    this.saving = true;
    this.error = '';

    const payload = this.buildPayload();
    const request$ = this.isEditMode && this.empleadoId
      ? this.http.put(`${environment.apiUrl}/api/empleados/${this.empleadoId}`, payload)
      : this.http.post(`${environment.apiUrl}/api/empleados`, payload);

    this.loadingService.show();
    request$
      .pipe(
        catchError((err) => {
          // Show detailed backend error in modal when available
          this.displayError(err);
          return of(null);
        }),
        finalize(() => {
          this.saving = false;
          this.loadingService.hide();
        })
      )
      .subscribe((res) => {
        if (!res) {
          return;
        }

        const createdId = (res as { empleado_id?: number; id?: number })?.empleado_id ?? (res as { empleado_id?: number; id?: number })?.id ?? this.empleadoId;
        if (!this.empleadoId && createdId) {
          this.empleadoId = createdId;
          this.isEditMode = true;
        }

        this.router.navigate(['/admin/empleados/listado']);
      });
  }

  private displayError(err: any): void {
    // Compose a detailed message from various possible backend shapes
    let details = '';
    try {
      if (!err) {
        details = 'Error desconocido.';
      } else if (typeof err === 'string') {
        details = err;
      } else if (err.error) {
        const payload = err.error;
        if (typeof payload === 'string') {
          details = payload;
        } else if (payload.message || payload.mensaje) {
          details = String(payload.message || payload.mensaje);
        } else if (payload.errors) {
          if (typeof payload.errors === 'string') {
            details = payload.errors;
          } else if (Array.isArray(payload.errors)) {
            details = payload.errors.join('\n');
          } else {
            details = JSON.stringify(payload.errors, null, 2);
          }
        } else {
          details = JSON.stringify(payload, null, 2);
        }
      } else if (err.message) {
        details = String(err.message);
      } else {
        details = JSON.stringify(err, null, 2);
      }
    } catch (e) {
      details = 'Error al procesar el detalle del error.';
    }

    this.errorModalMessage = details;
    this.errorModalOpen = true;
    try { this.cdr.detectChanges(); } catch {}
  }

  validarLegajoDuplicado(): void {
    const legajoControl = this.form.get('legajo');
    const legajo = String(legajoControl?.value || '').trim();

    if (!legajo) {
      return;
    }

    this.verificarLegajoDuplicado().catch(() => undefined);
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.archivoError = '';

    if (!file) {
      this.archivoForm.archivo = null;
      this.archivoPreviewName = '';
      return;
    }

    if (file.size <= 0) {
      this.archivoError = 'El archivo está vacío.';
      input.value = '';
      return;
    }

    if (file.size > this.archivoMaxSize) {
      this.archivoError = 'El archivo supera el tamaño máximo permitido.';
      input.value = '';
      return;
    }

    const tipo = (this.archivoForm.tipo || '').toLowerCase();
    if (tipo === 'foto' && !file.type.startsWith('image/')) {
      this.archivoError = 'Para foto solo se permiten imágenes.';
      input.value = '';
      return;
    }

    if (tipo !== 'foto' && file.type !== 'application/pdf') {
      this.archivoError = 'Para documentos solo se permite PDF.';
      input.value = '';
      return;
    }

    this.archivoForm.archivo = file;
    this.archivoPreviewName = file.name;

    this.adjuntoPreviewName = file.name;
    this.adjuntoPreviewType = file.type || '';
    this.adjuntoPreviewUrl = '';

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        this.adjuntoPreviewUrl = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      this.adjuntoPreviewUrl = '';
    }

    if (tipo === 'foto') {
      const reader = new FileReader();
      reader.onload = () => {
        this.adjuntoPreviewUrl = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    }
  }

  onFotoSeleccionada(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fotoError = '';

    if (!file) {
      this.fotoArchivo = null;
      this.fotoArchivoNombre = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.fotoError = 'La foto principal debe ser una imagen.';
      input.value = '';
      return;
    }

    if (file.size > this.archivoMaxSize) {
      this.fotoError = 'La foto supera el tamaño máximo permitido.';
      input.value = '';
      return;
    }

    this.fotoArchivo = file;
    this.fotoArchivoNombre = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      this.fotoPreviewUrl = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  subirFotoPrincipal(): void {
    if (!this.empleadoId) {
      this.fotoError = 'Primero guardá el empleado para poder subir la foto principal.';
      return;
    }

    if (!this.fotoArchivo) {
      this.fotoError = 'Seleccioná una foto antes de subirla.';
      return;
    }

    this.fotoSaving = true;
    this.fotoError = '';

    const formData = new FormData();
    formData.append('empleado_id', String(this.empleadoId));
    formData.append('tipo', 'foto');
    formData.append('alias', this.fotoArchivo.name);
    formData.append('descripcion', 'Foto principal del empleado');
    formData.append('es_principal', '1');
    formData.append('archivo', this.fotoArchivo, this.fotoArchivo.name);

    // Use reportProgress to provide immediate feedback and avoid UI waiting unexpectedly
    this.http.post<ArchivoEmpleadoItem>(`${environment.apiUrl}/api/empleados/${this.empleadoId}/archivos`, formData, { reportProgress: true, observe: 'events' as any })
      .pipe(
        catchError((err) => {
          this.fotoError = err?.error?.mensaje || 'No se pudo subir la foto principal.';
          this.fotoSaving = false;
          this.displayError(err);
          return of(null as any);
        })
      )
      .subscribe((event: any) => {
        if (!event) { return; }
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || 1;
          // opcional: podrías exponer esta variable para mostrar progreso
          const percent = Math.round(100 * event.loaded / total);
          // console.debug('[EmpleadosForm] foto upload progress', percent);
          return;
        }

        if (event.type === HttpEventType.Response) {
          const res = event.body as ArchivoEmpleadoItem | null;
          if (!res) { this.fotoSaving = false; return; }

          const fotoUrl = res.url_publica || res.url || res.ruta;
          if (fotoUrl) {
            const fotoPublica = this.resolvePublicUrl(fotoUrl);
            this.fotoPreviewUrl = fotoPublica;
            this.adjuntoPreviewUrl = fotoPublica;
            this.form.patchValue({ foto: fotoPublica });
          }

          this.fotoArchivo = null;
          this.fotoArchivoNombre = '';
          this.fotoSaving = false;
        }
      });
  }

  subirArchivo(): void {
    if (!this.empleadoId) {
      this.archivoError = 'Primero guardá el empleado para obtener su identificador.';
      return;
    }

    if (!this.archivoForm.archivo) {
      this.archivoError = 'Seleccioná un archivo antes de subirlo.';
      return;
    }

    this.archivoSaving = true;
    this.archivoError = '';

    const formData = new FormData();
    formData.append('empleado_id', String(this.empleadoId));
    formData.append('tipo', this.archivoForm.tipo);
    formData.append('alias', this.archivoForm.alias || this.archivoForm.archivo.name);
    formData.append('descripcion', this.archivoForm.descripcion || '');
    formData.append('es_principal', String(this.archivoForm.es_principal ? 1 : 0));
    formData.append('archivo', this.archivoForm.archivo, this.archivoForm.archivo.name);

    // Use reportProgress to update UI as upload proceeds and avoid apparent fixed waits
    this.http.post<ArchivoEmpleadoItem>(`${environment.apiUrl}/api/empleados/${this.empleadoId}/archivos`, formData, { reportProgress: true, observe: 'events' as any })
      .pipe(
        catchError((err) => {
          this.archivoError = err?.error?.mensaje || 'No se pudo subir el archivo.';
          this.archivoSaving = false;
          this.displayError(err);
          return of(null as any);
        })
      )
      .subscribe((event: any) => {
        if (!event) { return; }
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || 1;
          const percent = Math.round(100 * event.loaded / total);
          // console.debug('[EmpleadosForm] archivo upload progress', percent);
          return;
        }

        if (event.type === HttpEventType.Response) {
          const res = event.body as ArchivoEmpleadoItem | null;
          if (!res) { this.archivoSaving = false; return; }

          this.archivosAdjuntos = [res, ...this.archivosAdjuntos];

          const archivoPublico = this.resolvePublicUrl(res.url_publica || res.url || res.ruta || '');

          if (this.archivoForm.tipo === 'foto' && this.archivoForm.es_principal === 1 && archivoPublico) {
            this.fotoPreviewUrl = archivoPublico;
            this.form.patchValue({ foto: archivoPublico });
          }

          this.archivoForm.archivo = null;
          this.archivoPreviewName = '';
          this.archivoForm.alias = '';
          this.archivoForm.descripcion = '';
          this.archivoForm.es_principal = 1;
          this.archivoSaving = false;
        }
      });
  }

  borrarArchivo(archivo: ArchivoEmpleadoItem): void {
    const archivoId = archivo.archivo_id;
    if (!this.empleadoId || !archivoId) {
      return;
    }

    this.http.delete(`${environment.apiUrl}/api/empleados/${this.empleadoId}/archivos/${archivoId}`)
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.archivosAdjuntos = this.archivosAdjuntos.filter((item) => item.archivo_id !== archivoId);
      });
  }

  descargarArchivo(archivo: ArchivoEmpleadoItem): void {
    const url = this.resolvePublicUrl(archivo.url_publica || archivo.url || archivo.ruta || '');
    if (url) {
      window.open(url, '_blank');
    }
  }

  attachmentPreviewUrl(archivo: ArchivoEmpleadoItem): string {
    return this.resolvePublicUrl(archivo.url_publica || archivo.url || archivo.ruta || '');
  }

  attachmentPreviewType(archivo: ArchivoEmpleadoItem): string {
    return (archivo.mime_type || '').toLowerCase();
  }

  attachmentIsImage(archivo: ArchivoEmpleadoItem): boolean {
    return this.attachmentPreviewType(archivo).startsWith('image/');
  }

  attachmentThumbLabel(archivo: ArchivoEmpleadoItem): string {
    return archivo.alias || archivo.nombre_archivo || 'Archivo';
  }

  attachmentIsPrincipal(archivo: ArchivoEmpleadoItem): boolean {
    return archivo.es_principal === 1 || archivo.es_principal === true;
  }

  openImageViewer(archivo: ArchivoEmpleadoItem): void {
    if (!this.attachmentIsImage(archivo)) {
      return;
    }

    this.imageViewerUrl = this.attachmentPreviewUrl(archivo);
    this.imageViewerTitle = this.attachmentThumbLabel(archivo);
    this.imageViewerOpen = true;
  }

  openPhotoViewer(): void {
    const url = this.form.get('foto')?.value;
    if (!url) {
      return;
    }

    this.imageViewerUrl = String(url);
    this.imageViewerTitle = `${this.form.get('apellido')?.value || 'Empleado'} ${this.form.get('nombre')?.value || ''}`.trim() || 'Foto principal';
    this.imageViewerOpen = true;
  }

  onMainPhotoError(): void {
    this.fotoPrincipalError = true;
    this.form.patchValue({ foto: '' });
  }

  closeImageViewer(): void {
    this.imageViewerOpen = false;
    this.imageViewerUrl = '';
    this.imageViewerTitle = '';
  }

  get hasAdjuntoPreview(): boolean {
    return !!this.adjuntoPreviewUrl || !!this.adjuntoPreviewName;
  }

  get adjuntoEsImagen(): boolean {
    return !!this.adjuntoPreviewType && this.adjuntoPreviewType.startsWith('image/');
  }

  get adjuntoEsPdf(): boolean {
    return this.adjuntoPreviewType === 'application/pdf';
  }

  get adjuntoPreviewLabel(): string {
    if (this.adjuntoEsImagen) {
      return 'Vista previa de imagen';
    }

    if (this.adjuntoEsPdf) {
      return 'Documento PDF';
    }

    return 'Archivo seleccionado';
  }

  cancelar(): void {
    this.router.navigate(['/admin/empleados/listado']);
  }

  get titulo(): string {
    return this.isEditMode ? 'Editar empleado' : 'Alta de empleado';
  }

  get subtitulo(): string {
    return this.isEditMode
      ? 'Actualización completa del legajo y datos personales.'
      : 'Carga profesional de un nuevo empleado con toda su información.';
  }

  get empresaId(): number | null {
    return this.form.value.empresa_id ?? null;
  }

  get edad(): string {
    const fecha = this.form.get('fecha_nacimiento')?.value;
    if (!fecha) { return '-'; }
    const nacimiento = new Date(String(fecha));
    if (Number.isNaN(nacimiento.getTime())) { return '-'; }
    const hoy = new Date();
    let anos = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
      anos--;
    }
    if (anos < 0) { return '-'; }
    return `${anos} años`;
  }

  get sueldoBasico(): string {
    const valor = this.form.get('sueldo_basico')?.value;
    if (valor === null || typeof valor === 'undefined' || valor === '') { return '-'; }
    const num = Number(valor);
    if (!Number.isFinite(num)) { return String(valor); }
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(num);
    } catch (e) {
      return String(num);
    }
  }

  get sueldoCategoriaMin(): string {
    const raw = this.form.get('convenio_categoria_id')?.value;
    const id = Number(raw ?? null);
    if (!id) { return '-'; }
    const cat = this.convenioCategorias.find((c) => Number((c as any).categoria_id ?? c.id) === id);
    if (!cat) { return '-'; }
    const valor = Number(((cat as any).sueldo_min ?? (cat as any).sueldo_min ?? (cat as any).sueldo) || NaN);
    if (!Number.isFinite(valor)) { return '-'; }
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);
    } catch (e) {
      return String(valor);
    }
  }

  get selectedFormaPago(): CatalogoItem | null {
    const id = this.form.value.forma_pago_id ?? null;
    if (id === null) {
      return null;
    }

    return this.formasPago.find((item) => this.getCatalogoId(item) === Number(id)) || null;
  }

  get requiereBanco(): boolean {
    return this.flagEnabled(this.selectedFormaPago?.requiere_banco);
  }

  get requiereCbu(): boolean {
    return this.flagEnabled(this.selectedFormaPago?.requiere_cbu);
  }

  get requiereCuenta(): boolean {
    return this.flagEnabled(this.selectedFormaPago?.requiere_cuenta);
  }

  get bancoSeleccionado(): boolean {
    return !!this.form.value.banco_id;
  }

  trackByCatalogoId(_: number, item: CatalogoItem): number {
    return item.id ?? item.convenio_id ?? item.categoria_id ?? item.contrataciones_tipos_id ?? item.forma_pago_id ?? item.estado_empleado_id ?? item.banco_id ?? item.sucursal_id ?? item.cargo_id ?? item.seccion_id ?? 0;
  }

  trackByProvinciaId(_: number, item: ProvinciaItem): number {
    return item.provincia_id ?? item.id ?? 0;
  }

  mostrarDatosBancarios(): boolean {
    return this.requiereBanco || this.requiereCbu || this.requiereCuenta;
  }

  toggleFotoCard(): void {
    this.fotoCardCollapsed = !this.fotoCardCollapsed;
  }

  toggleArchivosCard(): void {
    this.archivosCardCollapsed = !this.archivosCardCollapsed;
  }

  private toInputDate(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }

  private createForm(): FormGroup {
    return this.fb.group({
      legajo: ['', [Validators.required, Validators.maxLength(20)]],
      empresa_id: [null as number | null, [Validators.required]],
      sucursal_id: [null as number | null, [Validators.required]],
      seccion_id: [null as number | null, [Validators.required]],
      cargo_id: [null as number | null, [Validators.required]],
      tipo_documento: ['DNI', [Validators.required]],
      numero_documento: ['', [Validators.required, Validators.maxLength(20)]],
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      apellido: ['', [Validators.required, Validators.maxLength(100)]],
      fecha_nacimiento: [''],
      sueldo_basico: [null as number | null],
      sexo: [''],
      estado_civil: [''],
      nacionalidad: ['Argentino'],
      direccion: [''],
      localidad: [''],
      provincia: [''],
      telefono: [''],
      email: ['', [Validators.email]],
      fecha_ingreso: [''],
      fecha_egreso: [''],
      foto: [''],
      habilitado: [0],
      estado: [1],
      tipo_contratacion_id: [null as number | null],
      convenio_id: [null as number | null],
      convenio_categoria_id: [null as number | null],
      dias_trabajados: ['30'],
      forma_pago_id: [null as number | null],
      banco_id: [null as number | null],
      cbu: [''],
      numero_cuenta: ['']
    });
  }

  private buildPayload(): Record<string, unknown> {
    const value = this.form.value;
    const cuentaBancariaPrincipal = this.mostrarDatosBancarios()
      ? {
          banco_id: this.requiereBanco ? value.banco_id ?? null : null,
          cbu: this.requiereCbu ? (value.cbu || null) : null,
          numero_cuenta: this.requiereCuenta ? (value.numero_cuenta || null) : null
        }
      : null;

    return {
      ...value,
      cuenta_bancaria_principal: cuentaBancariaPrincipal
    };
  }

  get esFotoLista(): boolean {
    return this.archivoForm.tipo === 'foto';
  }

  get acceptArchivo(): string {
    return this.archivoForm.tipo === 'foto' ? 'image/*' : 'application/pdf';
  }

  get tamanioArchivoTexto(): string {
    return `${Math.round(this.archivoMaxSize / 1024 / 1024)} MB`;
  }

  getCatalogoId(item: CatalogoItem | null | undefined): number {
    return Number(
      item?.id ??
      item?.cargo_id ??
      item?.seccion_id ??
      item?.sucursal_id ??
      item?.forma_pago_id ??
      item?.contrataciones_tipos_id ??
      item?.estado_empleado_id ??
      item?.banco_id ??
      0
    );
  }

  getEstadoOptionValue(item: any | null | undefined): number {

    return Number(item?.estado_id ?? item?.id ?? 0);
  }

  private flagEnabled(value: number | boolean | string | undefined): boolean {
    return value === true || value === 1 || value === '1';
  }

  private getEstadoControlValue(value: string | number | {
    estado_id?: number;
    id?: number;
    nombre?: string;
    descripcion?: string | null;
    es_activo?: number | boolean;
  } | null | undefined): number {
    if (value && typeof value === 'object') {
      const estadoId = Number(value.estado_id ?? value.id);
      if (Number.isFinite(estadoId) && estadoId > 0) {
        return estadoId;
      }

      if (value.nombre === '1' || value.nombre === 'activo' || value.nombre === 'Activo') {
        return 1;
      }

      if (value.es_activo === 1 || value.es_activo === true) {
        return 1;
      }

      return 0;
    }

    if (value === '1' || value === 1 || value === 'activo' || value === 'Activo') {
      return 1;
    }

    if (value === '0' || value === 0 || value === 'inactivo' || value === 'Inactivo') {
      return 0;
    }

    const parsed = Number(value ?? 1);
    return Number.isFinite(parsed) ? parsed : 1;
  }

  private normalizeEstadoCivil(value: string | null | undefined): string {
    const opciones = [
      'Soltero/a',
      'Casado/a',
      'Divorciado/a',
      'Viudo/a',
      'Separado/a',
      'Unión convivencial'
    ];

    if (!value && value !== '') {
      return '';
    }

    const cleaned = String(value || '').trim();
    const cleanedKey = this.stripAccents(cleaned).toLowerCase();

    for (const opt of opciones) {
      if (this.stripAccents(opt).toLowerCase() === cleanedKey) {
        return opt;
      }
    }

    // Try fuzzy match (startsWith / includes)
    for (const opt of opciones) {
      const optKey = this.stripAccents(opt).toLowerCase();
      if (cleanedKey.includes(optKey) || optKey.includes(cleanedKey)) {
        return opt;
      }
    }

    return '';
  }

  private stripAccents(s: string): string {
    return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  }

  estadoOptionValue(item: CatalogoItem | null | undefined): string {
    return String(item?.estado_empleado_id || item?.id || '');
  }

  private aplicarEstadoPendiente(): void {
    if (this.pendingEstadoId === null) {
      return;
    }

    if (!this.estadosEmpleados.length) {
      return;
    }

    const estadoExiste = this.estadosEmpleados.some((item) => Number(item.estado_empleado_id ?? item.id) === this.pendingEstadoId);
    if (!estadoExiste) {
      return;
    }

    this.form.get('estado')?.setValue(this.pendingEstadoId);
  }

  onSeccionChange(seccionId?: number | string | null | undefined): void {
    const raw = (typeof seccionId === 'undefined') ? this.form.get('seccion_id')?.value : seccionId;
    const id = Number(raw ?? null);
    // Clear cargo selection immediately when sección changes
    try { this.form.get('cargo_id')?.setValue(null); } catch {}

    if (!id) {
      this.cargos = [];
      return;
    }

    this.getCargosBySeccion(id, false);
  }

  private getSeccionesBySucursal(sucursalId: number, forceReload = false): void {
    console.debug('[EmpleadosForm] getSeccionesBySucursal start sucursalId=', sucursalId, 'forceReload=', forceReload);
    if (!sucursalId) { this.secciones = []; return; }
    if (!forceReload && this.seccionesCache.has(sucursalId)) {
      this.secciones = this.seccionesCache.get(sucursalId) || [];
      this.lastFetchedSucursalId = sucursalId;
      return;
    }
    this.loadingSecciones = true;
    this.seccionesError = '';
    this.http.get<any>(`${environment.apiUrl}/api/secciones/by-sucursal`, { params: { sucursal_id: String(sucursalId) } as any })
      .pipe(catchError((err) => {
        console.error('[EmpleadosForm] getSeccionesBySucursal error', err);
        if (err?.status === 401) { try { this.auth.logout(); } catch {} }
        this.seccionesError = err?.error?.mensaje || err?.error?.message || 'No se pudieron cargar las secciones.';
        this.loadingSecciones = false;
        return of([]);
      }))
      .subscribe((res: any) => {
        const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : (res?.secciones || res?.data || []));
        this.secciones = list || [];
        this.seccionesCache.set(sucursalId, this.secciones);
        this.loadingSecciones = false;
        this.lastFetchedSucursalId = sucursalId;
        try { this.cdr.detectChanges(); } catch {}
      });
  }

  private getCargosBySeccion(seccionId: number, forceReload = false): void {
    console.debug('[EmpleadosForm] getCargosBySeccion start seccionId=', seccionId, 'forceReload=', forceReload);
    if (!seccionId) { this.cargos = []; return; }
    if (!forceReload && this.cargosCache.has(seccionId)) {
      this.cargos = this.cargosCache.get(seccionId) || [];
      this.lastFetchedSeccionId = seccionId;
      return;
    }
    this.loadingCargos = true;
    this.cargosError = '';
    this.http.get<any>(`${environment.apiUrl}/api/cargos/by-seccion`, { params: { seccion_id: String(seccionId) } as any })
      .pipe(catchError((err) => {
        console.error('[EmpleadosForm] getCargosBySeccion error', err);
        if (err?.status === 401) { try { this.auth.logout(); } catch {} }
        this.cargosError = err?.error?.mensaje || err?.error?.message || 'No se pudieron cargar los cargos.';
        this.loadingCargos = false;
        return of([]);
      }))
      .subscribe((res: any) => {
        const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : (res?.cargos || res?.data || []));
        this.cargos = list.length ? list : [];
        this.cargosCache.set(seccionId, list);
        this.loadingCargos = false;
        this.lastFetchedSeccionId = seccionId;
        // If current selected cargo not in list, clear it
        const currentCargo = this.form.get('cargo_id')?.value;
        const matching = this.cargos.find((c) => this.getCatalogoId(c) === Number(currentCargo));
        if (!matching) { this.form.get('cargo_id')?.setValue(null); }
        try { this.cdr.detectChanges(); } catch {}
      });
  }

  // Called from template (change event) or programmatically when sucursal changes
  onSucursalChange(): void {
    const raw = this.form.get('sucursal_id')?.value;
    const id = Number(raw ?? null);
    console.debug('[EmpleadosForm] onSucursalChange ->', id);
    // clear dependent controls
    try { this.form.get('seccion_id')?.setValue(null); this.form.get('cargo_id')?.setValue(null); } catch {}
    if (id) {
      this.getSeccionesBySucursal(id, false);
    } else {
      this.secciones = [];
      this.cargos = [];
    }
  }

  onSucursalClick(): void {
    // Force reload when user interacts with the select (covers re-selecting same value)
    setTimeout(() => {
      const raw = this.form.get('sucursal_id')?.value;
      const id = Number(raw ?? null);
      console.debug('[EmpleadosForm] onSucursalClick ->', id);
      if (id) {
        this.getSeccionesBySucursal(id, true);
      }
    }, 0);
  }

  onSeccionClick(): void {
    // Force reload when user interacts with the sección select (covers re-selecting same value)
    setTimeout(() => {
      const raw = this.form.get('seccion_id')?.value;
      const id = Number(raw ?? null);
      console.debug('[EmpleadosForm] onSeccionClick ->', id);
      if (id) {
        this.getCargosBySeccion(id, true);
      }
    }, 0);
  }

  get filteredCargos(): CatalogoItem[] {
    const secVal = this.form.get('seccion_id')?.value;
    const secId = Number(secVal ?? null);
    if (!this.allCargos || !this.allCargos.length) {
      return [];
    }
    // Si no hay sección seleccionada, no mostrar cargos.
    if (!secId) {
      return [];
    }
    const filtered = this.allCargos.filter((c) => {
      // Extraer de forma robusta el seccion_id del cargo (número o string)
      const raw = (c as any).seccion_id ?? (c as any).seccionId ?? (c as any).seccion?.seccion_id ?? (c as any).seccion?.id ?? (c as any).seccion ?? null;
      if (raw === null || raw === undefined) { return false; }
      const candidateStr = String(raw);
      return candidateStr === String(secId);
    });
    return filtered.length ? filtered : [];
  }

  private resolvePublicUrl(url: string): string {
    const value = (url || '').trim();
    if (!value) {
      return '';
    }

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (value.startsWith('/')) {
      return `${environment.apiUrl}${value}`;
    }

    return `${environment.apiUrl}/${value}`;
  }

  getControlError(controlName: string): string {
    const control = this.form.get(controlName);

    if (!control || !control.touched || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return 'Este campo es obligatorio.';
    }

    if (control.errors['maxlength']) {
      const maxLength = control.errors['maxlength'].requiredLength;
      return `Máximo ${maxLength} caracteres.`;
    }

    if (control.errors['email']) {
      return 'Ingresá un correo válido.';
    }

    if (control.errors['duplicate']) {
      return 'El número de legajo ya existe. Debe agregar otro.';
    }

    return 'Valor inválido.';
  }

  private verificarLegajoDuplicado(): Promise<boolean> {
    const legajoControl = this.form.get('legajo');
    const legajo = String(legajoControl?.value || '').trim();

    if (!legajo) {
      return Promise.resolve(false);
    }

    this.legajoChecking = true;

    return new Promise<boolean>((resolve, reject) => {
      this.http.get<EmpleadoFormResponse[] | { data?: EmpleadoFormResponse[]; empleados?: EmpleadoFormResponse[] }>(`${environment.apiUrl}/api/empleados`)
        .pipe(finalize(() => {
          this.legajoChecking = false;
        }))
        .subscribe({
          next: (res) => {
            const empleados = Array.isArray(res) ? res : (res?.empleados || res?.data || []);
            const currentId = this.empleadoId ?? null;
            const duplicado = empleados.some((empleado) => {
              const mismoLegajo = String(empleado.legajo || '').trim() === legajo;
              const mismoEmpleado = currentId !== null && Number(empleado.empleado_id ?? empleado.id ?? 0) === currentId;
              return mismoLegajo && !mismoEmpleado;
            });

            if (duplicado) {
              legajoControl?.setErrors({ ...(legajoControl.errors || {}), duplicate: true });
            } else if (legajoControl?.errors?.['duplicate']) {
              const { duplicate, ...rest } = legajoControl.errors;
              legajoControl.setErrors(Object.keys(rest).length ? rest : null);
            }

            resolve(duplicado);
          },
          error: reject
        });
    });
  }

  private getCategoriasByConvenio(convenioId: number, forceReload = false): void {
    if (!convenioId) { this.convenioCategorias = []; return; }
    const params: any = {};
    if (this.empresaId) { params.empresa_id = String(this.empresaId); }
    this.http.get<any>(`${environment.apiUrl}/api/convenios/${convenioId}/categorias`, { params })
      .pipe(catchError((err) => {
        console.error('[EmpleadosForm] getCategoriasByConvenio error', err);
        this.convenioCategorias = [];
        return of([]);
      }))
      .subscribe((res: any) => {
        const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : (res?.categorias || res?.data || []));
        this.convenioCategorias = list || [];
        try { this.cdr.detectChanges(); } catch {}
      });
  }

  closeErrorModal(): void {
    this.errorModalOpen = false;
    this.errorModalMessage = '';
    try { this.cdr.detectChanges(); } catch {}
  }
}
