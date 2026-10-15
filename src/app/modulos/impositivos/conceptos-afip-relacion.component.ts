import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { ConceptosService } from '../conceptos/conceptos.service';
import {
  AfipConceptoItem,
  ConceptosAfipMapService,
  LsdSegSocialConceptosMapItem,
  LsdSegSocialConceptosMapPayload
} from './conceptos-afip-map.service';

interface ConceptoSistemaItem {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  grupo: string;
  raw: any;
}

type ImportMode = 'csv' | 'json';

@Component({
  selector: 'app-conceptos-afip-relacion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './conceptos-afip-relacion.component.html',
  styleUrls: ['./conceptos-afip-relacion.component.scss']
})
export class ConceptosAfipRelacionComponent implements OnInit {
  loading = false;
  loadingConceptos = false;
  loadingAfip = false;
  saving = false;
  importLoading = false;
  deleteLoadingId: number | null = null;

  origen = '';
  subsistemaId: number | null = null;
  subsistemaNombre = '';

  mappings: LsdSegSocialConceptosMapItem[] = [];
  mappingSearch = '';

  conceptosSistema: ConceptoSistemaItem[] = [];
  sistemaQuery = '';
  sistemaDropdownOpen = false;
  sistemaResultados: ConceptoSistemaItem[] = [];
  selectedSistema: ConceptoSistemaItem | null = null;

  afipQuery = '';
  afipDropdownOpen = false;
  afipResultados: AfipConceptoItem[] = [];
  private afipSearchTimer: any = null;

  form: LsdSegSocialConceptosMapPayload = this.defaultForm();
  editingId: number | null = null;

  importMode: ImportMode = 'json';
  importText = '';
  importFileName = '';
  importError = '';

