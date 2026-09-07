import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { GruposService } from './grupos.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ToastService } from '../../core/toast.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ConceptosService } from './conceptos.service';
import { AuthService } from '../../auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-grupo-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, LoadingSpinnerComponent, ModalAlertaComponent, RouterLink],
  templateUrl: './grupo-form.component.html',
  styleUrls: ['./grupo-form.component.scss']
})
export class GrupoFormComponent implements OnInit {
  form: any;
  loading = false;
  grupoId: number | null = null;
  grupoActual: any = null;
  asignaciones: any[] = [];
  conceptos: any[] = [];
  tiposConcepto: any[] = [];
  estados: Array<{ estado_id: number; nombre: string }> = [];
  conceptosLoading = false;
  conceptoSearch = '';
  conceptoTipoFilter = '';
  pendingConceptoIds = new Set<number>();
  selectedAvailableIds = new Set<number>();
  selectedAssignedIds = new Set<number>();
  draggedConceptoId: number | null = null;
  allVisibleSelected = false;
  dropAssignLoading = false;
  dropAssignText = 'Aguarde...';

  modalVisible = false; modalTitle=''; modalMessage=''; modalSpinner=false; modalBlock=false; pendingDelete:any=null; pendingDeleteId:number|null=null;
  errorModalVisible = false;
  errorModalTitle = '';
  errorModalMessage = '';
  errorModalIcon = 'bi bi-exclamation-triangle-fill';
  errorModalAccent = '#d32f2f';
  saveResultModalVisible = false;
  saveResultModalTitle = '';
  saveResultModalMessage = '';
  saveResultModalIcon = 'bi bi-check-circle-fill';
  saveResultModalAccent = '#198754';

  constructor(private fb: FormBuilder, private svc: GruposService, private conceptosSvc: ConceptosService, private route: ActivatedRoute, private router: Router, private toast: ToastService, private cdr: ChangeDetectorRef, private auth: AuthService, private http: HttpClient) {
    this.form = this.fb.group({
      grupo_id: [null], empresa_id: [1], codigo: [null], alias: ['', Validators.required], nombre: ['', Validators.required], descripcion: [''], comentario: [''], permite_importe_fijo: [0], orden: [0], estado_id: [1, Validators.required]
    });
  }

  tipoBadgeLabel(concepto: any): string {
    const tipo = concepto?.tipo_concepto;
    return String(tipo?.codigo || tipo?.nombre || tipo?.descripcion || '-');
  }

  tipoBadgeClass(concepto: any): string {
    const value = this.tipoBadgeLabel(concepto).toUpperCase();
    if (value.includes('DESCUENT') || value.includes('RESTA') || value.includes('DEDUC')) return 'badge-descuento';
    if (value.includes('APORT')) return 'badge-aporte';
    return 'badge-haber';
  }

  assignedRowTypeLabel(item: any): string {
    return this.tipoBadgeLabel(this.getConceptoSource(item));
  }

  assignedRowTypeClass(item: any): string {
    return this.tipoBadgeClass(this.getConceptoSource(item));
  }

  getConceptoSource(item: any): any {
    const concepto = item?.concepto || item || {};
    const conceptoId = Number(concepto?.concepto_id ?? concepto?.id ?? item?.concepto_id ?? item?.id ?? 0);
    const fallback = this.conceptos.find((c: any) => Number(c?.concepto_id ?? c?.id ?? 0) === conceptoId);
    return fallback || concepto;
  }

  getDetalleId(item: any): number | null {
    const value = Number(item?.grupo_detalle_id ?? item?.detalle_id ?? item?.id ?? item?.detalle?.grupo_detalle_id ?? item?.detalle?.id ?? 0);
    return value > 0 ? value : null;
  }

  conceptoNombre(item: any): string {
    const concepto = this.getConceptoSource(item);
    return String(concepto?.descripcion || concepto?.nombre || concepto?.detalle || concepto?.codigo || '-');
  }

