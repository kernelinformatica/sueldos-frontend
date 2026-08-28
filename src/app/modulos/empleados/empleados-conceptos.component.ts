import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { EmpleadosAsignarConceptoComponent } from './empleados-asignar-concepto.component';
import { EmpleadosConceptosService } from './empleados-conceptos.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, finalize, of, forkJoin } from 'rxjs';
import { environment } from '../../environments/environment';

interface ConceptoPersonal {
  concepto: string;
  tipo: string;
  estado: string;
  valor: string;
  vigenciaDesde: string;
  importe_fijo?: string | number | null;
  unidades?: number | null;
  tipo_concepto?: { tipo_concepto_id?: number; codigo?: string; nombre?: string } | null;
  grupo?: { grupo_id?: number; nombre?: string } | null;
}

interface EmpleadoFichaResponse {
  id?: number;
  empleado_id?: number;
  legajo?: string;
  tipo_documento?: string;
  numero_documento?: string;
  nombre?: string;
  apellido?: string;
  estado?: string | number;
  fecha_ingreso?: string | null;
  fecha_egreso?: string | null;
  seccion?: { nombre?: string };
  cargo?: { nombre?: string };
  sucursal?: { nombre?: string };
  empresa?: { nombre?: string; nombre_fantasia?: string };
}

@Component({
  selector: 'app-empleados-conceptos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, EmpleadosAsignarConceptoComponent, ModalAlertaComponent],

  templateUrl: './empleados-conceptos.component.html',
  styleUrls: ['./empleados-conceptos.component.scss']
})
export class EmpleadosConceptosComponent {
  //tabs = ['Asignados', 'Historial', 'Bajas'];
  activeTab: string = 'Asignados';
  loading = true;
  error = '';
  empleadoId: number | null = null;
  empleado: EmpleadoFichaResponse | null = null;

  // `conceptos` de ejemplo eliminado: usamos `conceptosAsignadosBackend` (datos reales) en la vista

  // asignar panel
  showAsignar = false;
  conceptosDisponibles: any[] = [];
  conceptosAsignadosBackend: any[] = [];
  selectedConceptos = new Set<number>();
  selectAll = false;
  // modal alerta
  modalVisible = false;
  modalTitle = '';
  modalMessage = '';
  modalIcon = '';
  modalSpinner = false;
  modalBlock = false;
  modalTextoSpinner = 'Procesando...';

  constructor(private http: HttpClient, private route: ActivatedRoute, private cdr: ChangeDetectorRef, private loadingService: LoadingService, private conceptosSvc: EmpleadosConceptosService) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.empleadoId = idParam ? Number(idParam) : null;

    if (!this.empleadoId) {
      this.error = 'No se pudo identificar el empleado.';
      this.loading = false;
      return;
    }

