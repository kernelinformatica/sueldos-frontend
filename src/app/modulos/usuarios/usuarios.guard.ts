import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class UsuariosGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  private hasPerm(alias: string): boolean {
    try {
      const perms = this.auth.getPermissions() || [];
      return Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === alias : p?.alias === alias));
    } catch {
      return false;
    }
  }

  private hasAnyUsersPerm(): boolean {
    return [
      'usuarios',
      'usuarios_crear',
      'usuarios_editar',
      'usuarios_baja',
      'usuarios_password',
      'usuarios_reset_password',
      'usuarios_desbloquear'
    ].some((permiso) => this.hasPerm(permiso));
  }

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const permiso = String(route.data?.['permiso'] || '').trim();
    if (permiso) {
      if (permiso === 'usuarios') {
        return this.hasAnyUsersPerm() ? true : this.router.createUrlTree(['/modulos']);
      }
      return this.hasPerm(permiso) ? true : this.router.createUrlTree(['/modulos']);
    }
    return this.hasAnyUsersPerm() ? true : this.router.createUrlTree(['/modulos']);
  }
}
