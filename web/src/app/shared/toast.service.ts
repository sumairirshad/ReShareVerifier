import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, kind: Toast['kind'] = 'info', ms = 3500): void {
    const toast = { id: ++this.nextId, message, kind };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), ms);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