  deleteModalVisible = false;
  deleteModalTitle = '';
  deleteModalMessage = '';
  deleteModalSpinner = false;
  private pendingDeleteId: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private conceptosSvc: ConceptosService,
    private mapsSvc: ConceptosAfipMapService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.origen = String(qp.get('origen') || '').trim();
    this.subsistemaId = qp.get('subsistema_id') ? Number(qp.get('subsistema_id')) : null;
    this.subsistemaNombre = String(qp.get('subsistema_nombre') || qp.get('subsistema') || '').trim();
    this.loadAll();
  }

  get pageTitle(): string {
    return 'Vincular concepto → Concepto AFIP';
  }

  get pageSubtitle(): string {
    return 'Relacioná un concepto del sistema con su equivalente AFIP/LSD para la empresa autenticada.';
  }

  get mappingsFiltrados(): LsdSegSocialConceptosMapItem[] {
    const q = String(this.mappingSearch || '').trim().toLowerCase();
    if (!q) return this.mappings;
    return this.mappings.filter((m) => {
      const hay = [
        m.conce_codigo_sueldos,
        m.conce_descri_sueldos,
        m.conce_codigo_afip,
        m.conce_descri_afip
      ].map((v) => String(v ?? '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }

  get totalMappings(): number {
    return this.mappings.length;
  }

  get visiblesMappings(): number {
    return this.mappings.filter((m) => m.visible).length;
  }

  get pendientesAfip(): number {
    return this.mappings.filter((m) => !m.conce_codigo_afip).length;
  }

  get selectedSistemaLabel(): string {
    if (!this.selectedSistema) return 'Sin selección';
    return this.conceptoSistemaLabel(this.selectedSistema);
  }

  get canSave(): boolean {
    return !!this.form.conce_codigo_sueldos;
  }

  loadAll(): void {
    this.loadMappings();
    this.loadConceptosSistema();
  }

  loadMappings(): void {
    this.loading = true;
    this.mapsSvc.list().pipe(finalize(() => {
      this.loading = false;
      this.refresh();
    })).subscribe((res) => {
      this.mappings = res.error ? [] : res.data;
      if (res.error) this.toast.error('No se pudieron cargar los vínculos AFIP.');
    });
  }

  loadConceptosSistema(): void {
    this.loadingConceptos = true;
    this.conceptosSvc.list({ per_page: 1000, limit: 1000, page: 1 }).pipe(finalize(() => {
      this.loadingConceptos = false;
      this.refresh();
    })).subscribe((res: any) => {
      const raw = Array.isArray(res) ? res : (res?.data || res || []);
      const list = Array.isArray(raw) ? raw : [];
      this.conceptosSistema = list.map((c: any): ConceptoSistemaItem => ({
        id: Number(c?.concepto_id ?? c?.id ?? c?.conceptoId ?? 0),
        codigo: String(c?.codigo ?? c?.concepto_codigo ?? c?.concepto_id ?? c?.id ?? '').trim(),
        nombre: String(c?.nombre ?? c?.descripcion ?? c?.detalle ?? '').trim(),
        descripcion: String(c?.descripcion ?? c?.detalle ?? c?.nombre ?? '').trim(),
        tipo: String(c?.tipo_concepto?.nombre ?? c?.tipo_concepto?.codigo ?? '').trim(),
        grupo: String(c?.grupo?.nombre ?? c?.grupo?.descripcion ?? '').trim(),
        raw: c
      })).filter((c: ConceptoSistemaItem) => !!c.codigo || !!c.nombre || c.id > 0);
      this.filtrarConceptosSistema();
    });
  }

  filtrarConceptosSistema(): void {
    const q = String(this.sistemaQuery || '').trim().toLowerCase();
    if (!q) {
      this.sistemaResultados = [];
      this.sistemaDropdownOpen = false;
      return;
    }
    this.sistemaResultados = this.conceptosSistema.filter((c) => {
      const hay = [c.codigo, c.nombre, c.descripcion, c.tipo, c.grupo].join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 12);
    this.sistemaDropdownOpen = true;
  }

  onSistemaQueryChange(value: string): void {
    this.sistemaQuery = value;
    this.selectedSistema = null;
    this.form.conce_codigo_sueldos = null;
    this.form.conce_descri_sueldos = '';
    this.filtrarConceptosSistema();
  }

  selectSistema(concepto: ConceptoSistemaItem): void {
    this.selectedSistema = concepto;
    this.sistemaQuery = this.conceptoSistemaLabel(concepto);
    this.form.conce_codigo_sueldos = concepto.id || Number(concepto.codigo) || null;
    this.form.conce_descri_sueldos = concepto.descripcion || concepto.nombre || concepto.codigo || '';
    this.sistemaDropdownOpen = false;
  }

  conceptoSistemaLabel(concepto: ConceptoSistemaItem): string {
    const partes = [concepto.codigo, concepto.nombre || concepto.descripcion].filter(Boolean);
    return partes.join(' — ') || `#${concepto.id}`;
  }

  searchAfip(term: string): void {
    this.afipQuery = term;
    if (this.afipSearchTimer) clearTimeout(this.afipSearchTimer);
    const q = String(term || '').trim();
    if (!q) {
      this.afipResultados = [];
      this.afipDropdownOpen = false;
      return;
    }
    this.afipSearchTimer = setTimeout(() => {
      this.loadingAfip = true;
      this.mapsSvc.searchAfipConcepts(q).pipe(finalize(() => {
        this.loadingAfip = false;
        this.refresh();
      })).subscribe((res) => {
        this.afipResultados = res.error ? [] : res.data;
        this.afipDropdownOpen = this.afipResultados.length > 0;
      });
    }, 250);
  }

  selectAfip(concepto: AfipConceptoItem): void {
    const codigo = concepto?.codigo != null ? Number(concepto.codigo) : null;
    this.form.conce_codigo_afip = codigo;
    this.form.conce_descri_afip = String(concepto?.descripcion ?? concepto?.nombre ?? '').trim();
    this.afipQuery = this.afipConceptoLabel(concepto);
    this.afipDropdownOpen = false;
  }

  afipConceptoLabel(concepto: AfipConceptoItem): string {
    const codigo = concepto?.codigo != null ? String(concepto.codigo) : '';
    const nombre = String(concepto?.nombre ?? concepto?.descripcion ?? '').trim();
    return [codigo, nombre].filter(Boolean).join(' — ') || 'AFIP';
  }

  nuevo(): void {
    this.editingId = null;
    this.form = this.defaultForm();
    this.selectedSistema = null;
    this.sistemaQuery = '';
    this.afipQuery = '';
    this.afipResultados = [];
    this.importError = '';
  }

  editar(item: LsdSegSocialConceptosMapItem): void {
    this.editingId = item.id;
    this.form = {
      conce_codigo_sueldos: item.conce_codigo_sueldos,
      conce_codigo_afip: item.conce_codigo_afip,
      conce_descri_sueldos: item.conce_descri_sueldos || '',
      conce_descri_afip: item.conce_descri_afip || '',
      marca_repeticion: item.marca_repeticion,
      sipa_aportes: item.sipa_aportes,
      sipa_contribuciones: item.sipa_contribuciones,
      inss_aportes: item.inss_aportes,
      inss_contribuciones: item.inss_contribuciones,
      obra_social_aportes: item.obra_social_aportes,
      obra_social_contribuciones: item.obra_social_contribuciones,
      renatre_aportes: item.renatre_aportes,
      renatre_contribuciones: item.renatre_contribuciones,
      asig_fam_contribuciones: item.asig_fam_contribuciones,
      fondo_solidario_aportes: item.fondo_solidario_aportes,
      fondo_solidario_contribuciones: item.fondo_solidario_contribuciones,
      fondo_nac_emp_contribuciones: item.fondo_nac_emp_contribuciones,
      ley_riesgos_trab_contribuciones: item.ley_riesgos_trab_contribuciones,
      regimen_diferencial: item.regimen_diferencial,
      regimen_especial: item.regimen_especial,
      visible: item.visible
    };
    this.sistemaQuery = `${item.conce_codigo_sueldos || ''} ${item.conce_descri_sueldos || ''}`.trim();
    this.afipQuery = `${item.conce_codigo_afip || ''} ${item.conce_descri_afip || ''}`.trim();
    this.selectedSistema = this.conceptosSistema.find((c) => c.id === Number(item.conce_codigo_sueldos)) || null;
  }

  save(): void {
    if (!this.form.conce_codigo_sueldos) {
      this.toast.error('Seleccioná el concepto del sistema.');
      return;
    }
    const payload = this.coercePayload(this.form);
    this.saving = true;
    const request$ = this.editingId ? this.mapsSvc.update(this.editingId, payload) : this.mapsSvc.create(payload);
    request$.pipe(finalize(() => {
      this.saving = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.toast.error(this.mapError(res.error, 'No se pudo guardar la relación.'));
        return;
      }
      this.toast.success('Relación guardada correctamente.');
      this.upsertMapping(res.data);
      this.nuevo();
    });
  }

  askDelete(item: LsdSegSocialConceptosMapItem): void {
    this.pendingDeleteId = item.id;
    this.deleteModalTitle = 'Eliminar relación';
    this.deleteModalMessage = `¿Eliminar la relación entre el concepto ${item.conce_codigo_sueldos || '-'} y AFIP ${item.conce_codigo_afip || '-'}? Esta acción no elimina los conceptos originales.`;
    this.deleteModalVisible = true;
  }

  onDeleteModalClose(confirm = false): void {
    if (!this.deleteModalVisible) return;
    if (!confirm) {
      this.deleteModalVisible = false;
      this.pendingDeleteId = null;
      return;
    }
    if (!this.pendingDeleteId) {
      this.deleteModalVisible = false;
      return;
    }
    this.deleteModalSpinner = true;
    this.mapsSvc.delete(this.pendingDeleteId).pipe(finalize(() => {
      this.deleteModalSpinner = false;
      this.refresh();
    })).subscribe((res) => {
      if (!res.ok) {
        this.toast.error(this.mapError(res.error, 'No se pudo eliminar la relación.'));
        return;
      }
      const deletedId = this.pendingDeleteId;
      this.toast.success('Relación eliminada.');
      this.deleteModalVisible = false;
      this.pendingDeleteId = null;
      this.removeMapping(deletedId);
    });
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.importText = String(reader.result || '');
      this.importFileName = file.name;
      this.importError = '';
      this.refresh();
    };
    reader.onerror = () => {
      this.importError = 'No se pudo leer el archivo seleccionado.';
      this.refresh();
    };
    reader.readAsText(file);
  }

  importar(): void {
    const raw = String(this.importText || '').trim();
    if (!raw) {
      this.importError = 'Pegá un CSV o JSON con mappings antes de importar.';
      return;
    }
    const parsed = this.parseImport(raw);
    if (parsed.error) {
      this.importError = parsed.error;
      return;
    }
    if (!parsed.payload) {
      this.importError = 'No se pudo preparar la importación.';
      return;
    }
    this.importLoading = true;
    this.mapsSvc.import(parsed.payload).pipe(finalize(() => {
      this.importLoading = false;
      this.refresh();
    })).subscribe((res) => {
      if (res.error || !res.data) {
        this.importError = this.mapError(res.error, 'No se pudo importar el archivo.');
        return;
      }
      this.toast.success('Importación procesada correctamente.');
      this.loadMappings();
      this.importText = '';
      this.importFileName = '';
      this.importError = '';
    });
  }

  descargarPlantilla(): void {
    const csv = [
      'conce_codigo_afip;conce_codigo_sueldos;conce_descri_sueldos;conce_descri_afip;marca_repeticion;visible',
      '1001;2001;Salario Básico;Sueldo AFIP;1;1'
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_mapeo_conceptos_afip.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  limpiarBuscadorSistema(): void {
    this.sistemaQuery = '';
    this.sistemaResultados = [];
    this.sistemaDropdownOpen = false;
    this.selectedSistema = null;
    this.form.conce_codigo_sueldos = null;
    this.form.conce_descri_sueldos = '';
  }

  limpiarBuscadorAfip(): void {
    this.afipQuery = '';
    this.afipResultados = [];
    this.afipDropdownOpen = false;
    this.form.conce_codigo_afip = null;
    this.form.conce_descri_afip = '';
  }

  irASubsistemas(): void {
    this.router.navigate(['/admin/impositivos/subsistemas']);
  }

  private parseImport(raw: string): { payload: { mappings?: any[]; csv?: string } | null; error?: string } {
    const text = raw.trim();
    if (!text) return { payload: null, error: 'El contenido a importar está vacío.' };
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return { payload: { mappings: parsed } };
        if (parsed && Array.isArray(parsed.mappings)) return { payload: { mappings: parsed.mappings } };
        return { payload: null, error: 'El JSON debe ser un array o un objeto con la propiedad mappings.' };
      } catch {
        return { payload: null, error: 'El JSON no es válido.' };
      }
    }
    return { payload: { csv: text } };
  }

  private coercePayload(payload: LsdSegSocialConceptosMapPayload): LsdSegSocialConceptosMapPayload {
    const boolToNum = (v: any) => (v ? 1 : 0);
    return {
      ...payload,
      conce_codigo_sueldos: payload.conce_codigo_sueldos != null ? Number(payload.conce_codigo_sueldos) : null,
      conce_codigo_afip: payload.conce_codigo_afip != null && String(payload.conce_codigo_afip).trim() !== '' ? Number(payload.conce_codigo_afip) : null,
      marca_repeticion: boolToNum(payload.marca_repeticion),
      sipa_aportes: boolToNum(payload.sipa_aportes),
      sipa_contribuciones: boolToNum(payload.sipa_contribuciones),
      inss_aportes: boolToNum(payload.inss_aportes),
      inss_contribuciones: boolToNum(payload.inss_contribuciones),
      obra_social_aportes: boolToNum(payload.obra_social_aportes),
      obra_social_contribuciones: boolToNum(payload.obra_social_contribuciones),
      renatre_aportes: boolToNum(payload.renatre_aportes),
      renatre_contribuciones: boolToNum(payload.renatre_contribuciones),
      asig_fam_contribuciones: boolToNum(payload.asig_fam_contribuciones),
      fondo_solidario_aportes: boolToNum(payload.fondo_solidario_aportes),
      fondo_solidario_contribuciones: boolToNum(payload.fondo_solidario_contribuciones),
      fondo_nac_emp_contribuciones: boolToNum(payload.fondo_nac_emp_contribuciones),
      ley_riesgos_trab_contribuciones: boolToNum(payload.ley_riesgos_trab_contribuciones),
      regimen_diferencial: boolToNum(payload.regimen_diferencial),
      regimen_especial: boolToNum(payload.regimen_especial),
      visible: boolToNum(payload.visible)
    };
  }

  private defaultForm(): LsdSegSocialConceptosMapPayload {
    return {
      conce_codigo_sueldos: null,
      conce_codigo_afip: null,
      conce_descri_sueldos: '',
      conce_descri_afip: '',
      marca_repeticion: 0,
      sipa_aportes: 0,
      sipa_contribuciones: 0,
      inss_aportes: 0,
      inss_contribuciones: 0,
      obra_social_aportes: 0,
      obra_social_contribuciones: 0,
      renatre_aportes: 0,
      renatre_contribuciones: 0,
      asig_fam_contribuciones: 0,
      fondo_solidario_aportes: 0,
      fondo_solidario_contribuciones: 0,
      fondo_nac_emp_contribuciones: 0,
      ley_riesgos_trab_contribuciones: 0,
      regimen_diferencial: 0,
      regimen_especial: 0,
      visible: 1
    };
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'No se encontró el recurso solicitado.';
    if (status >= 500) return 'Error interno del servidor. Reintente en unos minutos.';
    const payload = err?.error;
    if (payload && typeof payload === 'object') {
      const cand = [payload.message, payload.mensaje, payload.error, payload.detail].filter((x) => typeof x === 'string' && x.trim());
      if (cand.length) return String(cand[0]);
    }
    if (typeof payload === 'string' && payload.trim() && !payload.startsWith('<')) return payload.trim();
    return err?.message || fallback;
  }

  private refresh(): void {
    try { this.cdr.detectChanges(); } catch { /* ignore */ }
  }

  private upsertMapping(item: LsdSegSocialConceptosMapItem): void {
    const index = this.mappings.findIndex((x) => x.id === item.id);
    if (index >= 0) {
      this.mappings[index] = item;
    } else {
      this.mappings = [item, ...this.mappings];
    }
  }

  private removeMapping(id: number | null): void {
    if (!id) return;
    this.mappings = this.mappings.filter((x) => x.id !== id);
  }
}
