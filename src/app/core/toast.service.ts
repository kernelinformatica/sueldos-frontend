import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastLevel = 'success' | 'error' | 'info' | 'warning';
export interface ToastItem { id: number; level: ToastLevel; message: string; timeout?: number }

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts$ = new BehaviorSubject<ToastItem[]>([]);
  toasts$ = this._toasts$.asObservable();
  private idSeq = 1;

  private push(level: ToastLevel, message: string, timeout = 5000) {
    const item: ToastItem = { id: this.idSeq++, level, message, timeout };
    const list = [ ...this._toasts$.value, item ];
    this._toasts$.next(list);
    if (timeout > 0) setTimeout(() => this.dismiss(item.id), timeout);
    return item.id;
  }

  success(message: string, timeout = 4000) { this.push('success', message, timeout); }
  error(message: string, timeout = 6000) { this.push('error', message, timeout); }
  info(message: string, timeout = 4000) { this.push('info', message, timeout); }
  warning(message: string, timeout = 5000) { this.push('warning', message, timeout); }

  dismiss(id: number) { this._toasts$.next(this._toasts$.value.filter(t => t.id !== id)); }
  clear() { this._toasts$.next([]); }
}
