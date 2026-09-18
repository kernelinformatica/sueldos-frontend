import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { ModalFotos } from '../../shared/modal-fotos/modal-fotos';

interface EmpleadoItem {
  id: number;
  empleado_id?: number;
  empresa_id?: number;
  sucursal_id?: number;
  seccion_id?: number;
  cargo_id?: number;
  usuario_id?: number;
  legajo?: string;
  tipo_documento?: string;
  numero_documento?: string;
  apellido?: string;
  nombre?: string;
  fecha_nacimiento?: string | null;
  sexo?: string;
  estado_civil?: string;
  nacionalidad?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  email?: string;
  telefono?: string;
  fecha_ingreso?: string | null;
  fecha_egreso?: string | null;
  foto?: string | null;
  habilitado?: number;
  estado?: string | number | EstadoEmpleadoValue;
  foto_url_publica?: string | null;
  url_publica?: string | null;
  empresa?: {
    nombre?: string;
    nombre_fantasia?: string;
    cuit?: string;
  };
  cargo?: {
    cargo_id?: number;
    nombre?: string;
    descripcion?: string | null;
  };
  seccion?: {
    seccion_id?: number;
    nombre?: string;
    orden?: number;
    estado?: number;
  };
  sucursal?: {
    nombre?: string;
  };
  contratacion_tipo?: {
    nombre?: string;
  };
  convenio_categoria?: {
    nombre?: string;
  };
  convenio?: {
    nombre?: string;
  };
  forma_pago?: {
    nombre?: string;
  };
  cuenta_bancaria_principal?: {
    alias_cbu?: string;
    banco?: {
      nombre?: string;
    };
  };
}

interface CatalogoItem {
  id?: number;
  cargo_id?: number;
  seccion_id?: number;
  estado_empleado_id?: number;
  nombre?: string;
  descripcion?: string;
  estado?: number;
}

interface EstadoEmpleadoValue {
  id?: number;
  estado_id?: number;
  estado_empleado_id?: number;
  nombre?: string;
  descripcion?: string;
  es_activo?: number | boolean;
}

