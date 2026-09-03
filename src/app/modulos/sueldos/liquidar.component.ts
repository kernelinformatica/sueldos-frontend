import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { environment } from '../../environments/environment';

interface LiquidarEmpleado {
  id: number;
  legajo: string;
  nombre: string;
  apellido?: string;
  fotoUrl?: string;
  sucursal?: string;
  sucursalId?: number | null;
  seccionId?: number | null;
  contratacionTipo?: string;
  contratacionTipoId?: number | null;
  convenioCategoria?: string;
  convenioCategoriaId?: number | null;
  cargo: string;
  seccion: string;
  estado: string;
  seleccionado: boolean;
}

interface LiquidacionTipoOption {
  liquidacion_tipo_id: number;
  empresa_id?: number;
  nombre: string;
  descripcion?: string;
  orden: number;
  estado_id?: number;
}

interface MesOption {
  value: number;
  label: string;
}

interface CatalogoOption {
  id: number;
  nombre: string;
  descripcion?: string;
}

interface SeccionOption extends CatalogoOption {
  sucursal_id?: number;
}

@Component({
  selector: 'app-sueldos-liquidar',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  templateUrl: './liquidar.component.html',
  styleUrls: ['./liquidar.component.scss']
})
export class LiquidarComponent {
  isLoading = false;
  loadingEmpleados = false;
  loadingTipos = false;
  loadingContrataciones = false;
  loadingCategorias = false;
  loadingSucursales = false;
  loadingSecciones = false;
  errorMsg: string | null = null;
  tiposErrorMsg: string | null = null;
  contratacionesErrorMsg: string | null = null;
  categoriasErrorMsg: string | null = null;
  sucursalesErrorMsg: string | null = null;
  seccionesErrorMsg: string | null = null;
  modoLiquidacion: number | null = null;
  periodo = new Date().getFullYear();
  periodoMes = new Date().getMonth() + 1;
  selectAll = false;
  currentPage = 1;
  pageSize = 12;
  filtros = {
    nombre: '',
    sucursal: null as number | null,
    seccion: null as number | null,
    contratacionTipo: '',
    convenioCategoria: ''
  };

