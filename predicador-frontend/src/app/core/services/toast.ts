import { Injectable, signal } from '@angular/core';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

@Injectable({ providedIn: 'root' })
export class Toast {
  visible = signal(false);
  message = signal('');
  type = signal<ToastType>('info');
  private timeout: ReturnType<typeof setTimeout> | null = null;

  show(msg: string, duration = 3000, toastType: ToastType = 'info'): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.message.set(msg);
    this.type.set(toastType);
    this.visible.set(true);
    this.timeout = setTimeout(() => this.hide(), duration);
  }

  hide(): void {
    this.visible.set(false);
    this.message.set('');
  }
}
