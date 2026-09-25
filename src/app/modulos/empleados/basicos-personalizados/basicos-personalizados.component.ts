import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { EmpleadoBasicoService } from './empleado-basico.service';
import { EmpleadoBasico, EmpleadoBasicoUpdateMasivoItem, EmpleadoOption } from './empleado-basico.model';
import { ToastService } from '../../../core/toast.service';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../../shared/modal-alerta.component';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
type ModoModal = 'form' | 'alta-masiva' | 'modif-masiva' | null;

@Component({
  selector: 'app-basicos-personalizados',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './basicos-personalizados.component.html',
  styleUrls: ['./basicos-personalizados.component.scss']
})
export class BasicosPersonalizadosComponent implements OnInit {
  registros: EmpleadoBasico[] = [];
  empleados: EmpleadoOption[] = [];
  empleadosFiltrados: EmpleadoOption[] = [];
  estados: Array<{ estado_id: number; nombre: string }> = [];
  loading = false;
  procesando = false;

  filtros = {
    q: '',
    estado: 1,
    contratacion_tipo_id: '',
    sucursal_id: '',
    seccion_id: '',
    cargo_id: ''
  };
  contrataciones: any[] = [];
  sucursales: any[] = [];
  secciones: any[] = [];
  cargos: any[] = [];

  masivaSecciones: any[] = [];
  masivaCargos: any[] = [];

  masivaFiltros = {
    sucursal_id: '',
    seccion_id: '',
    cargo_id: ''
  };
  // Selección masiva
  seleccion = new Set<number>();
  get totalSeleccion(): number { return this.seleccion.size; }
  get seleccionados(): EmpleadoBasico[] {
    return this.registros.filter(r => this.seleccion.has(r.empleado_basico_id));
  }
  get todosSeleccionados(): boolean {
    return this.registrosFiltrados.length > 0 && this.registrosFiltrados.every(r => this.seleccion.has(r.empleado_basico_id));
  }

  // Modal genérico
  modalVisible = false;
  modalModo: ModoModal = null;
  modalTitulo = '';
  guardando = false;

  // Formulario individual
  editId: number | null = null;
  form = { empleado_id: null as number | null, empleadoBusqueda: '', basico_personalizado: null as number | null, fecha_desde: '', fecha_hasta: '', activo: true };
  formError = '';

  // Alta masiva
  masivaSeleccion = new Set<number>();
  masivaBusqueda = '';
  masivaForm = { basico_personalizado: null as number | null, fecha_desde: '', fecha_hasta: '', activo: true };
  masivaError = '';

  // Modificación masiva
  modifForm: { basico_personalizado: number | null; fecha_desde: string; fecha_hasta: string; activo: string } =
    { basico_personalizado: null, fecha_desde: '', fecha_hasta: '', activo: '' };
  modifError = '';

  // Confirmación (baja individual / masiva)
  confirmVisible = false;
  confirmTitulo = 'Confirmar baja';
  confirmMensaje = '';
  confirmAccion: (() => void) | null = null;

  constructor(
    private svc: EmpleadoBasicoService,
    private toast: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.loadEstados();
    this.cargarCatalogos();
    this.cargarEmpleados();
    this.cargarRegistros();


  }

  goTo(path: string): void {
    this.router.navigateByUrl(path);
  }

  // ---------- Carga ----------





