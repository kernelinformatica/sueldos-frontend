import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../core/toast.service';
import { GruposComponent } from './grupos.component';
import { GruposService } from './grupos.service';

describe('GruposComponent navigation', () => {
  let component: GruposComponent;
  let router: jasmine.SpyObj<Router>;
  let toast: jasmine.SpyObj<ToastService>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['error']);
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getPermissions']);
    auth.getPermissions.and.returnValue(['grupos_rela_conceptos']);
    component = new GruposComponent(
      jasmine.createSpyObj<GruposService>('GruposService', ['list']),
      jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['detectChanges']),
      toast,
      auth,
      router
    );
  });

  it('edits group 45 through Angular without reloading the page', () => {
    component.edit({ grupo_id: 45, id: 99 });

    expect(router.navigate).toHaveBeenCalledOnceWith(
      ['/admin/conceptos/grupos/editar'], { queryParams: { id: 45 } }
    );
  });

  it('supports the alternative group id field', () => {
    component.edit({ id: 45 });

    expect(router.navigate).toHaveBeenCalledOnceWith(
      ['/admin/conceptos/grupos/editar'], { queryParams: { id: 45 } }
    );
  });

  it('reports a missing group id instead of navigating', () => {
    component.edit({});

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Grupo inválido');
  });

  it('opens the new group route through Angular', () => {
    component.newGrupo();

    expect(router.navigate).toHaveBeenCalledOnceWith(['/admin/conceptos/grupos/alta']);
  });

  it('opens the concept relationship route with the group id', () => {
    component.relacionar({ grupo_id: 45 });

    expect(router.navigate).toHaveBeenCalledOnceWith(
      ['/admin/conceptos/grupos/relacionar'], { queryParams: { id: 45 } }
    );
  });

  it('does not navigate to relationships without permission', () => {
    auth.getPermissions.and.returnValue([]);

    component.relacionar({ grupo_id: 45 });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Sin permisos para relacionar conceptos');
  });

  it('reports a missing group id when relating concepts', () => {
    component.relacionar({});

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Grupo inválido');
  });
});
