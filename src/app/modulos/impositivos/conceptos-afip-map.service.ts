import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from '../../auth/auth.service';

export interface LsdSegSocialConceptosMapItem {
  id: number;
  conce_codigo_sueldos: number | null;
  conce_codigo_afip: number | null;
  conce_descri_sueldos: string;
  conce_descri_afip: string;
  marca_repeticion: boolean;
  sipa_aportes: boolean;
  sipa_contribuciones: boolean;
  inss_aportes: boolean;
  inss_contribuciones: boolean;
  obra_social_aportes: boolean;
  obra_social_contribuciones: boolean;
  renatre_aportes: boolean;
  renatre_contribuciones: boolean;
  asig_fam_contribuciones: boolean;
  fondo_solidario_aportes: boolean;
  fondo_solidario_contribuciones: boolean;
  fondo_nac_emp_contribuciones: boolean;
  ley_riesgos_trab_contribuciones: boolean;
  regimen_diferencial: boolean;
  regimen_especial: boolean;
  visible: boolean;
  empresa_id?: number | null;
  [key: string]: any;
}

export interface LsdSegSocialConceptosMapPayload {
  conce_codigo_sueldos: number | null;
  conce_codigo_afip: number | null;
  conce_descri_sueldos: string;
  conce_descri_afip: string;
  marca_repeticion: number | boolean;
  sipa_aportes: number | boolean;
  sipa_contribuciones: number | boolean;
  inss_aportes: number | boolean;
  inss_contribuciones: number | boolean;
  obra_social_aportes: number | boolean;
  obra_social_contribuciones: number | boolean;
  renatre_aportes: number | boolean;
  renatre_contribuciones: number | boolean;
  asig_fam_contribuciones: number | boolean;
  fondo_solidario_aportes: number | boolean;
  fondo_solidario_contribuciones: number | boolean;
  fondo_nac_emp_contribuciones: number | boolean;
  ley_riesgos_trab_contribuciones: number | boolean;
  regimen_diferencial: number | boolean;
  regimen_especial: number | boolean;
  visible: number | boolean;
}

export interface AfipConceptoItem {
  id?: number;
  codigo?: string | number | null;
  nombre?: string | null;
  descripcion?: string | null;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class ConceptosAfipMapService {
  private readonly baseUrl = `${environment.apiUrl}/api/lsdSegSocialConceptosMap`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken() || localStorage.getItem('token') || '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private toBool(value: any): boolean {
    if (typeof value === 'boolean') return value;
    const num = Number(value);
    if (!Number.isNaN(num)) return num === 1;
    return String(value ?? '').trim().toLowerCase() === 'true';
  }

  private normalize(item: any): LsdSegSocialConceptosMapItem {
    return {
      ...item,
      id: Number(item?.id ?? item?.lsd_segsocial_conceptos_map_id ?? item?.map_id ?? 0),
      conce_codigo_sueldos: item?.conce_codigo_sueldos != null && String(item.conce_codigo_sueldos).trim() !== '' ? Number(item.conce_codigo_sueldos) : null,
      conce_codigo_afip: item?.conce_codigo_afip != null && String(item.conce_codigo_afip).trim() !== '' ? Number(item.conce_codigo_afip) : null,
      conce_descri_sueldos: String(item?.conce_descri_sueldos ?? '').trim(),
      conce_descri_afip: String(item?.conce_descri_afip ?? '').trim(),
      marca_repeticion: this.toBool(item?.marca_repeticion),
      sipa_aportes: this.toBool(item?.sipa_aportes),
      sipa_contribuciones: this.toBool(item?.sipa_contribuciones),
      inss_aportes: this.toBool(item?.inss_aportes),
      inss_contribuciones: this.toBool(item?.inss_contribuciones),
      obra_social_aportes: this.toBool(item?.obra_social_aportes),
      obra_social_contribuciones: this.toBool(item?.obra_social_contribuciones),
      renatre_aportes: this.toBool(item?.renatre_aportes),
      renatre_contribuciones: this.toBool(item?.renatre_contribuciones),
      asig_fam_contribuciones: this.toBool(item?.asig_fam_contribuciones),
      fondo_solidario_aportes: this.toBool(item?.fondo_solidario_aportes),
      fondo_solidario_contribuciones: this.toBool(item?.fondo_solidario_contribuciones),
      fondo_nac_emp_contribuciones: this.toBool(item?.fondo_nac_emp_contribuciones),
      ley_riesgos_trab_contribuciones: this.toBool(item?.ley_riesgos_trab_contribuciones),
      regimen_diferencial: this.toBool(item?.regimen_diferencial),
      regimen_especial: this.toBool(item?.regimen_especial),
      visible: this.toBool(item?.visible)
    };
  }

  list(): Observable<{ data: LsdSegSocialConceptosMapItem[]; error?: any }> {
    return this.http.get<any>(this.baseUrl, { headers: this.headers() }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.data || res?.items || []);
        return { data: (Array.isArray(raw) ? raw : []).map((item) => this.normalize(item)) };
      }),
      catchError((error) => of({ data: [] as LsdSegSocialConceptosMapItem[], error }))
    );
  }

  create(payload: LsdSegSocialConceptosMapPayload): Observable<{ data: LsdSegSocialConceptosMapItem | null; error?: any }> {
    return this.http.post<any>(this.baseUrl, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: this.normalize(res?.data || res) })),
      catchError((error) => of({ data: null, error }))
    );
  }

  update(id: number, payload: Partial<LsdSegSocialConceptosMapPayload>): Observable<{ data: LsdSegSocialConceptosMapItem | null; error?: any }> {
    return this.http.put<any>(`${this.baseUrl}/${id}`, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: this.normalize(res?.data || res) })),
      catchError((error) => of({ data: null, error }))
    );
  }

  delete(id: number): Observable<{ ok: boolean; error?: any }> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.headers() }).pipe(
      map(() => ({ ok: true })),
      catchError((error) => of({ ok: false, error }))
    );
  }

  import(payload: { mappings?: any[]; csv?: string }): Observable<{ data: any; error?: any }> {
    return this.http.post<any>(`${this.baseUrl}/import`, payload, { headers: this.headers() }).pipe(
      map((res: any) => ({ data: res?.data ?? res })),
      catchError((error) => of({ data: null, error }))
    );
  }

  searchAfipConcepts(term: string): Observable<{ data: AfipConceptoItem[]; error?: any }> {
    const q = String(term || '').trim();
    if (!q) return of({ data: [] });
    const params = new HttpParams().set('search', q).set('limit', '20');
    return this.http.get<any>(`${environment.apiUrl}/api/arca_conceptos`, { headers: this.headers(), params }).pipe(
      map((res: any) => {
        const raw: any[] = Array.isArray(res) ? res : (res?.data || res?.items || []);
        return {
          data: (Array.isArray(raw) ? raw : []).map((x: any) => ({
            id: x?.id ?? x?.conce_codigo_afip ?? null,
            codigo: x?.codigo ?? x?.conce_codigo_afip ?? null,
            nombre: x?.nombre ?? x?.descripcion ?? null,
            descripcion: x?.descripcion ?? x?.nombre ?? null,
            ...x
          }))
        };
      }),
      catchError((error) => of({ data: [] as AfipConceptoItem[], error }))
    );
  }
}
