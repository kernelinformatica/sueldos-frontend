import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, timeout, catchError, of } from 'rxjs';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ModalAlertaComponent } from '../../shared/modal-alerta.component';
import { environment } from '../../environments/environment';
import { LiquidacionesService } from './liquidaciones.service';
import { Router } from '@angular/router';
@Component({
  selector: 'app-sueldos-listado',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, ModalAlertaComponent],
  templateUrl: './listado.component.html',
  styleUrls: ['./listado.component.scss']
})
export class ListadoComponent implements OnInit {
  loading = false;
  loadingDetail = false;
  savingBulk = false;
  recalculatingLiquidacionId: number | null = null;
  errorMsg = '';
  liquidaciones: any[] = [];
  estadosLiquidaciones: Array<{ estado_liquidacion_id: number; nombre: string; descripcion?: string }> = [];
  selectedLiquidacionIds = new Set<number>();
  detalle: any = null;
  detalleNormalizado: any = null;
  detalleLoadingError = '';
  detalleVisible = false;
  modalVisible = false;
  modalTitle = '';
  modalMessage = '';
  modalIcon = '';
  modalBlock = false;
  modalSpinner = false;
  modalReason = '';
  modalReasonRequired = false;
  private pendingAction:
    | { kind: 'bulk-state'; estadoId: number; tipo: 'revision' | 'cerrada' }
    | { kind: 'single-state'; liquidacionId: number; estadoId: number; tipo: 'revision' | 'cerrada' }
    | { kind: 'bulk-recalculate' }
    | { kind: 'delete'; liquidacionId: number; multi?: boolean }
    | { kind: 'reopen'; liquidacionId: number }
    | { kind: 'annul'; liquidacionId: number }
    | null = null;
  filtros = { periodo: '', empleado: '', tipo: '', estado: '' };
  private empleadoIdFiltro: string = '';

  constructor(private svc: LiquidacionesService, private route: ActivatedRoute, private cdr: ChangeDetectorRef, private router: Router) {}

  ngOnInit(): void {
    this.loadEstados();
    this.route.queryParamMap.subscribe((params) => {
      this.empleadoIdFiltro = String(params.get('empleado_id') || '').trim();
      const empleado = String(params.get('empleado') || '').trim();
      if (this.empleadoIdFiltro || empleado) {
        this.filtros.empleado = empleado || this.filtros.empleado;
      }
      this.load();
    });
  }

  loadEstados(): void {
    this.svc.estadosLiquidaciones().pipe(
      timeout(15000),
      catchError(() => of({ data: [] }))
    ).subscribe((res: any) => {
      const items = Array.isArray(res) ? res : (res?.data || res?.items || []);
      this.estadosLiquidaciones = items.map((item: any) => ({
        estado_liquidacion_id: Number(item.estado_liquidacion_id ?? item.id ?? 0),
        nombre: String(item.nombre ?? item.descripcion ?? 'Estado'),
        descripcion: String(item.descripcion ?? item.detalle ?? '')
      })).filter((item: any) => Number(item.estado_liquidacion_id) > 0);
    });
  }

  load(): void {
    this.loading = true;
    this.errorMsg = '';
    try { this.cdr.detectChanges(); } catch {}

    const params: Record<string, string> = {
      periodo: this.filtros.periodo,
      empleado: this.filtros.empleado,
      tipo: this.filtros.tipo,
      estado: this.filtros.estado
    };
    if (this.empleadoIdFiltro) params['empleado_id'] = this.empleadoIdFiltro;

    this.svc.list(params).pipe(
      timeout(15000),
      catchError((err) => {
        return of({ error: err });
      }),
      finalize(() => {
        this.loading = false;
        try { this.cdr.detectChanges(); } catch {}
      })
    ).subscribe({
      next: (res: any) => {
        if (res && res.error) {
          this.errorMsg = this.extractHttpErrorMessage(res.error, 'No se pudieron cargar las liquidaciones.');
          this.liquidaciones = [];
          try { this.cdr.detectChanges(); } catch {}
          return;
        }

        const items = Array.isArray(res) ? res : (res?.data || res?.items || res?.liquidaciones || []);
        this.liquidaciones = this.applyClientFilters(items);
        this.syncSelectionWithCurrentList();
        this.errorMsg = '';
        try { this.cdr.detectChanges(); } catch {}
      },
      error: (err) => {
        this.errorMsg = this.extractHttpErrorMessage(err, 'No se pudieron cargar las liquidaciones.');
        this.liquidaciones = [];
        try { this.cdr.detectChanges(); } catch {}
      }
    });
  }

  private applyClientFilters(items: any[]): any[] {
    const empleadoFiltro = this.normalize(this.filtros.empleado);
    if (!empleadoFiltro && !this.empleadoIdFiltro) return items;
    return items.filter((item) => {
      const empleadoId = String(item?.empleado_id ?? item?.empleado?.id ?? '').trim();
      const empleadoLabel = this.normalize(`${item?.empleado_label || ''} ${item?.empleado?.apellido || ''} ${item?.empleado?.nombre || ''} ${item?.empleado?.legajo || ''}`);
      if (this.empleadoIdFiltro && empleadoId === this.empleadoIdFiltro) return true;
      if (empleadoFiltro && empleadoLabel.includes(empleadoFiltro)) return true;
      return false;
    });
  }

  get hasSelectedLiquidaciones(): boolean {
    return this.selectedLiquidacionIds.size > 0;
  }

  get allLiquidacionesSelected(): boolean {
    return this.liquidaciones.length > 0 && this.liquidaciones.every((liq) => this.selectedLiquidacionIds.has(this.liquidacionId(liq)));
  }

