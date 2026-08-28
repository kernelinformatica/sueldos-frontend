import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { GruposService } from './grupos.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ToastService } from '../../core/toast.service';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';

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
  asignaciones: any[] = [];

  modalVisible = false; modalTitle=''; modalMessage=''; modalSpinner=false; modalBlock=false; pendingDelete:any=null;

  constructor(private fb: FormBuilder, private svc: GruposService, private route: ActivatedRoute, private router: Router, private toast: ToastService, private cdr: ChangeDetectorRef) {
    this.form = this.fb.group({
      grupo_id: [null], empresa_id: [1], codigo: [null], alias: ['', Validators.required], nombre: ['', Validators.required], descripcion: [''], comentario: [''], permite_importe_fijo: [0], orden: [0]
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParams['id'] || 0);
    if (id) { this.load(id); }
  }

  load(id:number) {
    this.loading = true;
    this.svc.get(id).pipe(finalize(()=>{ this.loading=false; try{this.cdr.detectChanges();}catch{} })).subscribe((res:any)=>{
      const g = res?.data || res;
      this.form.patchValue(g || {});
      this.grupoId = g?.grupo_id || g?.id || null;
      this.loadAsignaciones();
    }, (err)=>{ console.error('load grupo', err); });
  }

  loadAsignaciones() {
    if (!this.grupoId) return;
    this.svc.listAsignaciones(this.grupoId).subscribe((res:any)=>{ this.asignaciones = Array.isArray(res) ? res : (res?.data || []); try{this.cdr.detectChanges();}catch{} }, (err)=>{ console.error('asign', err); });
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    const payload = this.form.value;
    const op = this.grupoId ? this.svc.update(this.grupoId, payload) : this.svc.create(payload);
    op.pipe(finalize(()=>{ this.loading=false; try{this.cdr.detectChanges();}catch{} })).subscribe((res:any)=>{ this.toast.success('Guardado'); this.router.navigate(['/admin/conceptos/grupos']); }, (err)=>{ console.error('save', err); this.toast.error('Error guardando'); });
  }

  addAsignacion(conceptoId:number) {
    if (!this.grupoId) return;
    this.svc.assignConcepto(this.grupoId, conceptoId).subscribe(()=>{ this.loadAsignaciones(); this.toast.success('Asignado'); }, (err)=>{ console.error(err); this.toast.error('Error asignando'); });
  }

  confirmRemoveAsignacion(det:any) { this.pendingDelete = det; this.modalTitle='Confirmar'; this.modalMessage='Quitar asignación?'; this.modalVisible=true; }
  onModalClose(confirm=false){ if(!confirm){ this.modalVisible=false; this.pendingDelete=null; return; } this.svc.removeAsignacion(this.pendingDelete?.id || this.pendingDelete?.detalle_id).subscribe(()=>{ this.toast.success('Eliminado'); this.loadAsignaciones(); this.modalVisible=false; this.pendingDelete=null; }, (err)=>{ console.error(err); this.toast.error('Error eliminando'); }); }
}