  readonly meses: MesOption[] = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];

  liquidacionTipos: LiquidacionTipoOption[] = [];
  sucursales: CatalogoOption[] = [];
  secciones: SeccionOption[] = [];
  private seccionesCache = new Map<number, SeccionOption[]>();
  contratacionesTipos: CatalogoOption[] = [];
  convenioCategorias: CatalogoOption[] = [];
  empleados: LiquidarEmpleado[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.cargarEmpleados();
    this.cargarTiposLiquidacion();
    this.cargarSucursales();
    this.cargarContratacionesTipos();
    this.cargarConvenioCategorias();
  }

  get seleccionados(): LiquidarEmpleado[] {
    return this.empleados.filter((empleado) => empleado.seleccionado);
  }

  get totalSeleccionados(): number {
    return this.seleccionados.length;
  }

  get totalEmpleados(): number {
    return this.empleadosFiltrados.length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalEmpleados / this.pageSize));
  }

  get filtrosActivos(): Array<{ label: string; value: string }> {
    const filtros: Array<{ label: string; value: string }> = [];

    if (this.normalizarTexto(this.filtros.nombre)) {
      filtros.push({ label: 'Nombre', value: this.filtros.nombre.trim() });
    }

    const sucursal = this.sucursalSeleccionadaNombre();
    if (sucursal) {
      filtros.push({ label: 'Sucursal', value: sucursal });
    }

    const seccion = this.seccionSeleccionadaNombre();
    if (seccion) {
      filtros.push({ label: 'Sección', value: seccion });
    }

    const contratacion = this.contratacionSeleccionadaNombre();
    if (contratacion) {
      filtros.push({ label: 'Contratación', value: contratacion });
    }

    const convenio = this.convenioSeleccionadaNombre();
    if (convenio) {
      filtros.push({ label: 'Convenio', value: convenio });
    }

    return filtros;
  }

  get empleadosPaginados(): LiquidarEmpleado[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.empleadosFiltrados.slice(start, start + this.pageSize);
  }

  get empleadosFiltrados(): LiquidarEmpleado[] {
    const nombre = this.normalizarTexto(this.filtros.nombre);
    const sucursalId = this.parseCatalogoId(this.filtros.sucursal);
    const seccionId = this.parseCatalogoId(this.filtros.seccion);
    const contratacionId = this.parseCatalogoId(this.filtros.contratacionTipo);
    const convenioId = this.parseCatalogoId(this.filtros.convenioCategoria);

    return this.empleados.filter((empleado) => {
      const nombreCompleto = this.normalizarTexto([empleado.apellido, empleado.nombre].filter(Boolean).join(' '));
      if (nombre && !nombreCompleto.includes(nombre)) {
        return false;
      }

      if (sucursalId !== null && empleado.sucursalId !== sucursalId) {
        return false;
      }

      if (seccionId !== null && empleado.seccionId !== seccionId) {
        return false;
      }

      if (contratacionId !== null && empleado.contratacionTipoId !== contratacionId) {
        return false;
      }

      if (convenioId !== null && empleado.convenioCategoriaId !== convenioId) {
        return false;
      }

      return true;
    });
  }

  toggleTodos(valor: boolean): void {
    this.selectAll = valor;
    this.empleados = this.empleados.map((empleado) => ({
      ...empleado,
      seleccionado: valor && this.esEmpleadoActivo(empleado) && this.empleadoCoincideFiltros(empleado)
    }));
  }

  cargarEmpleados(): void {
    this.loadingEmpleados = true;
    this.http.get<any[] | { data?: any[]; empleados?: any[] }>(`${environment.apiUrl}/api/empleados`).subscribe({
      next: (res) => {
        const rows = Array.isArray(res) ? res : (res?.empleados || res?.data || []);
        this.empleados = rows
          .map((empleado: any) => ({
          id: Number(empleado?.id ?? empleado?.empleado_id ?? 0),
          legajo: String(empleado?.legajo ?? ''),
          nombre: String(empleado?.nombre ?? ''),
          apellido: String(empleado?.apellido ?? ''),
          fotoUrl: this.fotoEmpleadoUrl(empleado),
          sucursal: String(empleado?.sucursal?.nombre ?? empleado?.sucursal_nombre ?? empleado?.sucursal ?? ''),
          sucursalId: this.parseNumber(empleado?.sucursal_id ?? empleado?.sucursal?.sucursal_id ?? empleado?.sucursal?.id),
          seccionId: this.parseNumber(empleado?.seccion_id ?? empleado?.seccion?.seccion_id ?? empleado?.seccion?.id),
          contratacionTipo: String(empleado?.contratacion_tipo?.nombre ?? empleado?.contratacion_tipo_nombre ?? empleado?.contratacion_tipo ?? ''),
          contratacionTipoId: this.parseNumber(empleado?.contratacion_tipo_id ?? empleado?.tipo_contratacion_id ?? empleado?.contrataciones_tipos_id ?? empleado?.contratacion_tipo?.contrataciones_tipos_id ?? empleado?.contratacion_tipo?.id),
          convenioCategoria: String(empleado?.convenio_categoria?.nombre ?? empleado?.convenio_categoria_nombre ?? empleado?.convenio_categoria ?? ''),
          convenioCategoriaId: this.parseNumber(empleado?.convenio_categoria_id ?? empleado?.categoria_id ?? empleado?.convenio_categoria?.convenio_categoria_id ?? empleado?.convenio_categoria?.categoria_id ?? empleado?.convenio_categoria?.id),
          cargo: String(empleado?.cargo?.nombre ?? empleado?.cargo ?? 'Sin cargo'),
          seccion: String(empleado?.seccion?.nombre ?? empleado?.seccion_nombre ?? empleado?.seccion ?? 'Sin sección'),
          estado: String(this.estadoEmpleadoLabel(empleado?.estado) || 'Activo'),
          seleccionado: false
        }))
          .filter((empleado: LiquidarEmpleado) => this.esEmpleadoActivo(empleado));
        this.currentPage = 1;
        this.loadingEmpleados = false;
      },
      error: () => {
        this.errorMsg = 'No se pudieron cargar los empleados reales.';
        this.loadingEmpleados = false;
      }
    });
  }

  cargarTiposLiquidacion(): void {
    this.loadingTipos = true;
    this.tiposErrorMsg = null;

    this.http.get<LiquidacionTipoOption[] | { data?: LiquidacionTipoOption[]; meta?: { total?: number } }>(`${environment.apiUrl}/api/liquidacion-tipos`)
      .pipe(finalize(() => {
        this.loadingTipos = false;
      }))
      .subscribe({
        next: (res) => {
          const tipos = this.extraerTiposLiquidacion(res);
          this.liquidacionTipos = [...tipos].sort((a, b) => {
            const ordenA = Number(a?.orden ?? 0);
            const ordenB = Number(b?.orden ?? 0);

            if (ordenA !== ordenB) {
              return ordenA - ordenB;
            }

            return String(a?.nombre ?? '').localeCompare(String(b?.nombre ?? ''), 'es', { sensitivity: 'base' });
          });

          if (this.liquidacionTipos.length > 0 && this.modoLiquidacion === null) {
            this.modoLiquidacion = this.liquidacionTipos[0].liquidacion_tipo_id;
          }
        },
        error: () => {
          this.liquidacionTipos = [];
          this.tiposErrorMsg = 'No se pudieron cargar los tipos de liquidación.';
        }
      });
  }

  cargarSucursales(): void {
    this.loadingSucursales = true;
    this.sucursalesErrorMsg = null;

    this.http.get<CatalogoOption[] | { data?: CatalogoOption[]; sucursales?: CatalogoOption[] }>(`${environment.apiUrl}/api/sucursales`)
      .pipe(finalize(() => {
        this.loadingSucursales = false;
      }))
      .subscribe({
        next: (res) => {
          this.sucursales = this.extraerCatalogos(res, 'sucursales').map((item) => ({
            ...item,
            id: this.getCatalogoId(item)
          }));
        },
        error: () => {
          this.sucursales = [];
          this.sucursalesErrorMsg = 'No se pudieron cargar las sucursales.';
        }
      });
  }

  cargarSecciones(sucursalId: number, limpiarSeleccion = true): void {
    if (!sucursalId) {
      this.secciones = [];
      this.loadingSecciones = false;
      if (limpiarSeleccion) {
        this.filtros.seccion = null;
      }
      return;
    }

    if (limpiarSeleccion) {
      this.filtros.seccion = null;
    }

    if (this.seccionesCache.has(sucursalId)) {
      this.secciones = this.seccionesCache.get(sucursalId) || [];
      return;
    }

    this.loadingSecciones = true;
    this.seccionesErrorMsg = null;

    this.http.get<SeccionOption[] | { data?: SeccionOption[]; secciones?: SeccionOption[] }>(`${environment.apiUrl}/api/secciones/by-sucursal`, {
      params: { sucursal_id: String(sucursalId) } as any
    })
      .pipe(finalize(() => {
        this.loadingSecciones = false;
      }))
      .subscribe({
        next: (res) => {
          this.secciones = this.extraerCatalogos(res, 'secciones').map((item) => ({
            ...item,
            id: this.getCatalogoId(item)
          }));
          this.seccionesCache.set(sucursalId, this.secciones);
        },
        error: () => {
          this.secciones = [];
          this.seccionesErrorMsg = 'No se pudieron cargar las secciones.';
        }
      });
  }

    cargarContratacionesTipos(): void {
      this.loadingContrataciones = true;
      this.contratacionesErrorMsg = null;

      this.http.get<CatalogoOption[] | { data?: CatalogoOption[]; contrataciones_tipos?: CatalogoOption[] }>(`${environment.apiUrl}/api/contrataciones-tipos`)
        .pipe(finalize(() => {
          this.loadingContrataciones = false;
        }))
        .subscribe({
          next: (res) => {
              this.contratacionesTipos = this.extraerCatalogos(res, 'contrataciones_tipos').map((item) => ({
                ...item,
                id: this.getCatalogoId(item)
              }));
          },
          error: () => {
            this.contratacionesTipos = [];
            this.contratacionesErrorMsg = 'No se pudieron cargar los tipos de contratación.';
          }
        });
    }

    cargarConvenioCategorias(): void {
      this.loadingCategorias = true;
      this.categoriasErrorMsg = null;

      this.http.get<CatalogoOption[] | { data?: CatalogoOption[]; categorias?: CatalogoOption[] }>(`${environment.apiUrl}/api/convenios-categorias`)
        .pipe(finalize(() => {
          this.loadingCategorias = false;
        }))
        .subscribe({
          next: (res) => {
              this.convenioCategorias = this.extraerCatalogos(res, 'categorias').map((item) => ({
                ...item,
                id: this.getCatalogoId(item)
              }));
          },
          error: () => {
            this.convenioCategorias = [];
            this.categoriasErrorMsg = 'No se pudieron cargar las categorías de convenio.';
          }
        });
    }

  fotoEmpleadoUrl(empleado: any): string {
    return String(empleado?.foto_url_publica || empleado?.url_publica || empleado?.foto || '');
  }

  estadoEmpleadoLabel(estado: any): string {
    if (estado && typeof estado === 'object') {
      return String(estado?.nombre || estado?.descripcion || estado?.label || '');
    }

    return String(estado || '');
  }

  esEmpleadoActivo(empleado: { estado?: string }): boolean {
    return this.normalizarTexto(empleado?.estado || '') === 'activo';
  }

  trackByCatalogoId = (_: number, item: CatalogoOption): number => this.getCatalogoId(item);

  trackByTipoId(_: number, tipo: LiquidacionTipoOption): number {
    return tipo.liquidacion_tipo_id;
  }

  tipoSeleccionadoDescripcion(): string {
    const tipo = this.liquidacionTipos.find((item) => item.liquidacion_tipo_id === this.modoLiquidacion);
    return String(tipo?.descripcion || '').trim();
  }

  tipoSeleccionadoNombre(): string {
    const tipo = this.liquidacionTipos.find((item) => item.liquidacion_tipo_id === this.modoLiquidacion);
    return String(tipo?.nombre || '').trim();
  }

  seccionSeleccionadaNombre(): string {
    const seccionId = this.parseCatalogoId(this.filtros.seccion);
    if (seccionId === null) {
      return '';
    }

    const seccion = this.secciones.find((item) => this.getCatalogoId(item) === seccionId);
    return String(seccion?.nombre || '').trim();
  }

  limpiarFiltros(): void {
    this.filtros = {
      nombre: '',
      sucursal: null,
      seccion: null,
      contratacionTipo: '',
      convenioCategoria: ''
    };
    this.secciones = [];
    this.currentPage = 1;
  }

  onFiltroChange(): void {
    const sucursalId = this.parseCatalogoId(this.filtros.sucursal);
    if (sucursalId === null) {
      this.secciones = [];
      this.filtros.seccion = null;
    } else if (!this.seccionesCache.has(sucursalId) && !this.loadingSecciones) {
      this.cargarSecciones(sucursalId, true);
    } else if (this.seccionesCache.has(sucursalId) && this.filtros.seccion !== null) {
      const seccionValida = this.secciones.some((item) => item.id === this.filtros.seccion);
      if (!seccionValida) {
        this.filtros.seccion = null;
      }
    }
    this.currentPage = 1;
  }

  onSucursalChange(): void {
    this.filtros.sucursal = this.parseCatalogoId(this.filtros.sucursal);
    this.filtros.seccion = null;

    if (this.filtros.sucursal === null) {
      this.secciones = [];
      this.loadingSecciones = false;
      this.currentPage = 1;
      return;
    }

    this.cargarSecciones(this.filtros.sucursal, false);
    this.currentPage = 1;
  }

  contratacionLabel(item: CatalogoOption): string {
    return String(item?.nombre || '').trim();
  }

  categoriaLabel(item: CatalogoOption): string {
    return String(item?.nombre || '').trim();
  }

  sucursalSeleccionadaNombre(): string {
    const sucursalId = this.parseCatalogoId(this.filtros.sucursal);
    if (sucursalId === null) {
      return '';
    }

    const sucursal = this.sucursales.find((item) => this.getCatalogoId(item) === sucursalId);
    return String(sucursal?.nombre || '').trim();
  }

  contratacionSeleccionadaNombre(): string {
    const contratacionId = this.parseCatalogoId(this.filtros.contratacionTipo);
    if (contratacionId === null) {
      return '';
    }

    const contratacion = this.contratacionesTipos.find((item) => this.getCatalogoId(item) === contratacionId);
    return String(contratacion?.nombre || '').trim();
  }

  convenioSeleccionadaNombre(): string {
    const convenioId = this.parseCatalogoId(this.filtros.convenioCategoria);
    if (convenioId === null) {
      return '';
    }

    const convenio = this.convenioCategorias.find((item) => this.getCatalogoId(item) === convenioId);
    return String(convenio?.nombre || '').trim();
  }

  getCatalogoId(item: any): number {
    return this.parseNumber(
      item?.id ??
      item?.sucursal_id ??
      item?.seccion_id ??
      item?.contrataciones_tipos_id ??
      item?.categoria_id ??
      item?.liquidacion_tipo_id
    ) ?? 0;
  }

  private matchesFilterByText(actualText: string | undefined, selectedText: string): boolean {
    if (!selectedText) {
      return true;
    }

    return this.normalizarTexto(actualText || '') === selectedText;
  }

  private empleadoCoincideFiltros(empleado: LiquidarEmpleado): boolean {
    const nombre = this.normalizarTexto(this.filtros.nombre);
    if (nombre) {
      const nombreCompleto = this.normalizarTexto([empleado.apellido, empleado.nombre].filter(Boolean).join(' '));
      if (!nombreCompleto.includes(nombre)) {
        return false;
      }
    }

    const sucursalId = this.parseCatalogoId(this.filtros.sucursal);
    if (sucursalId !== null && empleado.sucursalId !== sucursalId) {
      return false;
    }

    const seccionId = this.parseCatalogoId(this.filtros.seccion);
    if (seccionId !== null && empleado.seccionId !== seccionId) {
      return false;
    }

    const contratacionId = this.parseCatalogoId(this.filtros.contratacionTipo);
    if (contratacionId !== null && empleado.contratacionTipoId !== contratacionId) {
      return false;
    }

    const convenioId = this.parseCatalogoId(this.filtros.convenioCategoria);
    if (convenioId !== null && empleado.convenioCategoriaId !== convenioId) {
      return false;
    }

    return true;
  }

  private extraerCatalogos<T extends CatalogoOption>(res: T[] | { data?: T[]; contrataciones_tipos?: T[]; categorias?: T[]; sucursales?: T[]; secciones?: T[] }, key: 'contrataciones_tipos' | 'categorias' | 'sucursales' | 'secciones'): T[] {
    if (Array.isArray(res)) {
      return res;
    }

    if (Array.isArray(res?.data)) {
      return res.data;
    }

    if (key === 'contrataciones_tipos' && Array.isArray((res as { contrataciones_tipos?: T[] }).contrataciones_tipos)) {
      return (res as { contrataciones_tipos?: T[] }).contrataciones_tipos || [];
    }

    if (key === 'categorias' && Array.isArray((res as { categorias?: T[] }).categorias)) {
      return (res as { categorias?: T[] }).categorias || [];
    }

    if (key === 'sucursales' && Array.isArray((res as { sucursales?: T[] }).sucursales)) {
      return (res as { sucursales?: T[] }).sucursales || [];
    }

    if (key === 'secciones' && Array.isArray((res as { secciones?: T[] }).secciones)) {
      return (res as { secciones?: T[] }).secciones || [];
    }

    return [];
  }

  private parseCatalogoId(valor: string | number | null | undefined): number | null {
    const texto = (valor ?? '').toString().trim();
    if (!texto) {
      return null;
    }

    const parsed = Number(texto);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private extraerTiposLiquidacion(res: LiquidacionTipoOption[] | { data?: LiquidacionTipoOption[] }): LiquidacionTipoOption[] {
    if (Array.isArray(res)) {
      return res;
    }

    if (Array.isArray(res?.data)) {
      return res.data;
    }

    return [];
  }

  private parseNumber(valor: unknown): number | null {
    const parsed = Number(valor ?? null);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage += 1;
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage -= 1;
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  pageRangeStart(): number {
    return this.totalEmpleados === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  pageRangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalEmpleados);
  }

  private normalizarTexto(valor: string): string {
    return String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}