  /*
    cargarRegistros(): void {
      this.loading = true;
      const activo = this.filtros.estado === '' ? undefined : (this.filtros.estado === '1' ? 1 : 0);
      this.svc.list(activo).pipe(finalize(() => {
        this.loading = false;
        try { this.cdr.detectChanges(); } catch { }
      })).subscribe((res: any) => {
        const data = Array.isArray(res) ? res : (res?.data || []);
        this.registros = (data as EmpleadoBasico[]).slice();
        this.seleccion.clear();
      }, (err) => {
        console.error(err);
        this.toast.error('No se pudieron cargar los básicos personalizados');
      });
    }
  */
  cargarRegistros(): void {
    this.loading = true;

    const estadoId = this.filtros.estado
      ? Number(this.filtros.estado)
      : undefined;

    console.log('Enviando estado:', estadoId);

    this.svc.list(estadoId)
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      ).subscribe(
        (res: any) => {

          this.registros = Array.isArray(res)
            ? res
            : (res?.data || []);

          this.seleccion.clear();

          this.loading = false;

          this.cdr.detectChanges();

        },
        err => {
          this.loading = false;
          console.error(err);
        }
      );

  }
  private cargarEmpleados(): void {
    this.svc.listEmpleados().subscribe((res: any) => {
      const data = Array.isArray(res) ? res : (res?.data || res?.empleados || []);
      this.empleados = (data as EmpleadoOption[]).slice();
      this.filtrarEmpleados();
    }, (err) => {
      console.error(err);
      this.toast.error('No se pudieron cargar los empleados');
    });
  }

  cargarCatalogos(): void {

    this.http.get<any[] | { data?: any[]; sucursales?: any[] }>(
      `${environment.apiUrl}/api/sucursales`
    )
      .pipe(
        catchError(() => of([]))
      )
      .subscribe((res) => {

        this.sucursales =
          Array.isArray(res)
            ? res
            : (res?.sucursales || res?.data || []);

      });

    this.http.get<any[] | { data?: any[]; cargos?: any[] }>(
      `${environment.apiUrl}/api/cargos/all`
    )
      .pipe(catchError(() => of([]))
      )
      .subscribe((res) => {

        this.cargos =
          Array.isArray(res)
            ? res
            : (res?.cargos || res?.data || []);



      });


       // Tipos de contratación
  this.http.get<any[] | { data?: any[]; contrataciones_tipos?: any[] }>(
    `${environment.apiUrl}/api/contrataciones-tipos/all`
  )
    .pipe(
      catchError(() => of([]))
    )
    .subscribe((res) => {

      this.contrataciones =
        Array.isArray(res)
          ? res
          : (res?.contrataciones_tipos || res?.data || []);

    });
  }


  onEstadoChange(): void {
    console.log('Estado seleccionado:', this.filtros.estado);
    this.cargarRegistros();
  }

