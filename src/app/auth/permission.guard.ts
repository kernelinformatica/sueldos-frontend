import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    const permiso = route.data?.['permiso'] as string | undefined;
    if (!permiso) return true; // no permiso required
    try {
      const perms = this.auth.getPermissions() || [];
      const has = Array.isArray(perms) && perms.some((p: any) => (typeof p === 'string' ? p === permiso : p?.alias === permiso));
      if (has) return true;
    } catch {}
    // redirect back to conceptos list if no permiso
    return this.router.createUrlTree(['/admin/conceptos']);
  }
}
