import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface PadronCuenta {
  id_padron: number;
  id_empresa: number;
  cuenta: string;
  nombre: string;
  apellido: string;
  DISPLAY: string;
  cuit: string;
  idSisSitIva: number;
  domicilio: string;
  localidad: string;
  codigo_postal: string;
  nro_renspa: string | null;
  nro_rucca: string | null;
  estado: number;
}

@Injectable({ providedIn: 'root' })
export class PadronService {
  private apiUrl = environment.apiUrl + '/api/padron/buscar';

  constructor(private http: HttpClient) {}

  buscarCuentas(query: string, token: string): Observable<PadronCuenta[]> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    return this.http.get<{ resultados: PadronCuenta[] }>(`${this.apiUrl}?q=${encodeURIComponent(query)}`, { headers })
      .pipe(map(res => res.resultados));
  }
}
