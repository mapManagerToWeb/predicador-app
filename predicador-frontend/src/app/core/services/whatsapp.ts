import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { WhatsAppSendRequest, WhatsAppSendResponse } from '../models/models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WhatsAppService {
  private http = inject(HttpClient);
  private sendUrl = `${environment.apiUrl}/reports/send`;

  async sendReport(request: WhatsAppSendRequest): Promise<WhatsAppSendResponse> {
    return firstValueFrom(
      this.http.post<WhatsAppSendResponse>(this.sendUrl, request)
    );
  }
}
