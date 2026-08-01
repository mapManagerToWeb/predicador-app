import { TestBed } from '@angular/core/testing';
import { MapReportService } from './map-report.service';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { WhatsAppService } from '../../core/services/whatsapp';

describe('MapReportService', () => {
  let service: MapReportService;
  let restoreMap: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    restoreMap = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        MapReportService,
        { provide: TerritorioService, useValue: {} },
        { provide: Profile, useValue: {} },
        { provide: Toast, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
      ],
    });
    service = TestBed.inject(MapReportService);
  });

  it('restores map state when no map element exists after preparation', async () => {
    const prepareMap = vi.fn().mockResolvedValue(undefined);

    await expect(service.captureScreenshot(prepareMap, restoreMap)).resolves.toBeNull();

    expect(prepareMap).toHaveBeenCalledOnce();
    expect(restoreMap).toHaveBeenCalledOnce();
  });
});
