import { Component } from '@angular/core';
import { app } from '../../environments/environment';

@Component({
  selector: 'app-footer',
  standalone: true,
  template: `
    <footer class="app-footer text-center">
      <span>{{ app.name }} &copy; {{ year }}</span>
      <span class="mx-2">|</span>
      <span class="text-muted">{{ app.description }}</span>
    </footer>
  `,
  styles: [`
    .app-footer {
      padding: 0.75rem 1rem;
      font-size: 0.82rem;
      color: #888;
      background: #f8f9fa;
      border-top: 1px solid #e9ecef;
    }
  `]
})
export class FooterComponent {
  app: any = app;
  year = new Date().getFullYear();
}
