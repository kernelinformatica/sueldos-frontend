import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { BootLoadingService } from './boot-loading.service';

/**
 * Overlay de carga a pantalla completa que se muestra durante la
 * inicialización de la aplicación y se oculta con fade-out cuando
 * terminan la navegación inicial y las peticiones HTTP iniciales.
 */
@Component({
  selector: 'app-loading-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-screen.component.html',
  styleUrls: ['./loading-screen.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingScreenComponent {
  private readonly boot = inject(BootLoadingService);
  private readonly router = inject(Router);

  /** Controla el desvanecido; el DOM se desmonta al terminar la transición. */
  protected readonly hiding = signal(false);

  constructor() {
    this.boot.done$.subscribe(() => {
      // Pequeño respiro para que el fade-out se perciba como intencional.
      setTimeout(() => this.hiding.set(true), 220);
    });

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.boot.markNavigationDone());
  }
}