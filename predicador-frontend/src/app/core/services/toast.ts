import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Toast {
  visible = signal(false);
  message = signal('');
  private timeout: ReturnType<typeof setTimeout> | null = null;

  show(msg: string, duration = 3000): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.message.set(msg);
    this.visible.set(true);
    this.timeout = setTimeout(() => this.hide(), duration);
  }

  hide(): void {
    this.visible.set(false);
    this.message.set('');
  }
}
