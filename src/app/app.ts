import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './core/toast-container.component';
import { FloatingQuickAccessComponent } from './core/layout/floating-quick-access.component';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, FloatingQuickAccessComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
     @if (!isLogin()) {
      <app-floating-quick-access></app-floating-quick-access>
    }
  `,
  styleUrl: './app.scss'
})
export class App {
  
  isLogin = signal(false);

  constructor(private router: Router) {
    this.router.events
      .pipe(
        filter((event: any) => event instanceof NavigationEnd)
      )
      .subscribe((event: NavigationEnd) => {
        this.isLogin.set(event.urlAfterRedirects.startsWith('/login'));
      });
  }
  protected readonly title = signal('front-v1');
}
