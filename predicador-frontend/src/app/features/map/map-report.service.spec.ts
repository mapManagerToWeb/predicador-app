import { TestBed } from '@angular/core/testing';
import { MapReportService } from './map-report.service';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { WhatsAppService } from '../../core/services/whatsapp';

vi.mock('html2canvas', () => ({
  default: vi.fn().mockRejectedValue(new Error('capture failed')),
}));

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

  it('restores map state when capture preparation fails', async () => {
    const prepareMap = vi.fn().mockRejectedValue(new Error('prepare failed'));

    await expect(service.captureScreenshot(prepareMap, restoreMap)).rejects.toThrow('prepare failed');

    expect(restoreMap).toHaveBeenCalledOnce();
  });

  it('restores map state when screenshot rendering fails', async () => {
    const mapElement = document.createElement('div');
    mapElement.id = 'map';
    document.body.appendChild(mapElement);

    await expect(service.captureScreenshot(vi.fn().mockResolvedValue(undefined), restoreMap)).rejects.toThrow(
      'capture failed',
    );

    expect(restoreMap).toHaveBeenCalledOnce();
    mapElement.remove();
  });

});
