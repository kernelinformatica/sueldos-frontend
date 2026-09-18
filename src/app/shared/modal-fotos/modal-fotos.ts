
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  imports: [],
  standalone: true,
  selector: 'app-modal-fotos',
  styleUrls: ['./modal-fotos.scss'],
  templateUrl: './modal-fotos.html',
})
export class ModalFotos {
  @Input() visible = false;
  @Input() titulo = '';
  @Output() cerrar = new EventEmitter<void>();
  cerrarModal(): void {
    this.visible = false;
    this.cerrar.emit();
  }
  closing = false
}
