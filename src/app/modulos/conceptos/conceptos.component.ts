import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { LoadingService } from '../../shared/loading-spinner/loading.service';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { ToastService } from '../../core/toast.service';
import { finalize } from 'rxjs/operators';
import { ConceptosService } from './conceptos.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-conceptos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './conceptos.component.html',
  styleUrls: ['./conceptos.component.scss']
})
export class ConceptosComponent implements OnInit {
  conceptos: any[] = [];
  loading = false;
  filtros = { nombre: '', tipo: '' };
  conceptTipos: any[] = [];



  // modal state for deletion confirmation
  modalVisible = false;
  modalTitle = '';
  modalMessage = '';
  modalIcon = '';
  modalSpinner = false;
  modalBlock = false;
  private pendingDelete: any = null;

  constructor(private svc: ConceptosService, private cdr: ChangeDetectorRef, private auth: AuthService, private loadingService: LoadingService, private toast: ToastService, private router: Router) {}

  ngOnInit(): void {
    this.loadConceptos();
  }

  loadConceptos() {
    this.loading = true;
    this.loadingService.show();
    this.svc.list()
      .pipe(finalize(() => {
        this.loading = false;
        try { this.cdr.detectChanges(); } catch {}
        this.loadingService.hide();
      }))
      .subscribe((res: any) => {
        this.conceptos = Array.isArray(res) ? res : (res?.data || []);
        // extraer tipos
        const tipos = new Map<string, any>();
        (this.conceptos || []).forEach((c: any) => {
          const t = c?.tipo_concepto;
          const key = t ? String(t.tipo_concepto_id ?? t.codigo ?? t.nombre) : '';
        if (key && !tipos.has(key)) tipos.set(key, { id: key, nombre: t?.nombre || t?.codigo || key });
        });
        this.conceptTipos = Array.from(tipos.values());
        // Load topes for each concepto (cached) and compute a summary for UI
        (this.conceptos || []).forEach((c: any) => {
          const id = Number(c.concepto_id ?? c.id ?? c.conceptoId);
          if (!id) return;
          this.svc.getTopes(id).subscribe((topes: any[]) => {
            c.topes = toplesOrEmpty(topes);
            c.topeSummary = computeTopesSummary(c.topes, c);
            try { this.cdr.detectChanges(); } catch {}
          });
        });
      }, (err) => { console.error('Error cargando conceptos', err); });
  }

  formulaTipoLabel(concepto: any): string {
    const ft = concepto?.formula_tipo;
    if (!ft) return '-';
    const codigo = ft?.codigo ?? ft?.clave ?? '';
    const nombre = ft?.nombre ?? ft?.descripcion ?? ft?.label ?? '';
    const id = ft?.formula_tipo_id ?? ft?.id ?? concepto?.formula_tipo_id ?? null;
    const left = codigo ? String(codigo) : (id !== null && id !== undefined ? String(id) : '');
    const right = nombre ? String(nombre) : '';
    return [left, right].filter(Boolean).join(' - ') || '-';
  }

