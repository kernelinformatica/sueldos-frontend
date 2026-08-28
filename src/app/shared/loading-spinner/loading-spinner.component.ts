import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from './loading.service';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="spinner-backdrop" *ngIf="(visible !== null ? visible : (ls.isVisible | async))" [ngStyle]="{'background': 'rgba(0,0,0,' + backdropOpacity + ')'}">
      <div class="spinner-box" [class.spinner-centered]="centered" [ngStyle]="{'padding': (size*0.7) + 'px ' + (size*0.9) + 'px'}">
        <div class="spinner-ring" aria-hidden="true" [ngStyle]="{ 'width.px': size, 'height.px': size, 'border-top-color': ringColor, 'border-width.px': borderWidth }"></div>
        <div class="spinner-label">{{ text || 'Cargando...' }}</div>
      </div>
    </div>
  `,
  styles: [
    `:host { position: fixed; inset: 0; pointer-events: none; z-index: 9999; }
    .spinner-backdrop { position: absolute; inset: 0; display:flex; align-items:center; justify-content:center; pointer-events: none; }
    .spinner-box { background: #fff; border-radius: 10px; display:flex; gap:12px; align-items:center; box-shadow: 0 6px 18px rgba(0,0,0,0.12); pointer-events:auto; }
    .spinner-ring { border:4px solid #e6e6e6; border-radius:50%; animation:spin 1s linear infinite; }
    .spinner-label { font-weight:600; color:#333; font-size:0.95rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    `
  ]
})
export class LoadingSpinnerComponent {
  ls: LoadingService = inject(LoadingService);
  @Input() visible?: boolean | null = null;
  @Input() centered: boolean = false;
  @Input() text?: string | null = null;
  @Input() size: number = 28; // px
  @Input() ringColor: string = '#0d6efd';
  @Input() backdropOpacity: number = 0.25;

  get borderWidth(): number {
    return Math.max(3, Math.round(this.size / 7));
  }
}

