import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { ToastService } from '../../../core/toast.service';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../../shared/modal-alerta.component';
import { GruposService } from '../../conceptos/grupos.service';
import {
  ConceptoCatalogoItem,
  GrupoConceptoDetalleItem,
  GrupoConceptoItem,
  LsdSegSocialConceptoItem,
  LsdSegSocialConceptoPayload,
  SicossBaseSicoss,
  SicossClasificacionFuncional,
  SicossConfiguracionSnapshot,
  SicossConfiguracionPersistPayload,
  SicossConceptoConfiguracionItem,
  SicossConceptoRemuneracionItem,
  SicossConceptoRemuneracionReplacePayload,
  Subsistema
} from './sicoss.model';
import { SicossService } from './sicoss.service';

type DetailTab = 'remuneraciones' | 'lsd';
type SicossTab = 'conceptos' | 'bases' | 'validaciones' | 'avanzadas';

@Component({
  selector: 'app-sicoss-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './sicoss-configuracion.component.html',
  styleUrls: ['./sicoss-configuracion.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SicossConfiguracionComponent implements OnInit, OnDestroy {
  private refreshSub?: Subscription;

  loadingGrupos = false;
  loadingConceptos = false;
  loadingSubsistemas = false;
  loadingDetalle = false;
  loadingConceptoDetalle = false;
  savingGrupo = false;
  savingGeneral = false;
  savingRemuneraciones = false;
  savingLsd = false;
  deleting = false;

  accessDenied = false;
  collapseConceptos = false;
  collapseSinConfiguracion = false;
  collapseBases = false;
  collapseEquivalencias = false;
  collapseMapaHistorico = false;
  collapseDetalle = false;
  showConceptoDetalleModal = false;
  ultimaAccionGuardado: string | null = null;
  grupos: GrupoConceptoItem[] = [];
  grupoSearch = '';
  selectedGrupoId: number | null = null;
  grupoForm = { nombre: '', descripcion: '' };
  groupConceptos: GrupoConceptoDetalleItem[] = [];
  groupConceptSearch = '';
  conceptos: ConceptoCatalogoItem[] = [];
  conceptoSearch = '';
  conceptoCodigoSearch = '';
  conceptoDescripcionSearch = '';
  conceptoSinConfigSearch = '';
  coberturaFilter: 'todos' | 'sin_configuracion' | 'con_configuracion' = 'todos';
  baseFilter = 'TODAS';
  clasificacionFilter = 'TODAS';
  selectedConceptoId: number | null = null;
  activeTab: SicossTab = 'conceptos';
  detailTab: DetailTab = 'remuneraciones';
  subsistemas: Subsistema[] = [];
  remuneracionOptions = ['1', '2', '3', '4', '5', '8', '9'];
  fechaVigenciaDesde = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  perfilSeleccionado = '';
  readonly perfilesAfip = [
    { codigo: 'REMUNERATIVO', nombre: 'Remunerativo (sueldo, antigüedad, presentismo)', buckets: ['1', '2', '4', '5', '8', '9'], ejemplo: 'Sueldo $100 → Rem 1/2/4/5/8/9 = 100. Rem 10 = Rem 2 − detracción.' },
    { codigo: 'SAC', nombre: 'SAC', buckets: ['1', '2', '3', '4', '5', '8', '9'], ejemplo: 'SAC $50 también suma Rem. 3.' },
    { codigo: 'NO_REMUNERATIVO_OS', nombre: 'No remunerativo con OS / ART', buckets: ['4', '5', '8', '9'], ejemplo: 'NR $20 no entra a SIPA; sí a OS y LRT.' },
    { codigo: 'NO_REMUNERATIVO_PURO', nombre: 'No remunerativo puro', buckets: [], ejemplo: 'No impacta F.931.' },
    { codigo: 'APORTE', nombre: 'Aporte del trabajador', buckets: [], ejemplo: 'Jubilación 11%, PAMI 3%, OS 3%. Se informa por LSD.' },
    { codigo: 'CONTRIBUCION', nombre: 'Contribución patronal', buckets: [], ejemplo: 'SIPA, FNE, AF, ART. Se informa por LSD.' },
    { codigo: 'SCVO', nombre: 'Seguro colectivo de vida obligatorio', buckets: [], ejemplo: 'Importe fijo. Nunca suma Rem 1–9.' }
  ];
  readonly remLabels: Record<string, string> = {
    '1': 'Rem. 1 — SIPA aportes (con tope)',
    '2': 'Rem. 2 — contribuciones SIPA (sin tope)',
    '3': 'Rem. 3 — SAC',
    '4': 'Rem. 4 — OS aportes',
    '5': 'Rem. 5 — LRT / ART',
    '8': 'Rem. 8 — OS contribuciones',
    '9': 'Rem. 9 — LRT adicional'
  };
  readonly clasificacionOptions: SicossClasificacionFuncional[] = ['REMUNERATIVO_BASE', 'ADICIONAL', 'PREMIO', 'HORA_EXTRA', 'SAC', 'ZONA_DESFAVORABLE', 'MATERNIDAD', 'RECTIFICACION_REMUNERATIVA', 'NO_REMUNERATIVO', 'IMPORTE_A_DETRAER', 'OTRO'];
  readonly baseSicossOptions: Array<SicossBaseSicoss | 'TODAS'> = ['TODAS', '1', '2', '3', '4', '5', '8', '9'];
  selectedRemuneraciones = new Set<string>();
  remMappings: SicossConceptoRemuneracionItem[] = [];
  lsdRows: LsdSegSocialConceptoItem[] = [];
  configuracionesConceptos: SicossConceptoConfiguracionItem[] = [];
  detalleGuardadoEstado: 'idle' | 'saving' | 'success' | 'error' = 'idle';
  detalleGuardadoMensaje: string | null = null;
  detalleGuardadoEn: string | null = null;
  configuracionSnapshot: SicossConfiguracionSnapshot = {
    importe_a_detraer_fijo: 7003.68,
    remuneracion_10_components: ['2'],
    clasificacion_por_concepto: {},
    bases_por_concepto: {},
    observaciones: 'Configuración ajustada por operador',
    version: 'v1'
  };
  importeADetraerFijoInput: number | null = 7003.68;
  conceptoConfiguracionDraft = {
    baseSicoss: 'TODAS' as SicossBaseSicoss | 'TODAS',
    clasificacion: 'OTRO' as SicossClasificacionFuncional,
    participaRem10: false,
    afectaDetraer: false
  };
  readonly baseEquivalencias = [
    { codigo: 'REM_IMPONIBLE_1', base: '1', etiqueta: 'Base SIPA / aportes jubilatorios', rol: 'Sueldo + adicionales remunerativos' },
    { codigo: 'REM_IMPONIBLE_2', base: '2', etiqueta: 'Base contribuciones SIPA', rol: 'Misma que Rem. 1, sin tope' },
    { codigo: 'REM_IMPONIBLE_3', base: '3', etiqueta: 'SAC', rol: 'Solo sueldo anual complementario' },
    { codigo: 'REM_IMPONIBLE_4', base: '4', etiqueta: 'Base OS aportes', rol: 'Remunerativo + NR con OS' },
    { codigo: 'REM_IMPONIBLE_5', base: '5', etiqueta: 'Base LRT / ART', rol: 'Remunerativo + NR con OS' },
    { codigo: 'REM_IMPONIBLE_8', base: '8', etiqueta: 'Base OS contribuciones', rol: 'Alineada a Rem. 4' },
    { codigo: 'REM_IMPONIBLE_9', base: '9', etiqueta: 'Base LRT adicional', rol: 'Alineada a Rem. 5' },
    { codigo: 'REM_IMPONIBLE_10', base: '2', etiqueta: 'Rem. 2 menos importe a detraer', rol: 'Derivada. No se mapea por concepto' },
    { codigo: 'IMPORTE_A_DETRAER', base: '—', etiqueta: 'Detracción F.931', rol: 'Importe fijo de configuración' }
  ];
  readonly legacySicossMapping = [
    { id: 1, liqui: '1', base: 'TOTAL', label: 'Sueldo + adicionales' },
    { id: 2, liqui: '1', base: 'TOTAL', label: 'No remunerativos' },
    { id: 3, liqui: '1 / 2', base: 'TOTAL', label: 'SAC' },
    { id: 4, liqui: '1', base: '4', label: 'Base 4 / 8' },
    { id: 5, liqui: '1', base: '5', label: 'Presentismo' },
    { id: 6, liqui: '1', base: '6', label: 'Antigüedad' },
    { id: 8, liqui: '1', base: '8', label: 'Aporte adicional OS' },
    { id: 9, liqui: '2', base: 'TOTAL', label: 'SAC acumulado' },
    { id: 10, liqui: '1', base: '10', label: 'No remunerativos excepcionales' }
  ];
  newLsdRow: LsdSegSocialConceptoPayload = {
    concepto_id: 0,
    subsistema_id: 0,
    afecta_base: 1,
    es_aporte: 0,
    es_contribucion: 0,
    estado_id: 1
  };

  constructor(
    private auth: AuthService,
    private gruposSvc: GruposService,
    private sicossSvc: SicossService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (!this.puedeVerPantalla) {
      this.accessDenied = true;
      return;
    }

    this.refreshSub = this.sicossSvc.previewRefreshRequested$.subscribe(() => {
      this.toast.info('Se marcó la actualización del preview SICOSS.');
    });

    if (this.sicossSvc.consumePreviewRefreshRequested()) {
      this.toast.info('Se actualizará el preview SICOSS con la próxima recarga.');
    }

    this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  get puedeVerPantalla(): boolean {
    return this.hasPermission('sicoss', 'sicoss_editar', 'sicoss_crear', 'grupos', 'grupos_editar', 'grupos_rela_conceptos');
  }

  get puedeEditarGrupos(): boolean {
    return this.hasPermission('grupos_editar', 'grupos_rela_conceptos');
  }

  get puedeEditarRemuneraciones(): boolean {
    return this.hasPermission('sicoss_editar');
  }

  get puedeEditarLsd(): boolean {
    return this.hasPermission('grupos_rela_conceptos', 'sicoss_editar');
  }

  get gruposFiltrados(): GrupoConceptoItem[] {
    const q = String(this.grupoSearch || '').trim().toLowerCase();
    return q ? this.grupos.filter((g) => this.textoGrupo(g).includes(q)) : this.grupos;
  }

  get conceptosFiltradosParaAgregar(): ConceptoCatalogoItem[] {
    const q = String(this.conceptoSearch || '').trim().toLowerCase();
    const assignedIds = new Set(this.groupConceptos.map((item) => Number(item.concepto_id)));
    const filtered = this.conceptos
      .filter((concepto) => !assignedIds.has(Number(concepto.concepto_id)))
      .filter((concepto) => !q || this.textoConcepto(concepto).includes(q))
      .filter((concepto) => this.pasaCoberturaFilter(concepto.concepto_id));
    return this.pasaBaseFilter(filtered).slice(0, 25);
  }

  get groupConceptosFiltrados(): GrupoConceptoDetalleItem[] {
    const q = String(this.groupConceptSearch || '').trim().toLowerCase();
    return q ? this.groupConceptos.filter((item) => this.textoGrupoConcepto(item).includes(q)) : this.groupConceptos;
  }

  get selectedGrupo(): GrupoConceptoItem | null {
    return this.grupos.find((g) => Number(g.grupo_id) === Number(this.selectedGrupoId ?? 0)) || null;
  }

  get selectedConcepto(): ConceptoCatalogoItem | null {
    return this.conceptos.find((c) => Number(c.concepto_id) === Number(this.selectedConceptoId ?? 0)) || null;
  }

  get selectedConceptoLabel(): string {
    const c = this.selectedConcepto;
    return c ? `${c.codigo} — ${c.nombre || c.descripcion || ''}`.trim() : 'Sin concepto seleccionado';
  }

  get conceptosSinConfiguracion(): ConceptoCatalogoItem[] {
    const q = String(this.conceptoSinConfigSearch || '').trim().toLowerCase();
    return this.pasaBaseFilter(this.conceptos.filter((c) => !this.tieneConfiguracionSicoss(c.concepto_id)).filter((c) => !q || this.textoConcepto(c).includes(q)));
  }

  get conceptosConfiguradosSnapshot(): SicossConceptoConfiguracionItem[] {
    return this.configuracionesConceptos.filter((c) => {
      if (this.clasificacionFilter !== 'TODAS' && c.clasificacion_funcional !== this.clasificacionFilter) return false;
      if (this.baseFilter !== 'TODAS' && !this.conceptoTieneBase(c.concepto_id, this.baseFilter)) return false;
      return true;
    });
  }

  get conceptosConfigurados(): ConceptoCatalogoItem[] {
    return this.pasaBaseFilter(this.conceptos.filter((c) => this.tieneConfiguracionSicoss(c.concepto_id)));
  }

  get resumenBasesSicoss(): Array<{ base: string; cantidad: number; seleccionada: boolean }> {
    return this.remuneracionOptions.map((base) => ({
      base,
      cantidad: this.conceptos.filter((c) => this.conceptoTieneBase(c.concepto_id, base)).length,
      seleccionada: this.selectedRemuneraciones.has(base)
    }));
  }

  conceptosDeBase(base: string): ConceptoCatalogoItem[] {
    const target = String(base || '').trim().toUpperCase();
    if (!target) return [];
    return this.conceptos.filter((concepto) => this.conceptoTieneBase(concepto.concepto_id, target));
  }

  resumenSicossConcepto(conceptoId: number): string {
    const id = Number(conceptoId);
    const conf = this.configuracionesConceptos.find((row) => Number(row.concepto_id) === id);
    const bases = Array.from(this.basesGuardadasParaConcepto(conf, id));
    const baseTxt = bases.length ? bases.map((b) => (b === 'TOTAL' ? 'TOTAL' : `Base ${b}`)).join(' · ') : 'Sin base';
    const clasificacion = conf?.clasificacion_funcional || this.configuracionSnapshot?.clasificacion_por_concepto?.[String(id)] || null;
    return clasificacion ? `${baseTxt} · ${clasificacion}` : baseTxt;
  }

  filtrarPorBase(base: string): void {
    this.baseFilter = String(base || 'TODAS').trim().toUpperCase() || 'TODAS';
    this.conceptoCodigoSearch = '';
    this.conceptoDescripcionSearch = '';
    if (this.baseFilter !== 'TODAS') {
      this.coberturaFilter = 'todos';
    }
  }

  get legacyMappingFiltrada(): Array<{ id: number; liqui: string; base: string; label: string }> {
    if (this.baseFilter === 'TODAS') return this.legacySicossMapping;
    const base = String(this.baseFilter || '').trim().toUpperCase();
    return this.legacySicossMapping.filter((row) => String(row.base || '').toUpperCase() === base || (base === 'TOTAL' && row.base === 'TOTAL'));
  }

  get totalGruposVisibles(): number {
    return this.gruposFiltrados.length;
  }

  get loadingAny(): boolean {
    return this.loadingGrupos || this.loadingConceptos;
  }

  loadInitialData(): void {
    this.loadGrupos();
    this.loadConceptos();
    this.loadSubsistemas();
    this.loadConfiguracionesConceptos();
  }

  loadConfiguracionesConceptos(): void {
    this.sicossSvc.conceptosConfiguracionList().subscribe((res) => {
      this.configuracionesConceptos = res.error ? [] : res.data;
      if (this.configuracionSnapshot && this.configuracionSnapshot.importe_a_detraer_fijo != null) {
        this.importeADetraerFijoInput = Number(this.configuracionSnapshot.importe_a_detraer_fijo);
      }
      this.cdr.markForCheck();
    });
  }

  nuevaGrupo(): void {
    this.selectedGrupoId = null;
    this.grupoForm = { nombre: '', descripcion: '' };
    this.groupConceptos = [];
    this.groupConceptSearch = '';
  }

  selectGrupo(grupo: GrupoConceptoItem): void {
    this.selectedGrupoId = Number(grupo.grupo_id);
    this.grupoForm = { nombre: String(grupo.nombre || ''), descripcion: String(grupo.descripcion || '') };
    this.groupConceptSearch = '';
    this.loadGrupoConceptos();
  }

  selectConcepto(conceptoId: number): void {
    this.selectedConceptoId = Number(conceptoId);
    this.detailTab = 'remuneraciones';
    this.showConceptoDetalleModal = true;
    this.detalleGuardadoEstado = 'idle';
    this.detalleGuardadoMensaje = null;
    this.detalleGuardadoEn = null;
    const conf = this.configuracionesConceptos.find((x) => Number(x.concepto_id) === Number(conceptoId));
    this.conceptoConfiguracionDraft = {
      baseSicoss: (conf?.base_sicoss ?? 'TODAS') as any,
      clasificacion: (conf?.clasificacion_funcional ?? 'OTRO') as SicossClasificacionFuncional,
      participaRem10: !!conf?.participa_remuneracion_10,
      afectaDetraer: !!conf?.afecta_importe_a_detraer
    };
    this.newLsdRow = {
      concepto_id: Number(conceptoId),
      subsistema_id: 0,
      afecta_base: 1,
      es_aporte: 0,
      es_contribucion: 0,
      estado_id: 1
    };
    this.loadConceptoDetail();
  }

  setDetailTab(tab: DetailTab): void {
    this.detailTab = tab;
  }

  abrirDetalleConcepto(): void {
    if (!this.selectedConceptoId) return;
    this.showConceptoDetalleModal = true;
  }

  cerrarDetalleConcepto(): void {
    this.showConceptoDetalleModal = false;
  }

  toggleSection(section: 'conceptos' | 'sin_configuracion' | 'bases' | 'equivalencias' | 'historia' | 'detalle'): void {
    if (section === 'conceptos') this.collapseConceptos = !this.collapseConceptos;
    if (section === 'sin_configuracion') this.collapseSinConfiguracion = !this.collapseSinConfiguracion;
    if (section === 'bases') this.collapseBases = !this.collapseBases;
    if (section === 'equivalencias') this.collapseEquivalencias = !this.collapseEquivalencias;
    if (section === 'historia') this.collapseMapaHistorico = !this.collapseMapaHistorico;
    if (section === 'detalle') this.collapseDetalle = !this.collapseDetalle;
  }

  guardarGrupo(): void {
    if (!this.puedeEditarGrupos) {
      this.toast.error('No tenés permisos para editar grupos.');
      return;
    }
    const nombre = String(this.grupoForm.nombre || '').trim();
    if (!nombre) {
      this.toast.error('El nombre del grupo es obligatorio.');
      return;
    }
    this.savingGrupo = true;
    const payload = { nombre, descripcion: String(this.grupoForm.descripcion || '').trim() };
    const req$ = this.selectedGrupoId ? this.gruposSvc.update(this.selectedGrupoId, payload) : this.gruposSvc.create(payload);
    req$.pipe(finalize(() => {
      this.savingGrupo = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: (res: any) => {
        this.toast.success(this.selectedGrupoId ? 'Grupo actualizado.' : 'Grupo creado.');
        const savedId = Number(res?.grupo_id ?? res?.data?.grupo_id ?? this.selectedGrupoId ?? 0);
        this.loadGrupos();
        if (savedId) {
          this.selectedGrupoId = savedId;
          this.loadGrupoConceptos();
        }
      },
      error: () => this.toast.error('No se pudo guardar el grupo.')
    });
  }

  eliminarGrupo(): void {
    if (!this.selectedGrupoId) return;
    if (!this.puedeEditarGrupos) {
      this.toast.error('No tenés permisos para eliminar grupos.');
      return;
    }
    const grupo = this.selectedGrupo;
    if (!confirm(`¿Eliminar el grupo "${grupo?.nombre || this.selectedGrupoId}"?`)) return;
    this.deleting = true;
    this.gruposSvc.delete(this.selectedGrupoId).pipe(finalize(() => {
      this.deleting = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success('Grupo eliminado.');
        this.nuevaGrupo();
        this.loadGrupos();
      },
      error: () => this.toast.error('No se pudo eliminar el grupo.')
    });
  }

  loadGrupos(): void {
    this.loadingGrupos = true;
    this.gruposSvc.list().pipe(finalize(() => {
      this.loadingGrupos = false;
      this.cdr.markForCheck();
    })).subscribe((res: any) => {
      const raw = Array.isArray(res) ? res : (res?.data || res?.items || []);
      this.grupos = (Array.isArray(raw) ? raw : []).map((item: any): GrupoConceptoItem => ({
        grupo_id: Number(item?.grupo_id ?? item?.id ?? 0),
        nombre: String(item?.nombre ?? item?.descripcion ?? '').trim(),
        descripcion: item?.descripcion ?? null,
        es_default_sistema: item?.es_default_sistema ?? item?.es_sistema ?? null,
        activo: item?.activo != null ? Boolean(Number(item?.activo)) : null,
        empresa_id: item?.empresa_id != null ? Number(item.empresa_id) : null,
        ...item
      })).filter((item: GrupoConceptoItem) => item.grupo_id > 0);

      if (!this.selectedGrupoId && this.grupos.length) {
        this.selectedGrupoId = Number(this.grupos[0].grupo_id);
        this.grupoForm = { nombre: String(this.grupos[0].nombre || ''), descripcion: String(this.grupos[0].descripcion || '') };
        this.loadGrupoConceptos();
      } else if (this.selectedGrupoId) {
        const stillExists = this.grupos.some((g) => Number(g.grupo_id) === Number(this.selectedGrupoId));
        if (!stillExists && this.grupos.length) {
          this.selectedGrupoId = Number(this.grupos[0].grupo_id);
          this.grupoForm = { nombre: String(this.grupos[0].nombre || ''), descripcion: String(this.grupos[0].descripcion || '') };
          this.loadGrupoConceptos();
        }
      }
    });
  }

  loadConceptos(): void {
    this.loadingConceptos = true;
    this.sicossSvc.conceptosCatalogo().pipe(finalize(() => {
      this.loadingConceptos = false;
      this.cdr.markForCheck();
    })).subscribe((res) => {
      this.conceptos = res.error ? [] : res.data;
    });
  }

  loadSubsistemas(): void {
    this.loadingSubsistemas = true;
    this.sicossSvc.subsistemas('sicoss').pipe(finalize(() => {
      this.loadingSubsistemas = false;
      this.cdr.markForCheck();
    })).subscribe((res) => {
      this.subsistemas = res.error ? [] : res.data;
    });
  }

  loadGrupoConceptos(): void {
    if (!this.selectedGrupoId) {
      this.groupConceptos = [];
      return;
    }
    this.loadingDetalle = true;
    this.gruposSvc.listAsignaciones(this.selectedGrupoId).pipe(finalize(() => {
      this.loadingDetalle = false;
      this.cdr.markForCheck();
    })).subscribe((res: any) => {
      const raw = Array.isArray(res) ? res : (res?.data || res?.items || []);
      this.groupConceptos = (Array.isArray(raw) ? raw : []).map((item: any): GrupoConceptoDetalleItem => ({
        grupo_detalle_id: Number(item?.grupo_detalle_id ?? item?.id ?? 0),
        grupo_id: Number(item?.grupo_id ?? this.selectedGrupoId ?? 0),
        concepto_id: Number(item?.concepto_id ?? 0),
        codigo: item?.codigo ?? item?.concepto_codigo ?? null,
        descripcion: item?.descripcion ?? item?.nombre ?? null,
        nombre: item?.nombre ?? item?.descripcion ?? null,
        ...item
      })).filter((item: GrupoConceptoDetalleItem) => item.concepto_id > 0);
      if (!this.selectedConceptoId && this.groupConceptos.length) {
        this.selectConcepto(this.groupConceptos[0].concepto_id);
      }
      this.cdr.markForCheck();
    });
  }

  loadConceptoDetail(): void {
    if (!this.selectedConceptoId) {
      this.remMappings = [];
      this.lsdRows = [];
      return;
    }

    this.loadingConceptoDetalle = true;
    this.sicossSvc.sicossConceptosRemuneracionesList(this.selectedConceptoId).pipe(finalize(() => {
      this.loadingConceptoDetalle = false;
      this.cdr.markForCheck();
    })).subscribe((res) => {
      this.remMappings = res.error ? [] : res.data;
      this.selectedRemuneraciones = new Set(this.remMappings.map((row) => String(row.remuneracion).trim().toUpperCase()));
      this.perfilSeleccionado = this.detectarPerfilSeleccionado();
      this.loadLsdDetail();
    });
  }

  loadLsdDetail(): void {
    if (!this.selectedConceptoId) {
      this.lsdRows = [];
      return;
    }
    this.loadingConceptoDetalle = true;
    this.sicossSvc.lsdSegSocialConceptosList(this.selectedConceptoId).pipe(finalize(() => {
      this.loadingConceptoDetalle = false;
      this.cdr.markForCheck();
    })).subscribe((res) => {
      this.lsdRows = (res.error ? [] : res.data).map((row) => ({
        ...row,
        afecta_base: this.toBoolean(row.afecta_base),
        es_aporte: this.toBoolean(row.es_aporte),
        es_contribucion: this.toBoolean(row.es_contribucion)
      }));
    });
  }

  agregarConceptoAGrupo(concepto: ConceptoCatalogoItem): void {
    if (!this.selectedGrupoId) return;
    if (!this.puedeEditarGrupos) {
      this.toast.error('No tenés permisos para modificar la relación de conceptos.');
      return;
    }
    this.savingGrupo = true;
    this.gruposSvc.assignConcepto(this.selectedGrupoId, Number(concepto.concepto_id)).pipe(finalize(() => {
      this.savingGrupo = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success('Concepto agregado al grupo.');
        this.loadGrupoConceptos();
      },
      error: () => this.toast.error('No se pudo agregar el concepto al grupo.')
    });
  }

  quitarConceptoDelGrupo(item: GrupoConceptoDetalleItem): void {
    if (!this.puedeEditarGrupos) {
      this.toast.error('No tenés permisos para modificar la relación de conceptos.');
      return;
    }
    if (!confirm(`¿Quitar ${item.codigo ?? item.concepto_id} del grupo?`)) return;
    this.savingGrupo = true;
    this.gruposSvc.removeAsignacion(Number(item.grupo_detalle_id)).pipe(finalize(() => {
      this.savingGrupo = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success('Concepto quitado del grupo.');
        this.loadGrupoConceptos();
      },
      error: () => this.toast.error('No se pudo quitar el concepto del grupo.')
    });
  }

  toggleRemuneracion(remuneracion: string, checked: boolean): void {
    const value = String(remuneracion).trim().toUpperCase();
    if (value === '10') {
      this.toast.info('Rem. 10 es derivada (Rem. 2 − detracción) y no se mapea por concepto.');
      return;
    }
    if (checked) this.selectedRemuneraciones.add(value);
    else this.selectedRemuneraciones.delete(value);
    this.perfilSeleccionado = this.detectarPerfilSeleccionado();
  }

  aplicarPerfil(codigo: string): void {
    this.perfilSeleccionado = codigo;
    const perfil = this.perfilesAfip.find((item) => item.codigo === codigo);
    this.selectedRemuneraciones = new Set(perfil?.buckets ?? []);
    if (codigo === 'SAC') this.conceptoConfiguracionDraft.clasificacion = 'SAC';
    else if (codigo === 'NO_REMUNERATIVO_OS' || codigo === 'NO_REMUNERATIVO_PURO') this.conceptoConfiguracionDraft.clasificacion = 'NO_REMUNERATIVO';
    else if (codigo === 'REMUNERATIVO') this.conceptoConfiguracionDraft.clasificacion = 'REMUNERATIVO_BASE';
    else this.conceptoConfiguracionDraft.clasificacion = 'OTRO';
  }

  remLabel(rem: string): string {
    return this.remLabels[rem] || (rem === 'TOTAL' ? 'TOTAL interno' : 'Base ' + rem);
  }

  get perfilHint(): string {
    return this.perfilesAfip.find((item) => item.codigo === this.perfilSeleccionado)?.ejemplo
      || 'Elegí un perfil AFIP para cargar las bases correctas. Rem. 10 no se tilda: se calcula sola.';
  }

  private detectarPerfilSeleccionado(): string {
    const set = new Set(Array.from(this.selectedRemuneraciones.values()).filter((item) => item !== 'TOTAL' && item !== '10'));
    const same = (buckets: string[]) => buckets.length === set.size && buckets.every((item) => set.has(item));
    const found = this.perfilesAfip.find((item) => same(item.buckets));
    return found?.codigo || '';
  }

  tieneConfiguracionSicoss(conceptoId: number): boolean {
    const id = Number(conceptoId);
    if (!id) return false;
    const tieneRem = this.remMappings.some((row) => Number(row.concepto_id) === id);
    const tieneLsd = this.lsdRows.some((row) => Number(row.concepto_id) === id);
    const tieneGeneral = this.configuracionesConceptos.some((row) => Number(row.concepto_id) === id);
    return tieneRem || tieneLsd || tieneGeneral;
  }

  conceptoTieneBase(conceptoId: number, base: string): boolean {
    const id = Number(conceptoId);
    const rem = String(base || '').trim().toUpperCase();
    if (!id || !rem) return false;
    if (this.remMappings.some((row) => Number(row.concepto_id) === id && String(row.remuneracion || '').trim().toUpperCase() === rem)) return true;
    const conf = this.configuracionesConceptos.find((row) => Number(row.concepto_id) === id);
    const bases = this.basesGuardadasParaConcepto(conf, id);
    return bases.has(rem);
  }

  conceptoTieneAlgunaBase(conceptoId: number): boolean {
    return this.remuneracionOptions.some((base) => this.conceptoTieneBase(conceptoId, base));
  }

  setCoberturaFilter(filter: 'todos' | 'sin_configuracion' | 'con_configuracion'): void {
    this.coberturaFilter = filter;
  }

  setBaseFilter(base: string): void {
    this.baseFilter = base;
  }

  get basesDisponiblesFiltro(): string[] {
    return ['TODAS', ...this.remuneracionOptions];
  }

  get coberturaLabel(): string {
    if (this.coberturaFilter === 'sin_configuracion') return 'Sin configuración';
    if (this.coberturaFilter === 'con_configuracion') return 'Con configuración';
    return 'Todos';
  }

  private pasaCoberturaFilter(conceptoId: number): boolean {
    if (this.coberturaFilter === 'sin_configuracion') return !this.tieneConfiguracionSicoss(conceptoId);
    if (this.coberturaFilter === 'con_configuracion') return this.tieneConfiguracionSicoss(conceptoId);
    return true;
  }

  private pasaBaseFilter(list: ConceptoCatalogoItem[]): ConceptoCatalogoItem[] {
    if (this.baseFilter === 'TODAS') return list;
    const base = String(this.baseFilter || '').trim().toUpperCase();
    if (!base) return list;
    return list.filter((concepto) => this.conceptoTieneBase(concepto.concepto_id, base));
  }

  private basesGuardadasParaConcepto(conf: SicossConceptoConfiguracionItem | undefined, conceptoId: number): Set<string> {
    const bases = new Set<string>();
    const id = String(conceptoId);
    const baseSicoss = String(conf?.base_sicoss || '').trim().toUpperCase();
    if (baseSicoss) bases.add(baseSicoss);

    const snapshotBases = this.configuracionSnapshot?.bases_por_concepto ?? {};
    const fromSnapshot = snapshotBases[id];
    if (Array.isArray(fromSnapshot)) {
      fromSnapshot.forEach((item) => {
        const normalized = String(item || '').trim().toUpperCase();
        if (normalized) bases.add(normalized);
      });
    }

    if (conf?.raw?.bases_por_concepto && typeof conf.raw.bases_por_concepto === 'object') {
      const rawBases = conf.raw.bases_por_concepto[id] ?? conf.raw.bases_por_concepto[conceptoId];
      if (Array.isArray(rawBases)) {
        rawBases.forEach((item: any) => {
          const normalized = String(item || '').trim().toUpperCase();
          if (normalized) bases.add(normalized);
        });
      }
    }

    this.remMappings
      .filter((row) => Number(row.concepto_id) === Number(conceptoId))
      .forEach((row) => {
        const normalized = String(row.remuneracion || '').trim().toUpperCase();
        if (normalized) bases.add(normalized);
      });

    return bases;
  }

  guardarRemuneraciones(): void {
    if (!this.selectedConceptoId) return;
    if (!this.puedeEditarRemuneraciones) {
      this.toast.error('No tenés permisos para editar el mapeo SICOSS.');
      return;
    }
    this.savingRemuneraciones = true;
    const payload: SicossConceptoRemuneracionReplacePayload = {
      concepto_id: Number(this.selectedConceptoId),
      remuneraciones: Array.from(this.selectedRemuneraciones.values()).filter((item) => item !== '10'),
      fecha_desde: this.fechaVigenciaDesde || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
    };
    this.sicossSvc.sicossConceptosRemuneracionesReplace(payload).pipe(finalize(() => {
      this.savingRemuneraciones = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success('Mapeo de remuneraciones actualizado correctamente.');
        this.marcarGuardadoDetalle('success', 'Bases SICOSS guardadas con éxito.');
        this.sicossSvc.notifyPreviewRefreshRequested();
      },
      error: () => {
        this.marcarGuardadoDetalle('error', 'No se pudo guardar las bases SICOSS.');
        this.toast.error('No se pudo actualizar el mapeo de remuneraciones.');
      }
    });
  }

  guardarConfiguracionGeneral(): void {
    if (!this.selectedConceptoId) return;
    const conceptoId = String(this.selectedConceptoId);
    const base = this.conceptoConfiguracionDraft.baseSicoss;
    const clasificacion = this.conceptoConfiguracionDraft.clasificacion;
    this.marcarGuardadoDetalle('saving', 'Guardando clasificación funcional...');
    this.configuracionSnapshot = {
      ...this.configuracionSnapshot,
      bases_por_concepto: {
        ...(this.configuracionSnapshot.bases_por_concepto || {}),
        [conceptoId]: base === 'TODAS' ? [] : [base]
      },
      clasificacion_por_concepto: {
        ...(this.configuracionSnapshot.clasificacion_por_concepto || {}),
        [conceptoId]: clasificacion
      }
    };
    this.persistirConfiguracionSnapshot('Clasificación funcional guardada con éxito.');
  }

  guardarConfiguracionGlobal(): void {
    this.configuracionSnapshot = {
      ...this.configuracionSnapshot,
      importe_a_detraer_fijo: this.toNumberOrNull(this.importeADetraerFijoInput),
      remuneracion_10_components: ['2']
    };
    this.persistirConfiguracionSnapshot('Configuración global guardada correctamente.');
  }

  private persistirConfiguracionSnapshot(successMessage: string): void {
    const payload: SicossConfiguracionPersistPayload = {
      fecha_desde: new Date().toISOString().slice(0, 10),
      fecha_hasta: null,
      version: this.configuracionSnapshot.version || 'v1',
      configuracion_snapshot: {
        ...this.configuracionSnapshot
      },
      importe_a_detraer_fijo: this.toNumberOrNull(this.configuracionSnapshot.importe_a_detraer_fijo),
      remuneracion_10_components: this.configuracionSnapshot.remuneracion_10_components || [],
      clasificacion_por_concepto: this.configuracionSnapshot.clasificacion_por_concepto || {},
      bases_por_concepto: this.configuracionSnapshot.bases_por_concepto || {},
      observaciones: this.configuracionSnapshot.observaciones ?? null
    };

    this.savingGeneral = true;
    this.marcarGuardadoDetalle('saving', 'Guardando configuración...');
    this.sicossSvc.guardarConfiguracion(payload).pipe(finalize(() => {
      this.savingGeneral = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: (res) => {
        const data = res.data;
        if (res.error || !data || data.ok === false) {
          this.ultimaAccionGuardado = 'No se pudo guardar la configuración SICOSS.';
          this.toast.error('No se pudo guardar la configuración SICOSS.');
          return;
        }
        if (data.configuracion_snapshot) {
          this.configuracionSnapshot = {
            ...this.configuracionSnapshot,
            ...data.configuracion_snapshot
          };
        }
        if (this.configuracionSnapshot.importe_a_detraer_fijo != null) {
          this.importeADetraerFijoInput = Number(this.configuracionSnapshot.importe_a_detraer_fijo);
        }
        this.loadConfiguracionesConceptos();
        this.marcarGuardadoDetalle('success', successMessage);
        this.ultimaAccionGuardado = successMessage;
        this.toast.success(successMessage);
        this.sicossSvc.notifyPreviewRefreshRequested();
      },
      error: () => {
        this.marcarGuardadoDetalle('error', 'No se pudo guardar la configuración SICOSS.');
        this.ultimaAccionGuardado = 'No se pudo guardar la configuración SICOSS.';
        this.toast.error('No se pudo guardar la configuración SICOSS.');
      }
    });
  }

  private marcarGuardadoDetalle(estado: 'saving' | 'success' | 'error', mensaje: string): void {
    this.detalleGuardadoEstado = estado;
    this.detalleGuardadoMensaje = mensaje;
    this.detalleGuardadoEn = new Date().toLocaleString('es-AR');
    this.cdr.markForCheck();
  }

  private toNumberOrNull(value: number | string | null | undefined): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  agregarLsdRow(): void {
    if (!this.selectedConceptoId) return;
    if (!this.puedeEditarLsd) {
      this.toast.error('No tenés permisos para editar el vínculo LSD.');
      return;
    }
    if (!this.newLsdRow.subsistema_id || Number(this.newLsdRow.subsistema_id) <= 0) {
      this.toast.error('Seleccioná un subsistema.');
      return;
    }
    const payload: LsdSegSocialConceptoPayload = {
      concepto_id: Number(this.selectedConceptoId),
      subsistema_id: Number(this.newLsdRow.subsistema_id),
      afecta_base: this.newLsdRow.afecta_base ? 1 : 0,
      es_aporte: this.newLsdRow.es_aporte ? 1 : 0,
      es_contribucion: this.newLsdRow.es_contribucion ? 1 : 0,
      estado_id: this.newLsdRow.estado_id ?? 1
    };
    this.savingLsd = true;
    this.sicossSvc.lsdSegSocialConceptosCreate(payload).pipe(finalize(() => {
      this.savingLsd = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success('Relación LSD agregada.');
        this.sicossSvc.notifyPreviewRefreshRequested();
        this.newLsdRow = {
          concepto_id: Number(this.selectedConceptoId),
          subsistema_id: 0,
          afecta_base: 1,
          es_aporte: 0,
          es_contribucion: 0,
          estado_id: 1
        };
        this.loadLsdDetail();
      },
      error: () => this.toast.error('No se pudo agregar la relación LSD.')
    });
  }

  guardarLsdRow(row: LsdSegSocialConceptoItem): void {
    if (!row.concepto_seg_social_id) return;
    if (!this.puedeEditarLsd) {
      this.toast.error('No tenés permisos para editar el vínculo LSD.');
      return;
    }
    this.savingLsd = true;
    const payload: Partial<LsdSegSocialConceptoPayload> = {
      concepto_id: Number(row.concepto_id),
      subsistema_id: Number(row.subsistema_id),
      afecta_base: this.toBoolean(row.afecta_base) ? 1 : 0,
      es_aporte: this.toBoolean(row.es_aporte) ? 1 : 0,
      es_contribucion: this.toBoolean(row.es_contribucion) ? 1 : 0,
      estado_id: row.estado_id ?? 1
    };
    this.sicossSvc.lsdSegSocialConceptosUpdate(Number(row.concepto_seg_social_id), payload).pipe(finalize(() => {
      this.savingLsd = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success('Relación LSD actualizada.');
        this.sicossSvc.notifyPreviewRefreshRequested();
        this.loadLsdDetail();
      },
      error: () => this.toast.error('No se pudo actualizar la relación LSD.')
    });
  }

  quitarLsdRow(row: LsdSegSocialConceptoItem): void {
    if (!row.concepto_seg_social_id) return;
    if (!this.puedeEditarLsd) {
      this.toast.error('No tenés permisos para editar el vínculo LSD.');
      return;
    }
    if (!confirm(`¿Eliminar la relación con el subsistema ${row.subsistema_codigo ?? row.subsistema_id}?`)) return;
    this.deleting = true;
    this.sicossSvc.lsdSegSocialConceptosDelete(Number(row.concepto_seg_social_id)).pipe(finalize(() => {
      this.deleting = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success('Relación LSD eliminada.');
        this.sicossSvc.notifyPreviewRefreshRequested();
        this.loadLsdDetail();
      },
      error: () => this.toast.error('No se pudo eliminar la relación LSD.')
    });
  }

  refreshPreviewNotice(): void {
    this.sicossSvc.notifyPreviewRefreshRequested();
    this.toast.info('Se solicitó refrescar el preview SICOSS.');
  }

  trackByGrupo(_: number, item: GrupoConceptoItem): number { return Number(item.grupo_id); }
  trackByConcepto(_: number, item: ConceptoCatalogoItem): number { return Number(item.concepto_id); }
  trackByDetalle(_: number, item: GrupoConceptoDetalleItem): number { return Number(item.grupo_detalle_id); }
  trackByLsd(_: number, item: LsdSegSocialConceptoItem): number { return Number(item.concepto_seg_social_id ?? 0); }

  private hasPermission(...aliases: string[]): boolean {
    const perms = this.auth.getPermissions() || [];
    return aliases.some((alias) => Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias)));
  }

  private textoGrupo(grupo: GrupoConceptoItem): string {
    return [grupo.nombre, grupo.descripcion].filter(Boolean).join(' ').toLowerCase();
  }

  private textoConcepto(concepto: ConceptoCatalogoItem): string {
    return [concepto.codigo, concepto.nombre, concepto.descripcion, concepto.grupo_nombre].filter(Boolean).join(' ').toLowerCase();
  }

  private textoGrupoConcepto(item: GrupoConceptoDetalleItem): string {
    return [item.codigo, item.descripcion, item.nombre].filter(Boolean).join(' ').toLowerCase();
  }

  private toBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    const num = Number(value);
    if (!Number.isNaN(num)) return num !== 0;
    const text = String(value ?? '').trim().toLowerCase();
    return text === 'true' || text === 'si' || text === 'sí' || text === 'activo' || text === '1';
  }
}
