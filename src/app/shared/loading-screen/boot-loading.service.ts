import { Injectable, NgZone, inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { BehaviorSubject, Subject, finalize } from 'rxjs';

/**
 * Coordina el estado de carga del arranque de la aplicación.
 *
 * El overlay se oculta cuando se cumplen *ambas* condiciones:
 *  - se completó la navegación inicial del router, y
 *  - no quedan peticiones HTTP iniciales en vuelo.
 *
 * Se aplica un tiempo mínimo de visualización para evitar el "flash"
 * de un loader que aparece y desaparece en el mismo cuadro.
 */
@Injectable({ providedIn: 'root' })
export class BootLoadingService {
  /** Emite cuando el arranque terminó y corresponde ocultar el overlay. */
  readonly done$ = new Subject<void>();

  private readonly minVisibleMs = 700;
  private readonly startedAt = Date.now();

  private navigationDone = false;
  private pendingRequests = 0;
  private finished = false;

  /** Estado observable para diagnósticos/contadores. */
  readonly isBooting = new BehaviorSubject<boolean>(true);

  constructor(private readonly zone: NgZone) {}

  trackRequest(): void {
    this.pendingRequests++;
  }

  releaseRequest(): void {
    this.pendingRequests = Math.max(0, this.pendingRequests - 1);
    this.tryFinish();
  }

  markNavigationDone(): void {
    this.navigationDone = true;
    this.tryFinish();
  }

  private tryFinish(): void {
    if (this.finished) return;
    if (!this.navigationDone) return;
    if (this.pendingRequests > 0) return;

    const elapsed = Date.now() - this.startedAt;
    const wait = Math.max(0, this.minVisibleMs - elapsed);

    setTimeout(() => {
      if (this.finished) return;
      this.finished = true;
      this.zone.run(() => {
        this.isBooting.next(false);
        this.done$.next();
      });
    }, wait);
  }
}

/**
 * Interceptor que contabiliza las peticiones HTTP generadas mientras el
 * overlay de arranque está visible. Se autodesactiva cuando el arranque
 * termina, para no sumar overhead durante el resto de la vida de la app.
 */
export const bootLoadingInterceptor: HttpInterceptorFn = (req, next) => {
  const boot = inject(BootLoadingService);
  const zone = inject(NgZone);

  const booting = boot.isBooting.value;
  if (!booting) return next(req);

  boot.trackRequest();

  return next(req).pipe(finalize(() => {
    zone.run(() => boot.releaseRequest());
  }));
};