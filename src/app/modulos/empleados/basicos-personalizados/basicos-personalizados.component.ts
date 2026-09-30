import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { EmpleadoBasicoService } from './empleado-basico.service';
import { EmpleadoBasico, EmpleadoBasicoUpdateMasivoItem, EmpleadoOption, Catalogo } from './empleado-basico.model';
import { ToastService } from '../../../core/toast.service';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../../shared/modal-alerta.component';
import { ModalFotos } from '../../../shared/modal-fotos/modal-fotos';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
type ModoModal = 'form' | 'alta-masiva' | 'modif-masiva' | 'importar' | null;

@Component({
  selector: 'app-basicos-personalizados',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, ModalAlertaComponent, ModalFotos],
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
  /** true = panel de filtros plegado. */
  filtrosColapsados = false;

  filtros = {
    q: '',
    estado: 1,
    contratacion_tipo_id: '',
    sucursal_id: '',
    seccion_id: '',
    cargo_id: ''
  };
  contrataciones: Catalogo[] = [];
  sucursales: Catalogo[] = [];
  secciones: Catalogo[] = [];
  cargos: Catalogo[] = [];

  private datosEmpleado = new Map<number, any>();
  private avatarsSinImagen = new Set<number>();

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
  /** Estado de baja de un registro (3 = dado de baja). */
  private esBaja(r: { activo?: number | null } | null | undefined): boolean {
    return Number(r?.activo) === 3;
  }
  /**
   * True solo cuando se está visualizando exclusivamente registros en estado baja.
   * En ese caso la baja masiva debe eliminar físicamente en lugar de hacer borrado lógico.
   */
  get soloRegistrosEnBaja(): boolean {
    return this.registrosFiltrados.length > 0 && this.registrosFiltrados.every(r => this.esBaja(r));
  }
  /** La baja masiva será física: hay selección y todo lo seleccionado está en baja. */
  get bajaMasivaEsFisica(): boolean {
    const sel = this.seleccionados;
    return sel.length > 0 && sel.every(r => this.esBaja(r)) && this.soloRegistrosEnBaja;
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
  /**
   * Recarga la lista.
   * @param silencioso si es true no levanta el overlay a pantalla completa, para
   *        refrescos posteriores a una acción donde el toast ya informó el resultado.
   */
  cargarRegistros(silencioso = false): void {
    if (!silencioso) {
      this.loading = true;
    }

    const estadoId = this.filtros.estado
      ? Number(this.filtros.estado)
      : undefined;

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
      this.datosEmpleado = new Map<number, any>();
      this.empleados.forEach(e => {
        const id = Number(e.empleado_id ?? e.id);
        if (id) this.datosEmpleado.set(id, e);
      });
      this.filtrarEmpleados();
      this.cdr.detectChanges();
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
        const data = Array.isArray(res) ? res : (res?.sucursales || res?.data || []);
        this.sucursales = this.normalizarCatalogo(data, 'sucursal_id');
      });

    this.http.get<any[] | { data?: any[]; cargos?: any[] }>(
      `${environment.apiUrl}/api/cargos/all`
    )
      .pipe(catchError(() => of([]))
      )
      .subscribe((res) => {
        const data = Array.isArray(res) ? res : (res?.cargos || res?.data || []);
        this.cargos = this.normalizarCatalogo(data, 'cargo_id');
      });


  // Tipos de contratación
  this.http.get<any[] | { data?: any[]; contrataciones_tipos?: any[] }>(
    `${environment.apiUrl}/api/contrataciones-tipos`
  )
    .pipe(
      catchError(() => of([]))
    )
    .subscribe((res) => {
      const data = Array.isArray(res) ? res : (res?.contrataciones_tipos || res?.data || []);
      this.contrataciones = this.normalizarCatalogo(data, 'contrataciones_tipos_id');
    });
  }

  /** Normaliza cualquier respuesta de catálogo a { id, nombre } con la clave de id indicada. */
  private normalizarCatalogo(data: any, ...idKeys: string[]): Catalogo[] {
    if (!Array.isArray(data)) return [];
    return data.map((x: any) => {
      let id = 0;
      for (const key of [...idKeys, 'id']) {
        const valor = x?.[key];
        if (valor != null && Number(valor) > 0) { id = Number(valor); break; }
      }
      return {
        id,
        nombre: String(x?.nombre ?? x?.descripcion ?? x?.name ?? '')
      };
    }).filter((x: Catalogo) => x.id > 0 && x.nombre);
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
    const ctId = Number(this.filtros.contratacion_tipo_id);
    resultado = resultado.filter((r: any) => this.idDeEmpleado(r, ['contratacion_tipo_id', 'tipo_contratacion_id', 'contratacion_tipo']) === ctId);
  }

  // Sucursal
  if (this.filtros.sucursal_id) {
    const sucId = Number(this.filtros.sucursal_id);
    resultado = resultado.filter((r: any) => this.idDeEmpleado(r, ['sucursal_id', 'sucursal']) === sucId);
  }

  // Sección
  if (this.filtros.seccion_id) {
    const secId = Number(this.filtros.seccion_id);
    resultado = resultado.filter((r: any) => this.idDeEmpleado(r, ['seccion_id', 'seccion']) === secId);
  }

  // Cargo
  if (this.filtros.cargo_id) {
    const cargoId = Number(this.filtros.cargo_id);
    resultado = resultado.filter((r: any) => this.idDeEmpleado(r, ['cargo_id', 'cargo']) === cargoId);
  }

  return resultado;
  }

  /**
   * Resuelve un id (contratación, sucursal, sección, cargo) buscando primero en el
   * registro y, si no está, en los datos del empleado cargados en el catálogo.
   * Devuelve 0 cuando no se encuentra.
   */
  private idDeEmpleado(r: any, claves: string[]): number {
  const [idKey, objKey] = claves;
  const emp = this.datosEmpleado.get(Number(r?.empleado_id)) || (r as any)?.empleado;

  for (const fuente of [r, emp]) {
    if (!fuente) continue;
    const directo = fuente[idKey];
    if (directo != null && Number(directo) > 0) return Number(directo);
    if (objKey) {
      const obj = fuente[objKey];
      const anidado = obj?.id ?? obj?.[idKey];
      if (anidado != null && Number(anidado) > 0) return Number(anidado);
    }
  }
  return 0;
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

  /**
   * Determina si un empleado está activo.
   * El backend expone el estado como objeto (`estado.estado_id`) o como número.
   */
  esEmpleadoActivo(empleado: any): boolean {
    if (!empleado) return false;

    const est = empleado.estado;
    if (est !== null && typeof est === 'object') {
      if (est.es_activo === 1 || est.es_activo === true) return true;
      if (est.es_activo === 0 || est.es_activo === false) return false;
      const id = Number(est.estado_id ?? est.estado_empleado_id ?? est.id);
      if (Number.isFinite(id)) return id === 1;
      return String(est.nombre || est.descripcion || '').trim().toLowerCase() === 'activo';
    }

    if (est !== null && est !== undefined) {
      const id = Number(est);
      if (Number.isFinite(id)) return id === 1;
      return String(est).trim().toLowerCase() === 'activo';
    }

    // Fallback: si no viene el estado, usar el campo habilitado.
    return empleado.habilitado === undefined ? true : Number(empleado.habilitado) === 1;
  }

  filtrarEmpleadosMasiva(): void {
    // En el alta masiva sólo se ofrecen empleados activos.
    let lista = this.empleados.filter((e: any) => this.esEmpleadoActivo(e));

    const q = String(this.masivaBusqueda || '').trim().toLowerCase();
    if (q) {
      lista = lista.filter(e => this.empleadoLabel(e).toLowerCase().includes(q));
    }

    if (this.masivaFiltros.sucursal_id) {
      const id = Number(this.masivaFiltros.sucursal_id);
      lista = lista.filter((e: any) => (Number(e.sucursal_id ?? e.sucursal?.id ?? 0) === id));
    }
    if (this.masivaFiltros.seccion_id) {
      const id = Number(this.masivaFiltros.seccion_id);
      lista = lista.filter((e: any) => (Number(e.seccion_id ?? e.seccion?.id ?? 0) === id));
    }
    if (this.masivaFiltros.cargo_id) {
      const id = Number(this.masivaFiltros.cargo_id);
      lista = lista.filter((e: any) => (Number(e.cargo_id ?? e.cargo?.id ?? 0) === id));
    }

    this.empleadosFiltrados = lista;
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
        this.cargarRegistros(true);
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
          this.cargarRegistros(true);
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
        this.cargarRegistros(true);
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
        this.cargarRegistros(true);
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

    const fisico = this.bajaMasivaEsFisica;
    this.confirmTitulo = fisico ? 'Confirmar eliminación definitiva' : 'Confirmar baja';
    this.confirmMensaje = fisico
      ? `Se eliminarán FÍSICAMENTE ${ids.length} registro(s) en estado de baja. Esta acción no se puede deshacer. ¿Desea continuar?`
      : `Se darán de baja ${ids.length} registro(s) seleccionados. ¿Desea continuar?`;

    this.confirmAccion = () => {
      this.procesando = true;
      const request$ = fisico
        ? this.svc.removeMasivoFinal(ids)
        : this.svc.removeMasivo(ids);

      request$.pipe(finalize(() => { this.procesando = false; try { this.cdr.detectChanges(); } catch { } }))
        .subscribe((res: any) => {
          if (res?.ok === false || res?.success === false) {
            this.toast.error(res?.message || 'No se pudo realizar la baja masiva');
            return;
          }
          this.toast.success(
            fisico
              ? `Eliminación física de ${ids.length} registro(s) realizada`
              : `Baja masiva realizada para ${ids.length} registro(s)`
          );
          this.cargarRegistros(true);
        }, (err) => {
          console.error(err);
          this.toast.error(fisico ? 'No se pudo eliminar físicamente los registros' : 'No se pudo realizar la baja masiva');
        });
    };
    this.confirmVisible = true;
  }

  // ---------- Importar desde Excel / CSV ----------

  archivoImport: File | null = null;
  importEnviando = false;
  importError = '';
  /** Respuesta del backend con el detalle de la carga. */
  importResultado: any = null;
  importJobId: string | null = null;
  importFechaDesde = '';
  importFechaHasta = '';
  importActivo = true;

  abrirImportacion(): void {
    this.archivoImport = null;
    this.importError = '';
    this.importResultado = null;
    this.importJobId = null;
    this.importFechaDesde = '';
    this.importFechaHasta = '';
    this.importActivo = true;
    this.abrirModal('importar', 'Importar básicos desde Excel / CSV');
  }

  /** Permite abrir el selector de archivos con un click en toda la zona. */
  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0] || null;
    this.importError = '';
    this.importResultado = null;
    this.importJobId = null;

    if (!file) { this.archivoImport = null; return; }

    const extOk = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!extOk) {
      this.archivoImport = null;
      this.importError = 'Formato no válido. Se aceptan archivos .xlsx, .xls o .csv.';
      return;
    }
    this.archivoImport = file;
  }

  quitarArchivo(): void {
    this.archivoImport = null;
    this.importError = '';
    this.importResultado = null;
  }

  formatearTamano(bytes: number): string {
    if (!bytes) return '0 B';
    const unidades = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${unidades[i]}`;
  }

  /** Sube el archivo al backend. dryRun permite previsualizar sin aplicar. */
  enviarImportacion(dryRun: boolean): void {
    if (!this.archivoImport || this.importEnviando) return;

    this.importEnviando = true;
    this.importError = '';

    this.svc.importarDesdeArchivo(this.archivoImport, {
      dryRun,
      fechaDesde: this.importFechaDesde || undefined,
      fechaHasta: this.importFechaHasta || undefined,
      activo: this.importActivo
    }).pipe(
      finalize(() => { this.importEnviando = false; try { this.cdr.detectChanges(); } catch { } })
    ).subscribe({
      next: (res: any) => {
        this.importResultado = res?.data ?? res ?? {};
        this.importJobId = res?.job_id || this.importResultado?.job_id || null;
        this.importError = '';

        const summary = this.importResultado?.summary || this.importResultado;
        const fallidos = Number(summary?.failed ?? summary?.errors ?? 0);
        const total = Number(summary?.processed ?? summary?.total ?? 0);

        if (dryRun) {
          this.importTitulo = 'Simulación de carga';
        } else {
          this.importTitulo = 'Carga finalizada';
        }
        this.importMensaje = this.importResultado?.message
          || (dryRun
            ? `Se procesarían ${total} fila(s), ${fallidos} con error.`
            : `Se procesaron ${total} fila(s), ${fallidos} con error.`);
        this.importMostrarResultado = true;
      },
      error: (err: any) => {
        const body = err?.error || err?.body || null;
        this.importError = body?.message || err?.message || 'No se pudo procesar el archivo.';
        this.importResultado = body;
        this.importMostrarResultado = true;
      }
    });
  }

  importTitulo = 'Importar básicos desde Excel / CSV';
  importMensaje = '';
  importMostrarResultado = false;

  /** Descarga el detalle de la carga en CSV. */
  exportarDetalleImport(): void {
    const det = this.importDetalleFilas();
    if (!det.length) return;
    const rows = [['legajo', 'fila', 'estado', 'mensaje']];
    det.forEach((d: any) => rows.push([d.legajo ?? '', d.fila ?? '', d.estado ?? '', d.mensaje ?? '']));
    const csv = rows.map((r: any[]) => r.map((c: any) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_basicos_${this.importJobId || Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Normaliza el detalle de la carga a una lista plana para la tabla. */
  importDetalleFilas(): any[] {
    const r = this.importResultado || {};
    const fuente = r.detalle || r.details || r.errors || r.filas || r.rows || [];
    if (!Array.isArray(fuente)) return [];
    return fuente.map((f: any, i: number) => {
      if (typeof f === 'string') {
        return { fila: i + 1, legajo: '', estado: 'error', mensaje: f };
      }
      const errores = f.errors || f.mensaje || f.message || f.error || '';
      return {
        fila: f.fila ?? f.row ?? i + 1,
        legajo: f.legajo ?? '',
        estado: f.estado ?? f.status ?? (errores ? 'error' : 'ok'),
        mensaje: Array.isArray(errores) ? errores.join('; ') : String(errores)
      };
    });
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
      contratacion_tipo_id: '',
      sucursal_id: '',
      seccion_id: '',
      cargo_id: ''
    };

    this.secciones = [];
    this.cargos = [];
    this.cargarRegistros();
  }

  /** Plega / despliega el panel de filtros. */
  toggleFiltros(): void {
    this.filtrosColapsados = !this.filtrosColapsados;
  }

  /** Cantidad de filtros con valor cargado (para el badge y el botón de limpiar). */
  get filtrosActivosCount(): number {
    const f = this.filtros || ({} as any);
    return [
      f.q,
      f.contratacion_tipo_id,
      f.sucursal_id,
      f.seccion_id,
      f.cargo_id,
      f.estado
    ].filter((v) => v !== null && v !== undefined && String(v).trim() !== '').length;
  }

  empleadoId(e: any): number {
    return Number(e?.empleado_id ?? e?.id ?? 0);
  }


  esActivo(valor: any): boolean {
    return Number(valor) === 1;
  }

  onSucursalChange(): void {
    this.filtros.seccion_id = '';
    this.filtros.cargo_id = '';
    this.secciones = [];
    this.cargos = [];

    const sucursalId = Number(this.filtros.sucursal_id || 0);
    if (!sucursalId) return;

    this.svc
      .listSeccionesBySucursal(sucursalId)
      .subscribe((res: any) => {
        const data = Array.isArray(res) ? res : (res?.data || res?.secciones || []);
        this.secciones = this.normalizarCatalogo(data, 'seccion_id');
        this.cdr.detectChanges();
      });
  }

  onSeccionChange(): void {
    this.filtros.cargo_id = '';
    this.cargos = [];

    const seccionId = Number(this.filtros.seccion_id || 0);
    if (!seccionId) return;

    this.svc
      .listCargosBySeccion(seccionId)
      .subscribe((res: any) => {
        const data = Array.isArray(res) ? res : (res?.data || res?.cargos || []);
        this.cargos = this.normalizarCatalogo(data, 'cargo_id');
        this.cdr.detectChanges();
      });
  }




  onMasivaSucursalChange(): void {
    this.masivaFiltros.seccion_id = '';
    this.masivaFiltros.cargo_id = '';
    this.masivaSecciones = [];
    this.masivaCargos = [];

    const sucursalId = Number(this.masivaFiltros.sucursal_id || 0);
    if (sucursalId) {
      this.svc.listSeccionesBySucursal(sucursalId).subscribe((res: any) => {
        const data = Array.isArray(res) ? res : (res?.data || res?.secciones || []);
        this.masivaSecciones = this.normalizarCatalogo(data, 'seccion_id');
        this.cdr.detectChanges();
      });
    }

    this.filtrarEmpleadosMasiva();
  }

  onMasivaSeccionChange(): void {
    this.masivaFiltros.cargo_id = '';
    this.masivaCargos = [];

    const seccionId = Number(this.masivaFiltros.seccion_id || 0);
    if (seccionId) {
      this.svc.listCargosBySeccion(seccionId).subscribe((res: any) => {
        const data = Array.isArray(res) ? res : (res?.data || res?.cargos || []);
        this.masivaCargos = this.normalizarCatalogo(data, 'cargo_id');
        this.cdr.detectChanges();
      });
    }

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
    return e?.foto_url_publica || e?.url_publica || e?.foto_url || e?.foto || null;
  }

  /** Datos del empleado (catálogo) vinculados a un registro del listado. */
  private empleadoDeRegistro(r: any): any {
    return this.datosEmpleado.get(Number(r?.empleado_id)) || null;
  }

  /** URL de la foto del empleado de un registro, ya resuelta contra la API. */
  fotoUrlRegistro(r: any): string | null {
    const url = this.fotoUrlEmp(r) || this.fotoUrlEmp(this.empleadoDeRegistro(r));
    if (!url) return null;
    const value = String(url).trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
    const base = (environment.apiUrl || '').replace(/\/$/, '');
    return `${base}${value.startsWith('/') ? value : `/${value}`}`;
  }

  tieneFotoRegistro(r: any): boolean {
    const id = Number(r?.empleado_id || 0);
    return !!this.fotoUrlRegistro(r) && !!id && !this.avatarsSinImagen.has(id);
  }

  avatarErrorRegistro(r: any): void {
    const id = Number(r?.empleado_id || 0);
    if (id) this.avatarsSinImagen.add(id);
  }

  inicialesRegistro(r: any): string {
    return this.inicialesEmp(r) || this.inicialesEmp(this.empleadoDeRegistro(r));
  }

  // ---------- Vista ampliada de foto ----------

  mostrarModalFoto = false;
  fotoAmpliada: string | null = null;
  empleadoFotoSeleccionado: any = null;

  tituloModalFoto(): string {
    const r = this.empleadoFotoSeleccionado;
    if (!r) return '';
    const emp = this.empleadoDeRegistro(r) || {};
    const legajo = r.legajo ?? emp.legajo ?? '-';
    const cargo = emp.cargo?.nombre ?? r.cargo?.nombre ?? '';
    const base = `${this.empleadoNombre(r)}, Legajo: ${legajo}`;
    return cargo ? `${base}, Puesto: ${cargo}` : base;
  }

  ampliarFoto(r: any): void {
    if (!this.tieneFotoRegistro(r)) return;
    this.empleadoFotoSeleccionado = r;
    this.fotoAmpliada = this.fotoUrlRegistro(r);
    this.mostrarModalFoto = true;
  }

  cerrarFoto(): void {
    this.fotoAmpliada = null;
    this.empleadoFotoSeleccionado = null;
    this.mostrarModalFoto = false;
  }
}
