import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  WhatsAppDeliveryDto,
  WhatsAppSendRequest,
  WhatsAppSendResponse,
} from '../models/models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WhatsAppService {
  private http = inject(HttpClient);
  private sendUrl = `${environment.apiUrl}/reports/send`;

  private readonly pollIntervalMs = 2000;
  private readonly pollTimeoutMs = 60_000;

  /**
   * Envía el reporte por WhatsApp de forma asíncrona: el backend registra la
   * petición (202) y procesa WhatsApp en segundo plano, así el proceso no se
   * bloquea frente a llamadas lentas a WhatsApp. Aquí se espera el estado final
   * consultando el endpoint de estado hasta que el envío se complete.
   */
  async sendReport(request: WhatsAppSendRequest): Promise<WhatsAppSendResponse> {
    const idempotencyKey = crypto.randomUUID();
    const headers = new HttpHeaders().set('Idempotency-Key', idempotencyKey);

    const submission = await firstValueFrom(
      this.http.post<WhatsAppDeliveryDto>(this.sendUrl, request, { headers }),
    );

    if (submission.status !== 'IN_PROGRESS') {
      return this.toResponse(submission);
    }
    return this.pollUntilDone(idempotencyKey);
  }

  private async pollUntilDone(idempotencyKey: string): Promise<WhatsAppSendResponse> {
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      await this.sleep(this.pollIntervalMs);
      const dto = await firstValueFrom(
        this.http.get<WhatsAppDeliveryDto>(`${this.sendUrl}/${idempotencyKey}`),
      );
      if (dto.status !== 'IN_PROGRESS') {
        return this.toResponse(dto);
      }
    }
    return { success: false, messageId: null, error: 'Tiempo de espera agotado' };
  }

  private toResponse(dto: WhatsAppDeliveryDto): WhatsAppSendResponse {
    return {
      success: dto.status === 'SUCCEEDED',
      messageId: dto.messageId,
      error: dto.error,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
