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
  unidades?: number | string | null;
  formula_tipo?: { formula_tipo_id?: number; codigo?: string; nombre?: string; descripcion?: string } | null;
  formula_tipo_id?: number | null;
  grupo?: { grupo_id?: number; nombre?: string; descripcion?: string; codigo?: string; orden?: number; permite_importe_fijo?: number | boolean; es_default_sistema?: number | boolean } | null;
  tipo_concepto?: { tipo_concepto_id?: number; codigo?: string; descripcion?: string; prioridad?: number } | null;
  suma_resta?: string | null;
  es_sueldo_basico?: number | boolean | null;
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

  @Output() asignar = new EventEmitter<{ empleadoId: number; conceptoId: number; importeFijo?: number | null; unidades?: number | null }>();
  @Output() quitar = new EventEmitter<{ empleadoId: number; conceptoId: number }>();
  @Output() cerrar = new EventEmitter<void>();

  seleccionId: number | null | undefined = null;
  selectedConcepto: ConceptoItem | null = null;
  hoverId: number | null | undefined = null;
  importeFijo: string = '';
  unidades: string = '1';
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
    this.selectedConcepto = item;
    this.importeFijo = this.normalizeAmount(item.importe_fijo);
    this.unidades = this.normalizeUnits(item.unidades);
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
          formula_tipo: it.formula_tipo ?? null,
          formula_tipo_id: it.formula_tipo_id ?? null,
          grupo: it.grupo ?? null,
          tipo_concepto: it.tipo_concepto ?? null,
          suma_resta: it.suma_resta ?? null,
          es_sueldo_basico: it.es_sueldo_basico ?? null,
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
    this.asignar.emit({ empleadoId: this.empleadoId, conceptoId: this.seleccionId, importeFijo: this.getImporteFijoToSend(), unidades: this.getUnidadesToSend() });
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

  get isFormulaFijo(): boolean {
    const ft = this.selectedConcepto?.formula_tipo;
    const code = String(ft?.codigo ?? ft?.nombre ?? ft?.descripcion ?? this.selectedConcepto?.nombre ?? '').trim().toUpperCase();
    return code === 'FIJO' || code.includes('FIJO');
  }

  get canEditImporteFijo(): boolean {
    return !!this.selectedConcepto && this.isFormulaFijo;
  }

  get canEditUnidades(): boolean {
    return !!this.selectedConcepto && this.isFormulaFijo;
  }

  private normalizeAmount(value: any): string {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) && n >= 0 ? String(n) : '';
  }

  private getImporteFijoToSend(): number | null {
    if (!this.canEditImporteFijo) return null;
    const raw = String(this.importeFijo || '').trim();
    if (!raw) return null;
    const value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
  }

  private normalizeUnits(value: any): string {
    if (value === null || value === undefined || value === '') return '1';
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) && n > 0 ? String(n) : '1';
  }

  private getUnidadesToSend(): number | null {
    if (!this.canEditUnidades) return null;
    const raw = String(this.unidades || '').trim();
    if (!raw) return null;
    const value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }

  ngOnDestroy(): void {
    if (this.searchTimer) { clearTimeout(this.searchTimer); }
    if (this.searchSub) { try { this.searchSub.unsubscribe(); } catch {} }
  }
}
