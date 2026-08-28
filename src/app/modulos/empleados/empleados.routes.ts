import { Routes } from '@angular/router';
import { EmpleadosLayoutComponent } from './empleados-layout.component';
import { EmpleadosHomeComponent } from './empleados-home.component';
import { EmpleadosListadoComponent } from './empleados-listado.component';
import { EmpleadosConceptosComponent } from './empleados-conceptos.component';
import { MovimientosMasivosComponent } from './movimientos-masivos.component';
import { EmpleadosFormComponent } from './empleados-form.component';

export const empleadosRoutes: Routes = [
  {
    path: '',
    component: EmpleadosLayoutComponent,
    children: [
      { path: '', component: EmpleadosHomeComponent },
      { path: 'listado', component: EmpleadosListadoComponent },
      { path: 'alta', component: EmpleadosFormComponent },
      { path: 'editar/:id', component: EmpleadosFormComponent },
      { path: 'conceptos', component: MovimientosMasivosComponent },
      { path: 'conceptos/:id', component: EmpleadosConceptosComponent }
    ]
  }
];
