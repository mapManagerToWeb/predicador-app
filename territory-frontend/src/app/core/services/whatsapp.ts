import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
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
  private readonly pollTimeoutMs = 90_000;
  /** Veces que se intenta entregar el pedido de WhatsApp cuando se corta la señal. */
  private readonly intentosPedido = 3;

  /**
   * Envía el reporte por WhatsApp de forma asíncrona: el backend registra la
   * petición (202) y procesa WhatsApp en segundo plano, así el proceso no se
   * bloquea frente a llamadas lentas a WhatsApp. Aquí se espera el estado final
   * consultando el endpoint de estado hasta que el envío se complete.
   */
  async sendReport(request: WhatsAppSendRequest): Promise<WhatsAppSendResponse> {
    return this.enviar(this.sendUrl, request);
  }

  /**
   * El administrador reenvía desde el panel un reporte que ya se envió: el
   * servidor lo manda al número de la copia (nunca al que diga la app).
   */
  async reenviarDesdePanel(request: WhatsAppSendRequest): Promise<WhatsAppSendResponse> {
    return this.enviar(`${environment.apiUrl}/reports/admin/reenviar`, request);
  }

  /**
   * Con poca señal, la respuesta puede perderse aunque el servidor ya haya
   * recibido el pedido y encolado el WhatsApp. Por eso: el pedido se reintenta
   * con la MISMA clave (el servidor la reconoce y nunca manda dos mensajes),
   * un corte al consultar el estado no corta la espera, y solo un «falló»
   * claro del servidor cuenta como fallo; lo demás es 'sin-confirmar'.
   */
  private async enviar(url: string, request: WhatsAppSendRequest): Promise<WhatsAppSendResponse> {
    const idempotencyKey = crypto.randomUUID();
    const headers = new HttpHeaders().set('Idempotency-Key', idempotencyKey);

    let submission: WhatsAppDeliveryDto | null = null;
    for (let intento = 1; intento <= this.intentosPedido && !submission; intento++) {
      try {
        submission = await firstValueFrom(this.http.post<WhatsAppDeliveryDto>(url, request, { headers }));
      } catch (e) {
        // El servidor respondió que no (sesión, datos): no se envió nada.
        if (e instanceof HttpErrorResponse && e.status >= 400 && e.status < 500) return this.fallo(e.message);
        if (intento < this.intentosPedido) await this.sleep(this.pollIntervalMs * intento);
      }
    }
    if (!submission) return this.sinConfirmar();
    if (submission.status !== 'IN_PROGRESS') {
      return this.toResponse(submission);
    }
    return this.pollUntilDone(idempotencyKey);
  }

  private async pollUntilDone(idempotencyKey: string): Promise<WhatsAppSendResponse> {
    const deadline = Date.now() + this.pollTimeoutMs;
    let currentInterval = this.pollIntervalMs;
    while (Date.now() < deadline) {
      await this.sleep(currentInterval);
      try {
        const dto = await firstValueFrom(
          this.http.get<WhatsAppDeliveryDto>(`${this.sendUrl}/${idempotencyKey}`),
        );
        if (dto.status !== 'IN_PROGRESS') {
          return this.toResponse(dto);
        }
      } catch {
        // Sin señal en esta consulta: el envío sigue en el servidor; se vuelve a preguntar.
      }
      currentInterval = Math.min(currentInterval * 2, 15000);
    }
    return this.sinConfirmar();
  }

  private toResponse(dto: WhatsAppDeliveryDto): WhatsAppSendResponse {
    const success = dto.status === 'SUCCEEDED';
    return {
      success,
      messageId: dto.messageId,
      error: dto.error,
      estado: success ? 'enviado' : 'fallo',
    };
  }

  private fallo(error: string): WhatsAppSendResponse {
    return { success: false, messageId: null, error, estado: 'fallo' };
  }

  private sinConfirmar(): WhatsAppSendResponse {
    return { success: false, messageId: null, error: 'Sin confirmación (poca señal)', estado: 'sin-confirmar' };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