  conceptoCodigo(item: any): string {
    const concepto = this.getConceptoSource(item);
    return String(concepto?.codigo || concepto?.concepto_id || concepto?.id || '-');
  }
  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParams['id'] || 0);
    this.loadEstados();
    this.loadConceptos();
    if (id) { this.load(id); }
  }

  loadEstados() {
    this.http.get<any>(`${environment.apiUrl}/api/estados`).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.data || res?.estados || res?.items || []);
        this.estados = (data || []).map((estado: any) => ({
          estado_id: Number(estado?.estado_id ?? estado?.id ?? 0) || 0,
          nombre: String(estado?.nombre ?? estado?.descripcion ?? estado?.name ?? estado?.estado ?? 'Estado')
        })).filter((estado: any) => estado.estado_id > 0);
      },
      error: (err) => {
        console.error('load estados', err);
        this.estados = [];
      }
    });
  }

  get canRelate(): boolean {
    return true;
  }

  get isSystemGroup(): boolean {
    return Number(this.grupoActual?.es_default_sistema ?? this.form?.value?.es_default_sistema ?? 0) === 1;
  }

  get canEditGroup(): boolean {
    return !this.isSystemGroup || this.auth.isSuperAdmin();
  }

  get canRelateGroup(): boolean {
    return !this.isSystemGroup || this.auth.isSuperAdmin();
  }

  get conceptosFiltrados(): any[] {
    const q = String(this.conceptoSearch || '').trim().toLowerCase();
    const tipo = String(this.conceptoTipoFilter || '').trim();
    return (this.conceptos || []).filter((c: any) => {
      if (this.isAssigned(c)) return false;
      if (tipo) {
        const tipoId = String(c?.tipo_concepto?.conceptos_tipos_id ?? c?.tipo_concepto?.tipo_concepto_id ?? c?.tipo_concepto?.id ?? c?.tipo_concepto?.codigo ?? c?.tipo_concepto?.nombre ?? '');
        if (tipoId !== tipo) return false;
      }
      if (!q) return true;
      const hay = [c.codigo, c.descripcion, c.nombre].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  get conceptosAsignadosVisibles(): any[] {
    const q = String(this.conceptoSearch || '').trim().toLowerCase();
    return (this.asignaciones || []).filter((a: any) => {
      const concepto = a?.concepto || a;
      if (!q) return true;
      const hay = [concepto.codigo, concepto.descripcion, concepto.nombre].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  get totalAsignados(): number {
    return this.grupoId ? this.asignaciones.length : this.pendingConceptoIds.size;
  }

  loadConceptos() {
    this.conceptosLoading = true;
    this.conceptosSvc.list().pipe(finalize(() => { this.conceptosLoading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res: any) => {
      this.conceptos = Array.isArray(res) ? res : (res?.data || []);
      const tipos = new Map<string, any>();
      (this.conceptos || []).forEach((c: any) => {
        const t = c?.tipo_concepto;
        const key = String(t?.conceptos_tipos_id ?? t?.tipo_concepto_id ?? t?.id ?? t?.codigo ?? t?.nombre ?? '');
        if (key && !tipos.has(key)) {
          tipos.set(key, {
            id: key,
            nombre: t?.nombre || t?.codigo || t?.descripcion || key,
            codigo: t?.codigo || null
          });
        }
      });
      this.tiposConcepto = Array.from(tipos.values()).sort((a: any, b: any) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
    }, (err) => { console.error('load conceptos', err); });
  }

  load(id:number) {
    this.loading = true;
    this.svc.get(id).pipe(finalize(()=>{ this.loading=false; try{this.cdr.detectChanges();}catch{} })).subscribe((res:any)=>{
      const g = res?.data || res;
      this.grupoActual = g || null;
      this.form.patchValue({ ...(g || {}), estado_id: Number(g?.estado_id ?? g?.estado?.estado_id ?? g?.estado?.id ?? g?.estado ?? 1) || 1 });
      this.grupoId = g?.grupo_id || g?.id || null;
      this.loadAsignaciones();
    }, (err)=>{ console.error('load grupo', err); });
  }

  loadAsignaciones() {
    if (!this.grupoId) return;
    this.svc.listAsignaciones(this.grupoId).subscribe((res:any)=>{ 
      this.asignaciones = Array.isArray(res) ? res : (res?.data || []);
      this.pendingConceptoIds.clear();
      try{this.cdr.detectChanges();}catch{}
    }, (err)=>{ console.error('asign', err); });
  }

  isAssigned(concepto:any): boolean {
    const id = Number(concepto?.concepto_id ?? concepto?.id ?? 0);
    if (!id) return false;
    if (!this.grupoId) return this.pendingConceptoIds.has(id);
    return (this.asignaciones || []).some((a:any) => Number(a.concepto_id ?? a.concepto?.concepto_id ?? a.id) === id);
  }

  canAssign(concepto:any): boolean {
    return !this.isAssigned(concepto);
  }

  isSelectedAvailable(concepto:any): boolean {
    const id = Number(concepto?.concepto_id ?? concepto?.id ?? 0);
    return id ? this.selectedAvailableIds.has(id) : false;
  }

  isSelectedAssigned(item:any): boolean {
    const id = this.getDetalleId(item);
    return id ? this.selectedAssignedIds.has(id) : false;
  }

  isAllVisibleSelected(): boolean {
    const visibles = this.conceptosFiltrados.filter((c:any) => !this.isAssigned(c));
    return visibles.length > 0 && visibles.every((c:any) => this.isSelectedAvailable(c));
  }

  isAllAssignedVisibleSelected(): boolean {
    const visibles = this.conceptosAsignadosVisibles;
    return visibles.length > 0 && visibles.every((a:any) => this.isSelectedAssigned(a));
  }

  toggleSelectAllAvailable() {
    if (!this.canRelateGroup) return;
    const visibles = this.conceptosFiltrados.filter((c:any) => !this.isAssigned(c));
    const shouldSelect = !this.isAllVisibleSelected();
    if (shouldSelect) {
      visibles.forEach((c:any) => this.selectedAvailableIds.add(Number(c.concepto_id ?? c.id ?? 0)));
    } else {
      visibles.forEach((c:any) => this.selectedAvailableIds.delete(Number(c.concepto_id ?? c.id ?? 0)));
    }
    try { this.cdr.detectChanges(); } catch {}
  }

  toggleSelectAllAssigned() {
    if (!this.canRelateGroup) return;
    const visibles = this.conceptosAsignadosVisibles;
    const shouldSelect = !this.isAllAssignedVisibleSelected();
    if (shouldSelect) {
      visibles.forEach((a:any) => {
        const id = this.getDetalleId(a);
        if (id) this.selectedAssignedIds.add(id);
      });
    } else {
      visibles.forEach((a:any) => {
        const id = this.getDetalleId(a);
        if (id) this.selectedAssignedIds.delete(id);
      });
    }
    try { this.cdr.detectChanges(); } catch {}
  }

  toggleAvailableSelection(concepto:any, forceState?: boolean) {
    const id = Number(concepto?.concepto_id ?? concepto?.id ?? 0);
    if (!id || this.isAssigned(concepto)) return;
    const next = forceState ?? !this.selectedAvailableIds.has(id);
    if (next) this.selectedAvailableIds.add(id);
    else this.selectedAvailableIds.delete(id);
    try { this.cdr.detectChanges(); } catch {}
  }

  toggleAssignedSelection(item:any, forceState?: boolean) {
    const id = this.getDetalleId(item);
    if (!id) return;
    const next = forceState ?? !this.selectedAssignedIds.has(id);
    if (next) this.selectedAssignedIds.add(id);
    else this.selectedAssignedIds.delete(id);
    try { this.cdr.detectChanges(); } catch {}
  }

  assignSelected() {
    if (!this.canRelateGroup) { this.toast.error('Sin permisos para relacionar conceptos'); return; }
    if (!this.grupoId) {
      this.conceptosFiltrados.forEach((c:any) => {
        const id = Number(c?.concepto_id ?? c?.id ?? 0);
        if (id && this.selectedAvailableIds.has(id)) this.pendingConceptoIds.add(id);
      });
      this.selectedAvailableIds.clear();
      try { this.cdr.detectChanges(); } catch {}
      return;
    }

    const ids = Array.from(this.selectedAvailableIds.values()).filter((id) => !this.isAssigned({ concepto_id: id }));
    if (ids.length === 0) return;
    ids.forEach((conceptoId) => {
      this.svc.assignConcepto(this.grupoId!, conceptoId).subscribe({
        next: (res:any) => {
          const concepto = (this.conceptos || []).find((c:any) => Number(c?.concepto_id ?? c?.id ?? 0) === conceptoId);
          const created = res?.data || res || {};
          const detalleId = this.getDetalleId(created);
          const assignedRow = detalleId
            ? { ...created, concepto: created?.concepto || concepto, concepto_id: conceptoId, grupo_detalle_id: detalleId }
            : { ...created, concepto: created?.concepto || concepto, concepto_id: conceptoId };
          if (concepto && !this.asignaciones.some((a:any) => Number(a?.concepto_id ?? a?.concepto?.concepto_id ?? a?.id) === conceptoId)) {
            this.asignaciones = [...this.asignaciones, assignedRow];
          }
          this.selectedAvailableIds.delete(conceptoId);
          this.pendingConceptoIds.delete(conceptoId);
          try { this.cdr.detectChanges(); } catch {}
          this.toast.success('Concepto asignado');
        },
        error: (err) => {
          console.error(err);
          this.showError(this.mapError(err, 'No se pudo asignar el concepto'));
        }
      });
    });
  }

  removeSelected() {
    if (!this.canRelateGroup) { this.toast.error('Sin permisos para relacionar conceptos'); return; }
    const ids = Array.from(this.selectedAssignedIds.values());
    if (ids.length === 0) return;
    const byDetalle = new Map<number, any>();
    (this.asignaciones || []).forEach((a:any) => {
      const detalleId = this.getDetalleId(a);
      if (detalleId) byDetalle.set(detalleId, a);
    });
    const selectedDetails = ids.map(id => byDetalle.get(id)).filter(Boolean);
    if (selectedDetails.length === 0) return;
    selectedDetails.forEach((det:any) => {
      const detalleId = this.resolveDetalleId(det);
      if (!detalleId) return;
      this.svc.removeAsignacion(detalleId).subscribe({
        next: () => {
          this.asignaciones = (this.asignaciones || []).filter((a:any) => this.getDetalleId(a) !== detalleId);
          this.selectedAssignedIds.delete(detalleId);
          const conceptoId = Number(det?.concepto_id ?? det?.concepto?.concepto_id ?? det?.concepto?.id ?? det?.id ?? 0);
          if (conceptoId) this.selectedAvailableIds.delete(conceptoId);
          try { this.cdr.detectChanges(); } catch {}
          this.toast.success('Concepto desasignado');
        },
        error: (err) => {
          console.error(err);
          this.showError(this.mapError(err, 'No se pudo quitar el concepto'));
        }
      });
    });
  }

  onDragStart(concepto: any) {
    const id = Number(concepto?.concepto_id ?? concepto?.id ?? 0);
    this.draggedConceptoId = id || null;
  }

  onDragEnd() {
    this.draggedConceptoId = null;
  }

  onDropToAssigned() {
    if (!this.draggedConceptoId) return;
    const concepto = (this.conceptos || []).find((c:any) => Number(c.concepto_id ?? c.id ?? 0) === this.draggedConceptoId);
    this.draggedConceptoId = null;
    if (!concepto) return;
    this.dropAssignLoading = true;
    this.dropAssignText = 'Aguarde...';
    this.toggleConcepto(concepto);
  }

  onDropToAssignedPanel() {
    this.onDropToAssigned();
  }

  toggleConcepto(concepto:any) {
    if (!this.canRelateGroup) { this.toast.error('Sin permisos para relacionar conceptos'); return; }
    const conceptoId = Number(concepto?.concepto_id ?? concepto?.id ?? 0);
    if (!conceptoId) return;
    if (!this.grupoId) {
      if (this.pendingConceptoIds.has(conceptoId)) this.pendingConceptoIds.delete(conceptoId);
      else this.pendingConceptoIds.add(conceptoId);
      try { this.cdr.detectChanges(); } catch {}
      return;
    }
    if (this.isAssigned(concepto)) return;
    this.svc.assignConcepto(this.grupoId, conceptoId).subscribe({
      next: () => {
        this.loadAsignaciones();
        this.toast.success('Concepto asignado');
        this.dropAssignLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.dropAssignLoading = false;
        this.showError(this.mapError(err, 'No se pudo asignar el concepto'));
      }
    });
  }

  save() {
    if (!this.canEditGroup) { this.showError('Solo super_admin puede editar este grupo del sistema.'); return; }
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    const payload = {
      ...this.form.getRawValue(),
      grupo_id: this.grupoId ?? this.form.get('grupo_id')?.value ?? null,
      codigo: this.form.get('codigo')?.value === '' ? null : Number(this.form.get('codigo')?.value ?? 0),
      orden: Number(this.form.get('orden')?.value ?? 0),
      permite_importe_fijo: Number(this.form.get('permite_importe_fijo')?.value ?? 0),
      estado_id: Number(this.form.get('estado_id')?.value ?? 0)
    };
    const op = this.grupoId ? this.svc.update(this.grupoId, payload) : this.svc.create(payload);
    op.pipe(finalize(()=>{ this.loading=false; try{this.cdr.detectChanges();}catch{} })).subscribe((res:any)=>{
      const savedId = res?.data?.grupo_id || res?.data?.id || res?.grupo_id || res?.id || this.grupoId;
      const backendData = res?.data || res || {};
      if (savedId && !this.grupoId) {
        this.grupoId = Number(savedId);
      }
      if (savedId && this.grupoId) {
        this.load(Number(savedId));
      }
      const actionLabel = this.grupoId ? 'actualizado' : 'creado';
      const backendMessage = backendData?.message || backendData?.mensaje || backendData?.detail || `Grupo ${actionLabel} correctamente.`;
      const backendCode = backendData?.codigo ?? this.form.get('codigo')?.value;
      this.saveResultModalTitle = 'Guardado correctamente';
      this.saveResultModalMessage = `El grupo fue ${actionLabel}.${backendCode !== undefined && backendCode !== null && String(backendCode).trim() !== '' ? ` Código: ${backendCode}.` : ''}${backendMessage ? `<br>${backendMessage}` : ''}`;
      this.saveResultModalVisible = true;
      this.toast.success('Guardado');
      if (this.grupoId) {
        this.loadAsignaciones();
      }
      const finish = () => {};
      if (this.grupoId && this.pendingConceptoIds.size > 0) {
        const pending = Array.from(this.pendingConceptoIds.values());
        let remaining = pending.length;
        pending.forEach((conceptoId) => {
          this.svc.assignConcepto(this.grupoId!, conceptoId).subscribe({
            next: () => {
              remaining -= 1;
              if (remaining === 0) {
                this.pendingConceptoIds.clear();
                finish();
              }
            },
            error: (err) => {
              console.error(err);
              remaining -= 1;
              if (remaining === 0) {
                this.pendingConceptoIds.clear();
                finish();
              }
            }
          });
        });
      } else {
        finish();
      }
    }, (err)=>{ console.error('save', err); this.showError(this.mapError(err, 'Error guardando el grupo')); });
  }

  addAsignacion(conceptoId:number) {
    if (!this.grupoId) return;
    this.svc.assignConcepto(this.grupoId, conceptoId).subscribe(()=>{ this.loadAsignaciones(); this.toast.success('Asignado'); }, (err)=>{ console.error(err); this.showError(this.mapError(err, 'No se pudo asignar el concepto')); });
  }

  confirmRemoveAsignacion(det:any) { this.pendingDelete = det; this.pendingDeleteId = this.resolveDetalleId(det); this.modalTitle='Confirmar'; this.modalMessage='Quitar asignación?'; this.modalVisible=true; }
  onModalClose(confirm=false){
    if(!confirm){ this.modalVisible=false; this.pendingDelete=null; this.pendingDeleteId=null; return; }
    const detalleId = this.pendingDeleteId ?? this.resolveDetalleId(this.pendingDelete);
    if (!detalleId) { this.modalVisible=false; this.pendingDelete=null; this.showError('No se pudo identificar la relación a eliminar'); return; }
    this.svc.removeAsignacion(detalleId).subscribe({
      next: () => {
        this.asignaciones = (this.asignaciones || []).filter((a:any) => this.getDetalleId(a) !== detalleId);
        this.selectedAssignedIds.delete(detalleId);
        this.modalVisible = false;
        this.pendingDelete = null;
        this.pendingDeleteId = null;
        try { this.cdr.detectChanges(); } catch {}
        this.toast.success('Eliminado');
      },
      error: (err) => {
        console.error(err);
        this.modalVisible = false;
        this.pendingDelete = null;
        this.pendingDeleteId = null;
        this.showError(this.mapError(err, 'No se pudo eliminar la relación'));
      }
    });
  }

  private resolveDetalleId(item: any): number | null {
    const direct = this.getDetalleId(item);
    if (direct) return direct;
    const conceptoId = Number(item?.concepto_id ?? item?.concepto?.concepto_id ?? item?.concepto?.id ?? item?.id ?? 0);
    if (!conceptoId) return null;
    const match = (this.asignaciones || []).find((a:any) => {
      const assignedConceptId = Number(a?.concepto_id ?? a?.concepto?.concepto_id ?? a?.concepto?.id ?? 0);
      return assignedConceptId === conceptoId;
    });
    return match ? this.getDetalleId(match) : null;
  }

  private findDetalleIdForPendingDelete(item: any): number | null {
    const conceptoId = Number(item?.concepto_id ?? item?.concepto?.concepto_id ?? item?.concepto?.id ?? item?.id ?? 0);
    if (!conceptoId) return null;
    const match = (this.asignaciones || []).find((a:any) => {
      const assignedConceptId = Number(a?.concepto_id ?? a?.concepto?.concepto_id ?? a?.concepto?.id ?? a?.id ?? 0);
      return assignedConceptId === conceptoId;
    });
    return match ? this.getDetalleId(match) : null;
  }

  closeErrorModal() {
    this.errorModalVisible = false;
    this.errorModalTitle = '';
    this.errorModalMessage = '';
  }

  closeSaveResultModal() {
    this.saveResultModalVisible = false;
    this.saveResultModalTitle = '';
    this.saveResultModalMessage = '';
    this.router.navigate(['/admin/conceptos/grupos']);
  }

  private showError(message: string, title = 'Error') {
    this.errorModalTitle = title;
    this.errorModalMessage = message;
    this.errorModalVisible = true;
    this.errorModalIcon = 'bi bi-exclamation-triangle-fill';
    try { this.cdr.detectChanges(); } catch {}
  }

  private clearSelections() {
    this.selectedAvailableIds.clear();
    this.selectedAssignedIds.clear();
    this.draggedConceptoId = null;
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    const apiMessage = err?.error?.message || err?.error?.mensaje || err?.error?.detail || err?.message;
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'El grupo o concepto solicitado no fue encontrado.';
    if (status === 409) return 'Ese concepto ya está asignado al grupo.';
    if (status === 400 && apiMessage) return String(apiMessage);
    return fallback;
  }
}