  get conceptosFiltrados() {
    const q = (this.filtros.nombre || '').toString().trim().toLowerCase();
    const tipo = (this.filtros.tipo || '').toString().trim();
    return (this.conceptos || []).filter((c: any) => {
      if (q) {
        const name = ((c.nombre || c.descripcion || c.codigo) + '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (tipo) {
        const key = String(c?.tipo_concepto?.tipo_concepto_id ?? c?.tipo_concepto?.codigo ?? c?.tipo_concepto?.nombre ?? '');
        if (key !== tipo) return false;
      }
      return true;
    });
  }

  get canView(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'conceptos' : p?.alias === 'conceptos')); } catch { return false; }
  }

  get canCreate(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'conceptos_agregar' : p?.alias === 'conceptos_agregar')); } catch { return false; }
  }

  get canEdit(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'conceptos_editar' : p?.alias === 'conceptos_editar')); } catch { return false; }
  }

  get canDelete(): boolean {
    try { const perms = this.auth.getPermissions() || []; return Array.isArray(perms) && perms.some((p:any) => (typeof p === 'string' ? p === 'conceptos_borrar' : p?.alias === 'conceptos_borrar')); } catch { return false; }
  }

  createConcepto() {
    if (!this.canCreate) return alert('Sin permisos para crear conceptos');
    // placeholder: abrir modal/route para crear
    alert('Crear concepto - UI pendiente');
  }

  editConcepto(c: any) {
    if (!this.canEdit) return alert('Sin permisos para editar conceptos');
    const id = c?.concepto_id || c?.id;
    if (!id) return;
    // navigate to the alta route reusing the form; pass id as query param so the form loads the concept
    this.router.navigate(['/admin/conceptos/alta'], { queryParams: { id } });
  }

  deleteConcepto(c: any) {
    if (!this.canDelete) {
      // show modal with permission error
      this.modalTitle = 'Sin permisos';
      this.modalMessage = 'No tiene permisos para eliminar conceptos.';
      this.modalIcon = 'bi bi-lock-fill';
      this.modalVisible = true;
      this.modalSpinner = false;
      this.modalBlock = false;
      return;
    }
    // open confirm modal
    this.pendingDelete = c;
    this.modalTitle = 'Confirmar eliminación';
    this.modalMessage = `Confirma eliminar el concepto "<strong>${(c?.nombre || c?.codigo || '')}</strong>"?`;
    this.modalIcon = 'bi bi-trash3-fill';
    this.modalVisible = true;
    this.modalSpinner = false;
    this.modalBlock = false;
  }

  onModalClose(confirmado: boolean = false) {
    if (!this.modalVisible) return;
    if (!confirmado) {
      // just close
      this.modalVisible = false;
      this.pendingDelete = null;
      return;
    }
    // proceed with deletion
    const target = this.pendingDelete;
    if (!target) { this.modalVisible = false; return; }
    this.modalSpinner = true;
    this.modalBlock = true;
    // call delete, ensure spinner/block cleared in finalize
    this.svc.delete(target?.concepto_id || target?.id).pipe(finalize(() => {
      this.modalSpinner = false;
      this.modalBlock = false;
      try { this.cdr.detectChanges(); } catch {}
    })).subscribe(() => {
      this.modalVisible = false;
      this.pendingDelete = null;
      this.toast.success('Concepto eliminado correctamente');
      this.loadConceptos();
    }, (err) => {
      console.error('delete error', err);
      // show backend message if present
      const backendMsg = err?.error?.message || err?.message || null;
      this.modalTitle = 'Error eliminando';
      this.modalMessage = 'No se pudo eliminar el concepto. Intente nuevamente.' + (backendMsg ? ('<br/>' + backendMsg) : '');
      this.modalIcon = 'bi bi-x-circle-fill';
      // keep modalVisible true so user can click OK
    });
  }
}


function toplesOrEmpty(t: any) { return Array.isArray(t) ? t : (t?.data || []); }

function computeTopesSummary(topes: any[], concepto: any) {
  if (!Array.isArray(topes) || topes.length === 0) return null;
  const severity: Record<string, number> = { 'reject': 3, 'clamp': 2, 'warn': 1 };
  const sorted = [...topes].filter(t => t?.activo == 1 || t?.activo === 1).sort((a: any, b: any) => {
    const pa = (a?.concepto_id ? 3 : (a?.grupo_id ? 2 : 1));
    const pb = (b?.concepto_id ? 3 : (b?.grupo_id ? 2 : 1));
    if (pa !== pb) return pb - pa;
    const sa = severity[String(a?.accion)] ?? 0;
    const sb = severity[String(b?.accion)] ?? 0;
    if (sa !== sb) return sb - sa;
    return Number(b?.valor ?? 0) - Number(a?.valor ?? 0);
  });
  const top = sorted[0];
  if (!top) return null;
  const unitLabel = (top.unidad === 'porcentaje') ? '%' : '$';
  const valor = Number(top.valor ?? 0);
  return {
    tope: top,
    action: top.accion,
    tipo: top.tipo,
    display: `${top.tipo?.toUpperCase?.() || (top.tipo || '').toString().toUpperCase()} ${unitLabel} ${formatNumber(valor, top.unidad)} — ${top.accion}`
  };
}

function formatNumber(n: number, unidad?: string) {
  try { if (unidad === 'porcentaje') return (Number(n) || 0) + '%'; return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n); } catch { return String(n); }
}
