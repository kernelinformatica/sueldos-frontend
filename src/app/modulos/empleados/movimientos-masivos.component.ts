import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { EmpleadosConceptosService } from './empleados-conceptos.service';
import { AuthService } from '../../auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { LoadingService } from '../../shared/loading-spinner/loading.service';

@Component({
  selector: 'app-movimientos-masivos',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './movimientos-masivos.component.html',
  styleUrls: ['./movimientos-masivos.component.scss']
})
export class MovimientosMasivosComponent implements OnInit {
  filterForm: FormGroup;
  cargos: any[] = [];
  secciones: any[] = [];
  sucursales: any[] = [];
  private seccionesCache = new Map<number, any[]>();
  private cargosCache = new Map<number, any[]>();
  private allCargos: any[] = [];
  loadingCatalogos = false;
  employees: any[] = [];
  conceptos: any[] = [];
  conceptQ = '';
  conceptTipo = '';
  conceptTipos: any[] = [];
  selectedEmployeeIds = new Set<number>();
  selectedConcepts: { concepto_id: number; importe?: number | null; unidades?: number | null }[] = [];
  loading = false;
  result: any = null;
  assignSummary: any[] = [];
  // last payload enviado, usado para reintentos por empleado
  lastPayload: any = null;
  // Modal state for showing success/error messages from backend
  modalVisible = false;
  modalClosing = false;
  private modalCloseTimeout: any = null;
  private modalForceCloseTimeout: any = null;
  modalTitle = '';
  modalMessage: string | null = null;
  modalErrors: any = null;
  avatarsSinImagen = new Set<number>();
  // track which employees have their conceptos list expanded
  expandedEmployeeIds = new Set<number>();

  constructor(
    private fb: FormBuilder,
    private svc: EmpleadosConceptosService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private loadingService: LoadingService
    , private auth: AuthService
  ) {
    this.filterForm = this.fb.group({
      q: [''],
      tipo_contratacion: [''],
      sucursal_id: [null],
      cargo: [''],
      seccion: ['']
    });
  }

  ngOnInit(): void {
    this.loadConceptos();
    this.cargarEmpleados();
    this.cargarCatalogos();
    // cuando cambia sucursal en filtros, cargar secciones por sucursal
    this.filterForm.get('sucursal_id')?.valueChanges.subscribe((val) => {
      const id = Number(val ?? null);
      try { this.filterForm.get('seccion')?.setValue(null); this.filterForm.get('cargo')?.setValue(null); } catch {}
      if (id) {
        this.getSeccionesBySucursal(id, false);
      } else {
        this.secciones = [];
        this.cargos = [];
      }
    });
    // cuando cambia seccion en filtros, cargar cargos por seccion
    this.filterForm.get('seccion')?.valueChanges.subscribe((val) => {
      const id = Number(val ?? null);
      try { this.filterForm.get('cargo')?.setValue(null); } catch {}
      if (id) {
        this.getCargosBySeccion(id, false);
      } else {
        this.cargos = [];
      }
    });
  }

  cargarCatalogos(): void {
    this.loadingCatalogos = true;
    // Load sucursales and all cargos (we'll fetch secciones/cargos by sucursal/seccion on demand)
    this.http.get<any[] | { data?: any[]; cargos?: any[] }>(`${environment.apiUrl}/api/cargos/all`)
      .pipe(catchError(() => of([] as any[])))
      .subscribe((res) => {
        this.allCargos = Array.isArray(res) ? res : (res?.cargos || res?.data || []);
      });

    this.http.get<any[] | { data?: any[]; sucursales?: any[] }>(`${environment.apiUrl}/api/sucursales`)
      .pipe(catchError(() => of([] as any[])))
      .subscribe((res) => {
        this.sucursales = Array.isArray(res) ? res : (res?.sucursales || res?.data || []);
      });

    this.http.get<any[] | { data?: any[]; estados_empleados?: any[] }>(`${environment.apiUrl}/api/estados-empleados`)
      .pipe(
        catchError(() => of([] as any[])),
        finalize(() => { this.loadingCatalogos = false; })
      )
      .subscribe(() => { /* estados handled elsewhere if needed */ });
  }

