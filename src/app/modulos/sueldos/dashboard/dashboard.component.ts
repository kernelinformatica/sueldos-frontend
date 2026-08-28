import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-sueldos-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  token = localStorage.getItem('token') || '';
  esAdmin = false;

  // Filtros
  fechaDesde: string = '';
  fechaHasta: string = '';
  nroPadron: string = '';

  // Estado
  isLoading = false;
  buscado = false;
  errorMsg: string | null = null;

  // Datos

  totalLiquidaciones = 0;
  expandidos: Set<string> = new Set();

  constructor(
    private http: HttpClient,

  ) {}

  ngOnInit(): void {
    const userRaw = localStorage.getItem('user');
    if (userRaw) {
      try {
        const userObj = JSON.parse(userRaw);
        const perfilId = userObj.usuario?.perfil?.id_perfil ?? userObj?.perfil_id;

        this.esAdmin = Number(perfilId) === 2;
      } catch {}
    }

    // Inicializar fechas: último mes
    const hoy = new Date();
    const hace30 = new Date();
    hace30.setDate(hoy.getDate() - 30);
    this.fechaHasta = this.formatDate(hoy);
    this.fechaDesde = this.formatDate(hace30);
  }

  formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }






 base64ToBlob(base64: string, mime: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mime });
}



}
