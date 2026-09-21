import { Component, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { BackendStatusService } from '../core/backend-status.service';
import { HttpClient } from '@angular/common/http';
import { app } from '../environments/environment';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, LoadingSpinnerComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})

export class LoginComponent implements OnInit {
  email = '';
  password = '';
  rememberMe = false;
  error = '';
  backendOnline = true;
  app: any = app;
  codigoCliente: string = '';
  isLoading: boolean = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private http: HttpClient,
    private backendStatus: BackendStatusService
  ) {}

  ngOnInit() {
    // Si el usuario eligió recordar, recupera el email
    const remembered = localStorage.getItem('rememberedEmail');
    if (remembered) {
      this.email = remembered;
      this.rememberMe = true;
    }
    this.verificarBackend();
  }

  verificarBackend() {
    this.backendStatus.pingBackend().subscribe({
      next: (resp) => {
        this.backendOnline = resp?.status === 'ok';
        if (!this.backendOnline) {
          this.error = 'Servicio no disponible temporalmente';
        }
      },
      error: () => {
        this.backendOnline = false;
        this.error = 'Servicio no disponible temporalmente';
      }
    });
    this.backendOnline = true
  }
  // Eliminada función onSitioChange
  login() {
    this.verificarBackend();
    if (!this.backendOnline) {
      this.error = 'Servicio no disponible temporalmente';
      return;
    }
    if (!this.isValidEmail(this.email)) {
      this.error = 'Por favor ingresa un email válido.';
      return;
    }
    if (!this.codigoCliente) {
      this.error = 'Por favor ingresa el código de cliente.';
      return;
    }
    if (!/^[A-Za-z0-9]{5,}$/.test(this.codigoCliente)) {
      this.error = 'El código de cliente debe tener un minimo de 5 caracteres.';
      return;
    }
    if (this.rememberMe) {
      localStorage.setItem('rememberedEmail', this.email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }
    this.isLoading = true;
    this.auth.login(this.email, this.password, this.codigoCliente).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.router.navigate(['/modulos']);
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 0) {
          this.backendOnline = false;
          this.error = 'Servicio no disponible temporalmente';
        } else {
          // Mostrar mensajes devueltos por el backend en varias formas posibles
          const backendMsg = err?.error?.message || err?.error?.mensaje || err?.error || err?.message;
          if (typeof backendMsg === 'string' && backendMsg.trim().length) {
            this.error = backendMsg;
          } else if (err?.error && typeof err?.error === 'object') {
            // intentar serializar un objeto de error
            try { this.error = JSON.stringify(err.error); } catch { this.error = 'Credenciales inválidas'; }
          } else {
            this.error = 'Credenciales inválidas';
          }
        }
      }
    });
  }

  forgotPassword(event: Event) {
    event.preventDefault();
    alert('Funcionalidad de recuperación de contraseña próximamente.');
  }

  isValidEmail(email: string): boolean {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  }
}
