import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapCanvasCaptureService } from './map-canvas-capture.service';
import type { MapEngine } from './map-engine.interface';

const ENGINE = {
  captureCanvas: vi.fn(),
} as unknown as MapEngine;

describe('MapCanvasCaptureService', () => {
  let service: MapCanvasCaptureService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MapCanvasCaptureService();
  });

  it('returns null when no engine is attached', async () => {
    expect(await service.capture()).toBeNull();
  });

  it('delegates the screenshot to the attached engine', async () => {
    service.setEngine(ENGINE);
    (ENGINE.captureCanvas as ReturnType<typeof vi.fn>).mockResolvedValue('QUJD');

    expect(await service.capture()).toBe('QUJD');
    expect(ENGINE.captureCanvas).toHaveBeenCalledTimes(1);
  });

  it('propagates a null engine result', async () => {
    service.setEngine(ENGINE);
    (ENGINE.captureCanvas as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    expect(await service.capture()).toBeNull();
  });

  it('clears the engine reference on destroy so a stale map cannot be captured', async () => {
    service.setEngine(ENGINE);
    service.setEngine(null);

    expect(await service.capture()).toBeNull();
    expect(ENGINE.captureCanvas).not.toHaveBeenCalled();
  });
});