 
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SidebarMenuItemComponent } from './sidebar-menu-item.component';
import { trigger, state, style, transition, animate } from '@angular/animations';

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

