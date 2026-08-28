import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastItem } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="toast-wrap" aria-live="polite">
    <div *ngFor="let t of toasts" class="toast" [ngClass]="t.level">
      <div class="msg">{{ t.message }}</div>
      <button class="close" (click)="dismiss(t.id)">×</button>
    </div>
  </div>
  `,
  styles: [`
    .toast-wrap { position:fixed; right:1rem; top:1rem; z-index:1200; display:flex; flex-direction:column; gap:0.5rem }
    .toast { min-width:220px; max-width:420px; padding:0.6rem 0.8rem; border-radius:8px; color:#fff; display:flex; justify-content:space-between; align-items:center; box-shadow:0 6px 18px rgba(10,10,20,0.08) }
    .toast.success { background:#16a34a }
    .toast.error { background:#dc2626 }
    .toast.info { background:#2563eb }
    .toast.warning { background:#f59e0b }
    .toast .msg { flex:1; padding-right:0.5rem }
    .toast .close { background:transparent; border:0; color:rgba(255,255,255,0.9); font-size:1.1rem; cursor:pointer }
  `]
})
export class ToastContainerComponent {
  toasts: ToastItem[] = [];
  constructor(private svc: ToastService) { this.svc.toasts$.subscribe(t => this.toasts = t); }
  dismiss(id: number) { this.svc.dismiss(id); }
}