  get someLiquidacionesSelected(): boolean {
    const selected = this.liquidaciones.some((liq) => this.selectedLiquidacionIds.has(this.liquidacionId(liq)));
    return selected && !this.allLiquidacionesSelected;
  }

  liquidacionId(liquidacion: any): number {
    return Number(liquidacion?.liquidacion_id ?? liquidacion?.id ?? 0);
  }

  formatPeriodo(liquidacion: any): string {
    const value = liquidacion?.periodo;
    if (value) {
      const text = String(value).trim();
      if (!text) return '-';
      const match = text.match(/^(\d{4})[-/](\d{1,2})/);
      if (match) {
        return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
      }
      return text.length >= 7 ? text.slice(0, 7).replace('/', '-') : text.replace('/', '-');
    }

    const anio = liquidacion?.anio;
    const mes = liquidacion?.mes;
    if (anio && mes) {
      return `${anio}-${String(mes).padStart(2, '0')}`;
    }
    return '-';
  }

  formatFecha(liquidacion: any): string {
    const value = liquidacion?.fecha_liquidacion || liquidacion?.fecha || '';
    if (!value) return '-';
    const text = String(value).trim();
    if (!text) return '-';
    return text.length >= 10 ? text.slice(0, 10) : text;
  }

  private normalizePeriodoValue(liquidacion: any): string | null {
    const value = liquidacion?.periodo ?? liquidacion?.liquidacion?.periodo ?? '';
    const text = String(value || '').trim();
    if (text) {
      const match = text.match(/^(\d{4})[-/](\d{1,2})/);
      if (match) {
        return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
      }
      if (/^\d{4}-\d{2}$/.test(text)) return text;
      if (/^\d{4}\/\d{2}$/.test(text)) return text.replace('/', '-');
    }

    const anio = liquidacion?.anio ?? liquidacion?.liquidacion?.anio;
    const mes = liquidacion?.mes ?? liquidacion?.liquidacion?.mes;
    if (anio && mes) {
      return `${anio}-${String(mes).padStart(2, '0')}`;
    }
    return null;
  }

  private normalizeFechaValue(liquidacion: any): string | null {
    const value = liquidacion?.fecha_liquidacion ?? liquidacion?.fecha ?? liquidacion?.liquidacion?.fecha_liquidacion ?? liquidacion?.liquidacion?.fecha ?? '';
    const text = String(value || '').trim();
    if (!text) return null;
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    return text.length >= 10 ? text.slice(0, 10) : text;
  }

  private buildRecalcularPayload(liquidacion: any): any {
    const empleadoId = Number(liquidacion?.empleado_id ?? liquidacion?.empleado?.id ?? 0) || null;
    const empleadoIds = Array.isArray(liquidacion?.empleado_ids)
      ? liquidacion.empleado_ids.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
      : [];

    const payload: any = {
      periodo: this.normalizePeriodoValue(liquidacion),
      fecha_liquidacion: this.normalizeFechaValue(liquidacion)
    };

    if (empleadoIds.length > 1) {
      payload.empleado_ids = empleadoIds;
    } else if (empleadoId) {
      payload.empleado_id = empleadoId;
    }

    const tipoLiquidacionId = Number(liquidacion?.tipo_liquidacion_id ?? liquidacion?.tipo?.id ?? 0) || null;
    if (tipoLiquidacionId) payload.tipo_liquidacion_id = tipoLiquidacionId;

    return payload;
  }

  private buildBulkRecalcularPayload(selectedLiquidaciones: any[]): any | null {
    if (!selectedLiquidaciones.length) return null;

    const first = selectedLiquidaciones[0];
    const periodo = this.normalizePeriodoValue(first);
    const fechaLiquidacion = this.normalizeFechaValue(first);
    const empleadoIds = selectedLiquidaciones
      .map((item) => Number(item?.empleado_id ?? item?.empleado?.id ?? 0))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!periodo || !fechaLiquidacion || !empleadoIds.length) return null;

