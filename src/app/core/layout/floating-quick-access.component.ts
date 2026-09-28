import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

type QuickAction = {
  label: string;
  route: string;
  icon: string;
  hint?: string;
  permission?: string;
};

@Component({
  selector: 'app-floating-quick-access',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="quick-access-root" [class.open]="open">
      <div class="quick-access-bubble" [class.hidden]="open" aria-hidden="true">
        Rápidos
      </div>

      <button
        type="button"
        class="quick-access-toggle"
        (click)="toggle()"
        [attr.aria-expanded]="open"
        aria-label="Accesos rápidos"
        title="Accesos rápidos">

        <i class="bi" [ngClass]="open ? 'bi-x-lg' : 'bi-lightning-charge-fill'"></i>
      </button>

      <div
        class="quick-access-panel"
        [class.visible]="open"
        [attr.aria-hidden]="!open">

        <div class="quick-access-header">
          <span><i class="bi bi-lightning-charge-fill"></i> Atajos</span>
          <small> <div class="bi-grid-3x3-gap-fill"></div> </small>
        </div>

        <a
          *ngFor="let action of actions"
          class="quick-access-item"
          [routerLink]="action.route"
          (click)="close()">

          <i class="bi" [ngClass]="action.icon"></i>

          <div class="quick-access-content">
<strong>{{ action.label }}</strong>
<div *ngIf="action.hint">{{ action.hint }}</div>
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
      transition: opacity .2s, transform .2s;
    }
    .quick-access-bubble.hidden {
      opacity: 0;
      transform: translateX(6px) scale(0.92);
    }
    .quick-access-toggle {
      width: 3.45rem;
      height: 3.45rem;
      border: 0;
      border-radius: 999px;
      color: #fff;
      background: linear-gradient(135deg, #0f766e 0%, #0b5f59 100%);
      cursor: pointer;
    }
    .quick-access-panel {
      position: absolute;
      right: 0;
      bottom: 4.05rem;
      width: 16.4rem;
      padding: .7rem;
      background: rgba(255,255,255,.96);
      border-radius: 18px;
      opacity: 0;
      visibility: hidden;
      transform: translateY(10px) scale(.95);
      pointer-events: none;
      transition: all .2s;
    }
    .quick-access-panel.visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .quick-access-header {
      display:flex;
      justify-content:space-between;
      margin-bottom:.55rem;
    }
    .quick-access-item {
      display:flex;
      align-items:center;
      gap:.75rem;
      padding:.7rem;
      text-decoration:none;
      color:#0f172a;
      border-radius:14px;
    }
    .quick-access-item:hover {
  background:#f8fafc;
}

.quick-access-item {
  display: flex;
  align-items: center;
  gap: .75rem;
  padding: .7rem;
  text-decoration: none;
  color: #0f172a;
  border-radius: 14px;

  transition:
    transform .25s ease,
    background-color .25s ease,
    box-shadow .25s ease;
}
.quick-access-root.open .quick-access-toggle i {
transform: rotate(180deg) scale(1.15);
}
.quick-access-item:hover {
  background: #dfdfdf;
  transform: translateX(-4px);
  box-shadow: 0 8px 20px rgba(15,23,42,.08);
}

.quick-access-item i {
  font-size: 1.2rem;
  color: #0f766e;
  transition:
    transform .25s ease,
    color .25s ease;
}

.quick-access-item:hover i {
  transform: scale(1.2) rotate(-8deg);
  color: #14b8a6;
}`

  ]

})

export class FloatingQuickAccessComponent implements OnInit {

  open = false;

  actions: QuickAction[] = [
    {
      label: 'Inicio Sueldos',
      route: '/modulos',
      icon: 'bi-house',
      hint: 'Panel principal'
    },
    {
      label: 'Liquidar',
      route: '/sueldos/liquidar',
      icon: 'bi-cash-stack',
      hint: 'Nueva liquidación',
      permission: 'liquidar'
    },
    {
      label: 'Liquidaciones',
      route: '/sueldos/listado',
      icon: 'bi-card-list',
      hint: 'Historial',
      permission: 'liquidaciones'
    },
    {
      label: 'Libros de sueldos',
      route: '/sueldos/libros',
      icon: 'bi-book',
      hint: 'Gestionar',
      permission: 'libros_sueldos'
    },
    {
      label: 'Conceptos',
      route: '/admin/conceptos',
      icon: 'bi-journal-text',
      hint: 'Catálogo',
      permission: 'conceptos'
    },
    {
      label: 'Empleados',
      route: '/admin/empleados/listado',
      icon: 'bi-people',
      hint: 'Ficha y listado',
      permission: 'empleados'
    }
  ];

  constructor(
    private router: Router,
    private auth: AuthService
  ) {}

  ngOnInit(): void {

    const perms = this.auth.getPermissions() || [];

    const has = (alias: string) =>
      Array.isArray(perms) &&
      perms.some((p: any) =>
        typeof p === 'string'
          ? p === alias
          : p?.alias === alias
      );

    this.actions = this.actions.filter(
      action => !action.permission || has(action.permission)
    );
  }

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