import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EmpleadoBasico, EmpleadoBasicoResponse } from './empleado-basico.model';

/**
 * Servicio CRUD de básicos personalizados por empleado.
 * La empresa la determina el backend a partir del JWT (req.user.empresa_id):
 * ningún método envía empresa_id.
 */
@Injectable({ providedIn: 'root' })
export class EmpleadoBasicoService {
  private readonly baseUrl = `${environment.apiUrl}/api/empleado-basico`;

  constructor(private http: HttpClient) { }

  list(activo?: number): Observable<EmpleadoBasicoResponse> {

  const params: Record<string, string> = {};

  if (activo !== undefined && activo !== null) {
    params['activo'] = String(activo);
  }

  return this.http.get<EmpleadoBasicoResponse>(
    this.baseUrl,
    { params }
  );
}

  getById(id: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}`);
  }

  getByEmpleado(empleadoId: number): Observable<EmpleadoBasicoResponse> {
    return this.http.get<EmpleadoBasicoResponse>(`${this.baseUrl}/empleado/${empleadoId}`);
  }

  create(data: Partial<EmpleadoBasico>): Observable<any> {
    return this.http.post(this.baseUrl, data);
  }

  update(id: number, data: Partial<EmpleadoBasico>): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}`, data);
  }

  remove(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  createMasivo(items: Array<Partial<EmpleadoBasico>>): Observable<any> {
    return this.http.post(`${this.baseUrl}/masivo`, { items });
  }

  updateMasivo(items: any[]): Observable<any> {
    return this.http.put(`${this.baseUrl}/masivo`, { items });
  }

  removeMasivo(ids: number[]): Observable<any> {
    return this.http.delete(`${this.baseUrl}/masivo`, { body: { items: ids } });
  }

  /** Borrado físico (definitivo) de varios registros a la vez. */
  removeMasivoFinal(ids: number[]): Observable<any> {
    return this.http.delete(`${this.baseUrl}/masivo/final`, { body: { items: ids } });
  }

  /** Lista de empleados para los selectores (reutiliza el endpoint existente). */
  listEmpleados(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/empleados`);
  }

  /** Catálogos para los filtros de la pantalla. */
  listContratacionesTipos(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/contrataciones-tipos`);
  }

  listSucursales(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/sucursales`);
  }

  /** Secciones dependientes de una sucursal (cascada). */
  listSeccionesBySucursal(sucursalId: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/secciones/by-sucursal`, { params: { sucursal_id: String(sucursalId) } });
  }

  /** Cargos dependientes de una sección (cascada). */
  listCargosBySeccion(seccionId: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/cargos/by-seccion`, { params: { seccion_id: String(seccionId) } });
  }

  listSecciones(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/secciones/all`);
  }

  listCargos(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/api/cargos/all`);
  }

  /**
   * Sube un Excel/CSV con columnas LEGAJO y BASICO (importe).
   * El archivo viaja tal cual al backend (multipart/form-data), sin parsear en el front.
   * @param archivo Archivo .xlsx, .xls o .csv
   * @param opciones dryRun para previsualizar sin aplicar; fechas como valores por defecto
   */
  importarDesdeArchivo(
    archivo: File,
    opciones: { dryRun?: boolean; fechaDesde?: string; fechaHasta?: string; activo?: boolean } = {}
  ): Observable<any> {
    const fd = new FormData();
    fd.append('archivo', archivo, archivo.name);
    // Alias duplicates por si el backend espera otro nombre de campo.
    fd.append('file', archivo, archivo.name);
    if (opciones.dryRun !== undefined) fd.append('dryRun', String(opciones.dryRun));
    if (opciones.fechaDesde) fd.append('fecha_desde', opciones.fechaDesde);
    if (opciones.fechaHasta) fd.append('fecha_hasta', opciones.fechaHasta);
    if (opciones.activo !== undefined) fd.append('activo', String(opciones.activo));

    return this.http.post(`${this.baseUrl}/importar`, fd);
  }
}
