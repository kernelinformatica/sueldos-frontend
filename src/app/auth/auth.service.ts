import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';

interface LoginResponse {
  token: string;
  user?: any;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = environment.apiUrl + '/api/auth/login';

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string, codigoCliente: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(this.apiUrl, { email, password, codigo_cliente: codigoCliente }).pipe(
      tap((res) => {
        localStorage.setItem('token', res.token);
        const user = res.user ?? null;
        localStorage.setItem('user', JSON.stringify(user));
      })
    );
  }

  logout() {
    const token = this.getToken();
    const headers = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    this.http.post(environment.apiUrl + '/api/auth/logout', {}, headers).subscribe({
      next: () => {
        this.clearSession();
        this.router.navigate(['/login']);
      },
      error: () => {
        this.clearSession();
        this.router.navigate(['/login']);
      }
    });
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  hasValidToken(): boolean {
    const token = this.getToken();
    return !!token && token.trim().length > 0;
  }

  clearSession(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('empresa');
  }

  getUser(): any {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  getPermissions(): string[] {
    const user = this.getUser();
    return user?.permissions || user?.permisos || [];
  }

  isLoggedIn(): boolean {
    return this.hasValidToken();
  }
}
// Archivo innecesario, eliminado en refactorización
