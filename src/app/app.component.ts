
 

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './core/toast-container.component';
import { FloatingQuickAccessComponent } from './core/layout/floating-quick-access.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent, FloatingQuickAccessComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
    <app-floating-quick-access></app-floating-quick-access>
  `,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'FusionWebAdmin';
}
// Archivo innecesario, eliminado en refactorización
