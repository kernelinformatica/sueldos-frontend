import { BehaviorSubject } from 'rxjs';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private visibility$ = new BehaviorSubject<boolean>(false);
  get isVisible() { return this.visibility$.asObservable(); }

  private counter = 0;

  show(): void {
    this.counter++;
    if (this.counter > 0) { this.visibility$.next(true); }
  }

  hide(force = false): void {
    if (force) {
      this.counter = 0;
      this.visibility$.next(false);
      return;
    }

    this.counter = Math.max(0, this.counter - 1);
    if (this.counter === 0) { this.visibility$.next(false); }
  }
}
