import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Pantalla de inicio del módulo Impositivos. Muestra el encabezado del
 * módulo y deja reservado el espacio para los gráficos/resúmenes que se
 * agregarán más adelante.
 */
@Component({
  selector: 'app-impositivos-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './impositivos-home.component.html',
  styleUrls: ['./impositivos-home.component.scss']
})
export class ImpositivosHomeComponent { }
