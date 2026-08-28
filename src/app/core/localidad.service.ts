import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface Localidad {
  id: number;
  id_localidad?: number;
  nombre: string;
  provincia?: string;
  codigo_postal?: string;
  nombre_depa?: string;
  codigoPostal?: string;
  cod_loc_arca?: number;
  id_provincia?: number;
  display?: string;
  edisplay?: string;
}

@Injectable({ providedIn: 'root' })
export class LocalidadService {
  private apiUrl = environment.apiUrl + '/api/localidades';

  constructor(private http: HttpClient) {}

  buscarLocalidades(query: string, token: string): Observable<Localidad[]> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    return this.http.get<{ localidades: any[] }>(`${this.apiUrl}?textoabuscar=${encodeURIComponent(query)}`, { headers })
      .pipe(
        map(res => (res.localidades || []).map(l => ({
          id: l.id_localidad,
          nombre: l.nombre,
          provincia: l.provincia?.display || l.nombre_depa,
          codigo_postal: l.codigoPostal,
          nombre_depa: l.nombre_depa,
          codigoPostal: l.codigoPostal,
          cod_loc_arca: l.cod_loc_arca,
          id_provincia: l.id_provincia,
          display: l.display,
          edisplay: l.edisplay
        })))
      );
  }
}
