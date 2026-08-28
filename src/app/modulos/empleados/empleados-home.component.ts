import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-empleados-home',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="module-placeholder">
      <h3>Resumen de Empleados</h3>
      <p>Panel inicial del módulo de empleados. Aquí irá el tablero principal.</p>
    </div>
  `
})
export class EmpleadosHomeComponent {}
