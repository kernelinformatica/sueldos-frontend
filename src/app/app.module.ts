
import { NgModule } from '@angular/core';
import { AppComponent } from './app.component';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { RouterModule } from '@angular/router';

// import { AppComponent } from './app.component';
import { LoginComponent } from './auth/login.component';
import { AuthGuard } from './auth/auth.guard';
import { tokenInterceptor } from './auth/token.interceptor';

@NgModule({
  declarations: [],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    RouterModule.forRoot([
      { path: 'login', component: LoginComponent },
      { path: 'modulos', canActivate: [AuthGuard], loadComponent: () => import('./module-selector/module-selector.component').then(m => m.ModuleSelectorComponent) },
      { path: '', redirectTo: 'modulos', pathMatch: 'full' }
    ]),
    AppComponent
  ],
  providers: [
    AuthGuard
  ],
  bootstrap: []
})
export class AppModule {}
// Archivo innecesario, eliminado en refactorización
