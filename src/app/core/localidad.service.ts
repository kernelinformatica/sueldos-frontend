import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface Localidad {
  id: number;
  id_localidad?: number;
  texto?: string;
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

  search(query: string, token: string): Observable<Localidad[]> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get<any>(`${this.apiUrl}/search?q=${encodeURIComponent(query)}`, { headers }).pipe(
      map((res) => {
        const items = Array.isArray(res?.data) ? res.data : Array.isArray(res?.localidades) ? res.localidades : Array.isArray(res) ? res : [];
        return items.map((l: any) => ({
          id: Number(l.localidad_id ?? l.id_localidad ?? l.id ?? 0),
          id_localidad: Number(l.localidad_id ?? l.id_localidad ?? l.id ?? 0),
          texto: String(l.texto || '').trim() || undefined,
          nombre: l.nombre ?? l.texto ?? '',
          codigo_postal: l.codigo_postal ?? l.codigoPostal ?? l.cp ?? '',
          provincia: l.provincia?.display || l.nombre_depa,
          nombre_depa: l.nombre_depa,
          codigoPostal: l.codigo_postal ?? l.codigoPostal ?? l.cp ?? '',
          cod_loc_arca: l.cod_loc_arca,
          id_provincia: l.id_provincia,
          display: l.display,
          edisplay: l.edisplay
        }));
      })
    );
  }

  buscarLocalidades(query: string, token: string): Observable<Localidad[]> {
    return this.search(query, token);
  }
}