  private getSeccionesBySucursal(sucursalId: number, forceReload = false): void {
    if (!sucursalId) { this.secciones = []; return; }
    if (!forceReload && this.seccionesCache.has(sucursalId)) {
      this.secciones = this.seccionesCache.get(sucursalId) || [];
      return;
    }
    this.loadingCatalogos = true;
    this.http.get<any>(`${environment.apiUrl}/api/secciones/by-sucursal`, { params: { sucursal_id: String(sucursalId) } as any })
      .pipe(catchError(() => of([] as any[])), finalize(() => { this.loadingCatalogos = false; }))
      .subscribe((res) => {
        const list = Array.isArray(res) ? res : (res?.secciones || res?.data || []);
        this.secciones = list || [];
        this.seccionesCache.set(sucursalId, this.secciones);
      });
  }

  private getCargosBySeccion(seccionId: number, forceReload = false): void {
    if (!seccionId) { this.cargos = []; return; }
    if (!forceReload && this.cargosCache.has(seccionId)) {
      this.cargos = this.cargosCache.get(seccionId) || [];
      return;
    }
    this.loadingCatalogos = true;
    this.http.get<any>(`${environment.apiUrl}/api/cargos/by-seccion`, { params: { seccion_id: String(seccionId) } as any })
      .pipe(catchError(() => of([] as any[])), finalize(() => { this.loadingCatalogos = false; }))
      .subscribe((res) => {
        const list = Array.isArray(res) ? res : (res?.cargos || res?.data || []);
        this.cargos = list || [];
        this.cargosCache.set(seccionId, list || []);
      });
  }

  // Called from template (change event) or programmatically when sucursal changes
  onSucursalChange(): void {
    const raw = this.filterForm.get('sucursal_id')?.value;
    const id = Number(raw ?? null);
    try { this.filterForm.get('seccion')?.setValue(null); this.filterForm.get('cargo')?.setValue(null); } catch {}
    if (id) {
      this.getSeccionesBySucursal(id, false);
    } else {
      this.secciones = [];
      this.cargos = [];
    }
  }

  onSucursalClick(): void {
    setTimeout(() => {
      const raw = this.filterForm.get('sucursal_id')?.value;
      const id = Number(raw ?? null);
      if (id) {
        this.getSeccionesBySucursal(id, true);
      }
    }, 0);
  }

  cargarEmpleados(): void {
    this.loading = true;
    this.loadingService.show();

    this.http
      .get<any[] | { data?: any[]; empleados?: any[] }>(`${environment.apiUrl}/api/empleados`)
      .pipe(
        catchError((err) => {
          console.error('Error cargando empleados', err);
          return of([] as any[]);
        }),
        finalize(() => {
          this.loading = false;
          try { this.cdr.detectChanges(); } catch {}
          this.loadingService.hide();
        })
      )
      .subscribe((res) => {
        const rows = Array.isArray(res) ? res : (res?.empleados || res?.data || []);
        this.employees = rows;
        try { this.cdr.detectChanges(); } catch {}
      });
  }

  private normalizarTexto(valor: string): string {
    return (valor || '').toString().trim().toLowerCase();
  }

  private parseCatalogoId(valor: string | number | null | undefined): number | null {
    const texto = (valor ?? '').toString().trim();
    if (!texto) return null;
    const parsed = Number(texto);
    return Number.isFinite(parsed) ? parsed : null;
  }

  get empleadosFiltrados(): any[] {
    const nombre = this.normalizarTexto(this.filterForm.get('q')?.value || '');
    const cargoId = this.parseCatalogoId(this.filterForm.get('cargo')?.value);
    const seccionId = this.parseCatalogoId(this.filterForm.get('seccion')?.value);

    return this.employees.filter((empleado) => {
      const nombreCompleto = this.normalizarTexto(((empleado.apellido || '') + ' ' + (empleado.nombre || '')).trim());

      if (nombre && !nombreCompleto.includes(nombre)) return false;

      const empleadoCargoId = this.parseCatalogoId(empleado.cargo_id ?? empleado.cargo?.cargo_id ?? null);
      if (cargoId !== null && empleadoCargoId !== null && empleadoCargoId !== cargoId) return false;

      const empleadoSeccionId = this.parseCatalogoId(empleado.seccion_id ?? empleado.seccion?.seccion_id ?? null);
      if (seccionId !== null && empleadoSeccionId !== null && empleadoSeccionId !== seccionId) return false;

      return true;
    });
  }

