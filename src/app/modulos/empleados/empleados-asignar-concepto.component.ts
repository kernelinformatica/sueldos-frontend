import { Component, EventEmitter, Input, Output, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, tap, filter, catchError } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmpleadosConceptosService } from './empleados-conceptos.service';

interface ConceptoItem {
  id?: number;
  nombre?: string;
  codigo?: string;
  descripcion?: string | null;
  detalle?: string | null;
  importe_fijo?: string | number | null;
  alreadyAssigned?: boolean;
}

@Component({
  selector: 'app-empleados-asignar-concepto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './empleados-asignar-concepto.component.html',
  styleUrls: ['./empleados-asignar-concepto.component.scss']
})
export class EmpleadosAsignarConceptoComponent {
  @Input() empleadoId: number | null = null;
  @Input() conceptosDisponibles: ConceptoItem[] = [];
  @Input() conceptosAsignados: ConceptoItem[] = [];

  @Output() asignar = new EventEmitter<{ empleadoId: number; conceptoId: number }>();
  @Output() quitar = new EventEmitter<{ empleadoId: number; conceptoId: number }>();
  @Output() cerrar = new EventEmitter<void>();

  seleccionId: number | null | undefined = null;
  hoverId: number | null | undefined = null;
  // búsqueda
  searchTerm = '';
  searchResults: ConceptoItem[] = [];
  searching = false;
  showResults = false;
  private searchTimer: any = null;
  private search$ = new Subject<string>();
  private searchSub: any = null;

  trackById(_: number, item: ConceptoItem) {
    return item.id ?? 0;
  }

  onSelectResult(item: ConceptoItem) {
    // don't allow selecting an already assigned concepto
    if ((item as any).alreadyAssigned) { this.seleccionId = null; return; }
    this.seleccionId = item.id ?? null;
    // put the selected name into the input so user can confirm and press Asignar
    this.searchTerm = item.nombre ?? this.searchTerm;
    // hide expanded results after selection for cleaner UX
    this.showResults = false;
    try { this.cdr.detectChanges(); } catch {}
  }

  onHover(id: number | null | undefined) {
    this.hoverId = id;
    try { this.cdr.detectChanges(); } catch {}
  }

  constructor(private conceptosSvc: EmpleadosConceptosService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // flujo de búsqueda: debounce, evitar duplicados, cancelar solicitudes previas
    this.searchSub = this.search$.pipe(
      debounceTime(220),
      distinctUntilChanged(),
      tap((q) => {
        if (!q || q.length < 2) {
          this.searchResults = [];
          this.showResults = false;
        }
      }),
      filter((q) => !!q && q.length >= 2),
      tap(() => { this.searching = true; this.showResults = false; try { this.cdr.detectChanges(); } catch {} }),
      switchMap((q) => this.conceptosSvc.getConceptosDisponibles({ q }).pipe(catchError(() => of({ items: [] }))))
    ).subscribe((res: any) => {
      const arr = Array.isArray(res?.items) ? res.items : [];
      const assignedIds = new Set((this.conceptosAsignados ?? []).map((c: any) => c.id ?? c.concepto_id ?? null));
      this.searchResults = arr.map((it: any) => {
        const id = it.concepto_id ?? it.id ?? null;
        return ({
          id,
          nombre: it.descripcion ?? it.detalle ?? it.nombre ?? String(id ?? ''),
          codigo: it.codigo ?? '',
          descripcion: it.descripcion ?? null,
          detalle: it.detalle ?? null,
          importe_fijo: it.importe_fijo ?? null,
          alreadyAssigned: assignedIds.has(id)
        });
      });
      this.searching = false;
      this.showResults = true;
      try { this.cdr.detectChanges(); } catch {}
    });
  }

  onAsignar() {
    if (!this.empleadoId || !this.seleccionId) { return; }
    // Prevent assigning if the selected concepto is already assigned
    const sel = this.searchResults.find(s => s.id === this.seleccionId as any);
    if (sel && (sel as any).alreadyAssigned) { return; }
    this.asignar.emit({ empleadoId: this.empleadoId, conceptoId: this.seleccionId });
  }

  onQuitar(concepto: ConceptoItem) {
    if (!this.empleadoId || !concepto.id) { return; }
    this.quitar.emit({ empleadoId: this.empleadoId, conceptoId: concepto.id });
  }

  onClose() {
    try { this.cerrar.emit(); } catch {}
  }

  onSearchInput() {
    // push term into subject for debounced handling
    this.search$.next(String(this.searchTerm || '').trim());
  }

  ngOnDestroy(): void {
    if (this.searchTimer) { clearTimeout(this.searchTimer); }
    if (this.searchSub) { try { this.searchSub.unsubscribe(); } catch {} }
  }
}