    return {
      periodo,
      fecha_liquidacion: fechaLiquidacion,
      empleado_ids: Array.from(new Set(empleadoIds))
    };
  }

  isLiquidacionSelected(liquidacion: any): boolean {
    return this.selectedLiquidacionIds.has(this.liquidacionId(liquidacion));
  }

  toggleLiquidacion(liquidacion: any, checked: boolean): void {
    const id = this.liquidacionId(liquidacion);
    if (!id) return;
    if (checked) this.selectedLiquidacionIds.add(id);
    else this.selectedLiquidacionIds.delete(id);
  }

  toggleAllLiquidaciones(checked: boolean): void {
    if (checked) {
      this.liquidaciones
        .filter((liq) => {
          const estado = this.estadoClass(liq);
          return estado === 'edicion' || estado === 'revision';
        })
        .forEach((liq) => this.selectedLiquidacionIds.add(this.liquidacionId(liq)));
      return;
    }
    this.liquidaciones.forEach((liq) => this.selectedLiquidacionIds.delete(this.liquidacionId(liq)));
  }

  clearSelection(): void {
    this.selectedLiquidacionIds.clear();
  }

  cambiarEstadoSeleccionadas(tipo: 'revision' | 'cerrada'): void {
    const estado = this.estadoIdPorTipo(tipo);
    if (!estado || !this.hasSelectedLiquidaciones || this.savingBulk) return;
    const etiqueta = tipo === 'revision' ? 'revisión' : 'cerrada';
    this.pendingAction = { kind: 'bulk-state', estadoId: estado, tipo };
    this.openModal(`Confirmar paso a ${etiqueta}`, `¿Pasar ${this.selectedLiquidacionIds.size} liquidación(es) seleccionada(s) a ${etiqueta}?`, 'bi bi-exclamation-triangle-fill');
  }

  eliminarSeleccionadas(): void {
    if (!this.hasSelectedLiquidaciones || this.savingBulk) return;
    this.pendingAction = { kind: 'delete', liquidacionId: -1, multi: true };
    this.openModal('Confirmar eliminación', `¿Eliminar ${this.selectedLiquidacionIds.size} liquidación(es) seleccionada(s)?`, 'bi bi-trash-fill');
  }

  recalcularSeleccionadas(): void {
    if (!this.hasSelectedLiquidaciones || this.savingBulk || this.recalculatingLiquidacionId) return;

    const selected = this.liquidaciones.filter((liq) => this.selectedLiquidacionIds.has(this.liquidacionId(liq)));
    const payload = this.buildBulkRecalcularPayload(selected);
    if (!payload) {
      this.errorMsg = 'Para recalcular masivo, todas las liquidaciones seleccionadas deben compartir período y fecha_liquidacion válidos.';
      return;
    }

    this.pendingAction = { kind: 'bulk-recalculate' };
    this.modalReason = '';
    this.modalReasonRequired = false;
    this.openModal('Recalcular seleccionadas', `¿Recalcular ${selected.length} liquidación(es) seleccionada(s)?`, 'bi bi-arrow-repeat');
  }

  eliminarLiquidacion(liquidacion: any): void {
    const id = this.liquidacionId(liquidacion);
    if (!id || this.savingBulk) return;
    this.pendingAction = { kind: 'delete', liquidacionId: id, multi: false };
    this.openModal('Confirmar eliminación', '¿Eliminar esta liquidación?', 'bi bi-trash-fill');
  }

  abrirCambioEstadoIndividual(liquidacion: any, tipo: 'revision' | 'cerrada'): void {
    const id = this.liquidacionId(liquidacion);
    const estadoId = this.estadoIdPorTipo(tipo);
    if (!id || !estadoId || this.savingBulk) return;
    this.pendingAction = { kind: 'single-state', liquidacionId: id, estadoId, tipo };
    const etiqueta = tipo === 'revision' ? 'revisión' : 'cerrada';
    this.openModal(`Cambiar a ${etiqueta}`, `¿Pasar esta liquidación a ${etiqueta}?`, 'bi bi-arrow-repeat');
  }

  reabrirLiquidacion(liquidacion: any): void {
    const id = this.liquidacionId(liquidacion);
    if (!id || this.savingBulk) return;
    this.pendingAction = { kind: 'reopen', liquidacionId: id };
    this.modalReason = '';
    this.modalReasonRequired = true;
    this.openModal('Reabrir liquidación', 'Indica el motivo para reabrir esta liquidación.', 'bi bi-arrow-counterclockwise');
  }

  anularLiquidacion(liquidacion: any): void {
    const id = this.liquidacionId(liquidacion);
    if (!id || this.savingBulk) return;
    this.pendingAction = { kind: 'annul', liquidacionId: id };
    this.modalReason = '';
    this.modalReasonRequired = true;
    this.openModal('Anular liquidación', 'Indica el motivo para anular esta liquidación.', 'bi bi-x-circle-fill');
  }

  onModalClose(confirmado: boolean = false): void {
    if (!this.modalVisible) return;
    if (!confirmado) {
      this.modalVisible = false;
      this.pendingAction = null;
      this.modalReason = '';
      this.modalReasonRequired = false;
      return;
    }

    if (this.modalReasonRequired && !String(this.modalReason || '').trim()) {
      this.errorMsg = 'El motivo es obligatorio.';
      return;
    }

    const action = this.pendingAction;
    if (!action) return;

    this.modalSpinner = true;
    this.modalBlock = true;
    this.modalVisible = false;
    switch (action.kind) {
      case 'bulk-state':
        this.executeBulkStateChange(action.estadoId, action.tipo, this.modalReason);
        break;
      case 'single-state':
        this.executeSingleStateChange(action.liquidacionId, action.estadoId, action.tipo, this.modalReason);
        break;
      case 'bulk-recalculate':
        this.executeBulkRecalculate();
        break;
      case 'delete':
        if (action.multi) {
          this.executeBulkDelete(this.modalReason);
        } else {
          this.executeDeleteSingle(action.liquidacionId, this.modalReason);
        }
        break;
      case 'reopen':
        this.executeReopen(action.liquidacionId, this.modalReason);
        break;
      case 'annul':
        this.executeAnnul(action.liquidacionId, this.modalReason);
        break;
    }
  }

  private executeBulkStateChange(estadoLiquidacionId: number, tipo: 'revision' | 'cerrada', razon?: string): void {
    const ids = Array.from(this.selectedLiquidacionIds);
    this.savingBulk = true;
    let pending = ids.length;
    let hadError = false;

    ids.forEach((id) => {
      this.svc.changeEstado(id, estadoLiquidacionId, razon).pipe(
        timeout(15000),
        catchError((err) => of({ error: err }))
      ).subscribe({
        next: (res: any) => {
          pending -= 1;
          if (res?.error && !hadError) {
            hadError = true;
            this.errorMsg = this.extractHttpErrorMessage(res.error, `No se pudo pasar a ${tipo}.`);
          }
          if (pending === 0) {
            this.savingBulk = false;
            this.modalSpinner = false;
            this.modalBlock = false;
            this.load();
          }
        },
        error: (err) => {
          pending -= 1;
          if (!hadError) {
            hadError = true;
            this.errorMsg = this.extractHttpErrorMessage(err, `No se pudo pasar a ${tipo}.`);
          }
          if (pending === 0) {
            this.savingBulk = false;
            this.modalSpinner = false;
            this.modalBlock = false;
            this.load();
          }
        }
      });
    });
  }

  private executeDeleteSingle(id: number, razon?: string): void {
    this.savingBulk = true;
    this.svc.deleteLiquidacion(id, razon).pipe(
      timeout(15000),
      catchError((err) => of({ error: err }))
    ).subscribe({
      next: (res: any) => {
        this.savingBulk = false;
        this.modalSpinner = false;
        this.modalBlock = false;
        this.modalReason = '';
        this.modalReasonRequired = false;
        if (res?.error) {
          this.errorMsg = this.extractHttpErrorMessage(res.error, 'No se pudo eliminar la liquidación.');
          return;
        }
        this.selectedLiquidacionIds.delete(id);
        this.load();
      },
      error: (err) => {
        this.savingBulk = false;
        this.modalSpinner = false;
        this.modalBlock = false;
        this.errorMsg = this.extractHttpErrorMessage(err, 'No se pudo eliminar la liquidación.');
      }
    });
  }

  private executeBulkDelete(razon?: string): void {
    const ids = Array.from(this.selectedLiquidacionIds);
    this.savingBulk = true;
    let pending = ids.length;
    let hadError = false;

    ids.forEach((id) => {
      this.svc.deleteLiquidacion(id, razon).pipe(
        timeout(15000),
        catchError((err) => of({ error: err }))
      ).subscribe({
        next: (res: any) => {
          pending -= 1;
          if (res?.error && !hadError) {
            hadError = true;
            this.errorMsg = this.extractHttpErrorMessage(res.error, 'No se pudo eliminar la liquidación.');
          }
          if (pending === 0) {
            this.savingBulk = false;
            this.modalSpinner = false;
            this.modalBlock = false;
            this.load();
          }
        },
        error: (err) => {
          pending -= 1;
          if (!hadError) {
            hadError = true;
            this.errorMsg = this.extractHttpErrorMessage(err, 'No se pudo eliminar la liquidación.');
          }
          if (pending === 0) {
            this.savingBulk = false;
            this.modalSpinner = false;
            this.modalBlock = false;
            this.load();
          }
        }
      });
    });
  }

  private executeSingleStateChange(liquidacionId: number, estadoLiquidacionId: number, tipo: 'revision' | 'cerrada', razon?: string): void {
    this.savingBulk = true;
    this.svc.changeEstado(liquidacionId, estadoLiquidacionId, razon).pipe(timeout(15000), catchError((err) => of({ error: err }))).subscribe({
      next: (res: any) => {
        this.savingBulk = false;
        this.modalSpinner = false;
        this.modalBlock = false;
        this.modalReason = '';
        this.modalReasonRequired = false;
        if (res?.error) {
          this.errorMsg = this.extractHttpErrorMessage(res.error, `No se pudo pasar a ${tipo}.`);
          return;
        }
        this.load();
        if (this.detalleVisible) this.openDetalle({ liquidacion_id: liquidacionId });
      },
      error: (err) => {
        this.savingBulk = false;
        this.modalSpinner = false;
        this.modalBlock = false;
        this.errorMsg = this.extractHttpErrorMessage(err, `No se pudo pasar a ${tipo}.`);
      }
    });
  }

  private executeBulkRecalculate(): void {
    const selected = this.liquidaciones.filter((liq) => this.selectedLiquidacionIds.has(this.liquidacionId(liq)));
    const payload = this.buildBulkRecalcularPayload(selected);
    if (!payload) {
      this.modalSpinner = false;
      this.modalBlock = false;
      this.errorMsg = 'Para recalcular masivo, todas las liquidaciones seleccionadas deben compartir período y fecha_liquidacion válidos.';
      return;
    }

    this.savingBulk = true;
    this.svc.calcularMensual(payload).pipe(timeout(15000), catchError((err) => of({ error: err }))).subscribe({
      next: (res: any) => {
        this.savingBulk = false;
        this.modalSpinner = false;
        this.modalBlock = false;
        if (res?.error) {
          this.errorMsg = this.extractHttpErrorMessage(res.error, 'No se pudieron recalcular las liquidaciones seleccionadas.');
          return;
        }

        this.load();
        if (this.detalleVisible) {
          const currentId = this.detalleNormalizado?.liquidacion?.liquidacion_id ?? this.detalleNormalizado?.liquidacion?.id ?? this.detalle?.liquidacion?.liquidacion_id ?? this.detalle?.liquidacion?.id;
          if (currentId) this.openDetalle({ liquidacion_id: currentId });
        }
      },
      error: (err) => {
        this.savingBulk = false;
        this.modalSpinner = false;
        this.modalBlock = false;
        this.errorMsg = this.extractHttpErrorMessage(err, 'No se pudieron recalcular las liquidaciones seleccionadas.');
      }
    });
  }

  private executeReopen(liquidacionId: number, razon: string): void {
    this.savingBulk = true;
    this.svc.reabrirLiquidacion(liquidacionId, razon).pipe(timeout(15000), catchError((err) => of({ error: err }))).subscribe({
      next: (res: any) => this.finishStateMutation(res, liquidacionId, 'No se pudo reabrir la liquidación.'),
      error: (err) => this.finishStateMutation({ error: err }, liquidacionId, 'No se pudo reabrir la liquidación.')
    });
  }

  private executeAnnul(liquidacionId: number, razon: string): void {
    this.savingBulk = true;
    this.svc.anularLiquidacion(liquidacionId, razon).pipe(timeout(15000), catchError((err) => of({ error: err }))).subscribe({
      next: (res: any) => this.finishStateMutation(res, liquidacionId, 'No se pudo anular la liquidación.'),
      error: (err) => this.finishStateMutation({ error: err }, liquidacionId, 'No se pudo anular la liquidación.')
    });
  }

  private finishStateMutation(res: any, liquidacionId: number, fallback: string): void {
    this.savingBulk = false;
    this.modalSpinner = false;
    this.modalBlock = false;
    this.modalReason = '';
    this.modalReasonRequired = false;
    if (res?.error) {
      this.errorMsg = this.extractHttpErrorMessage(res.error, fallback);
      return;
    }
    this.selectedLiquidacionIds.delete(liquidacionId);
    this.load();
    if (this.detalleVisible) {
      const current = this.detalleNormalizado?.liquidacion || this.detalle;
      const currentId = Number(current?.liquidacion_id ?? current?.id ?? 0);
      if (currentId === liquidacionId) {
        this.openDetalle({ liquidacion_id: liquidacionId });
      }
    }
  }

  private estadoIdPorTipo(tipo: 'revision' | 'cerrada'): number | null {
    return this.findEstadoId(tipo);
  }

  private findEstadoId(tipo: 'revision' | 'cerrada'): number | null {
    const label = tipo === 'revision' ? 'revision' : 'cerrada';
    const match = this.estadosLiquidaciones.find((estado: any) => this.normalize(`${estado?.nombre || ''} ${estado?.descripcion || ''}`).includes(label));
    return Number(match?.estado_liquidacion_id ?? 0) || null;
  }

  get estadoEdicionId(): number | null { return this.findEstadoIdByName(['edicion', 'edición']); }
  get estadoRevisionId(): number | null { return this.findEstadoIdByName(['revision', 'revisión']); }
  get estadoCerradaId(): number | null { return this.findEstadoIdByName(['cerrada']); }
  get estadoAnuladaId(): number | null { return this.findEstadoIdByName(['anulada']); }

  get canBulkStateChange(): boolean {
    return !!this.estadoRevisionId || !!this.estadoCerradaId;
  }

  estadoInfo(liquidacion: any): { id: number | null; nombre: string; descripcion: string } {
    const estadoId = Number(liquidacion?.estado_liquidacion_id ?? liquidacion?.estado_id ?? liquidacion?.estado?.estado_liquidacion_id ?? liquidacion?.estado?.id ?? 0) || null;
    const estadoCatalogo = estadoId ? this.estadosLiquidaciones.find((estado) => Number(estado.estado_liquidacion_id) === estadoId) : null;
    const fallbackNombre = String(liquidacion?.estado_nombre || liquidacion?.estado || estadoCatalogo?.nombre || 'Borrador');
    const descripcion = String(liquidacion?.estado_descripcion || liquidacion?.estado?.descripcion || estadoCatalogo?.descripcion || '');
    return { id: estadoId, nombre: fallbackNombre, descripcion };
  }

  estadoBadgeLabel(liquidacion: any): string {
    const estado = this.estadoInfo(liquidacion);
    return estado.descripcion ? `${estado.nombre} - ${estado.descripcion}` : estado.nombre;
  }

  estadoClass(liquidacion: any): string {
    const estado = this.estadoInfo(liquidacion);
    const key = this.normalize(`${estado.nombre} ${estado.descripcion}`);
    if (key.includes('cerrada')) return 'cerrada';
    if (key.includes('revision')) return 'revision';
    if (key.includes('edicion')) return 'edicion';
    if (key.includes('anulada')) return 'anulada';
    if (key.includes('calcul')) return 'calculada';
    return 'borrador';
  }

  canRecalcular(liquidacion: any): boolean {
    const estado = this.estadoClass(liquidacion);
    return estado === 'edicion';
  }

  recalcularLiquidacion(liquidacion: any): void {
    if (this.savingBulk || this.recalculatingLiquidacionId) return;

    const liquidacionId = this.liquidacionId(liquidacion);
    if (!liquidacionId) return;

    const payload = {
      liquidacion_id: liquidacionId,
      ...this.buildRecalcularPayload(liquidacion)
    };

    this.recalculatingLiquidacionId = liquidacionId;
    this.svc.calcularMensual(payload).pipe(timeout(15000), catchError((err) => of({ error: err }))).subscribe({
      next: (res: any) => {
        this.recalculatingLiquidacionId = null;
        if (res?.error) {
          this.errorMsg = this.extractHttpErrorMessage(res.error, 'No se pudo recalcular la liquidación.');
          return;
        }

        this.load();
        if (this.detalleVisible) {
          this.openDetalle({ liquidacion_id: liquidacionId });
        }
      },
      error: (err) => {
        this.recalculatingLiquidacionId = null;
        this.errorMsg = this.extractHttpErrorMessage(err, 'No se pudo recalcular la liquidación.');
      }
    });
  }

  isRecalculating(liquidacion: any): boolean {
    return this.recalculatingLiquidacionId === this.liquidacionId(liquidacion);
  }

  canDelete(liquidacion: any): boolean {
    const estado = this.estadoClass(liquidacion);
    return estado === 'edicion';
  }

  canChangeToRevision(liquidacion: any): boolean {
    return this.estadoClass(liquidacion) === 'edicion' && !!this.estadoRevisionId;
  }

  canChangeToCerrada(liquidacion: any): boolean {
    const estado = this.estadoClass(liquidacion);
    return (estado === 'edicion' || estado === 'revision') && !!this.estadoCerradaId;
  }

  canReabrir(liquidacion: any): boolean {
    return this.estadoClass(liquidacion) === 'cerrada' && !!this.estadoEdicionId;
  }

  canAnular(liquidacion: any): boolean {
    return this.estadoClass(liquidacion) === 'cerrada' && !!this.estadoAnuladaId;
  }

  private findEstadoIdByName(names: string[]): number | null {
    const match = this.estadosLiquidaciones.find((estado: any) => names.some((name) => this.normalize(`${estado?.nombre || ''} ${estado?.descripcion || ''}`).includes(this.normalize(name))));
    return Number(match?.estado_liquidacion_id ?? 0) || null;
  }

  openModal(titulo: string, mensaje: string, icono: string): void {
    this.modalTitle = titulo;
    this.modalMessage = mensaje;
    this.modalIcon = icono;
    this.modalVisible = true;
    this.modalSpinner = false;
    this.modalBlock = false;
  }

  private syncSelectionWithCurrentList(): void {
    const validIds = new Set(this.liquidaciones.map((liq) => this.liquidacionId(liq)).filter((id) => Number(id) > 0));
    Array.from(this.selectedLiquidacionIds).forEach((id) => {
      if (!validIds.has(id)) this.selectedLiquidacionIds.delete(id);
    });
  }

  normalize(value: string): string {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[^\w\s]/g, '').replace(/[\u0300-\u036f]/g, '').trim();
  }
  
  openDetalle(liquidacion: any): void {
    const id = Number(liquidacion?.liquidacion_id ?? liquidacion?.id ?? 0);
    if (!id) return;
    this.loadingDetail = true;
    this.detalleVisible = false;
    this.detalleLoadingError = '';
    this.detalle = null;
    this.detalleNormalizado = null;
    try { this.cdr.detectChanges(); } catch {}

    this.svc.detalleBasico(id).pipe(
      timeout(15000),
      catchError((err) => {
        return of({ error: err });
      }),
      finalize(() => {
        this.loadingDetail = false;
        try { this.cdr.detectChanges(); } catch {}
      })
    ).subscribe({
      next: (res: any) => {
        this.loadingDetail = false;
        if (res && res.error) {
          this.detalleLoadingError = this.extractHttpErrorMessage(res.error, 'No se pudo cargar el detalle.');
          this.detalle = null;
          this.detalleVisible = true;
          try { this.cdr.detectChanges(); } catch {}
          return;
        }

        this.detalle = res?.data || res || null;
        this.detalleNormalizado = this.normalizeDetalle(this.detalle, liquidacion);
        this.detalleLoadingError = '';
        this.detalleVisible = true;
        try { this.cdr.detectChanges(); } catch {}
      },
      error: (err) => {
        this.detalle = null;
        this.detalleNormalizado = null;
        this.detalleLoadingError = this.extractHttpErrorMessage(err, 'No se pudo cargar el detalle.');
        this.loadingDetail = false;
        this.detalleVisible = true;
        try { this.cdr.detectChanges(); } catch {}
      }
    });
  }

  get detalleEmpleadoNombre(): string {
    const empleado = this.detalleNormalizado?.empleado;
    return [empleado?.apellido, empleado?.nombre].filter(Boolean).join(' ').trim() || this.detalleNormalizado?.empleado_label || '-';
  }

  get detallePeriodo(): string {
    const raw = String(this.detalleNormalizado?.liquidacion?.periodo || this.detalleNormalizado?.periodo || '').trim();
    if (!raw) return '-';
    const match = raw.match(/^(\d{4})[-/](\d{1,2})$/);
    if (match) {
      return `${match[1]} / ${Number(match[2])}`;
    }
    const yearOnly = raw.match(/^(\d{4})$/);
    if (yearOnly) return `${yearOnly[1]} / -`;
    return raw;
  }

  get detalleEstado(): string {
    return this.detalleNormalizado?.liquidacion?.estado || this.detalleNormalizado?.estado || '-';
  }

  get detalleRequiereRevision(): boolean {
    return !!this.detalleNormalizado?.resumen?.requiere_revision;
  }

  get detalleTotales(): any {
    return this.detalleNormalizado?.resumen || {};
  }
  irAFichaEmpleado(empleadoId: number) {
    if (empleadoId) {
      this.router.navigate(['admin/empleados/editar', empleadoId]);
    }
  }
  get detalleFotoUrl(): string | null {
    return this.resolveEmployeePhoto({
      empleado_foto: this.detalleNormalizado?.empleado_foto,
      foto: this.detalleNormalizado?.empleado?.foto,
      foto_url_publica: this.detalleNormalizado?.empleado?.foto_url_publica,
      url_publica: this.detalleNormalizado?.empleado?.url_publica,
      foto_url: this.detalleNormalizado?.empleado?.foto_url,
      imagen_url: this.detalleNormalizado?.empleado?.imagen_url,
      avatar_url: this.detalleNormalizado?.empleado?.avatar_url,
      photo_url: this.detalleNormalizado?.empleado?.photo_url,
      photoUrl: this.detalleNormalizado?.empleado?.photoUrl
    });
  }

  private normalizeDetalle(data: any, liquidacion: any): any {
    const source = data?.data || data || {};
    const empleado = source?.empleado || source?.empleada || source?.empleado_detalle || source?.persona || liquidacion?.empleado || {};
    const periodoRaw = String(source?.periodo || liquidacion?.periodo || `${liquidacion?.anio || ''}${liquidacion?.anio && liquidacion?.mes ? '-' : ''}${liquidacion?.mes || ''}` || '').trim();
    let periodo = periodoRaw || '-';
    const periodoMatch = periodoRaw.match(/^(\d{4})[-/](\d{1,2})(?:[-/].*)?$/);
    if (periodoMatch) {
      periodo = `${periodoMatch[1]} / ${Number(periodoMatch[2])}`;
    } else {
      const yearOnly = periodoRaw.match(/^(\d{4})$/);
      if (yearOnly) periodo = `${yearOnly[1]} / -`;
    }
    const liquidacionInfo = source?.liquidacion || source?.cabecera || source?.header || {
      periodo,
      estado: source?.estado || liquidacion?.estado || liquidacion?.estado_nombre || '-',
      calculado_en: source?.calculado_en || source?.fecha_calculo || liquidacion?.calculado_en || null
    };

    const resumen = source?.resumen || source?.totales || source?.summary || {
      requiere_revision: !!(source?.requiere_revision || source?.requiereRevision || liquidacion?.requiere_revision),
      total_haberes: source?.total_haberes ?? source?.haberes ?? liquidacion?.total_haberes ?? 0,
      total_descuentos: source?.total_descuentos ?? source?.descuentos ?? liquidacion?.total_descuentos ?? 0,
      total_neto: source?.total_neto ?? source?.neto ?? liquidacion?.total_neto ?? 0,
      total_costo_empresa: source?.total_costo_empresa ?? source?.costo_empresa ?? liquidacion?.total_costo_empresa ?? 0
    };

    const detalle = Array.isArray(source?.detalle) ? source.detalle : (Array.isArray(source?.items) ? source.items : []);
    const meta = source?.meta || {
      cantidad_conceptos: detalle.length,
      cantidad_conceptos_con_revision: detalle.filter((item: any) => !!item?.requiere_revision).length
    };

    return {
      empleado,
      empleado_foto: source?.empleado_foto
        || source?.empleado?.foto
        || source?.empleado?.foto_url_publica
        || source?.empleado?.url_publica
        || source?.empleado?.foto_url
        || source?.empleado?.imagen_url
        || source?.empleado?.avatar_url
        || source?.empleado?.photo_url
        || source?.empleado?.photoUrl
        || liquidacion?.empleado_foto
        || liquidacion?.empleado?.foto
        || liquidacion?.empleado?.foto_url_publica
        || liquidacion?.empleado?.url_publica
        || liquidacion?.empleado?.foto_url
        || liquidacion?.empleado?.imagen_url
        || liquidacion?.empleado?.avatar_url
        || liquidacion?.empleado?.photo_url
        || liquidacion?.empleado?.photoUrl
        || empleado?.foto
        || empleado?.foto_url_publica
        || empleado?.url_publica
        || empleado?.foto_url
        || empleado?.imagen_url
        || empleado?.avatar_url
        || empleado?.photo_url
        || empleado?.photoUrl
        || null,
      empleado_label: source?.empleado_label || source?.empleado_nombre || liquidacion?.empleado_nombre || liquidacion?.nombre,
      empleado_nombre: source?.empleado_nombre || liquidacion?.empleado_nombre || empleado?.nombre || liquidacion?.nombre,
      empleado_apellido: source?.empleado_apellido || liquidacion?.empleado_apellido || empleado?.apellido || liquidacion?.apellido,
      liquidacion: liquidacionInfo,
      resumen,
      meta,
      detalle
    };
  }

  private extractHttpErrorMessage(err: any, fallback: string): string {
    if (err?.name === 'TimeoutError') {
      return 'El servidor está tardando demasiado en responder dándonos timeout. Volvé a intentar.';
    }
    const payload = err?.error;
    if (typeof payload === 'string' && payload.trim()) {
      const text = payload.trim();
      if (text.includes('Cannot GET') || text.startsWith('<!DOCTYPE html>') || text.startsWith('<html')) {
        return 'No se pudo cargar el detalle de la liquidación porque el backend no expone ese recurso.';
      }
      return text;
    }
    if (payload && typeof payload === 'object') {
      const candidates = [
        payload.mensaje,
        payload.message,
        payload.error,
        payload.detail,
        payload.descripcion,
        payload.title
      ].filter((value) => typeof value === 'string' && value.trim());
      if (candidates.length) return String(candidates[0]).trim();
      if (Array.isArray(payload.errors) && payload.errors.length) {
        const firstError = payload.errors.find((item: any) => typeof item === 'string' && item.trim()) || payload.errors[0];
        if (typeof firstError === 'string' && firstError.trim()) return firstError.trim();
        if (firstError && typeof firstError === 'object') {
          return String(firstError.message || firstError.mensaje || firstError.detail || fallback).trim();
        }
      }
    }

    const status = Number(err?.status ?? 0);
    if (status >= 400 && status < 500) return `Error ${status}: no se puede completar la operación actual.`;
    if (status >= 500) return `Error ${status}: falló el servidor al procesar la lista.`;
    return err?.message || fallback;
  }

  employeePhotoUrl(liquidacion: any): string | null {
    return this.resolveEmployeePhoto({
      empleado_foto: liquidacion?.empleado_foto,
      foto: liquidacion?.empleado?.foto || liquidacion?.foto,
      foto_url_publica: liquidacion?.empleado?.foto_url_publica,
      url_publica: liquidacion?.empleado?.url_publica,
      imagen_url: liquidacion?.empleado?.imagen_url,
      avatar_url: liquidacion?.empleado?.avatar_url
    });
  }

  private resolveEmployeePhoto(source: any): string | null {
    const candidate = source?.empleado_foto
      || source?.foto_preview_url
      || source?.fotoPreviewUrl
      || source?.foto_url_publica
      || source?.url_publica
      || source?.foto
      || source?.foto_url
      || source?.imagen_url
      || source?.avatar_url
      || source?.photo_url
      || source?.photoUrl;
    if (!candidate || typeof candidate !== 'string') return null;
    const value = candidate.trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (value.startsWith('assets/')) return value;
    const base = String(environment.apiUrl || '').replace(/\/$/, '');
    const path = value.startsWith('/') ? value : `/${value}`;
    return base ? `${base}${path}` : value;
  }

  detalleNombreCompleto(): string {
    const apellido = this.detalleNormalizado?.empleado_apellido || this.detalleNormalizado?.empleado?.apellido || '';
    const nombre = this.detalleNormalizado?.empleado_nombre || this.detalleNormalizado?.empleado?.nombre || '';
    return [apellido, nombre].filter(Boolean).join(' ').trim() || this.detalleNormalizado?.empleado_label || '-';
  }

  imprimirDetalle(liquidacion?: any): void {
    this.openDetalleEnVentana('print', liquidacion);
  }

  descargarDetallePdf(liquidacion?: any): void {
    this.openDetalleEnVentana('pdf', liquidacion);
  }

  private openDetalleEnVentana(mode: 'print' | 'pdf', liquidacion?: any): void {
    const detalleBase = liquidacion ? this.normalizeDetalle(this.detalle || liquidacion, liquidacion) : this.detalleNormalizado;
    if (!detalleBase || this.loadingDetail) return;

    const conceptos = Array.isArray(detalleBase?.detalle) ? detalleBase.detalle : [];
    const html = `
      <html>
        <head>
          <title>Recibo de liquidación</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { font-size: 20px; margin: 0 0 8px; }
            .meta { margin-bottom: 18px; color: #475569; font-size: 13px; }
            .box { border: 1px solid #dbe2ea; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
            .row { margin: 6px 0; }
            .label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; margin-bottom: 2px; }
            .value { font-size: 14px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; }
            .right { text-align: right; }
            .footer { margin-top: 18px; font-size: 11px; color: #64748b; }
            @media print { body { margin: 12mm; } }
          </style>
        </head>
        <body>
          <h1>Recibo de liquidación</h1>
          <div class="meta">${this.escapeHtml(detalleBase.empleado_label || this.detalleNombreCompleto())} | ${this.escapeHtml(this.detallePeriodo)} | ${this.escapeHtml(this.detalleEstado)}</div>
          <div class="box">
            <div class="grid">
              <div class="row"><span class="label">Empleado</span><span class="value">${this.escapeHtml(detalleBase.empleado_label || this.detalleNombreCompleto())}</span></div>
              <div class="row"><span class="label">Periodo de liquidación</span><span class="value">${this.escapeHtml(this.detallePeriodo)}</span></div>
              <div class="row"><span class="label">Estado</span><span class="value">${this.escapeHtml(this.detalleEstado)}</span></div>
              <div class="row"><span class="label">Revisión</span><span class="value">${this.detalleRequiereRevision ? 'Sí' : 'No'}</span></div>
            </div>
          </div>
          <div class="box">
            <div class="grid">
              <div class="row"><span class="label">Total haberes</span><span class="value">${this.formatMoney(this.detalleTotales?.total_haberes)}</span></div>
              <div class="row"><span class="label">Total descuentos</span><span class="value">${this.formatMoney(this.detalleTotales?.total_descuentos)}</span></div>
              <div class="row"><span class="label">Total neto</span><span class="value">${this.formatMoney(this.detalleTotales?.total_neto)}</span></div>
              <div class="row"><span class="label">Costo empresa</span><span class="value">${this.formatMoney(this.detalleTotales?.total_costo_empresa)}</span></div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Fórmula</th>
                <th>Tipo</th>
                <th class="right">Original</th>
                <th class="right">Importe</th>
                <th class="right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              ${conceptos.map((item: any) => `
                <tr>
                  <td><strong>${this.escapeHtml(String(item?.codigo_concepto || '-'))}</strong><br>${this.escapeHtml(String(item?.nombre_concepto || '-'))}</td>
                  <td>${this.escapeHtml(String(item?.formula_tipo || item?.formula_tipo_id || '-'))}</td>
                  <td><span class="receipt-flag ${String(item?.suma_resta ?? '').toUpperCase() === 'R' ? 'receipt-flag-resta' : 'receipt-flag-suma'}">${String(item?.suma_resta ?? '').toUpperCase() === 'R' ? 'Resta' : 'Suma'}</span></td>
                  <td class="right">${this.formatMoney(item?.importe_original)}</td>
                  <td class="right">${this.formatMoney(item?.importe)}</td>
                  <td class="right">${this.formatQuantity(item?.cantidad ?? 1)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="footer">Generado el ${new Date().toLocaleString('es-AR')}</div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      this.errorMsg = 'El navegador bloqueó la apertura de la ventana de impresión.';
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.onload = () => {
      win.print();
      if (mode === 'pdf') {
        setTimeout(() => win.close(), 300);
      }
    };
  }

  private formatMoney(value: any): string {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';
  }

  private formatQuantity(value: any): string {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '0';
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}