  loadConceptos() {
    this.svc.getConceptosDisponibles({ per_page: 200 }).subscribe((res: any) => {
      this.conceptos = res.items || [];
      // extraer tipos disponibles desde la propiedad anidada tipo_concepto
      const tipos = new Map<string, any>();
      (this.conceptos || []).forEach((c: any) => {
        const tipo = c?.tipo_concepto;
        const key = tipo ? String(tipo.tipo_concepto_id ?? tipo.codigo ?? tipo.nombre) : '';
        const nombre = tipo ? (tipo.nombre || tipo.codigo || key) : '';
        if (key && !tipos.has(key)) tipos.set(key, { id: key, nombre });
      });
      this.conceptTipos = Array.from(tipos.values());
    });
  }

  getConceptId(concepto: any): number | null {
    return concepto?.concepto_id ?? concepto?.id ?? null;
  }

  toggleEmployee(emp: any) {
    const id = this.getEmpleadoId(emp);
    if (!id) return;
    if (this.selectedEmployeeIds.has(id)) this.selectedEmployeeIds.delete(id);
    else this.selectedEmployeeIds.add(id);
  }

  toggleConcept(concepto: any) {
    const id = this.getConceptId(concepto);
    if (!id) return;
    const idx = this.selectedConcepts.findIndex((c) => c.concepto_id === id);
    if (idx >= 0) this.selectedConcepts.splice(idx, 1);
    else {
      const manual = this.isConceptManual(concepto);
      this.selectedConcepts.push({ concepto_id: id, importe: manual ? (concepto.importe_fijo ?? null) : null, unidades: manual ? 1 : null });
    }
  }

  toggleEmployeeConcepts(emp: any) {
    const id = this.getEmpleadoId(emp);
    if (!id) return;
    if (this.expandedEmployeeIds.has(id)) {
      // already open -> close it
      this.expandedEmployeeIds.delete(id);
    } else {
      // exclusive behavior: close others, open this one
      this.expandedEmployeeIds.clear();
      this.expandedEmployeeIds.add(id);
    }
  }

  isEmployeeConceptsExpanded(emp: any): boolean {
    const id = this.getEmpleadoId(emp);
    return !!id && this.expandedEmployeeIds.has(id);
  }

  getConceptsSortedByPriority(emp: any): any[] {
    // Delegar ordenamiento al backend: devolver la lista tal como viene.
    return Array.isArray(emp?.conceptos) ? emp.conceptos.slice() : [];
  }

  isConceptManual(concepto: any): boolean {
    // Evaluar el código del tipo de concepto (concepto.tipo_concepto.codigo)
    const tipoCodigo = String(concepto?.tipo_concepto?.codigo ?? '').toUpperCase();
    // Habilitar ingreso de importe/unidades si el código contiene 'MANUAL' (cubre _MANUAL y variantes)
    return tipoCodigo.includes('MANUAL');
  }

  isEmployeeSelected(emp: any) {
    const id = this.getEmpleadoId(emp);
    return !!id && this.selectedEmployeeIds.has(id);
  }

  areAllEmployeesSelected(): boolean {
    const visibles = this.empleadosFiltrados;
    if (!visibles || visibles.length === 0) return false;
    return visibles.every((e) => {
      const id = this.getEmpleadoId(e);
      return !!id && this.selectedEmployeeIds.has(id);
    });
  }

  toggleSelectAllEmployees(): void {
    const all = this.areAllEmployeesSelected();
    if (all) {
      // deselect filtered
      for (const e of this.empleadosFiltrados) {
        const id = this.getEmpleadoId(e);
        if (id) this.selectedEmployeeIds.delete(id);
      }
    } else {
      for (const e of this.empleadosFiltrados) {
        const id = this.getEmpleadoId(e);
        if (id) this.selectedEmployeeIds.add(id);
      }
    }
  }

  getEmpleadoId(empleado: any): number | null {
    return empleado.empleado_id ?? empleado.id ?? null;
  }

