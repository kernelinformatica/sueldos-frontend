import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GruposService } from './grupos.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../auth/auth.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-grupos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './grupos.component.html',
  styleUrls: ['./grupos.component.scss']
})
export class GruposComponent implements OnInit {
  grupos: any[] = [];
  loading = false;
  expandedGroups = new Set<number>();
  filtros = { nombre: '', codigo: '', alcance: 'todos' };

  modalVisible = false;
  modalTitle = '';
  modalMessage = '';
  modalSpinner = false;
  modalBlock = false;
  private pendingDelete: any = null;
  errorModalVisible = false;
  errorModalTitle = '';
  errorModalMessage = '';
  errorModalIcon = 'bi bi-exclamation-triangle-fill';

  constructor(private svc: GruposService, private cdr: ChangeDetectorRef, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void { this.load(); }

  load() {
    this.loading = true;
    this.svc.list().pipe(finalize(() => { this.loading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      this.grupos = Array.isArray(res) ? res : (res?.data || []);
      (this.grupos || []).forEach((g:any) => {
        g.conceptos = this.normalizeConceptos(g?.conceptos);
        g.conceptos_count = g.conceptos.length || g.conceptos_count || 0;
      });
      this.grupos = [...this.grupos].sort((a: any, b: any) => {
        const ao = Number(a?.orden ?? 0);
        const bo = Number(b?.orden ?? 0);
        if (ao !== bo) return ao - bo;
        return String(a?.nombre || a?.alias || '').localeCompare(String(b?.nombre || b?.alias || ''));
      });
    }, (err) => { console.error('Error listando grupos', err); this.showError(this.mapError(err, 'No se pudieron cargar los grupos.')); });
  }

  get canCreate() { try { const p = this.auth.getPermissions()||[]; return p.some((x:any)=> typeof x==='string'? x==='grupos_crear' : x?.alias==='grupos_crear'); } catch { return false; } }
  get canEdit() { try { const p = this.auth.getPermissions()||[]; return p.some((x:any)=> typeof x==='string'? x==='grupos_editar' : x?.alias==='grupos_editar'); } catch { return false; } }
  get canDelete() { try { const p = this.auth.getPermissions()||[]; return p.some((x:any)=> typeof x==='string'? x==='grupos_eliminar' : x?.alias==='grupos_eliminar'); } catch { return false; } }

  newGrupo() {
    // navigate to the group form route - route should be added in app routes; fallback: open /admin/conceptos/grupos/alta
    window.location.href = '/admin/conceptos/grupos/alta';
  }

  edit(gr:any) { window.location.href = `/admin/conceptos/grupos/editar?id=${gr.grupo_id || gr.id}`; }

  relacionar(gr:any) {
    if (!this.canRelate) { this.toast.error('Sin permisos para relacionar conceptos'); return; }
    const id = gr?.grupo_id || gr?.id;
    if (!id) { this.toast.error('Grupo inválido'); return; }
    // Navega a la pantalla de relación (se diseñará luego)
    window.location.href = `/admin/conceptos/grupos/relacionar?id=${id}`;
  }

  toggleConceptos(gr:any) {
    const id = Number(gr.grupo_id || gr.id);
    if (!id) return;
    if (this.expandedGroups.has(id)) this.expandedGroups.delete(id);
    else this.expandedGroups.add(id);
  }

  hasConceptos(gr: any): boolean {
    return this.normalizeConceptos(gr?.conceptos).length > 0;
  }

  isExpanded(gr:any) {
    const id = Number(gr.grupo_id || gr.id);
    return id ? this.expandedGroups.has(id) : false;
  }

  get gruposFiltrados() {
    const q = (this.filtros.nombre || '').toString().trim().toLowerCase();
    const codigo = (this.filtros.codigo || '').toString().trim();
    const alcance = String(this.filtros.alcance || 'todos');
    return (this.grupos || []).filter((g:any) => {
      const protegido = this.isSystemGroup(g);
      if (alcance === 'protegidos' && !protegido) return false;
      if (alcance === 'comunes' && protegido) return false;
      if (q) {
        const name = ((g.nombre || g.alias || '') + '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (codigo) {
        const cod = String(g.codigo || '');
        if (!cod.includes(codigo)) return false;
      }
      return true;
    });
  }

  grupoCodigo(g: any): string {
    const codigo = g?.codigo;
    return codigo !== null && codigo !== undefined && String(codigo).trim() !== '' ? String(codigo) : '-';
  }

  conceptoLabel(c: any): string {
    return String(c?.descripcion || c?.nombre || c?.alias || c?.codigo || c?.concepto_id || '-');
  }

  conceptoCodigo(c: any): string {
    const codigo = c?.codigo ?? c?.concepto_id ?? c?.id;
    return codigo !== null && codigo !== undefined && String(codigo).trim() !== '' ? String(codigo) : '-';
  }

  private normalizeConceptos(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.conceptos)) return value.conceptos;
    return [];
  }

  get canRelate() {
    try { const p = this.auth.getPermissions()||[]; return p.some((x:any)=> typeof x==='string'? x==='grupos_rela_conceptos' : x?.alias==='grupos_rela_conceptos'); } catch { return false; }
  }

  isSystemGroup(g: any): boolean {
    return Number(g?.es_default_sistema ?? 0) === 1;
  }

  canModifyGroup(g: any): boolean {
    return this.canEdit || (this.isSystemGroup(g) && this.canEditSystemGroups);
  }

  canRemoveGroup(g: any): boolean {
    return this.canDelete && !this.isSystemGroup(g);
  }

  removeAsignacion(gr:any, det:any) {
    if (!this.canRelateGroup(gr)) { this.toast.error('Sin permisos para quitar asignaciones'); return; }
    const detalleId = det?.grupo_detalle_id || det?.id || det?.detalle_id;
    if (!detalleId) { this.toast.error('Detalle inválido'); return; }
    this.svc.removeAsignacion(detalleId).subscribe(() => {
      this.toast.success('Asignación eliminada');
      gr.conceptos = (gr.conceptos || []).filter((c:any)=> (c.grupo_detalle_id || c.id || c.detalle_id) !== detalleId);
      gr.conceptos_count = gr.conceptos.length;
    }, (err:any)=>{ console.error(err); this.showError(this.mapError(err, 'No se pudo quitar la asignación')); });
  }

  confirmDelete(g:any) {
    if (!this.canRemoveGroup(g)) { this.modalTitle='Operación no permitida'; this.modalMessage=this.isSystemGroup(g) ? 'Este grupo pertenece al sistema y no puede eliminarse.' : 'No tiene permisos para eliminar grupos'; this.modalVisible=true; return; }
    this.pendingDelete = g;
    this.modalTitle = 'Confirmar eliminación';
    this.modalMessage = `Confirma eliminar el grupo "${g.nombre || g.alias || ''}"?`;
    this.modalIcon = 'bi bi-trash3-fill';
    this.modalVisible = true;
  }

  modalIcon = '';

  get canEditSystemGroups(): boolean {
    return this.auth.isSuperAdmin();
  }

  get canRelateSystemGroups(): boolean {
    return this.auth.isSuperAdmin();
  }

  canRelateGroup(g: any): boolean {
    return this.canRelate && (!this.isSystemGroup(g) || this.canRelateSystemGroups);
  }

  onModalClose(confirm=false) {
    if (!this.modalVisible) return;
    if (!confirm) { this.modalVisible=false; this.pendingDelete=null; return; }
    const target = this.pendingDelete;
    if (!target) { this.modalVisible=false; return; }
    this.modalSpinner = true; this.modalBlock = true;
    this.svc.delete(target.grupo_id || target.id).pipe(finalize(()=>{ this.modalSpinner=false; this.modalBlock=false; try{this.cdr.detectChanges();}catch{} })).subscribe(()=>{
      this.modalVisible=false; this.pendingDelete=null; this.toast.success('Grupo eliminado'); this.load();
    }, (err)=>{
      console.error('delete grupo', err); this.showError(this.mapError(err, 'No se pudo eliminar el grupo.'));
    });
  }

  closeErrorModal() {
    this.errorModalVisible = false;
    this.errorModalTitle = '';
    this.errorModalMessage = '';
  }

  private showError(message: string, title = 'Error') {
    this.errorModalTitle = title;
    this.errorModalMessage = message;
    this.errorModalVisible = true;
    this.errorModalIcon = 'bi bi-exclamation-triangle-fill';
    try { this.cdr.detectChanges(); } catch {}
  }

  private mapError(err: any, fallback: string): string {
    const status = Number(err?.status ?? 0);
    const apiMessage = err?.error?.message || err?.error?.mensaje || err?.error?.detail || err?.message;
    if (status === 401) return 'Sesión vencida o no autorizada.';
    if (status === 403) return 'La operación no está permitida.';
    if (status === 404) return 'El recurso solicitado no fue encontrado.';
    if (status === 409) return 'La relación ya existe o entra en conflicto con otra regla.';
    if (status === 400 && apiMessage) return String(apiMessage);
    return fallback;
  }
}
