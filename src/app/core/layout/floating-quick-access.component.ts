import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

type QuickAction = {
  label: string;
  route: string;
  icon: string;
  hint?: string;
};

@Component({
  selector: 'app-floating-quick-access',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="quick-access-root" [class.open]="open">
      <div class="quick-access-bubble" [class.hidden]="open" aria-hidden="true">Rápidos</div>
      <button type="button" class="quick-access-toggle" (click)="toggle()" [attr.aria-expanded]="open" aria-label="Accesos rápidos" title="Accesos rápidos">
        <i class="bi" [ngClass]="open ? 'bi-x-lg' : 'bi-lightning-charge-fill'"></i>
      </button>

      <div class="quick-access-panel" [class.visible]="open" [attr.aria-hidden]="!open">
        <div class="quick-access-header">
          <span>Accesos rápidos</span>
          <small>Sueldos</small>
        </div>

        <a *ngFor="let action of actions" class="quick-access-item" [routerLink]="action.route" (click)="close()">
          <i class="bi" [ngClass]="action.icon"></i>
          <div>
            <strong>{{ action.label }}</strong>
            <span *ngIf="action.hint">{{ action.hint }}</span>
          </div>
        </a>
      </div>
    </div>
  `,
  styles: [
    `:host { position: fixed; right: 1.1rem; bottom: 1.4rem; z-index: 5000; }
    .quick-access-root { position: relative; }
    .quick-access-bubble {
      position: absolute; right: 3.65rem; bottom: .35rem;
      background: rgba(15,23,42,.92); color: #fff; font-size: .76rem; font-weight: 700;
      padding: .35rem .6rem; border-radius: 999px; white-space: nowrap;
      box-shadow: 0 10px 24px rgba(15,23,42,.18);
      pointer-events: none;
      opacity: 1;
      transform: translateX(0) scale(1);
      transition: opacity .2s cubic-bezier(0.4, 0, 0.2, 1), transform .2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .quick-access-bubble.hidden {
      opacity: 0;
      transform: translateX(6px) scale(0.92);
    }
    .quick-access-toggle {
      width: 3.45rem; height: 3.45rem; border: 0; border-radius: 999px; color: #fff;
      background: linear-gradient(135deg, #0f766e 0%, #0b5f59 100%);
      box-shadow: 0 20px 40px rgba(15,23,42,0.32);
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: transform .22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow .2s ease, filter .2s ease;
    }
    .quick-access-toggle:hover { transform: translateY(-2px) scale(1.04); filter: brightness(1.05); box-shadow: 0 24px 42px rgba(15,23,42,0.36); }
    .quick-access-toggle:active { transform: translateY(0) scale(0.96); }
    .quick-access-toggle i {
      font-size: 1.1rem;
      transition: transform .25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .quick-access-root.open .quick-access-toggle i {
      transform: rotate(90deg);
    }
    .quick-access-panel {
      position: absolute; right: 0; bottom: 4.05rem; width: 16.4rem; padding: .7rem;
      background: rgba(255,255,255,.96); backdrop-filter: blur(10px);
      border: 1px solid rgba(226,232,240,.9); border-radius: 18px;
      box-shadow: 0 18px 40px rgba(15,23,42,.18);
      transform-origin: bottom right;
      /* Estado cerrado (animación sutil de salida) */
      opacity: 0;
      visibility: hidden;
      transform: translateY(10px) scale(0.95);
      pointer-events: none;
      transition:
        opacity .22s cubic-bezier(0.4, 0, 0.2, 1),
        transform .24s cubic-bezier(0.4, 0, 0.2, 1),
        visibility .24s step-end;
    }
    /* Estado abierto (animación sutil de entrada con resorte leve) */
    .quick-access-panel.visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
      pointer-events: auto;
      transition:
        opacity .24s cubic-bezier(0, 0, 0.2, 1),
        transform .26s cubic-bezier(0.16, 1, 0.3, 1),
        visibility 0s step-start;
    }
    .quick-access-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:.55rem; padding: 0 .25rem; }
    .quick-access-header span { font-weight: 800; color:#0f172a; font-size:.95rem; }
    .quick-access-header small { color:#64748b; }
    .quick-access-item {
      display:flex; align-items:center; gap:.75rem; padding:.7rem .75rem; border-radius: 14px;
      text-decoration:none; color:#0f172a;
      transition: background .15s ease, transform .15s ease, color .15s ease;
    }
    .quick-access-item:hover { background:#f8fafc; transform: translateX(-2px); }
    .quick-access-item i { font-size: 1rem; color:#0f766e; width: 1.4rem; text-align:center; transition: transform .15s ease; }
    .quick-access-item:hover i { transform: scale(1.1); }
    .quick-access-item strong { display:block; font-size:.92rem; }
    .quick-access-item span { display:block; color:#64748b; font-size:.78rem; }
    @media (prefers-reduced-motion: reduce) {
      .quick-access-panel,
      .quick-access-bubble,
      .quick-access-toggle,
      .quick-access-toggle i,
      .quick-access-item {
        transition: none !important;
        animation: none !important;
      }
    }
    @media (max-width: 768px) {
      :host { right: .75rem; bottom: .85rem; }
      .quick-access-panel { width: min(16rem, calc(100vw - 1.5rem)); }
    }
    `
  ]
})
export class FloatingQuickAccessComponent {
  open = false;

  actions: QuickAction[] = [
    { label: 'Inicio Sueldos', route: '/sueldos', icon: 'bi-house', hint: 'Panel principal' },
    { label: 'Liquidar', route: '/sueldos/liquidar', icon: 'bi-cash-stack', hint: 'Nueva liquidación' },
    { label: 'Liquidaciones', route: '/sueldos/listado', icon: 'bi-card-list', hint: 'Historial' },
    { label: 'Conceptos', route: '/admin/conceptos', icon: 'bi-journal-text', hint: 'Catálogo' },
    { label: 'Empleados', route: '/admin/empleados/listado', icon: 'bi-people', hint: 'Ficha y listado' }
  ];

  constructor(private router: Router) {}

  toggle(): void {
    this.open = !this.open;
  }

  close(): void {
    this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.open && target && !target.closest('.quick-access-root')) {
      this.close();
    }
  }
}