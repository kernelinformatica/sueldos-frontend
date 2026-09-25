import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../core/layout/navbar.component';
import { SidebarComponent } from '../../core/layout/sidebar.component';
import { AuthService } from '../../auth/auth.service';

interface EmpleadosMenuItem {
  label: string;
  route?: string;
  icon?: string;
  children?: EmpleadosMenuItem[];
}

@Component({
  selector: 'app-empleados-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, NavbarComponent, SidebarComponent],
  templateUrl: './empleados-layout.component.html',
  styleUrls: ['./empleados-layout.component.scss']
})
export class EmpleadosLayoutComponent {
  collapsed = false;
  menu = [
    {
      label: 'Resumen',
      route: '/admin/empleados',
      icon: 'bi bi-speedometer2'
    },
    {
      label: 'Listado',
      route: '/admin/empleados/listado',
      icon: 'bi bi-people'
    },
    {
      label: 'Alta de empleado',
      route: '/admin/empleados/alta',
      icon: 'bi bi-person-plus'
    },
    {
      label: 'Movimientos Masivos',
      route: '/admin/empleados/conceptos',
      icon: 'bi bi-ui-checks-grid'
    },
    
  ];

  constructor(private auth: AuthService) {
    // build menu conditionally based on permisos
    const base = [
      {
        label: 'Resumen',
        route: '/admin/empleados',
        icon: 'bi bi-speedometer2'
      },
      {
        label: 'Listado',
        route: '/admin/empleados/listado',
        icon: 'bi bi-people'
      },
      {
        label: 'Alta de empleado',
        route: '/admin/empleados/alta',
        icon: 'bi bi-person-plus'
      }
    ];

   const perms = this.auth.getPermissions() || [];

    const getPerm = (...aliases: string[]) => perms.find((p: any) => aliases.includes(p.alias));
    const conceptosMasivosPerm = getPerm( 'empleados_conceptos_masivos');
    const sueldoEspecialPerm = getPerm( 'sueldo_especial');
    alert(conceptosMasivosPerm.router)
    const has = (alias: string) => Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : (p?.alias === alias)));
    if (has('empleados_conceptos_masivos') || has('empleados')) {
    
      base.push({ label: 'Movimientos Masivos', route: `/${conceptosMasivosPerm.router}`, icon: 'bi bi-ui-checks-grid' });
    }
   
    if (has('sueldo_especial') || has('sueldo_especial_agregar')) {
      base.push({ label: 'Sueldo Basico Especial', route: `/${sueldoEspecialPerm.router}`, icon: 'bi bi-sliders2' });
    }
    this.menu = base;
  }


  get user(): any {
    return this.auth.getUser();
  }

  get sitioActual(): any {
    try {
      const sitios = JSON.parse(localStorage.getItem('sitios') || '[]');
      if (!Array.isArray(sitios)) return null;
      const sitioId = Number(localStorage.getItem('sitioId'));
      return sitios.find((s: any) => s.id === sitioId) || sitios[0] || null;
    } catch {
      return null;
    }
  }
}
