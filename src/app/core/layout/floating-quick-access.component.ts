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
      <div class="quick-access-bubble" *ngIf="!open">Rápidos</div>
      <button type="button" class="quick-access-toggle" (click)="toggle()" aria-label="Abrir accesos rápidos" title="Accesos rápidos">
        <i class="bi" [ngClass]="open ? 'bi-x-lg' : 'bi-lightning-charge-fill'"></i>
      </button>

      <div class="quick-access-panel" *ngIf="open">
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
    }
    .quick-access-toggle {
      width: 3.45rem; height: 3.45rem; border: 0; border-radius: 999px; color: #fff;
      background: linear-gradient(135deg, #0f766e 0%, #0b5f59 100%);
      box-shadow: 0 20px 40px rgba(15,23,42,0.32);
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
    }
    .quick-access-toggle:hover { transform: translateY(-1px) scale(1.02); filter: brightness(1.05); box-shadow: 0 24px 42px rgba(15,23,42,0.36); }
    .quick-access-toggle i { font-size: 1.1rem; }
    .quick-access-panel {
      position: absolute; right: 0; bottom: 4.05rem; width: 16.4rem; padding: .7rem;
      background: rgba(255,255,255,.96); backdrop-filter: blur(10px);
      border: 1px solid rgba(226,232,240,.9); border-radius: 18px;
      box-shadow: 0 18px 40px rgba(15,23,42,.18);
    }
    .quick-access-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:.55rem; padding: 0 .25rem; }
    .quick-access-header span { font-weight: 800; color:#0f172a; font-size:.95rem; }
    .quick-access-header small { color:#64748b; }
    .quick-access-item {
      display:flex; align-items:center; gap:.75rem; padding:.7rem .75rem; border-radius: 14px;
      text-decoration:none; color:#0f172a; transition: background .15s ease, transform .15s ease;
    }
    .quick-access-item:hover { background:#f8fafc; transform: translateX(-1px); }
    .quick-access-item i { font-size: 1rem; color:#0f766e; width: 1.4rem; text-align:center; }
    .quick-access-item strong { display:block; font-size:.92rem; }
    .quick-access-item span { display:block; color:#64748b; font-size:.78rem; }
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