    this.cargarEmpleado(this.empleadoId);
    this.loadAsignados(this.empleadoId);
  }

  private loadAsignados(id: number | null) {
    if (!id) { return; }
    this.conceptosSvc.listAsignados(id).subscribe({
      next: (res) => {
        console.debug('[EmpleadosConceptos] loadAsignados response', res);
        const items = Array.isArray(res) ? res : res?.data || [];

        this.conceptosAsignadosBackend = items.map((it: any) => {
          const concepto = it.concepto ?? it;
          const empleadoConceptoId = it.empleado_concepto_id ?? it.empleadoConceptoId ?? null;
          const orden = ((it.orden ?? concepto.orden ?? 0) || 0);
          return {
            id: empleadoConceptoId ?? concepto.concepto_id ?? it.concepto_id ?? it.id ?? null,
            empleado_concepto_id: empleadoConceptoId,
            nombre: concepto.descripcion ?? concepto.detalle ?? concepto.nombre ?? String(concepto.concepto_id ?? concepto.id ?? ''),
            codigo: concepto.codigo ?? '',
            fecha_asignacion: it.fecha_asignacion ?? it.fecha ?? null,
            // Accept different backend shapes: 'importe', 'importe_fijo' or concepto.importe_fijo
            importe_fijo: (concepto.importe_fijo ?? it.importe_fijo ?? it.importe) ?? 0,
            // Ensure null/undefined unidades fallback to 1
            unidades: (it.unidades ?? concepto.unidades) ?? 1,
            tipo_concepto: concepto.tipo_concepto ?? it.tipo_concepto ?? null,
            grupo: concepto.grupo ?? it.grupo ?? null,
            orden: Number(orden)
          };
        })
        // ordenar según reglas: primero por `orden` si >0 asc, si orden==0 por `codigo`, finalmente por `fecha_asignacion`
        .sort((a: any, b: any) => {
          const ao = Number(a.orden || 0);
          const bo = Number(b.orden || 0);
          if (ao > 0 || bo > 0) {
            if (ao === bo) {
              // fallback to codigo
              const ac = String(a.codigo || '').localeCompare(String(b.codigo || ''));
              if (ac !== 0) return ac;
            }
            if (ao === 0 && bo > 0) return 1; // b antes que a
            if (bo === 0 && ao > 0) return -1; // a antes que b
            return ao - bo;
          }
          // ambos orden == 0 -> por codigo
          const codeComp = String(a.codigo || '').localeCompare(String(b.codigo || ''));
          if (codeComp !== 0) return codeComp;
          // finalmente por fecha_asignacion (asc)
          const af = a.fecha_asignacion ? new Date(a.fecha_asignacion).getTime() : 0;
          const bf = b.fecha_asignacion ? new Date(b.fecha_asignacion).getTime() : 0;
          return af - bf;
        });
      },
      error: () => { /* ignore for now */ }
    });
  }

  cambiarTab(tab: string) {
    this.activeTab = tab;
  }

  badgeClass(tipoCodigo?: string | null): string {
    if (!tipoCodigo) return '';
    const code = String(tipoCodigo).toUpperCase();
    if (code.includes('DESCUENT')) return 'descuentos';
    if (code.includes('HABER')) return 'haber_con_desc';
    if (code.includes('APORT') || code.includes('APORTE')) return 'aporte';
    return '';
  }

  badgeLabel(tipo: any): string {
    return tipo?.nombre || tipo?.codigo || '-';
  }

  get nombreCompleto(): string {
    if (!this.empleado) {
      return 'Empleado';
    }

    return [this.empleado.apellido, this.empleado.nombre].filter(Boolean).join(', ') || 'Empleado';
  }

  get documentoLabel(): string {
    if (!this.empleado) {
      return '-';
    }

    return `${this.empleado.tipo_documento || 'DNI'} ${this.empleado.numero_documento || '-'}`;
  }

  get empresaLabel(): string {
    return this.empleado?.empresa?.nombre_fantasia || this.empleado?.empresa?.nombre || '-';
  }

  get sectorLabel(): string {
    return this.empleado?.seccion?.nombre || '-';
  }

  get cargoLabel(): string {
    return this.empleado?.cargo?.nombre || '-';
  }

  get sucursalLabel(): string {
    return this.empleado?.sucursal?.nombre || '-';
  }

  get estadoLabel(): string {
    const estado = this.empleado?.estado;
    // Quick checks for common primitive values
      if (estado === 1 || estado === '1' || String(estado).toLowerCase() === 'true') return 'Activo';
      if (typeof estado === 'string' && String(estado).toLowerCase().includes('activo')) return 'Activo';

    // If estado is an object, try to infer from common properties
    if (estado && typeof estado === 'object') {
      const anyEstado: any = estado;
      const name = anyEstado.nombre ?? anyEstado.name ?? anyEstado.descripcion ?? '';
      const id = anyEstado.estado_id ?? anyEstado.id ?? anyEstado.estadoId ?? null;
      const esActivo = anyEstado.es_activo ?? anyEstado.activo ?? anyEstado.habilitado ?? null;
      if (id === 1 || id === '1' || String(name).toLowerCase().includes('activo') || esActivo === 1 || esActivo === true) {
        return 'Activo';
      }
    }

    // Fallback: if empleado has fecha_egreso, consider inactive
    if (this.empleado?.fecha_egreso) return 'Inactivo';

    // Default to Inactivo
    return 'Inactivo';
  }

  // Nombre real del estado si viene desde el backend (objeto o string). Fallback a `estadoLabel`.
  get estadoNombre(): string {
    const estado = this.empleado?.estado;
    if (!estado && this.empleado?.fecha_egreso) return 'Baja';
    if (!estado) return this.estadoLabel;
    if (typeof estado === 'string') return estado;
    if (typeof estado === 'number') return estado === 1 ? 'Activo' : 'Inactivo';
    if (typeof estado === 'object') {
      const anyE: any = estado;
      if (anyE.nombre) return String(anyE.nombre);
      if (anyE.name) return String(anyE.name);
      if (anyE.descripcion) return String(anyE.descripcion);
    }
    return this.estadoLabel;
  }

  // Determina si se considera activo (para el punto verde)
  get isActivo(): boolean {
    const estado = this.empleado?.estado;
      if (estado === 1 || estado === '1' || String(estado).toLowerCase() === 'true') return true;
      if (typeof estado === 'string' && String(estado).toLowerCase().includes('activo')) return true;
    if (estado && typeof estado === 'object') {
      const anyE: any = estado;
      const esActivo = anyE.es_activo ?? anyE.activo ?? anyE.habilitado ?? null;
      const id = anyE.estado_id ?? anyE.id ?? null;
      if (esActivo === 1 || esActivo === true) return true;
      if (id === 1 || id === '1') return true;
    }
    // if has fecha_egreso consider not active
    if (this.empleado?.fecha_egreso) return false;
    return false;
  }

  get iniciales(): string {
    const apellido = (this.empleado?.apellido || '').trim();
    const nombre = (this.empleado?.nombre || '').trim();
    const text = `${apellido.charAt(0)}${nombre.charAt(0)}`.trim();
    return text || 'E';
  }

  formatCurrency(value: string | number | null | undefined): string {
    const num = Number(value ?? NaN);
    if (!Number.isFinite(num)) return '-';
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(num);
    } catch (e) {
      return String(num);
    }
  }

  private cargarEmpleado(id: number): void {
    console.debug('[EmpleadosConceptos] cargarEmpleado start id=', id);
    this.loading = true;
    try { this.loadingService.show(); } catch {}
    this.http.get<EmpleadoFichaResponse>(`${environment.apiUrl}/api/empleados/${id}`)
      .pipe(
        catchError((err) => {
          console.error('[EmpleadosConceptos] cargarEmpleado error', err);
          this.error = err?.error?.mensaje || 'No se pudo cargar la ficha del empleado.';
          try { this.loadingService.hide(); } catch {}
          try { this.cdr.detectChanges(); } catch {}
          return of(null);
        }),
        finalize(() => {
          this.loading = false;
          try { this.loadingService.hide(); } catch {}
          try { this.cdr.detectChanges(); } catch {}
        })
      )
      .subscribe((res) => {
        console.debug('[EmpleadosConceptos] cargarEmpleado response', res);
        this.empleado = res;
        try { this.cdr.detectChanges(); } catch {}
      });
  }

  abrirAsignar() {
    this.showAsignar = true;
    // cargar conceptos disponibles (sin paginar por ahora)
    this.conceptosSvc.getConceptosDisponibles().subscribe({
      next: (res: any) => {
        const arr = Array.isArray(res?.items) ? res.items : [];
        this.conceptosDisponibles = arr.map((it: any) => ({
          id: it.concepto_id ?? it.id ?? null,
          nombre: it.descripcion ?? it.detalle ?? it.nombre ?? String(it.concepto_id ?? it.id ?? ''),
          codigo: it.codigo ?? '',
          descripcion: it.descripcion ?? it.detalle ?? null,
          importe_fijo: it.importe_fijo ?? null
        }));
        try { this.cdr.detectChanges(); } catch {}
      },
      error: () => { this.conceptosDisponibles = []; try { this.cdr.detectChanges(); } catch {} }
    });
  }

  cerrarAsignar() {
    this.showAsignar = false;
  }

  onAsignar(event: { empleadoId: number; conceptoId: number }) {
    this.loadingService.show();
    // show modal spinner
    this.modalVisible = true;
    this.modalSpinner = true;
    this.modalBlock = true;
    this.modalTitle = 'Procesando';
    this.modalMessage = '';
    this.modalIcon = '';
    this.conceptosSvc.assignConceptos(event.empleadoId, [event.conceptoId]).pipe(finalize(() => this.loadingService.hide())).subscribe({
      next: (res: any) => {
        // recargar asignados y la lista de disponibles para reflejar cambios
        this.loadAsignados(this.empleadoId);
        if (this.showAsignar) { this.abrirAsignar(); }
        try { this.cdr.detectChanges(); } catch {}
        // mostrar mensaje de resultado
        const msg = res?.message || 'Asignación completada correctamente.';
        this.modalTitle = res?.message ? 'Aviso' : 'Éxito';
        this.modalMessage = msg;
        this.modalIcon = res?.message ? '' : 'check-circle';
        this.modalSpinner = false;
        this.modalBlock = false;
        this.modalVisible = true;
        // auto-close modal después de mostrar resultado
        setTimeout(() => { try { this.onModalClose(); } catch {} }, 1600);
      },
      error: (err) => {
        console.error('Error asignando concepto', err);
        this.modalTitle = 'Error';
        this.modalMessage = err?.error?.mensaje || 'No se pudo asignar el concepto.';
        this.modalIcon = 'exclamation-triangle';
        this.modalSpinner = false;
        this.modalBlock = false;
        this.modalVisible = true;
        // auto-close también en error para evitar bloquear la UI
        setTimeout(() => { try { this.onModalClose(); } catch {} }, 2500);
      }
    });
  }

  onQuitar(event: { empleadoId: number; conceptoId: number }) {
    this.loadingService.show();
    // show modal spinner
    this.modalVisible = true;
    this.modalSpinner = true;
    this.modalBlock = true;
    this.modalTitle = 'Procesando';
    this.modalMessage = '';
    this.modalIcon = '';
    this.conceptosSvc.removeConcepto(event.empleadoId, event.conceptoId).pipe(finalize(() => this.loadingService.hide())).subscribe({
      next: (res: any) => {
        // backend puede devolver { removed: null, message: 'no assigned' }
        if (res?.removed === null || res?.message) {
          this.modalTitle = 'Aviso';
          this.modalMessage = res?.message || 'Operación no realizada.';
          this.modalIcon = 'exclamation-triangle';
        } else {
          this.modalTitle = 'Éxito';
          this.modalMessage = res?.message || 'Concepto eliminado correctamente.';
          this.modalIcon = 'check-circle';
        }
        this.modalSpinner = false;
        this.modalBlock = false;
        this.modalVisible = true;
        setTimeout(() => { try { this.onModalClose(); } catch {} }, 1600);
        this.loadAsignados(this.empleadoId);
        try { this.cdr.detectChanges(); } catch {}
      },
      error: (err) => {
        console.error('Error quitando concepto', err);
        this.modalTitle = 'Error';
        this.modalMessage = err?.error?.mensaje || 'No se pudo quitar el concepto.';
        this.modalIcon = 'exclamation-triangle';
        this.modalSpinner = false;
        this.modalBlock = false;
        this.modalVisible = true;
        setTimeout(() => { try { this.onModalClose(); } catch {} }, 2500);
      }
    });
  }

  toggleSelect(conceptoId: number, checked: boolean) {
    if (checked) this.selectedConceptos.add(conceptoId);
    else this.selectedConceptos.delete(conceptoId);
  }

  toggleSelectAll(checked: boolean) {
    this.selectAll = checked;
    this.selectedConceptos.clear();
    if (checked) {
      this.conceptosAsignadosBackend.forEach(c => { if (c.id) this.selectedConceptos.add(c.id); });
    }
  }

  quitarSeleccionados() {
    if (!this.empleadoId || this.selectedConceptos.size === 0) { return; }
    const ids = Array.from(this.selectedConceptos);
    const calls = ids.map(id => this.conceptosSvc.removeConcepto(this.empleadoId!, id));

    this.loadingService.show();
    this.modalVisible = true; this.modalSpinner = true; this.modalBlock = true; this.modalTitle = 'Procesando'; this.modalMessage = '';

    forkJoin(calls).pipe(finalize(() => { try { this.loadingService.hide(); } catch {} })).subscribe({
      next: (results: any[]) => {
        this.modalSpinner = false; this.modalBlock = false; this.modalTitle = 'Éxito';
        this.modalMessage = 'Operación completada.';
        this.selectedConceptos.clear(); this.selectAll = false;
        this.loadAsignados(this.empleadoId);
        try { this.cdr.detectChanges(); } catch {}
        setTimeout(() => { try { this.onModalClose(); } catch {} }, 1200);
      },
      error: (err) => {
        console.error('Error quitando varios conceptos', err);
        this.modalSpinner = false; this.modalBlock = false; this.modalTitle = 'Error';
        this.modalMessage = err?.error?.mensaje || 'No se pudieron quitar los conceptos.';
        setTimeout(() => { try { this.onModalClose(); } catch {} }, 2500);
      }
    });
  }


  moveUp(item: any) {
    const idx = this.conceptosAsignadosBackend.indexOf(item);
    if (idx > 0) {
      // swap locally
      const prev = this.conceptosAsignadosBackend[idx - 1];
      this.conceptosAsignadosBackend[idx - 1] = item;
      this.conceptosAsignadosBackend[idx] = prev;
      this.persistNewOrdens();
    }
  }

  moveDown(item: any) {
    const idx = this.conceptosAsignadosBackend.indexOf(item);
    if (idx >= 0 && idx < this.conceptosAsignadosBackend.length - 1) {
      const next = this.conceptosAsignadosBackend[idx + 1];
      this.conceptosAsignadosBackend[idx + 1] = item;
      this.conceptosAsignadosBackend[idx] = next;
      this.persistNewOrdens();
    }
  }

  private persistNewOrdens() {
    if (!this.empleadoId) return;
    const updates: any[] = [];
    this.conceptosAsignadosBackend.forEach((it: any, i: number) => {
      const newOrden = i + 1;
      it.orden = newOrden;
      if (it.empleado_concepto_id) {
        updates.push(this.conceptosSvc.updateOrden(this.empleadoId!, it.empleado_concepto_id, newOrden));
      }
    });
    if (updates.length === 0) return;
    // persist updates without showing modal — show only loading spinner
    this.loadingService.show();
    forkJoin(updates).pipe(finalize(() => { try { this.loadingService.hide(); } catch {} })).subscribe({
      next: () => { this.modalSpinner = false; this.modalBlock = false; this.modalTitle = 'Éxito'; this.modalMessage = 'Orden actualizado.'; try { this.cdr.detectChanges(); } catch {} },
      error: (err) => { console.error('Error persistiendo ordenes', err); this.modalSpinner = false; this.modalBlock = false; this.modalTitle = 'Error'; this.modalMessage = err?.error?.mensaje || 'No se pudo actualizar el orden.'; }
    });
  }

  vaciarFicha() {
    if (!this.empleadoId) { return; }
    const ids = this.conceptosAsignadosBackend.map(c => c.id).filter(Boolean);
    if (ids.length === 0) { return; }
    const calls = ids.map((id: number) => this.conceptosSvc.removeConcepto(this.empleadoId!, id));

    this.loadingService.show();
    this.modalVisible = true; this.modalSpinner = true; this.modalBlock = true; this.modalTitle = 'Procesando'; this.modalMessage = '';

    forkJoin(calls).pipe(finalize(() => { try { this.loadingService.hide(); } catch {} })).subscribe({
      next: () => {
        this.modalSpinner = false; this.modalBlock = false; this.modalTitle = 'Éxito';
        this.modalMessage = 'Todos los conceptos han sido eliminados.';
        this.selectedConceptos.clear(); this.selectAll = false;
        this.loadAsignados(this.empleadoId);
        try { this.cdr.detectChanges(); } catch {}
        setTimeout(() => { try { this.onModalClose(); } catch {} }, 1200);
      },
      error: (err) => {
        console.error('Error vaciando ficha', err);
        this.modalSpinner = false; this.modalBlock = false; this.modalTitle = 'Error';
        this.modalMessage = err?.error?.mensaje || 'No se pudo vaciar la ficha.';
        setTimeout(() => { try { this.onModalClose(); } catch {} }, 2500);
      }
    });
  }

  onModalClose() {
    this.modalVisible = false;
    this.modalSpinner = false;
    this.modalBlock = false;
    try { this.cdr.detectChanges(); } catch {}
  }
}
