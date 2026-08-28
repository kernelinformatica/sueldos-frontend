import { Component, Input } from '@angular/core';
import { NgIf, NgClass, NgForOf, CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-sidebar-menu-item',
  standalone: true,
  imports: [CommonModule, NgIf, NgClass, RouterModule],
  templateUrl: './sidebar-menu-item.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarMenuItemComponent {
  @Input() item: any;
  @Input() collapsed: boolean = false;
  @Input() depth: number = 0;

  expanded = false;

  toggle() {
    if (this.item.children && this.item.children.length > 0) {
      this.expanded = !this.expanded;
    }
  }

  onMenuClick(event: MouseEvent) {
    if (this.item.children && this.item.children.length > 0) {
      event.preventDefault();
      this.toggle();
    }
    // Si no tiene hijos, deja que navegue normalmente
  }
}