get registrosFiltrados(): EmpleadoBasico[] {

  let resultado = [...this.registros];

  // Búsqueda
  const q = String(this.filtros.q || '')
    .trim()
    .toLowerCase();

  if (q) {

    resultado = resultado.filter(r => {

      const hay = [
        r.legajo,
        r.apellido,
        r.nombre,
        r.documento
      ]
        .filter(Boolean)
        .map(v => String(v).toLowerCase())
        .join(' ');

      return hay.includes(q);

    });

  }

  // Tipo de contratación
  if (this.filtros.contratacion_tipo_id) {
    resultado = resultado.filter(r =>
      Number(r.contratacion_tipo_id) ===
      Number(this.filtros.contratacion_tipo_id)
    );
  }

  // Cargo
  if (this.filtros.cargo_id) {

    const cargoSeleccionado = Number(this.filtros.cargo_id);

    resultado = resultado.filter((r: any) => {

      const cargoId =
        r.cargo_id ??
        r.empleado?.cargo_id ??
        r.cargo?.cargo_id ??
        r.empleado?.cargo?.cargo_id;

      return Number(cargoId) === cargoSeleccionado;

    });

  }

  return resultado;
}
  // ---------- Helpers ----------

  empleadoNombre(r: EmpleadoBasico): string {
    const ap = r.apellido || '';
    const no = r.nombre || '';
    return `${ap}, ${no}`.trim() || '-';
  }

  formatImporte(v: number | null | undefined): string {
    return `$ ${Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatFecha(v: string | null | undefined): string {
    if (!v) return '-';
    return String(v).slice(0, 10);
  }

  public empleadoLabel(e: EmpleadoOption): string {
    const legajo = e?.legajo ? String(e.legajo) : '-';
    const ap = e?.apellido ?? '';
    const no = e?.nombre ?? '';
    const doc = (e as any)?.numero_documento ??
      (e as any)?.documento ??
      '-';

    return `${legajo} - ${ap}, ${no} - ${doc}`;
  }

  empleadoSeleccionadoLabel(): string {
    const e = this.empleados.find(x => Number(x.empleado_id ?? x.id) === Number(this.form.empleado_id));
    return e ? this.empleadoLabel(e) : '';
  }

  filtrarEmpleados(): void {
    const q = String(this.form.empleadoBusqueda || '').trim().toLowerCase();
    if (!q) { this.empleadosFiltrados = this.empleados.slice(); return; }
    this.empleadosFiltrados = this.empleados.filter(e => this.empleadoLabel(e).toLowerCase().includes(q));
  }

  onBuscarEmpleadoChange(): void {
    this.filtrarEmpleados();
    const label = String(this.form.empleadoBusqueda || '').trim();
    const match = this.empleadosFiltrados.find(e => this.empleadoLabel(e) === label);
    if (match) this.form.empleado_id = Number(match.empleado_id ?? match.id);
  }

  filtrarEmpleadosMasiva(): void {
    const q = String(this.masivaBusqueda || '').trim().toLowerCase();
    if (!q) { this.empleadosFiltrados = this.empleados.slice(); return; }
    this.empleadosFiltrados = this.empleados.filter(e => this.empleadoLabel(e).toLowerCase().includes(q));
  }

  // ---------- Formulario individual ----------

  abrirNuevo(): void {
    this.editId = null;
    this.form = { empleado_id: null, empleadoBusqueda: '', basico_personalizado: null, fecha_desde: '', fecha_hasta: '', activo: true };
    this.formError = '';
    this.filtrarEmpleados();
    this.abrirModal('form', 'Nuevo básico personalizado');
  }

  abrirEditar(r: EmpleadoBasico): void {
    this.editId = r.empleado_basico_id;
    this.form = {
      empleado_id: r.empleado_id,
      empleadoBusqueda: '',
      basico_personalizado: r.basico_personalizado,
      fecha_desde: this.formatFecha(r.fecha_desde),
      fecha_hasta: r.fecha_hasta ? this.formatFecha(r.fecha_hasta) : '',
      activo: Number(r.activo) === 1
    };
    this.formError = '';
    this.filtrarEmpleados();
    this.abrirModal('form', 'Editar básico personalizado');
  }

  validarForm(): boolean {
    if (!this.form.empleado_id) { this.formError = 'Debe seleccionar un empleado.'; return false; }
    if (this.form.basico_personalizado == null || Number(this.form.basico_personalizado) <= 0) {
      this.formError = 'El básico personalizado debe ser mayor a cero.'; return false;
    }
    if (!this.form.fecha_desde) { this.formError = 'La fecha desde es obligatoria.'; return false; }
    if (this.form.fecha_hasta && this.form.fecha_hasta < this.form.fecha_desde) {
      this.formError = 'La fecha hasta no puede ser anterior a la fecha desde.'; return false;
    }
    this.formError = '';
    return true;
  }

  guardarForm(): void {
    if (!this.validarForm() || this.guardando) return;
    const payload = {
      empleado_id: Number(this.form.empleado_id),
      basico_personalizado: Number(this.form.basico_personalizado),
      fecha_desde: this.form.fecha_desde,
      fecha_hasta: this.form.fecha_hasta || null,
      activo: this.form.activo ? 1 : 0
    };
    this.guardando = true;
    const request$ = this.editId
      ? this.svc.update(this.editId, payload)
      : this.svc.create(payload);
    request$.pipe(finalize(() => { this.guardando = false; try { this.cdr.detectChanges(); } catch { } }))
      .subscribe((res: any) => {
        if (res?.ok === false || res?.success === false) {
          this.toast.error(res?.message || 'No se pudo guardar el básico personalizado');
          return;
        }
        this.cerrarModal();
        this.toast.success(this.editId ? 'Básico personalizado actualizado' : 'Básico personalizado creado');
        this.cargarRegistros();
      }, (err) => {
        console.error(err);
        this.toast.error(err?.error?.message || 'No se pudo guardar el básico personalizado');
      });
  }

  // ---------- Baja individual ----------

  pedirBaja(r: EmpleadoBasico): void {
    this.confirmMensaje = '¿Desea dar de baja el básico personalizado de este empleado?';
    this.confirmAccion = () => {
      this.procesando = true;
      this.svc.remove(r.empleado_basico_id).pipe(finalize(() => { this.procesando = false; try { this.cdr.detectChanges(); } catch { } }))
        .subscribe((res: any) => {
          if (res?.ok === false || res?.success === false) {
            this.toast.error(res?.message || 'No se pudo dar de baja el registro');
            return;
          }
          this.toast.success('Básico personalizado dado de baja');
          this.cargarRegistros();
        }, (err) => {
          console.error(err);
          this.toast.error('No se pudo dar de baja el registro');
        });
    };
    this.confirmVisible = true;
  }

  // ---------- Selección ----------

  toggleSeleccion(id: number, checked: boolean): void {
    if (checked) this.seleccion.add(id); else this.seleccion.delete(id);
  }

  toggleSeleccionTodos(checked: boolean): void {
    if (checked) this.registrosFiltrados.forEach(r => this.seleccion.add(r.empleado_basico_id));
    else this.registrosFiltrados.forEach(r => this.seleccion.delete(r.empleado_basico_id));
  }

  // ---------- Alta masiva ----------

  abrirAltaMasiva(): void {
    this.masivaSeleccion.clear();
    this.masivaBusqueda = '';
    this.masivaForm = { basico_personalizado: null, fecha_desde: '', fecha_hasta: '', activo: true };
    this.masivaError = '';
    this.filtrarEmpleadosMasiva();
    this.abrirModal('alta-masiva', 'Alta masiva de básicos');
  }

  toggleMasiva(id: number, checked: boolean): void {
    if (checked) this.masivaSeleccion.add(id); else this.masivaSeleccion.delete(id);
  }

  toggleMasivaTodos(checked: boolean): void {
    if (checked) this.empleadosFiltrados.forEach(e => this.masivaSeleccion.add(Number(e.empleado_id ?? e.id)));
    else this.empleadosFiltrados.forEach(e => this.masivaSeleccion.delete(Number(e.empleado_id ?? e.id)));
  }

  validarMasiva(): boolean {
    if (!this.masivaSeleccion.size) { this.masivaError = 'Debe seleccionar al menos un empleado.'; return false; }
    if (this.masivaForm.basico_personalizado == null || Number(this.masivaForm.basico_personalizado) <= 0) {
      this.masivaError = 'El básico personalizado debe ser mayor a cero.'; return false;
    }
    if (!this.masivaForm.fecha_desde) { this.masivaError = 'La fecha desde es obligatoria.'; return false; }
    if (this.masivaForm.fecha_hasta && this.masivaForm.fecha_hasta < this.masivaForm.fecha_desde) {
      this.masivaError = 'La fecha hasta no puede ser anterior a la fecha desde.'; return false;
    }
    this.masivaError = '';
    return true;
  }

  guardarAltaMasiva(): void {
    if (!this.validarMasiva() || this.guardando) return;
    const items = Array.from(this.masivaSeleccion).map(empleadoId => ({
      empleado_id: empleadoId,
      basico_personalizado: Number(this.masivaForm.basico_personalizado),
      fecha_desde: this.masivaForm.fecha_desde,
      fecha_hasta: this.masivaForm.fecha_hasta || null,
      activo: this.masivaForm.activo ? 1 : 0
    }));
    this.guardando = true;
    this.svc.createMasivo(items).pipe(finalize(() => { this.guardando = false; try { this.cdr.detectChanges(); } catch { } }))
      .subscribe((res: any) => {
        if (res?.ok === false || res?.success === false) {
          this.toast.error(res?.message || 'No se pudo realizar el alta masiva');
          return;
        }
        this.cerrarModal();
        this.toast.success(`Alta masiva realizada para ${items.length} empleado(s)`);
        this.cargarRegistros();
      }, (err) => {
        console.error(err);
        this.toast.error(err?.error?.message || 'No se pudo realizar el alta masiva');
      });
  }

  // ---------- Modificación masiva ----------

  abrirModifMasiva(): void {
    if (!this.seleccion.size) return;
    this.modifForm = { basico_personalizado: null, fecha_desde: '', fecha_hasta: '', activo: '' };
    this.modifError = '';
    this.abrirModal('modif-masiva', `Modificar ${this.seleccion.size} registro(s)`);
  }

  validarModif(): boolean {
    const algo = this.modifForm.basico_personalizado != null || this.modifForm.fecha_desde || this.modifForm.fecha_hasta || this.modifForm.activo !== '';
    if (!algo) { this.modifError = 'Complete al menos un campo a modificar.'; return false; }
    if (this.modifForm.basico_personalizado != null && Number(this.modifForm.basico_personalizado) <= 0) {
      this.modifError = 'El básico personalizado debe ser mayor a cero.'; return false;
    }
    if (this.modifForm.fecha_desde && this.modifForm.fecha_hasta < this.modifForm.fecha_desde) {
      this.modifError = 'La fecha hasta no puede ser anterior a la fecha desde.'; return false;
    }
    this.modifError = '';
    return true;
  }

  guardarModifMasiva(): void {
    if (!this.validarModif() || this.guardando) return;
    const items: EmpleadoBasicoUpdateMasivoItem[] = this.seleccionados.map(r => {
      const item: EmpleadoBasicoUpdateMasivoItem = { empleado_basico_id: r.empleado_basico_id };
      if (this.modifForm.basico_personalizado != null) item.basico_personalizado = Number(this.modifForm.basico_personalizado);
      if (this.modifForm.fecha_desde) item.fecha_desde = this.modifForm.fecha_desde;
      if (this.modifForm.fecha_hasta) item.fecha_hasta = this.modifForm.fecha_hasta;
      if (this.modifForm.activo !== '') item.activo = Number(this.modifForm.activo);
      return item;
    });
    this.guardando = true;
    this.svc.updateMasivo(items).pipe(finalize(() => { this.guardando = false; try { this.cdr.detectChanges(); } catch { } }))
      .subscribe((res: any) => {
        if (res?.ok === false || res?.success === false) {
          this.toast.error(res?.message || 'No se pudo realizar la modificación masiva');
          return;
        }
        this.cerrarModal();
        this.toast.success(`Modificación masiva realizada para ${items.length} registro(s)`);
        this.cargarRegistros();
      }, (err) => {
        console.error(err);
        this.toast.error(err?.error?.message || 'No se pudo realizar la modificación masiva');
      });
  }
  loadEstados() {
    this.http.get<any>(`${environment.apiUrl}/api/estados`).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.data || res?.estados || res?.items || []);
        this.estados = (data || []).map((estado: any) => ({
          estado_id: Number(estado?.estado_id ?? estado?.id ?? 0) || 0,
          nombre: String(estado?.nombre ?? estado?.descripcion ?? estado?.name ?? estado?.estado ?? 'Estado')
        })).filter((estado: any) => estado.estado_id > 0);
      },
      error: (err) => {
        console.error('load estados', err);
        this.estados = [];
      }
    });
  }

  // ---------- Baja masiva ----------

  pedirBajaMasiva(): void {
    const ids = Array.from(this.seleccion);
    if (!ids.length) return;
    this.confirmMensaje = `Se darán de baja ${ids.length} registro(s) seleccionados. ¿Desea continuar?`;
    this.confirmAccion = () => {
      this.procesando = true;
      this.svc.removeMasivo(ids).pipe(finalize(() => { this.procesando = false; try { this.cdr.detectChanges(); } catch { } }))
        .subscribe((res: any) => {
          if (res?.ok === false || res?.success === false) {
            this.toast.error(res?.message || 'No se pudo realizar la baja masiva');
            return;
          }
          this.toast.success(`Baja masiva realizada para ${ids.length} registro(s)`);
          this.cargarRegistros();
        }, (err) => {
          console.error(err);
          this.toast.error('No se pudo realizar la baja masiva');
        });
    };
    this.confirmVisible = true;
  }

  // ---------- Modal genérico ----------

  abrirModal(modo: ModoModal, titulo: string): void {
    this.modalModo = modo;
    this.modalTitulo = titulo;
    this.modalVisible = true;
    try { this.cdr.detectChanges(); } catch { }
  }

  cerrarModal(): void {
    this.modalVisible = false;
    this.modalModo = null;
  }

  onConfirmClose(confirmado: boolean): void {
    this.confirmVisible = false;
    if (confirmado && this.confirmAccion) this.confirmAccion();
    this.confirmAccion = null;
  }



  limpiarFiltros(): void {
    this.filtros = {
      q: '',
      estado: 1,
      contratacion_id: '',
      sucursal_id: '',
      seccion_id: '',
      cargo_id: ''
    } as any;

    this.cargarRegistros();
  }

  empleadoId(e: any): number {
    return Number(e?.empleado_id ?? e?.id ?? 0);
  }


  esActivo(valor: any): boolean {
    return Number(valor) === 1;
  }

  onSucursalChange(): void {
    console.log('Sucursal:', this.filtros.sucursal_id);

    this.filtros.seccion_id = '';
    this.filtros.cargo_id = '';

    this.secciones = [];
    this.cargos = [];

    this.svc
      .listSeccionesBySucursal(Number(this.filtros.sucursal_id))
      .subscribe((res: any) => {

        console.log('SECCIONES', res);

        this.secciones =
          Array.isArray(res)
            ? res
            : (res?.data || res?.secciones || []);

      });

    this.cargarRegistros();
  }



  onSeccionChange(): void {
    this.filtros.cargo_id = '';

    // si tenías carga remota:
    // this.cargarCargos();

    this.cargarRegistros();
  }




  onMasivaSucursalChange(): void {
    this.masivaFiltros.seccion_id = '';
    this.masivaFiltros.cargo_id = '';

    this.filtrarEmpleadosMasiva();
  }

  onMasivaSeccionChange(): void {
    this.masivaFiltros.cargo_id = '';

    this.filtrarEmpleadosMasiva();
  }

  inicialesEmp(e: any): string {
    const nombre = String(e?.nombre || '');
    const apellido = String(e?.apellido || '');

    return (
      (apellido[0] || '') +
      (nombre[0] || '')
    ).toUpperCase();
  }
  onAvatarErrorEmp(e: any): void {
    if (e) {
      e.foto_url = null;
      e.foto = null;
    }
  }
  fotoUrlEmp(e: any): string | null {
    return e?.foto_url || e?.foto || null;
  }
}
