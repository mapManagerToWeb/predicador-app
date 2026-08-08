import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface WhatsAppSendRequest {
  destinationNumber: string;
  templateName: string;
  languageCode: string;
  components: Array<Record<string, unknown>>;
}

interface WhatsAppDeliveryResponse {
  idempotencyKey: string;
  status: string;
  messageId: string | null;
  error: string | null;
}

@Component({
  selector: 'app-whatsapp-simulation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whatsapp-simulation.component.html',
  styleUrls: ['./whatsapp-simulation.component.scss']
})
export class WhatsappSimulationComponent {
  readonly loading = signal(false);
  readonly result = signal<WhatsAppDeliveryResponse | null>(null);
  readonly error = signal<string | null>(null);
  readonly statusPolling = signal<string | null>(null);

  readonly destinationNumber = signal('56936577203');
  readonly templateName = signal('asignacion_territorio');
  readonly languageCode = signal('es');

  private http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private pollCancelled = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.pollCancelled = true;
    });
  }

  async sendTestReport(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    const idempotencyKey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    const request: WhatsAppSendRequest = {
      destinationNumber: this.destinationNumber(),
      templateName: this.templateName(),
      languageCode: this.languageCode(),
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'Test Territory' }] },
        { type: 'body', parameters: [{ type: 'text', text: 'Test Address' }] }
      ]
    };

    try {
      const headers = new HttpHeaders()
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', idempotencyKey);

      // Use async endpoint via gateway
      const response = await firstValueFrom(
        this.http.post<WhatsAppDeliveryResponse>(
          `${environment.apiUrl}/reports/whatsapp/async`,
          request,
          { headers },
        ),
      );

      this.result.set(response ?? null);

      // Poll for status
      void this.pollStatus(idempotencyKey);
    } catch (err: unknown) {
      this.error.set(this.describeError(err));
    } finally {
      this.loading.set(false);
    }
  }

  private describeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const detail = (err.error as { detail?: string } | null)?.detail;
      return detail ?? err.message;
    }
    return err instanceof Error ? err.message : 'Error desconocido';
  }

  private async pollStatus(key: string): Promise<void> {
    this.statusPolling.set('Polling...');

    for (let i = 0; i < 30; i++) {
      if (this.pollCancelled) return;
      await new Promise((r) => setTimeout(r, 2000));
      if (this.pollCancelled) return;

      try {
        const response = await firstValueFrom(
          this.http.get<WhatsAppDeliveryResponse>(`${environment.apiUrl}/reports/send/${key}`),
        );

        if (response && response.status !== 'IN_PROGRESS') {
          this.result.set(response);
          this.statusPolling.set(null);
          return;
        }
      } catch {
        // Ignore polling errors
      }
    }

    if (!this.pollCancelled) {
      this.statusPolling.set('Timeout - check manually');
    }
  }
}