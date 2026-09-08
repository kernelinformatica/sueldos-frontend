import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConceptosService } from './conceptos.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../auth/auth.service';
import { of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-concepto-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './concepto-form.component.html',
  styleUrls: ['./concepto-form.component.scss']
})
export class ConceptoFormComponent implements OnInit {
  form!: FormGroup;

  loading = false;
  saving = false;
  tipos: any[] = [];
  formulaTipos: any[] = [];
  selectedTipo: any = null;
  selectedFormulaTipo: any = null;
  permiteImporteFlag = false;
  permiteFormulaFlag = false;
  grupos: any[] = [];
  previewResult: any = null;
  showPreview = false;
  showConfirmModal = false;
  confirmReason = '';
  confirmPurpose: 'save' | 'override' | null = null;
  private _razonResolver?: (v: string | null) => void;
  // Topes
  topes: any[] = [];
  loadingTopes = false;
  creatingTope = false;
  deletingTopeId: number | null = null;
  newTope: any = { tipo: 'max', accion: 'clamp', unidad: 'monto', valor: null, requiere_override: 0, activo: 1 };
  codigoTaken = false;

  conceptoId: number | null = null;
  private originalValue: any = null;

  constructor(
    private fb: FormBuilder,
    private svc: ConceptosService,
    private route: ActivatedRoute,
    private router: Router,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private auth: AuthService
  ) {}

