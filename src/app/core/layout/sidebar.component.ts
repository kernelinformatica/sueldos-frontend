
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

  readonly defaultLogo = 'assets/logos/app.png';
  readonly defaultLogoIcono = 'assets/logos/10-1-icono.png';

  get logoSrc(): string {
    // 1) Si está colapsado y existe un icono reducido
    if (this.collapsed) {
      const codigo = this.obtenerCodigoEmpresa();
      if (codigo) {
        return `assets/logos/${codigo}-1-icono.png`;
      }
      return this.defaultLogoIcono;
    }

    // 2) Buscar código de empresa en varias fuentes
    const codigo = this.obtenerCodigoEmpresa();
    if (codigo) {
      return `assets/logos/${codigo}-1.png`;
    }

    // 3) Fallback por defecto si no hay empresa definida
    return this.defaultLogo;
  }

  onLogoError(event: Event): void {
    const target = event.target as HTMLImageElement | null;
    if (target && target.src && !target.src.includes(this.defaultLogo)) {
      // Si falló el logo específico o el icono, recurrir al logo estándar
      target.src = this.defaultLogo;
    }
  }

  private obtenerCodigoEmpresa(): string | null {
    // a) Desde localStorage 'empresa'
    try {
      const empresaStr = localStorage.getItem('empresa');
      if (empresaStr) {
        const empresa = JSON.parse(empresaStr);
        const cod = empresa?.codigo_empresa || empresa?.codigo || empresa?.cod;
        if (cod) return String(cod).trim();
      }
    } catch {}

    // b) Desde localStorage 'user'
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        const cod = user?.empresa?.codigo_empresa
          || user?.empresa?.codigo
          || user?.codigo_empresa
          || user?.empresa_codigo
          || user?.empresa_id;
        if (cod) return String(cod).trim();
      }
    } catch {}

    // c) Desde localStorage 'sitioActual' o 'sitios'
    try {
      const sitioStr = localStorage.getItem('sitioActual');
      if (sitioStr) {
        const sitio = JSON.parse(sitioStr);
        const cod = sitio?.codigo_empresa || sitio?.codigo;
        if (cod) return String(cod).trim();
      }
    } catch {}

    return null;
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

