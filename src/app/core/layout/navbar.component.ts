
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink } from '@angular/router';
import { app } from '../../environments/environment';
import { NgIf, CommonModule } from '@angular/common';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [NgIf, CommonModule, RouterLink],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {

  @Input() user: any;
  @Input() sitioActual: any;
  @Input() sidebarCollapsed?: boolean;
  @Input() showSidebarToggle: boolean = true;

  @Output() collapsedChange = new EventEmitter<boolean>();

  showUserMenu = false;
  showAlerts = false;
  showMessages = false;

  notificationsCount = 0;
  messagesCount = 0;

  app: any = app;

  constructor(private auth: AuthService) {}

  private get session(): any {
    return this.user || this.auth.getUser() || {};
  }

  private get effectiveUser(): any {
    const source = this.session;
   
    return source?.usuario || source?.user || source;
    
  }

  /**
   * Empresa asociada al usuario logueado.
   */
  get empresa(): any {
    return this.session?.empresa || {};
  }

  /**
   * Nombre que se muestra en el navbar.
   * Prioriza nombre_fantasia y luego nombre.
   */
  get empresaNombre(): string {
    return this.empresa?.nombre
      || this.empresa?.nombre_fantasia
      || '';
  }

  /**
   * Logo de la empresa.
   *
   * Si el backend devuelve solamente un nombre/id de logo,
   * se arma la URL utilizando la configuración de la aplicación.
   */
  get empresaLogo(): string {
    const logo = this.empresa?.logo;
    return logo;
  }

  get userDisplayName(): string {
    const user = this.effectiveUser;

    const nombreCompleto = [user?.nombre, user?.apellido]
      .filter(
        (value) =>
          typeof value === 'string' &&
          value.trim().length > 0
      )
      .join(' ')
      .trim();

    if (nombreCompleto) {
      return nombreCompleto;
    }

    const fallback =
      user?.name ||
      user?.username ||
      user?.email ||
      '';

    return fallback || 'Usuario';
  }

  get userRoleName(): string {
    const session = this.session;
    const user = this.effectiveUser;

    return (
      session?.rol?.nombre ||
      user?.rol?.nombre ||
      session?.role?.nombre ||
      user?.role?.nombre ||
      session?.rol?.alias ||
      user?.role ||
      ''
    );
  }

  toggleSidebar() {
    this.collapsedChange.emit(!this.sidebarCollapsed);
  }

  toggleUserMenu() {
    this.showUserMenu = !this.showUserMenu;
    this.showAlerts = false;
    this.showMessages = false;
  }

  logout() {
    this.auth.logout();
  }
}
