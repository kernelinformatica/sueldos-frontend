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
  filtros = { nombre: '', codigo: '' };

  modalVisible = false;
  modalTitle = '';
  modalMessage = '';
  modalSpinner = false;
  modalBlock = false;
  private pendingDelete: any = null;

  constructor(private svc: GruposService, private cdr: ChangeDetectorRef, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void { this.load(); }

  load() {
    this.loading = true;
    this.svc.list().pipe(finalize(() => { this.loading = false; try { this.cdr.detectChanges(); } catch {} })).subscribe((res:any) => {
      this.grupos = Array.isArray(res) ? res : (res?.data || []);
      (this.grupos || []).forEach((g:any) => {
        g.conceptos = Array.isArray(g.conceptos) ? g.conceptos : (g?.conceptos || []);
        g.conceptos_count = g.conceptos.length || g.conceptos_count || 0;
      });
    }, (err) => { console.error('Error listando grupos', err); });
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

  isExpanded(gr:any) {
    const id = Number(gr.grupo_id || gr.id);
    return id ? this.expandedGroups.has(id) : false;
  }

  get gruposFiltrados() {
    const q = (this.filtros.nombre || '').toString().trim().toLowerCase();
    const codigo = (this.filtros.codigo || '').toString().trim();
    return (this.grupos || []).filter((g:any) => {
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

  get canRelate() {
    try { const p = this.auth.getPermissions()||[]; return p.some((x:any)=> typeof x==='string'? x==='grupos_rela_conceptos' : x?.alias==='grupos_rela_conceptos'); } catch { return false; }
  }

  removeAsignacion(gr:any, det:any) {
    if (!this.canRelate) { this.toast.error('Sin permisos para quitar asignaciones'); return; }
    const detalleId = det?.grupo_detalle_id || det?.id || det?.detalle_id;
    if (!detalleId) { this.toast.error('Detalle inválido'); return; }
    this.svc.removeAsignacion(detalleId).subscribe(() => {
      this.toast.success('Asignación eliminada');
      gr.conceptos = (gr.conceptos || []).filter((c:any)=> (c.grupo_detalle_id || c.id || c.detalle_id) !== detalleId);
      gr.conceptos_count = gr.conceptos.length;
    }, (err)=>{ console.error(err); this.toast.error('Error eliminando asignación'); });
  }

  confirmDelete(g:any) {
    if (!this.canDelete) { this.modalTitle='Sin permisos'; this.modalMessage='No tiene permisos para eliminar grupos'; this.modalVisible=true; return; }
    this.pendingDelete = g;
    this.modalTitle = 'Confirmar eliminación';
    this.modalMessage = `Confirma eliminar el grupo "${g.nombre || g.alias || ''}"?`;
    this.modalIcon = 'bi bi-trash3-fill';
    this.modalVisible = true;
  }

  modalIcon = '';
  onModalClose(confirm=false) {
    if (!this.modalVisible) return;
    if (!confirm) { this.modalVisible=false; this.pendingDelete=null; return; }
    const target = this.pendingDelete;
    if (!target) { this.modalVisible=false; return; }
    this.modalSpinner = true; this.modalBlock = true;
    this.svc.delete(target.grupo_id || target.id).pipe(finalize(()=>{ this.modalSpinner=false; this.modalBlock=false; try{this.cdr.detectChanges();}catch{} })).subscribe(()=>{
      this.modalVisible=false; this.pendingDelete=null; this.toast.success('Grupo eliminado'); this.load();
    }, (err)=>{
      console.error('delete grupo', err); this.modalTitle='Error'; this.modalMessage='No se pudo eliminar el grupo.'; // keep modal open
    });
  }
}