  iniciales(empleado: any): string {
    const apellido = (empleado.apellido || '').trim();
    const nombre = (empleado.nombre || '').trim();
    const text = `${apellido.charAt(0) || ''}${nombre.charAt(0) || ''}`.trim();
    return text || 'E';
  }

  esEmpleadoInactivo(empleado: any): boolean {
    if (empleado.estado === 1 || empleado.estado === '1') return false;
    if (empleado && typeof empleado.estado === 'object') {
      if (empleado.estado.es_activo === 1 || empleado.estado.es_activo === true) return false;
      const nombre = (empleado.estado.nombre || empleado.estado.descripcion || '').toString().toLowerCase();
      if (nombre === 'activo') return false;
    }
    if (empleado.habilitado === 1) return false;
    return false;
  }

  resolvePublicUrl(url: string): string {
    const value = (url || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
    const baseUrl = (environment.apiUrl || '').replace(/\/$/, '');
    const path = value.startsWith('/') ? value : `/${value}`;
    return `${baseUrl}${path}`;
  }

  fotoUrl(empleado: any): string {
    return this.resolvePublicUrl(empleado.foto_url_publica || empleado.url_publica || empleado.foto || '');
  }

  tieneFoto(empleado: any): boolean {
    const empleadoId = this.getEmpleadoId(empleado);
    return !!this.fotoUrl(empleado) && !!empleadoId;
  }

  avatarError(empleado: any): void {
    const empleadoId = this.getEmpleadoId(empleado);
    if (!empleadoId) return;
    // marcar para que muestre iniciales en caso de error
    try { this.avatarsSinImagen.add(empleadoId); } catch {}
  }

  isConceptSelected(concepto: any) {
    const id = this.getConceptId(concepto);
    return !!id && this.selectedConcepts.some((c) => c.concepto_id === id);
  }

  areAllConceptsSelected(): boolean {
    const visibles = this.conceptosFiltrados;
    if (!visibles || visibles.length === 0) return false;
    return visibles.every((c) => {
      const id = this.getConceptId(c);
      return !!id && this.selectedConcepts.some((sc) => sc.concepto_id === id);
    });
  }

  toggleSelectAllConcepts(): void {
    const all = this.areAllConceptsSelected();
    const visibles = this.conceptosFiltrados;
    if (all) {
      // deselect filtered
      const visiblesIds = new Set(visibles.map((c) => this.getConceptId(c)));
      this.selectedConcepts = this.selectedConcepts.filter((sc) => !visiblesIds.has(sc.concepto_id));
    } else {
      // add filtered concepts
      const visiblesIds = new Set(visibles.map((c) => this.getConceptId(c)));
      const newSelected = visibles
        .map((c) => ({ concepto_id: this.getConceptId(c), importe: this.isConceptManual(c) ? (c.importe_fijo ?? null) : null, unidades: this.isConceptManual(c) ? 1 : null }))
        .filter((s) => s.concepto_id != null) as { concepto_id: number; importe?: number | null; unidades?: number | null }[];
      // merge avoiding duplicates
      const map = new Map<number, any>(this.selectedConcepts.map((s) => [s.concepto_id, s]));
      newSelected.forEach((s) => {
        if (s.concepto_id != null) map.set(s.concepto_id, s);
      });
      this.selectedConcepts = Array.from(map.values());
    }
  }

  get conceptosFiltrados(): any[] {
    const q = (this.conceptQ || '').toString().trim().toLowerCase();
    const tipo = (this.conceptTipo || '').toString().trim();
    return (this.conceptos || []).filter((c) => {
      if (q) {
        const name = ((c.nombre || c.descripcion || c.codigo) + '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (tipo) {
        const key = String(c?.tipo_concepto?.tipo_concepto_id ?? c?.tipo_concepto?.codigo ?? c?.tipo_concepto?.nombre ?? '');
        if (key !== tipo) return false;
      }
      return true;
    });
  }

  /**
   * Obtiene el objeto seleccionado para un concepto, creándolo si no existe.
   * Esto evita accesos a `undefined` desde la plantilla.
   */
  getSelectedConcept(conceptoId: number) {
    if (!conceptoId) {
      return { concepto_id: null, importe: null, unidades: 1 };
    }
    let sc = this.selectedConcepts.find((c) => c.concepto_id === conceptoId);
    if (!sc) {
      sc = { concepto_id: conceptoId, importe: null, unidades: 1 };
      this.selectedConcepts.push(sc);
    }
    return sc;
  }

  getConceptField(concepto: any, field: 'importe' | 'unidades') {
    const id = this.getConceptId(concepto);
    if (!id) return field === 'unidades' ? 1 : null;
    const sc = this.selectedConcepts.find((s) => s.concepto_id === id);
    if (!sc) return field === 'unidades' ? 1 : null;
    return sc[field];
  }

  setConceptField(concepto: any, field: 'importe' | 'unidades', value: any) {
    if (!this.isConceptManual(concepto)) return;
    const id = this.getConceptId(concepto);
    if (!id) return;
    let sc = this.selectedConcepts.find((s) => s.concepto_id === id);
    if (!sc) {
      sc = { concepto_id: id, importe: null, unidades: 1 };
      this.selectedConcepts.push(sc);
    }
    sc[field] = value;
  }

  assign() {
    const employee_ids = Array.from(this.selectedEmployeeIds.values());
    if (!employee_ids.length || !this.selectedConcepts.length) {
      alert('Seleccione al menos 1 empleado y 1 concepto');
      return;
    }

    const conceptosPayload = this.selectedConcepts.map((c) => {
      const importe = c.importe != null ? Number(c.importe) : null;
      const unidades = c.unidades != null ? Number(c.unidades) : null;
      const valor = (importe != null && unidades != null) ? (importe * unidades) : null;
      return { concepto_id: c.concepto_id, importe, unidades, valor };
    });

    const payload = {
      empresa_id: Number(localStorage.getItem('empresaId') || 0) || undefined,
      employee_ids,
      conceptos: conceptosPayload,
      requestedBy: 0
    };

    // store for possible reintentos por empleado
    try { this.lastPayload = JSON.parse(JSON.stringify(payload)); } catch { this.lastPayload = payload; }

    this.loading = true;
    this.loading = true;
    console.debug('assign() start - payload', payload);
    let assignStart = Date.now();
    try { this.loadingService.show(); } catch (e) { console.debug('loadingService.show error', e); }

    // ensure both local and global spinners are hidden in finalize
    this.svc.assignConceptosMasivos(payload).pipe(finalize(() => { try { this.loading = false; this.loadingService.hide(); const duration = Date.now() - assignStart; console.debug('assign() finalize - loading hidden, duration(ms):', duration); this.cdr.detectChanges(); } catch (e) { console.debug('finalize hide error', e); } })).subscribe(
      (res: any) => {
        try {
          this.result = res;
          // Generar resumen por empleado con los conceptos enviados
          this.assignSummary = Array.from(this.selectedEmployeeIds.values()).map((id) => {
            const empleado = this.employees.find((e) => this.getEmpleadoId(e) === id) || { empleado_id: id, nombre: '', apellido: '' };
            const conceptos = (conceptosPayload || []).map((cp) => {
              const conceptoObj = this.conceptos.find((cc) => this.getConceptId(cc) === cp.concepto_id) || {};
              return {
                concepto_id: cp.concepto_id,
                nombre: conceptoObj.nombre || conceptoObj.descripcion || conceptoObj.codigo || '',
                codigo: conceptoObj.codigo || null,
                tipo_codigo: (conceptoObj?.tipo_concepto?.codigo) || (conceptoObj?.tipo_concepto?.nombre) || null,
                importe: cp.importe,
                unidades: cp.unidades,
                valor: cp.valor
              };
            });
            return { empleado, conceptos };
          });

          // limpiar selección para evitar reenvíos accidentales
          this.selectedEmployeeIds.clear();
          this.selectedConcepts = [];
          // refrescar listado para mostrar los conceptos asignados actualizados
          try { this.cargarEmpleados(); } catch (e) { console.debug('refresh empleados after assign error', e); }
          // If backend returned a summary with failures, treat as partial failure and show details
          const summary = res?.summary;
          const failures = res?.failures || [];
          if (summary && (Number(summary.failed || 0) > 0 || (Array.isArray(failures) && failures.length > 0))) {
            this.modalTitle = 'Asignación con errores';
            this.modalMessage = res?.message || `Procesado: ${summary.processed || 0}, Fallados: ${summary.failed || failures.length}`;
            this.modalErrors = failures.length ? failures : (res?.errors || null);
          } else {
            // show success modal with backend message if provided
            this.modalTitle = 'Asignación exitosa';
            this.modalMessage = res?.message || 'Asignación enviada. Ver resumen abajo.';
            this.modalErrors = failures.length ? failures : null;
          }
          // expose job id if backend returned it
          if (res?.job_id) {
            this.result = this.result || {};
            this.result.job_id = res.job_id;
          }
          this.modalVisible = true;
          console.debug('assignConceptosMasivos res', res);
        } catch (ex) {
          console.error('Error processing assign response', ex);
          try { this.loading = false; this.loadingService.hide(); } catch {}
          this.modalTitle = 'Error interno';
          this.modalMessage = 'Ocurrió un error al procesar la respuesta. Revise la consola.';
          this.modalErrors = ex instanceof Error ? (ex.message as any) : null;
          this.modalVisible = true;
        }
      },
      (err: any) => {
        try { console.error('assignConceptosMasivos err', err); } catch {}
        try { this.loading = false; this.loadingService.hide(); } catch {}
        // Support structured error from service: { status, message, body }
        const msg = err?.message || err?.error?.message || `Error al ejecutar asignación. Código: ${err?.status || ''}`;
        this.modalTitle = 'Error en la asignación';
        this.modalMessage = msg;
        this.modalErrors = err?.error?.errors || null;
        this.modalVisible = true;
      }
    );
  }

  retryEmpleado(empleadoId: number) {
    if (!empleadoId) return;
    if (!this.lastPayload) {
      this.modalMessage = 'No hay datos disponibles para reintentar. Realice la asignación nuevamente.';
      this.modalVisible = true;
      return;
    }
    const payload = JSON.parse(JSON.stringify(this.lastPayload));
    payload.employee_ids = [empleadoId];

    this.loading = true;
    let retryStart = Date.now();
    this.svc.assignConceptosMasivos(payload).pipe(finalize(() => { this.loading = false; const duration = Date.now() - retryStart; console.debug('retryEmpleado finalize - duration(ms):', duration); })).subscribe(
      (res: any) => {
        // mostrar resultado del intento específico
        const summary = res?.summary;
        const failures = res?.failures || [];
        if (summary && Number(summary.failed || 0) > 0) {
          this.modalTitle = 'Reintento con errores';
          this.modalMessage = res?.message || `Fallaron ${summary.failed} items al reintentar.`;
          this.modalErrors = failures.length ? failures : (res?.errors || null);
        } else {
          this.modalTitle = 'Reintento exitoso';
          this.modalMessage = res?.message || 'Reintento completado correctamente.';
          this.modalErrors = failures.length ? failures : null;
          // refrescar listado para mostrar concepto actualizado en el empleado
          try { this.cargarEmpleados(); } catch (e) { console.debug('refresh empleados after retry error', e); }
        }
        if (res?.job_id) {
          this.result = this.result || {};
          this.result.job_id = res.job_id;
        }
        // ensure loading flag is cleared for retry
        try { this.loading = false; } catch {}
        this.modalVisible = true;
      },
      (err: any) => {
        const msg = err?.message || err?.error?.message || `Error al reintentar. Código: ${err?.status || ''}`;
        this.modalTitle = 'Error en reintento';
        this.modalMessage = msg;
        this.modalErrors = err?.error?.errors || null;
        try { this.loading = false; } catch {}
        this.modalVisible = true;
      }
    );
  }

  exportFailuresCsv() {
    const list: any[] = Array.isArray(this.modalErrors) ? (this.modalErrors as any[]) : (Array.isArray(this.result?.failures) ? (this.result!.failures as any[]) : []);
    if (!list || !list.length) return;
    const rows = [['empleado_id', 'errors', 'job_id']];
    for (const f of list) {
      const errs = Array.isArray(f.errors) ? f.errors.join('; ') : (f.errors || '');
      rows.push([String(f.empleado_id || ''), errs, String(this.result?.job_id || '')]);
    }
    const csv = rows.map((r: any[]) => r.map((cell: any) => '"' + String(cell).replace(/"/g,'""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asignaciones_errores_${(this.result?.job_id||Date.now())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  copyFailuresToClipboard() {
    const list: any[] = Array.isArray(this.modalErrors) ? (this.modalErrors as any[]) : (Array.isArray(this.result?.failures) ? (this.result!.failures as any[]) : []);
    if (!list || !list.length) return;
    const text = list.map((f: any) => `Empleado ${f.empleado_id}: ${(Array.isArray(f.errors) ? f.errors.join('; ') : f.errors || '')}`).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.modalMessage = 'Errores copiados al portapapeles.';
      }).catch(() => {
        this.modalMessage = 'No se pudo copiar automáticamente. Use Exportar CSV.';
      });
    } else {
      try { window.prompt('Copiar errores (Ctrl+C + Enter):', text); } catch { /* noop */ }
    }
  }

  isArray(v: any): boolean {
    return Array.isArray(v);
  }
  closeModal() {
    // Allow repeated calls safely: clear any pending timeouts first
    try {
      if (this.modalCloseTimeout) { clearTimeout(this.modalCloseTimeout); this.modalCloseTimeout = null; }
      if (this.modalForceCloseTimeout) { clearTimeout(this.modalForceCloseTimeout); this.modalForceCloseTimeout = null; }
    } catch (e) {
      console.debug('closeModal: error clearing timeouts', e);
    }
    // play closing animation then hide
    try { this.modalClosing = true; this.cdr.detectChanges(); } catch (e) { console.debug('closeModal detectChanges error', e); }
    // ensure any spinner is hidden (force hide to clear counters)
    try { this.loading = false; this.loadingService.hide(true); } catch (e) { console.debug('closeModal hide spinner error', e); }

    this.modalCloseTimeout = setTimeout(() => {
      try {
        this.modalVisible = false;
        this.modalClosing = false;
        this.modalTitle = '';
        this.modalMessage = null;
        this.modalErrors = null;
        this.cdr.detectChanges();
      } catch (ex) {
        console.debug('closeModal timeout handler error', ex);
      } finally {
        if (this.modalCloseTimeout) { clearTimeout(this.modalCloseTimeout); this.modalCloseTimeout = null; }
        if (this.modalForceCloseTimeout) { clearTimeout(this.modalForceCloseTimeout); this.modalForceCloseTimeout = null; }
      }
    }, 220);

    // Safety: force hide after 1s if animation fails
    this.modalForceCloseTimeout = setTimeout(() => {
      try {
        if (this.modalVisible) {
          this.modalVisible = false;
          this.modalClosing = false;
          this.modalTitle = '';
          this.modalMessage = null;
          this.modalErrors = null;
          // also force hide spinner again as last resort
          try { this.loadingService.hide(true); } catch {}
          this.cdr.detectChanges();
        }
      } catch (ex) {
        console.debug('closeModal force hide error', ex);
      } finally {
        if (this.modalCloseTimeout) { clearTimeout(this.modalCloseTimeout); this.modalCloseTimeout = null; }
        if (this.modalForceCloseTimeout) { clearTimeout(this.modalForceCloseTimeout); this.modalForceCloseTimeout = null; }
      }
    }, 1000);
  }

  get canAssignConcepts(): boolean {
    try {
      const perms = this.auth.getPermissions() || [];
      const has = (alias: string) => {
        return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : (p?.alias === alias)));
      };
      return has('conceptos') && has('conceptos_asigna');
    } catch (e) {
      return false;
    }
  }

  get hasSelection(): boolean {
    try {
      const hasEmp = !!(this.selectedEmployeeIds && this.selectedEmployeeIds.size > 0);
      const hasConcept = !!(this.selectedConcepts && this.selectedConcepts.length > 0);
      return hasEmp || hasConcept;
    } catch (e) {
      return false;
    }
  }

  removeSelected() {
    if (!this.hasSelection) return;
    const proceed = confirm('¿Confirma eliminar las asignaciones seleccionadas? Esta acción no está implementada en el frontend y debe confirmarse con el backend.');
    if (!proceed) return;
    // Placeholder: implementar eliminación masiva por backend.
    console.warn('removeSelected() called - implementación pendiente');
    alert('Eliminar asignaciones masivas no implementado aún. Abriré un issue si querés.');
  }
}
