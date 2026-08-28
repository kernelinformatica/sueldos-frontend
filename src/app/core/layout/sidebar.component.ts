
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SidebarMenuItemComponent } from './sidebar-menu-item.component';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarMenuItemComponent],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  animations: [
    trigger('slideDown', [
      state('void', style({ height: '0', opacity: 0, overflow: 'hidden' })),
      state('*', style({ height: '*', opacity: 1, overflow: 'hidden' })),
      transition(':enter', [animate('250ms cubic-bezier(0.25, 0.8, 0.25, 1)')]),
      transition(':leave', [animate('200ms cubic-bezier(0.25, 0.8, 0.25, 1)')])
    ])
  ]
})
export class SidebarComponent implements OnChanges {
  @Input() menu: any[] = [];
  @Input() menugrupos:any[] = [];
  @Input() esAdmin: boolean = false;
  @Input() paginasOpen: boolean = false;
  @Input() collapsed: boolean = false;
  @Input() componentsOpen: boolean = false;
  @Input() tituloModulo: string = '';
  @Output() crearPagina = new EventEmitter<void>();
  @Output() collapsedChange = new EventEmitter<boolean>();

  get logoSrc(): string {
    const empresaStr = localStorage.getItem('empresa');
    if (empresaStr) {
      try {
        const empresa = JSON.parse(empresaStr);
        if (empresa && empresa.codigo_empresa) {
          return `assets/logos/${empresa.codigo_empresa}-1.png`;
        }
        if (empresa && empresa.codigo) {
          return `assets/logos/${empresa.codigo}-1.png`;
        }
      } catch {}
    }
    return '';
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['menu'] && changes['menu'].currentValue) {
      this.menu = this.buildMenuFromMenuObject(changes['menu'].currentValue);

    }
    if (changes['menugrupos'] && changes['menugrupos'].currentValue) {
      this.menugrupos = this.buildMenuFromMenuObject(changes['menugrupos'].currentValue);


    }
  }

  constructor(private auth: AuthService) {}

  get canViewGrupos(): boolean {
    try {
      const perms = this.auth.getPermissions() || [];
      return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === 'grupos' : p?.alias === 'grupos'));
    } catch { return false; }
  }

  get canCreateGrupos(): boolean {
    try {
      const perms = this.auth.getPermissions() || [];
      return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === 'grupos_crear' : p?.alias === 'grupos_crear'));
    } catch { return false; }
  }

  gruposMenu = [
    { label: 'Listado Grupos', route: '/admin/conceptos/grupos', icon: 'bi bi-list' },
    { label: 'Nuevo Grupo', route: '/admin/conceptos/grupos/alta', icon: 'bi bi-plus-lg' }
  ];

  get gruposMenuFiltered(): any[] {
    try {
      return (this.gruposMenu || []).filter((item: any) => {
        if (!item || !item.route) return false;
        // hide 'alta' entry when user doesn't have create permiso
        if (String(item.route).endsWith('/alta')) return this.canCreateGrupos;
        return true;
      });
    } catch { return this.gruposMenu || []; }
  }

  buildMenuFromMenuObject(menuItems: any[]): any[] {
    return menuItems.map(item => ({
      label: item.label || item.nombre,
      route: item.route || (item.ruta ? `/${item.ruta}` : ''),
      icon: item.icon || item.icono || 'fa-folder',
      children: item.children && item.children.length > 0 ? this.buildMenuFromMenuObject(item.children) : []
    }));
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }
  }

