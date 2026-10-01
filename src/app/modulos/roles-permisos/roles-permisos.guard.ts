import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class RolesPermisosGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): boolean | UrlTree {
    if (this.auth.canAccessRolesPermisos()) {
      return true;
    }

    this.auth.clearSession();
    return this.router.createUrlTree(['/login']);
  }
}