  get canEdit(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'conceptos_editar' : p?.alias === 'conceptos_editar')); } catch { return false; }
  }

  get canViewTopes(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'topes' : p?.alias === 'topes')); } catch { return false; }
  }

  get canAddTope(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'topes_agregar' : p?.alias === 'topes_agregar')); } catch { return false; }
  }

  get canEditTope(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'topes_editar' : p?.alias === 'topes_editar')); } catch { return false; }
  }

  get canDeleteTope(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'topes_eliminar' : p?.alias === 'topes_eliminar')); } catch { return false; }
  }

  get canOverrideTopes(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'topes_override' : p?.alias === 'topes_override')); } catch { return false; }
  }

  // preview clamp state
  previewClamp: { adjustedImporte: number, top: any } | null = null;

  showConfirmError = false;

  // Error modal for server errors on save
  errorModalVisible = false;
  errorModalTitle = '';
  errorModalMessage = '';
  errorModalIcon = '';
  errorModalSpinner = false;
  errorModalBlock = false;

  onErrorModalClose() {
    this.errorModalVisible = false;
  }

  onConfirmModalClose(confirmado: boolean) {
    // Handler for modal confirm/cancel emitted from app-modal-alerta
    if (this.confirmPurpose === 'override') {
      // modal used to request razon for override
      if (!confirmado) {
        this.showConfirmModal = false;
        this.showConfirmError = false;
        try { this._razonResolver?.(null); } catch {}
        this._razonResolver = undefined;
        this.confirmPurpose = null;
        return;
      }
      // Confirmed: require a reason
      if (!this.confirmReason || !String(this.confirmReason).trim() || String(this.confirmReason).trim().length < 3) {
        this.showConfirmError = true;
        this.showConfirmModal = true;
        return;
      }
      const razon = String(this.confirmReason).trim();
      this.showConfirmError = false;
      this.showConfirmModal = false;
      try { this._razonResolver?.(razon); } catch {}
      this._razonResolver = undefined;
      this.confirmPurpose = null;
      return;
    }

    // default: save flow
    if (!confirmado) {
      this.showConfirmModal = false;
      this.showConfirmError = false;
      return;
    }
    // Confirmed: require a reason
    if (!this.confirmReason || !String(this.confirmReason).trim()) {
      this.showConfirmError = true;
      this.showConfirmModal = true;
      return;
    }
    this.showConfirmError = false;
    this.showConfirmModal = false;
    this.confirmPurpose = null;
    // proceed with save now that reason exists
    const payload = this.buildPayload();
    this.performSave(payload);
  }

  askForRazon(): Promise<string | null> {
    this.confirmPurpose = 'override';
    this.confirmReason = '';
    this.showConfirmError = false;
    this.showConfirmModal = true;
    try { this.cdr.detectChanges(); } catch {}
    return new Promise(resolve => { this._razonResolver = resolve; });
  }

  // initialize form after fb is available
  private initForm() {
    this.form = this.fb.group({
      codigo: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(50)]],
      descripcion: ['', [Validators.required, Validators.minLength(2)]],
      tipo_concepto_id: [null, Validators.required],
      formula_tipo_id: [null],
      grupo_id: [null],
      importe_fijo: [null],
      multiplicador: [1, [Validators.min(0)]],
      divisor: [100, [Validators.min(0)]],
      suma_resta: ['S', Validators.required],
      afecta_sac: [false],
      es_sueldo_basico: [false],
      detalle: [''],
      formula: [''],
      orden: [null]
    });
    // Disable controls initially except `tipo_concepto_id`, `codigo` and `descripcion`
    Object.keys(this.form.controls).forEach(k => {
      if (k !== 'tipo_concepto_id' && k !== 'formula_tipo_id' && k !== 'codigo' && k !== 'descripcion') {
        this.form.controls[k].disable({ emitEvent: false });
      }
    });
  }


  ngOnInit(): void {
    this.initForm();
    this.loading = true;
    this.loadingService.show();
    // subscribe to tipo selection changes
    const tipoCtrl = this.form.get('tipo_concepto_id');
    tipoCtrl?.valueChanges.subscribe(v => this.onTipoChange(v));
    // subscribe to grupo selection changes to re-evaluate permiso de importe
    const grupoCtrl = this.form.get('grupo_id');
    grupoCtrl?.valueChanges.subscribe(() => this.updatePermiteImporteFlag());
    // load tipos and grupos in parallel
    this.svc.tiposList().pipe(catchError(() => of([]))).subscribe((t: any) => { this.tipos = t || []; if (this.form.value.tipo_concepto_id) this.onTipoChange(this.form.value.tipo_concepto_id); this.updatePermiteImporteFlag(); });
    this.svc.formulaTiposList().pipe(catchError(() => of([]))).subscribe((ft: any) => {
      this.formulaTipos = ft || [];
      this.syncSelectedFormulaTipo(this.form.value.formula_tipo_id);
    });
    this.svc.gruposList().pipe(catchError(() => of([]))).subscribe((g: any) => {
      this.grupos = g || [];
      // if editing and originalValue has grupo id, patch control with full group object
      try {
        const origGrpId = this.originalValue?.grupo?.grupo_id ?? this.originalValue?.grupo_id ?? null;
        if (origGrpId) {
          const matched = this.grupos.find((x: any) => Number(x.grupo_id ?? x.id) === Number(origGrpId));
          if (matched) {
            this.form.patchValue({ grupo_id: matched }, { emitEvent: false });
          } else {
            // keep primitive id as fallback
            this.form.patchValue({ grupo_id: origGrpId }, { emitEvent: false });
          }
        }
      } catch (e) { /* ignore */ }
      this.updatePermiteImporteFlag();
    });

    // Accept concept id from route param, query param or history.state (reuse 'alta' screen for edit)
    const routeId = this.route.snapshot.paramMap.get('id');
    const queryId = this.route.snapshot.queryParamMap.get('id');
    const stateId = (history && (history.state as any) && (history.state as any).id) ? String((history.state as any).id) : null;
    const id = routeId || queryId || stateId;
    if (id) {
      this.conceptoId = Number(id);
      this.svc.get(this.conceptoId).pipe(finalize(() => { this.loading = false; this.loadingService.hide(); })).subscribe((res: any) => {
        if (res) {
          this.originalValue = res;
          this.form.patchValue({
            codigo: res.codigo,
            descripcion: res.descripcion,
            tipo_concepto_id: res.tipo_concepto?.tipo_concepto_id ?? res.tipo_concepto_id,
            formula_tipo_id: res.formula_tipo?.formula_tipo_id ?? res.formula_tipo_id ?? null,
            grupo_id: res.grupo?.grupo_id ?? res.grupo_id,
            importe_fijo: res.importe_fijo ?? null,
            multiplicador: res.multiplicador ?? 1,
            divisor: res.divisor ?? 100,
            suma_resta: res.suma_resta ?? 'S',
            afecta_sac: !!res.afecta_sac,
            es_sueldo_basico: !!res.es_sueldo_basico,
            detalle: res.detalle || '',
            orden: res.orden ?? null
          });
          // set selectedTipo based on loaded concepto
          const tipoId = this.form.value.tipo_concepto_id;
          if (tipoId) { this.selectedTipo = this.tipos.find(tt => (tt.id ?? tt.tipo_concepto_id ?? tt.tipo_concepto_id) == tipoId) || null; }
          this.syncSelectedFormulaTipo(this.form.value.formula_tipo_id);
          if (this.selectedTipo) this.applyTipoRules(false);
            // after loading original concept, evaluate permiso using grupo if present
            this.updatePermiteImporteFlag();
            // load topes for this concepto only if user can view them
              try { if (this.canViewTopes) this.loadTopes(); } catch (e) {}
            // Ensure grupo control stores the actual group object (select uses [ngValue]="g").
            try {
              const origGrpId = this.originalValue?.grupo?.grupo_id ?? this.originalValue?.grupo_id ?? null;
              if (origGrpId && this.grupos && this.grupos.length > 0) {
                const matched = this.grupos.find((x: any) => Number(x.grupo_id ?? x.id) === Number(origGrpId));
                if (matched) this.form.patchValue({ grupo_id: matched }, { emitEvent: false });
                else this.form.patchValue({ grupo_id: origGrpId }, { emitEvent: false });
              }
            } catch (e) { /* ignore */ }
        }
      }, (err) => {
        this.loading = false;
        this.loadingService.hide();
      });
    } else {
      this.loading = false;
      this.loadingService.hide();
    }
  }

  get f() { return this.form.controls; }

  onTipoChange(tipoId: any) {
    // tipoId may be number or string
    const id = tipoId == null ? null : (typeof tipoId === 'object' ? (tipoId.id ?? tipoId) : tipoId);
    this.selectedTipo = this.tipos.find(t => (t.id ?? t.conceptos_tipos_id ?? t.tipo_concepto_id ?? t.id) == id) || null;
    // keep permiteImporteFlag driven by selected grupo only (grupo toma prioridad)
    // enable basic fields now that a tipo is selected
    this.enableBasicFields();
    try { this.form.get('formula_tipo_id')?.enable({ emitEvent: false }); } catch {}
    this.applyTipoRules(true);
    // force-enable multiplicador/divisor when tipo indicates they should be usable
    const ctrlMult = this.form.get('multiplicador');
    const ctrlDiv = this.form.get('divisor');
    if (this.permiteImporteFlag) {
      try { ctrlMult?.enable({ emitEvent: false }); } catch {}
      try { ctrlDiv?.enable({ emitEvent: false }); } catch {}
    }
    // apply default suma_resta explicitly if backend provides one (S or R)
    const defaultSR = this.selectedTipo?.default_suma_resta ?? this.selectedTipo?.defaultSumaResta ?? null;
    if (defaultSR === 'S' || defaultSR === 'R') {
      const ctrl = this.form.get('suma_resta');
      if (ctrl) ctrl.setValue(defaultSR, { emitEvent: false });
    }
    // debug log
    try { console.log('ConceptoForm:onTipoChange', { id, selectedTipo: this.selectedTipo, permiteImporte: this.permiteImporteFlag }); } catch {}
    try { this.cdr.detectChanges(); } catch {}
  }

  onFormulaTipoChange(formulaTipoId: any) {
    this.syncSelectedFormulaTipo(formulaTipoId);
  }

  private syncSelectedFormulaTipo(formulaTipoId: any) {
    const id = formulaTipoId == null || formulaTipoId === '' ? null : (typeof formulaTipoId === 'object' ? (formulaTipoId.formula_tipo_id ?? formulaTipoId.id ?? null) : formulaTipoId);
    this.selectedFormulaTipo = this.formulaTipos.find((ft: any) => Number(ft.id ?? ft.formula_tipo_id ?? ft.id) === Number(id)) || null;
  }

  private getGroupPermiteImporte(): boolean | null {
    // priority: selected grupo (from control) -> originalValue.grupo -> default false
    // check selected grupo from control first. The control may store either the whole group object or just an id.
    const gidRaw = this.form.get('grupo_id')?.value;

    // if control value is the full group object, use its flag directly
    if (gidRaw && typeof gidRaw === 'object') {
      const valObj = gidRaw?.permite_importe_fijo ?? gidRaw?.permiteImporteFijo ?? gidRaw?.permite_importe ?? null;
      if (valObj !== undefined && valObj !== null) return Number(valObj) === 1 || valObj === true || valObj === '1';
      // if object present but no flag, fall through to lookup by id
      const tryId = Number(gidRaw.grupo_id ?? gidRaw.id ?? null);
      if (!Number.isNaN(tryId)) {
        const g = this.grupos.find((x: any) => Number(x.grupo_id ?? x.id) === tryId);
        const v = g?.permite_importe_fijo ?? g?.permiteImporteFijo ?? g?.permite_importe ?? null;
        if (v !== undefined && v !== null) return Number(v) === 1 || v === true || v === '1';
      }
    }
    // else interpret gidRaw as an id (string/number)
    const gid = (gidRaw === null || gidRaw === undefined || gidRaw === '') ? null : Number(gidRaw);
    if (gid !== null && !Number.isNaN(gid)) {
      const g = this.grupos.find((x: any) => Number(x.grupo_id ?? x.id) === gid);
      const val = g?.permite_importe_fijo ?? g?.permiteImporteFijo ?? g?.permite_importe ?? null;
      if (val !== undefined && val !== null) return Number(val) === 1 || val === true || val === '1';
    }
    // then check originalValue.grupo
    const grpFromOriginal = this.originalValue?.grupo?.permite_importe_fijo ?? this.originalValue?.grupo?.permiteImporteFijo;
    if (grpFromOriginal !== undefined && grpFromOriginal !== null) return Number(grpFromOriginal) === 1 || grpFromOriginal === true || grpFromOriginal === '1';
    // default: do not allow if no group info
    return false;
  }

  private updatePermiteImporteFlag() {
    this.permiteImporteFlag = !!this.getGroupPermiteImporte();
    // re-apply rules based on resulting flag
    try { this.applyTipoRules(true); } catch {}
    try { this.cdr.detectChanges(); } catch {}
  }



  private enableBasicFields() {
    const basic = ['codigo', 'descripcion', 'formula_tipo_id', 'suma_resta', 'afecta_sac', 'es_sueldo_basico', 'detalle', 'orden'];
    basic.forEach(k => { const c = this.form.get(k); if (c) c.enable({ emitEvent: false }); });
  }

  private applyTipoRules(applyDefaults: boolean) {
    const tipo = this.selectedTipo;
    // Defaults
    if (!tipo) return;
    if (applyDefaults && !this.originalValue) {
      // apply defaults only for new concept
      this.form.patchValue({
        suma_resta: tipo.default_suma_resta ?? tipo.defaultSumaResta ?? this.form.value.suma_resta,
        // unidades not a control present; if needed add later
        afecta_sac: !!(tipo.afecta_sac ?? tipo.afectaSac ?? tipo.afecta_sueldo ?? 0),
        es_sueldo_basico: !!(tipo.afecta_sueldo ?? tipo.afectaSueldo ?? 0)
      }, { emitEvent: false });
    }

    const permiteImporte = this.permiteImporteFlag;
    // enable/disable formula control only when importe fijo is allowed AND tipo.permite_formula==1
    const permiteFormulaRaw = Number(tipo.permite_formula ?? tipo.permiteFormula ?? 0) === 1;
    const permiteFormula = permiteImporte && permiteFormulaRaw;
    this.permiteFormulaFlag = permiteFormula;
    const ctrlFormula = this.form.get('formula');
    if (permiteFormula) {
      ctrlFormula?.enable({ emitEvent: false });
    } else {
      ctrlFormula?.disable({ emitEvent: false });
      ctrlFormula?.setValue('', { emitEvent: false });
    }
    const ctrlImporte = this.form.get('importe_fijo');
    const ctrlMult = this.form.get('multiplicador');
    const ctrlDiv = this.form.get('divisor');
    const ctrlGrupo = this.form.get('grupo_id');
    if (permiteImporte) {
      // When importe fijo is allowed: enable importe input, enable multiplicador/divisor; hide/disable grupo
      ctrlImporte?.enable({ emitEvent: false });
      ctrlMult?.enable({ emitEvent: false });
      ctrlDiv?.enable({ emitEvent: false });
      // Keep grupo control enabled so user can change group even when importe fijo is allowed
      try { ctrlGrupo?.enable({ emitEvent: false }); } catch {}
    } else {
      // When importe fijo is NOT allowed: disable importe input and reset it; still enable multiplicador/divisor so user can enter % values; allow group selection
      ctrlImporte?.disable({ emitEvent: false });
      ctrlImporte?.setValue(null, { emitEvent: false });
      ctrlMult?.enable({ emitEvent: false });
      ctrlDiv?.enable({ emitEvent: false });
      ctrlGrupo?.enable({ emitEvent: false });
    }
  }

  loadTopes() {
    if (!this.conceptoId) return;
    this.loadingTopes = true;
    this.svc.getTopes(this.conceptoId).pipe(finalize(() => { this.loadingTopes = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((t: any) => {
      const tt = t as any;
      const raw = Array.isArray(tt) ? tt : (tt?.data || []);
      // Precompute formatted values and css classes to avoid heavy template work on each CD cycle
      this.topes = (raw || []).map((x: any) => {
        const valorNum = this.normalizeNumber(x?.valor);
        const formatted = x?.unidad === 'porcentaje' ? (valorNum !== null ? (valorNum + '%') : '—') : (valorNum !== null ? this.formatCurrency(valorNum) : '—');
        const css = (x?.accion === 'reject') ? 'tope-reject' : (x?.accion === 'clamp' ? 'tope-clamp' : (x?.accion === 'warn' ? 'tope-warn' : ''));
        return { ...x, formattedValue: formatted, cssClass: css };
      });
      try { this.cdr.detectChanges(); } catch {}
    }, (err) => {
      console.error('loadTopes error', err);
    });
  }

  trackByTope(index: number, t: any) { return t?.tope_id ?? t?.id ?? index; }

  private evaluateTopesForImporte(importe: number, unidades: number = 1) {
    if (!Array.isArray(this.topes) || this.topes.length === 0) return { decision: 'ok' } as any;
    // sort by priority similar to computeTopesSummary: concepto > grupo > global, then action severity
    const severity: Record<string, number> = { 'reject': 3, 'clamp': 2, 'warn': 1 };
    const sorted = [...this.topes].filter(t => t?.activo == 1 || t?.activo === 1).sort((a: any, b: any) => {
      const pa = (a?.concepto_id ? 3 : (a?.grupo_id ? 2 : 1));
      const pb = (b?.concepto_id ? 3 : (b?.grupo_id ? 2 : 1));
      if (pa !== pb) return pb - pa;
      const sa = severity[String(a?.accion)] ?? 0;
      const sb = severity[String(b?.accion)] ?? 0;
      if (sa !== sb) return sb - sa;
      return Number(b?.valor ?? 0) - Number(a?.valor ?? 0);
    });
    for (const top of sorted) {
      const unidad = top?.unidad;
      const valor = Number(top?.valor ?? 0);
      if (unidad === 'monto') {
        if (importe > valor) {
          if (top.accion === 'reject') return { decision: 'reject', top, requiresOverride: !!top.requiere_override };
          if (top.accion === 'clamp') return { decision: 'clamp', adjustedImporte: valor, top, requiresOverride: !!top.requiere_override };
          if (top.accion === 'warn') return { decision: 'warn', top };
        }
      } else if (unidad === 'porcentaje') {
        // cannot evaluate without reference salary; return warn with info
        return { decision: 'warn', top, message: 'Tope en porcentaje — requiere referencia salarial para evaluar' };
      }
    }
    return { decision: 'ok' };
  }

  createTope() {
    if (!this.canAddTope) {
      this.errorModalTitle = 'Acceso denegado';
      this.errorModalMessage = 'No tiene permiso para crear topes (topes_agregar).';
      this.errorModalIcon = 'bi bi-lock-fill';
      this.errorModalVisible = true;
      try { this.cdr.detectChanges(); } catch {}
      return;
    }
    const payload: any = { ...this.newTope };
    // ensure valor is numeric and not null
    payload.valor = this.normalizeNumber(payload.valor);
    if (payload.valor === null || payload.valor === undefined) {
      this.errorModalTitle = 'Valor requerido';
      this.errorModalMessage = 'Ingrese un valor numérico para el tope.';
      this.errorModalIcon = 'bi bi-exclamation-circle-fill';
      this.errorModalVisible = true;
      try { this.cdr.detectChanges(); } catch {}
      return;
    }
    // ensure unidad default
    payload.unidad = payload.unidad || 'monto';
    // apply scope: prefer concepto_id when editing, else attach grupo_id if set
    payload.concepto_id = this.conceptoId ?? null;
    if (!payload.concepto_id) payload.grupo_id = this.form.value.grupo_id ? (this.form.value.grupo_id.grupo_id ?? this.form.value.grupo_id) : null;
    this.creatingTope = true;
    this.svc.createTope(payload).pipe(finalize(() => { this.creatingTope = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res: any) => {
      this.toast.success('Tope creado');
      // try to extract created tope from response and optimistically add to list
      const created = (res && (res.data || res.top || res.tope)) ? (res.data || res.top || res.tope) : res;
      const topeObj = (Array.isArray(created) ? created[0] : created) || null;
      if (topeObj) {
        const valorNum = this.normalizeNumber(topeObj?.valor);
        const formatted = topeObj?.unidad === 'porcentaje' ? (valorNum !== null ? (valorNum + '%') : '—') : (valorNum !== null ? this.formatCurrency(valorNum) : '—');
        const css = (topeObj?.accion === 'reject') ? 'tope-reject' : (topeObj?.accion === 'clamp' ? 'tope-clamp' : (topeObj?.accion === 'warn' ? 'tope-warn' : ''));
        const normalized = { ...topeObj, formattedValue: formatted, cssClass: css };
        // insert at beginning for visibility
        this.topes = [normalized, ...(this.topes || [])];
        try { this.cdr.detectChanges(); } catch {}
      } else {
        // fallback: invalidate cache and reload
        try { this.svc.invalidateTopes((this.conceptoId ?? payload.concepto_id) ?? undefined); } catch {}
        this.loadTopes();
      }
      this.newTope = { tipo: 'max', accion: 'clamp', unidad: 'monto', valor: null, requiere_override: 0, activo: 1 };
    }, (err) => {
      console.error('createTope error', err);
      const status = err?.status ?? '??';
      const backendMsg = err?.error?.message || err?.message || JSON.stringify(err?.error || err);
      this.errorModalTitle = `Error creando tope (${status})`;
      this.errorModalMessage = backendMsg;
      this.errorModalIcon = 'bi bi-x-circle-fill';
      this.errorModalVisible = true;
      try { this.cdr.detectChanges(); } catch {}
    });
  }

  deleteTope(tope: any) {
    if (!this.canDeleteTope) {
      this.errorModalTitle = 'Acceso denegado';
      this.errorModalMessage = 'No tiene permiso para eliminar topes (topes_eliminar).';
      this.errorModalIcon = 'bi bi-lock-fill';
      this.errorModalVisible = true;
      try { this.cdr.detectChanges(); } catch {}
      return;
    }
    const id = tope?.tope_id || tope?.id;
    if (!id) return;
    this.deletingTopeId = Number(id);
    this.svc.deleteTope(id).pipe(finalize(() => { this.deletingTopeId = null; try { this.cdr.detectChanges(); } catch {} })).subscribe((res: any) => {
      this.toast.success('Tope eliminado');
      // optimistically remove from UI
      this.topes = (this.topes || []).filter((x: any) => Number(x?.tope_id ?? x?.id) !== Number(id));
      try { this.cdr.detectChanges(); } catch {}
      // invalidate cache
      try { this.svc.invalidateTopes(this.conceptoId ?? undefined); } catch {}
    }, (err) => {
      console.error('deleteTope error', err);
      const status = err?.status ?? '??';
      const backendMsg = err?.error?.message || err?.message || JSON.stringify(err?.error || err);
      this.errorModalTitle = `Error eliminando tope (${status})`;
      this.errorModalMessage = backendMsg;
      this.errorModalIcon = 'bi bi-x-circle-fill';
      this.errorModalVisible = true;
      try { this.cdr.detectChanges(); } catch {}
    });
  }

  importeAceptado() {
    if (!this.previewClamp) return;
    const val = this.previewClamp.adjustedImporte;
    this.form.get('importe_fijo')?.setValue(val);
    this.previewClamp = null;
    this.showPreview = false;
    try { this.cdr.detectChanges(); } catch {}
  }

  async solicitarPreview() {
    if (!this.form.valid) return;
    const body: any = {
      concepto_id: this.conceptoId,
      importe: this.normalizeNumber(this.f['importe_fijo']?.value),
      unidades: 1
    };
    this.showPreview = false;
    this.loadingService.show();
    this.svc.preview(body).pipe(finalize(() => this.loadingService.hide())).subscribe(async (res: any) => {
      this.previewResult = res;
      this.showPreview = true;
      try { this.cdr.detectChanges(); } catch {}
      const tope = res?.tope || res?.top || null;
      const requiere = tope?.requiere_override || tope?.requiereOverride || false;
      if (requiere && this.canOverrideTopes) {
        const razon = await this.askForRazon();
        if (!razon) return;
        const body2 = { ...body, razon_override: razon };
        this.loadingService.show();
        this.svc.preview(body2).pipe(finalize(() => this.loadingService.hide())).subscribe((res2: any) => {
          this.previewResult = res2;
          this.showPreview = true;
          try { this.cdr.detectChanges(); } catch {}
        }, (err2) => {
          console.error('preview error after override', err2);
          this.errorModalTitle = 'Error al validar override';
          this.errorModalMessage = err2?.error?.message || err2?.message || 'Error del servidor';
          this.errorModalIcon = 'bi bi-x-circle-fill';
          this.errorModalVisible = true;
          try { this.cdr.detectChanges(); } catch {}
        });
      } else if (requiere && !this.canOverrideTopes) {
        this.errorModalTitle = 'Acceso denegado';
        this.errorModalMessage = 'Permiso requerido: topes_override. Contacte a RRHH.';
        this.errorModalIcon = 'bi bi-lock-fill';
        this.errorModalVisible = true;
        try { this.cdr.detectChanges(); } catch {}
      }
    }, (err) => {
      console.error('preview error', err);
      this.toast.error('Error al calcular preview');
    });
  }

  formatCurrency(n: number) {
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n);
    } catch (e) {
      return n.toFixed(2);
    }
  }

  submit() {
    if (this.form.invalid) {
      // allow save if the ONLY invalid controls are multiplicador/divisor
      const invalidKeys = Object.keys(this.form.controls).filter(k => this.form.controls[k].invalid);
      const onlyMultDivInvalid = invalidKeys.length > 0 && invalidKeys.every(k => k === 'multiplicador' || k === 'divisor');
      if (!onlyMultDivInvalid) {
        // focus first error (typed)
        type Controls = typeof this.form.controls;
        const keys = Object.keys(this.form.controls) as Array<keyof Controls>;
        const firstKey = keys.find(k => this.form.controls[k].invalid as boolean);
        if (firstKey) {
          const el = document.querySelector(`[formControlName="${String(firstKey)}"]`) as HTMLElement | null;
          if (el) el.focus();
        }
        return;
      }
      // otherwise proceed despite multiplicador/divisor invalid
    }

    const payload = this.buildPayload();
    // client-side validation: if importe provided but group/tipo does not permit, block and show API-like error
    const importeVal = payload.importe_fijo;
    if ((importeVal !== null && importeVal !== undefined && importeVal > 0) && !this.permiteImporteFlag) {
      this.errorModalTitle = 'Error de validación';
      this.errorModalMessage = 'El grupo/tipo no permite importe fijo. Remueva importe_fijo o habilite en el grupo.';
      this.errorModalIcon = 'bi bi-x-circle-fill';
      this.errorModalVisible = true;
      try { this.cdr.detectChanges(); } catch {}
      return;
    }

    const needsConfirm = this.shouldRequireConfirm(payload);
    if (needsConfirm && !this.confirmReason) {
      this.showConfirmModal = true;
      return;
    }

    this.performSave(payload);
  }

  private performSave(payload: any) {
    this.saving = true;
    this.loadingService.show();
    const req = this.conceptoId ? this.svc.update(this.conceptoId, payload) : this.svc.create(payload);
    req.pipe(finalize(() => { this.saving = false; this.loadingService.hide(); })).subscribe((res: any) => {
      // success
      // navigate back to listado
      this.toast.success('Concepto guardado correctamente');
      this.router.navigate(['/admin/conceptos']);
    }, (err: any) => {
      console.error('save error', err);
      const backendMsg = err?.error?.message || err?.message || null;
      if (err?.status === 409) {
        this.f['codigo'].setErrors({ codigoTaken: true });
        this.toast.error('Código ya existe. Cambie el código.');
      } else if (err?.status === 400 && err?.error) {
        // map field errors if possible
        const e = err.error;
        if (e?.fields) {
          Object.keys(e.fields).forEach((k: string) => {
            const control = this.form.get(k as any);
            if (control) control.setErrors({ server: e.fields[k] });
          });
        }
        // show detailed modal for validation errors (400) using backend message when available
        this.errorModalTitle = 'Error de validación';
        this.errorModalMessage = e?.message || backendMsg || 'Errores de validación. Revise los campos.';
        this.errorModalIcon = 'bi bi-exclamation-triangle-fill';
        this.errorModalVisible = true;
      } else if (err?.status === 403) {
        this.toast.error('Sin permisos.');
      } else if (err?.status >= 500) {
        // show detailed modal for server errors
        this.errorModalTitle = 'Error del servidor';
        this.errorModalMessage = (backendMsg ? backendMsg : 'Ocurrió un error en el servidor. Intente nuevamente.');
        this.errorModalIcon = 'bi bi-x-circle-fill';
        this.errorModalVisible = true;
        try { this.cdr.detectChanges(); } catch {}
      } else {
        this.toast.error('Error al guardar. Intente nuevamente.');
      }
    });
  }

  checkCodigo() {
    const val = (this.f['codigo'].value || '').toString().trim();
    if (!val) return;
    // if editing and codigo same as original, skip
    if (this.originalValue && String(this.originalValue.codigo || '').toUpperCase() === val.toUpperCase()) {
      this.codigoTaken = false;
      this.f['codigo'].setErrors(null);
      return;
    }
    this.svc.existsCodigo(val).pipe(finalize(() => {})).subscribe((exists: boolean) => {
      this.codigoTaken = exists;
      if (exists) this.f['codigo'].setErrors({ codigoTaken: true });
      else this.f['codigo'].setErrors(null);
    }, (err) => {
      console.error('existsCodigo error', err);
    });
  }

  cancelar() { this.router.navigate(['/admin/conceptos']); }

  private buildPayload() {
    const v = this.form.value;
    const payload: any = {
      codigo: (v.codigo || '').toString().trim().toUpperCase(),
      descripcion: v.descripcion,
      // ensure we send numeric ids not whole objects
      tipo_concepto_id: (function(raw:any){ if (raw==null) return null; if (typeof raw === 'object') return Number(raw.tipo_concepto_id ?? raw.conceptos_tipos_id ?? raw.id ?? raw); return Number(raw); })(v.tipo_concepto_id),
      formula_tipo_id: (function(raw:any){ if (raw==null || raw === '') return null; if (typeof raw === 'object') return Number(raw.formula_tipo_id ?? raw.id ?? raw); return Number(raw); })(v.formula_tipo_id),
      grupo_id: (function(raw:any){ if (raw==null) return null; if (typeof raw === 'object') return Number(raw.grupo_id ?? raw.id ?? raw); return Number(raw); })(v.grupo_id) || null,
      multiplicador: this.normalizeNumber(v.multiplicador) ?? 1,
      divisor: this.normalizeNumber(v.divisor) ?? 100,
      suma_resta: v.suma_resta,
      afecta_sac: v.afecta_sac ? 1 : 0,
      es_sueldo_basico: v.es_sueldo_basico ? 1 : 0,
      detalle: v.detalle || null,
      orden: v.orden ?? null,
      razon_override: this.confirmReason || null
    };
    // Determine final permiso: prefer computed permiteImporteFlag (grupo -> tipo)
    const permiteImporte = !!this.permiteImporteFlag;
    if (permiteImporte || payload.razon_override) {
      payload.importe_fijo = this.normalizeNumber(v.importe_fijo);
    }
    return payload;
  }

  private calculatePreviewLocal() {
    return null; // This method is no longer used
  }
  private shouldRequireConfirm(payload: any): boolean {
    if (!this.originalValue) return false;
    const changedImporte = (payload.importe_fijo !== (this.originalValue.importe_fijo ?? null));
    const changedEsBasico = (payload.es_sueldo_basico !== (this.originalValue.es_sueldo_basico ? 1 : 0));
    const criticalChange = changedImporte || changedEsBasico;
    // If the tipo enforces rules, require confirm for critical changes
    const enforce = this.selectedTipo ? Number(this.selectedTipo.enforce_type_rules ?? this.selectedTipo.enforceTypeRules ?? 0) === 1 : false;
    return criticalChange && (enforce || true);
  }

  private normalizeNumber(v: any) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
}
