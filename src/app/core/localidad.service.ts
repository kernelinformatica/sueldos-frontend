import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface Localidad {
  id: number;
  id_localidad?: number;
  texto?: string;
  nombre: string;
  codigo_postal?: string;
  nombre_depa?: string;
  codigoPostal?: string;
  cod_loc_arca?: number;
  id_provincia?: number;
  display?: string;
  edisplay?: string;
  codigoProvincia?: number;
  provincia?: string | { id?: number; nombre?: string; codigo?: string; codigoPais?: string };
  provinciaNombre?: string;
  provinciaCodigo?: string;
  provinciaCodigoPais?: string;
}

@Injectable({ providedIn: 'root' })
export class LocalidadService {
  private apiUrl = environment.apiUrl + '/api/localidades';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private authHeaders(): HttpHeaders {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /** Busca localidades contra /api/localidades/buscar?q= */
  buscar(query: string): Observable<Localidad[]> {
    const q = String(query || '').trim();
    if (q.length < 3) return of([] as Localidad[]);
    return this.http.get<any>(`${this.apiUrl}/buscar?q=${encodeURIComponent(q)}`, { headers: this.authHeaders() }).pipe(
      map((res) => {
        const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        return items.map((l: any) => {
          const codigoPostal = String(l?.codigoPostal ?? l?.codigo_postal ?? '').trim();
          const prov: any = l?.provincia;
          const provinciaNombre = String(
            (prov && typeof prov === 'object' ? prov.nombre : prov) ?? l?.provincia_nombre ?? l?.nombre_provincia ?? ''
          ).trim();
          const provinciaCodigo = String(
            (prov && typeof prov === 'object' ? prov.codigo : l?.codigo_provincia) ?? l?.codigoProvincia ?? ''
          ).trim();
          const provinciaCodigoPais = String(
            (prov && typeof prov === 'object' ? prov.codigoPais : l?.codigo_pais) ?? ''
          ).trim();
          return {
            id: Number(l?.id ?? l?.localidad_id ?? 0) || 0,
            id_localidad: Number(l?.id ?? l?.localidad_id ?? 0) || 0,
            nombre: String(l?.nombre ?? '').trim(),
            codigo_postal: codigoPostal,
            codigoPostal,
            provincia: provinciaNombre || undefined,
            provinciaNombre,
            provinciaCodigo,
            provinciaCodigoPais,
            codigoProvincia: l?.codigoProvincia ?? l?.codigo_provincia ?? l?.id_provincia ?? null
          } as Localidad;
        }).filter((l: Localidad) => l.id > 0);
      })
    );
  }

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
