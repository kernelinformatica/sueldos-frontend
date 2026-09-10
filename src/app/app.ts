import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './core/toast-container.component';
import { FloatingQuickAccessComponent } from './core/layout/floating-quick-access.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, FloatingQuickAccessComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
    <app-floating-quick-access></app-floating-quick-access>
  `,
  styleUrl: './app.scss'
})
export class App {
  
  
  protected readonly title = signal('front-v1');
}
