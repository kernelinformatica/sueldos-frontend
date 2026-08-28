import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModeloImputacionService {
  private modeloImputacionCab: any;

  setModeloImputacionCab(data: any) {
    this.modeloImputacionCab = data;
    try {
      localStorage.setItem('modeloImputacionCab', JSON.stringify(data));
    } catch {}
  }

  getModeloImputacionCab() {
    if (!this.modeloImputacionCab) {
      try {
        const stored = localStorage.getItem('modeloImputacionCab');
        if (stored) {
          this.modeloImputacionCab = JSON.parse(stored);
        }
      } catch {}
    }
    return this.modeloImputacionCab;
  }

  clearModeloImputacionCab() {
    this.modeloImputacionCab = null;
    try {
      localStorage.removeItem('modeloImputacionCab');
    } catch {}
  }
}
