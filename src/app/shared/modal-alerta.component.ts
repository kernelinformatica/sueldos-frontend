import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal-alerta',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-backdrop" *ngIf="visible" (click)="onBackdropClick()"></div>
    <div class="modal-container" *ngIf="visible">
      <div class="modal-content">
        <div class="modal-header">
          <span *ngIf="icono" class="modal-icono" [ngClass]="icono" [style.color]="accentColor" style="margin-right:0.7em;font-size:1.3em;"></span>
          <span class="modal-title">{{ titulo }}</span>
          <button class="modal-close" (click)="onClose()" [disabled]="bloquearCierre">&times;</button>
        </div>
        <div class="modal-body">
          <ng-content></ng-content>
          <div *ngIf="mensaje" [innerHTML]="mensaje"></div>
          <div *ngIf="mostrarSpinner" class="modal-spinner-wrap" aria-live="polite" aria-busy="true">
            <div class="modal-spinner"></div>
            <div class="modal-spinner-text">{{ textoSpinner || 'Procesando...' }}</div>
          </div>
        </div>
        <div class="modal-footer" *ngIf="!mostrarSpinner">
          <ng-container *ngIf="esConfirmacion; else soloOk">
            <button class="modal-btn-ok" [style.marginRight]="'1.2em'" [style.minWidth]="'90px'" [style.background]="buttonColor" (click)="onClose(true)">Aceptar</button>
            <button class="modal-btn-ok" style="background:#bbb;color:#222;min-width:90px;" (click)="onClose(false)">Cancelar</button>
          </ng-container>
          <ng-template #soloOk>
            <button class="modal-btn-ok" [style.background]="buttonColor" (click)="onClose()">OK</button>
          </ng-template>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.25);
      z-index: 1000;
      animation: fadeIn 0.2s;
    }
    .modal-container {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1001;
      pointer-events: none;
    }
    .modal-content {
      background: #fff;
      border-radius: 12px;
      width: 50vw;
      min-width: 320px;
      max-width: 480px;
      margin: 0 auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      animation: slideDown 0.35s cubic-bezier(.23,1.01,.32,1);
      pointer-events: all;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .modal-header {
      padding: 1.1em 1.5em 0.7em 1.5em;
      font-size: 1.18em;
      font-weight: 600;
      color: #222;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #eee;
    }
    .modal-title {
      flex: 1;
    }
    .modal-close {
      background: none;
      border: none;
      font-size: 1.5em;
      color: #888;
      cursor: pointer;
      margin-left: 1em;
      transition: color 0.2s;
    }
    .modal-close:hover {
      color: #d32f2f;
    }
    .modal-close:disabled {
      color: #c7c7c7;
      cursor: not-allowed;
    }
    .modal-body {
      padding: 1.2em 1.5em 1.2em 1.5em;
      font-size: 1.05em;
      color: #444;
      min-width: 200px;
      text-align: left;
    }
    .modal-spinner-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.8em;
      margin-top: 1.2em;
    }
    .modal-spinner {
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 50%;
      border: 4px solid #d1e7dd;
      border-top-color: #198754;
      animation: spin 0.9s linear infinite;
    }
    .modal-spinner-text {
      color: #155724;
      font-size: 0.96em;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .modal-footer {
      padding: 0.7em 1.5em 1.1em 1.5em;
      display: flex;
      justify-content: center;
      border-top: 1px solid #eee;
    }
    .modal-btn-ok {
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0.5em 1.5em;
      font-size: 1em;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(25,135,84,0.08);
      transition: background 0.2s;
    }
    .modal-btn-ok:hover {
      filter: brightness(0.88);
    }
    .modal-icono { display: inline-flex; align-items: center; vertical-align: middle; }
    @keyframes slideDown {
      0% { transform: translateY(-60px) scale(0.98); opacity: 0; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes fadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class ModalAlertaComponent {
  @Input() visible = false;
  @Input() titulo = '';
  @Input() mensaje = '';
  @Input() icono: string = '';
  @Input() esConfirmacion: boolean = false;
  @Input() mostrarSpinner: boolean = false;
  @Input() textoSpinner = '';
  @Input() bloquearCierre: boolean = false;
  @Input() accentColor = '#198754';
  @Input() buttonColor = '#198754';
  @Output() cerrar = new EventEmitter<boolean>();

  onClose(confirmado: boolean = false) {
    if (this.bloquearCierre) {
      return;
    }
    this.cerrar.emit(confirmado);
  }

  onBackdropClick() {
    if (this.bloquearCierre) {
      return;
    }
    this.onClose();
  }
}