@Component({
  selector: 'app-empleados-listado',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalFotos],
  templateUrl: './empleados-listado.component.html',
  styleUrls: ['./empleados-listado.component.scss']
})
export class EmpleadosListadoComponent implements OnInit {
  empleados: EmpleadoItem[] = [];
  cargos: CatalogoItem[] = [];
  secciones: CatalogoItem[] = [];
  estadosEmpleados: CatalogoItem[] = [];
  avatarsSinImagen = new Set<number>();
  fotoAmpliada: string | null = null;
  mostrarModalFoto = false;
  empleadoSeleccionado: any;
  filtros = {
    legajoDesde: '',
    legajoHasta: '',
    nombre: '',
    seccion: '',
    cargo: '',
    estado: ''
  };
  loading = true;
  loadingCatalogos = false;
  error = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef, private loadingService: LoadingService) { }

  ngOnInit(): void {
    this.cargarEmpleados();
    this.cargarCatalogos();
  }

  cargarCatalogos(): void {
    this.loadingCatalogos = true;

    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; cargos?: CatalogoItem[] }>(`${environment.apiUrl}/api/cargos/all`)
      .pipe(
        catchError(() => of([] as CatalogoItem[]))
      )
      .subscribe((res) => {
        this.cargos = Array.isArray(res) ? res : (res?.cargos || res?.data || []);
      });

    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; secciones?: CatalogoItem[] }>(`${environment.apiUrl}/api/secciones/all`)
      .pipe(
        catchError(() => of([] as CatalogoItem[])),
        finalize(() => {
          this.loadingCatalogos = false;
        })
      )
      .subscribe((res) => {
        this.secciones = Array.isArray(res) ? res : (res?.secciones || res?.data || []);
      });

    this.http.get<CatalogoItem[] | { data?: CatalogoItem[]; estados_empleados?: CatalogoItem[] }>(`${environment.apiUrl}/api/estados-empleados`)
      .pipe(catchError(() => of([] as CatalogoItem[])))
      .subscribe((res) => {
        this.estadosEmpleados = Array.isArray(res) ? res : (res?.estados_empleados || res?.data || []);
      });
  }

  cargarEmpleados(): void {
    this.loading = true;
    this.error = '';
    this.loadingService.show();

    this.http.get<EmpleadoItem[] | { data?: EmpleadoItem[]; empleados?: EmpleadoItem[] }>(`${environment.apiUrl}/api/empleados`)
      .pipe(
        catchError((err) => {
          this.error = err?.error?.mensaje || 'No se pudieron cargar los empleados.';
          return of([] as EmpleadoItem[]);
        }),
        finalize(() => {
          this.loading = false;
          // Forzar detección de cambios en caso de que la respuesta ocurra fuera de la zona
          try { this.cdr.detectChanges(); } catch { /* ignore */ }
          this.loadingService.hide();
        })
      )
      .subscribe((res) => {
        const rows = Array.isArray(res) ? res : (res?.empleados || res?.data || []);
        this.empleados = rows as EmpleadoItem[];
        // Forzar actualización de la vista inmediatamente
        try { this.cdr.detectChanges(); } catch { /* ignore */ }
      });
  }

  get empleadosFiltrados(): EmpleadoItem[] {
    const nombre = this.normalizarTexto(this.filtros.nombre);
    const seccionId = this.parseCatalogoId(this.filtros.seccion);
    const cargoId = this.parseCatalogoId(this.filtros.cargo);
    const legajoDesde = this.parseLegajo(this.filtros.legajoDesde);
    const legajoHasta = this.parseLegajo(this.filtros.legajoHasta);
    const estadoFiltro = this.normalizarTexto(this.filtros.estado);

    return this.empleados.filter((empleado) => {
      const legajo = this.parseLegajo(empleado.legajo);
      const nombreCompleto = this.normalizarTexto(this.nombreCompleto(empleado));
      const seccionEmpleadoId = this.parseCatalogoId(empleado.seccion_id ?? empleado.seccion?.seccion_id ?? null);
      const cargoEmpleadoId = this.parseCatalogoId(empleado.cargo_id ?? empleado.cargo?.cargo_id ?? null);
      const estadoEmpleadoNombre = this.normalizarTexto(this.estadoNombre(empleado.estado) || this.estadoLabel(empleado.estado));

      if (legajoDesde !== null && legajo !== null && legajo < legajoDesde) {
        return false;
      }

      if (legajoHasta !== null && legajo !== null && legajo > legajoHasta) {
        return false;
      }

      if (nombre && !nombreCompleto.includes(nombre)) {
        return false;
      }

      if (seccionId !== null && seccionEmpleadoId !== null && seccionEmpleadoId !== seccionId) {
        return false;
      }

      if (cargoId !== null && cargoEmpleadoId !== null && cargoEmpleadoId !== cargoId) {
        return false;
      }

      if (estadoFiltro && estadoEmpleadoNombre !== estadoFiltro) {
        return false;
      }

      return true;
    });
  }

  limpiarFiltros(): void {
    this.filtros = {
      legajoDesde: '',
      legajoHasta: '',
      nombre: '',
      seccion: '',
      cargo: '',
      estado: ''
    };
  }

  nombreCompleto(empleado: EmpleadoItem): string {
    return [empleado.apellido, empleado.nombre].filter(Boolean).join(', ') || 'Empleado';
  }

  iniciales(empleado: EmpleadoItem): string {
    const apellido = (empleado.apellido || '').trim();
    const nombre = (empleado.nombre || '').trim();
    const text = `${apellido.charAt(0)}${nombre.charAt(0)}`.trim();
    return text || 'E';
  }

  estadoLabel(estado: string | number | EstadoEmpleadoValue | undefined): string {
    if (estado && typeof estado === 'object') {
      const nombreEstado = estado.nombre || estado.descripcion;
      if (nombreEstado) {
        return nombreEstado;
      }

      const estadoId = Number(estado.id ?? estado.estado_id ?? estado.estado_empleado_id);
      if (Number.isFinite(estadoId) && estadoId > 0) {
        return this.estadoNombre(estadoId) || 'Estado';
      }
    }

    if (estado === 1 || estado === '1') {
      return 'Activo';
    }
    return this.estadoNombre(estado);
  }

  esEmpleadoInactivo(empleado: EmpleadoItem): boolean {
    if (empleado.estado === 1 || empleado.estado === '1') {
      return false;
    }

    if (empleado.estado && typeof empleado.estado === 'object') {
      const nombreEstado = this.normalizarTexto(empleado.estado.nombre || empleado.estado.descripcion || '');
      if (nombreEstado === 'activo') {
        return false;
      }

      if (empleado.estado.es_activo === 1 || empleado.estado.es_activo === true) {
        return false;
      }
    }

    const estadoNombre = this.estadoNombre(empleado.estado).toLowerCase();

    return estadoNombre !== 'activo';
  }


  ampliarFoto(empleado: EmpleadoItem): void {

    if (this.tieneFoto(empleado)) {
      this.empleadoSeleccionado = empleado;
      this.fotoAmpliada = this.fotoUrl(empleado);
      this.mostrarModalFoto = true;
    }
  }

  cerrarFoto(): void {
    this.fotoAmpliada = null;
    this.mostrarModalFoto = false;
  }

  estadoNombre(estado: string | number | EstadoEmpleadoValue | undefined): string {
    if (estado && typeof estado === 'object') {
      const nombreEstado = estado.nombre || estado.descripcion;
      if (nombreEstado) {
        return nombreEstado;
      }

      const estadoId = Number(estado.id ?? estado.estado_id ?? estado.estado_empleado_id);
      if (Number.isFinite(estadoId) && estadoId > 0) {
        return this.estadoNombre(estadoId);
      }

      return '';
    }

    const valor = (estado ?? '').toString().trim();
    if (!valor) {
      return '';
    }

    const estadoNumerico = Number(valor);
    if (Number.isFinite(estadoNumerico)) {
      const match = this.estadosEmpleados.find((item) => Number(item.id ?? item.estado_empleado_id) === estadoNumerico);
      return match?.nombre || match?.descripcion || '';
    }

    const matchTexto = this.estadosEmpleados.find((item) => this.normalizarTexto(item.nombre || item.descripcion || '') === this.normalizarTexto(valor));
    return matchTexto?.nombre || matchTexto?.descripcion || '';
  }

  getEstadoEmpleadoId(estado: string | number | EstadoEmpleadoValue | undefined): number | null {
    if (estado && typeof estado === 'object') {
      const estadoId = Number(estado.estado_id ?? estado.id ?? estado.estado_empleado_id);
      return Number.isFinite(estadoId) && estadoId > 0 ? estadoId : null;
    }

    const texto = (estado ?? '').toString().trim();
    if (!texto) {
      return null;
    }

    const estadoNumerico = Number(texto);
    return Number.isFinite(estadoNumerico) && estadoNumerico > 0 ? estadoNumerico : null;
  }

  estadoLabelCorto(estado: string | number | EstadoEmpleadoValue | undefined): string {
    const nombre = this.estadoNombre(estado);
    return nombre;
  }

  documentoLabel(empleado: EmpleadoItem): string {
    const tipo = empleado.tipo_documento || 'Doc';
    const numero = empleado.numero_documento || '-';
    return `${tipo} ${numero}`;
  }

  cargoLabel(empleado: EmpleadoItem): string {
    return empleado.cargo?.nombre || '-';
  }

  sectorLabel(empleado: EmpleadoItem): string {
    return empleado.seccion?.nombre || '-';
  }

  sucursalLabel(empleado: EmpleadoItem): string {
    return empleado.sucursal?.nombre || '-';
  }

  empresaLabel(empleado: EmpleadoItem): string {
    return empleado.empresa?.nombre_fantasia || empleado.empresa?.nombre || '-';
  }

  getCatalogoId(item: CatalogoItem | null | undefined): number {
    return Number(item?.id ?? item?.estado_empleado_id ?? 0);
  }

  getEstadoCatalogoNombre(item: CatalogoItem | null | undefined): string {
    return (item?.nombre || item?.descripcion || '').trim();
  }

  isUsuarioNoHabilitado(empleado: EmpleadoItem): boolean {
    return empleado.habilitado === 0;
  }

  getEmpleadoId(empleado: EmpleadoItem): number | null {
    return empleado.empleado_id ?? empleado.id ?? null;
  }

  fotoUrl(empleado: EmpleadoItem): string {
    return this.resolvePublicUrl(empleado.foto_url_publica || empleado.url_publica || empleado.foto || '');
  }

  tieneFoto(empleado: EmpleadoItem): boolean {
    const empleadoId = this.getEmpleadoId(empleado);
    return !!this.fotoUrl(empleado) && !!empleadoId && !this.avatarsSinImagen.has(empleadoId);
  }

  avatarError(empleado: EmpleadoItem): void {
    const empleadoId = this.getEmpleadoId(empleado);
    if (!empleadoId) {
      return;
    }

    this.avatarsSinImagen.add(empleadoId);
  }

  trackByCatalogoId(_: number, item: CatalogoItem): number {
    return item.id ?? item.cargo_id ?? item.seccion_id ?? item.estado_empleado_id ?? 0;
  }

  private normalizarTexto(valor: string): string {
    return (valor || '')
      .toString()
      .trim()
      .toLowerCase();
  }

  private parseCatalogoId(valor: string | number | null | undefined): number | null {
    const texto = (valor ?? '').toString().trim();
    if (!texto) {
      return null;
    }

    const parsed = Number(texto);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseLegajo(valor: string | undefined | null): number | null {
    const texto = (valor ?? '').toString().trim();
    if (!texto) {
      return null;
    }

    const parsed = Number(texto);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private resolvePublicUrl(url: string): string {
    const value = (url || '').trim();
    if (!value) {
      return '';
    }

    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) {
      return value;
    }

    const baseUrl = (environment.apiUrl || '').replace(/\/$/, '');
    const path = value.startsWith('/') ? value : `/${value}`;
    return `${baseUrl}${path}`;
  }
}
