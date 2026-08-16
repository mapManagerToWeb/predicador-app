import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Toast } from './toast';

describe('Toast', () => {
  let service: Toast;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [Toast]
    });
    service = TestBed.inject(Toast);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start hidden', () => {
    expect(service.visible()).toBeFalsy();
    expect(service.message()).toBe('');
  });

  describe('show', () => {
    it('should show message', () => {
      service.show('Test message');

      expect(service.visible()).toBeTruthy();
      expect(service.message()).toBe('Test message');
    });

    it('should hide after default duration', fakeAsync(() => {
      service.show('Test message');
      expect(service.visible()).toBeTruthy();

      tick(3000);

      expect(service.visible()).toBeFalsy();
      expect(service.message()).toBe('');
    }));

    it('should hide after custom duration', fakeAsync(() => {
      service.show('Test message', 5000);
      expect(service.visible()).toBeTruthy();

      tick(3000);
      expect(service.visible()).toBeTruthy();

      tick(2000);
      expect(service.visible()).toBeFalsy();
    }));

    it('should reset timeout on multiple calls', fakeAsync(() => {
      service.show('First message');
      tick(2000);
      service.show('Second message');
      tick(2000);

      expect(service.visible()).toBeTruthy();
      expect(service.message()).toBe('Second message');

      tick(1000);
      expect(service.visible()).toBeFalsy();
    }));

    it('should show subtitle and toast type', () => {
      service.show('Title', 4000, 'sent', 'Subtitle');

      expect(service.visible()).toBeTruthy();
      expect(service.message()).toBe('Title');
      expect(service.subtitle()).toBe('Subtitle');
      expect(service.type()).toBe('sent');
    });

    it('should default subtitle to empty and keep existing types working', () => {
      service.show('Some warning', 2000, 'warning');

      expect(service.subtitle()).toBe('');
      expect(service.type()).toBe('warning');
    });
  });

  describe('hide', () => {
    it('should hide toast', () => {
      service.show('Test message', 3000, 'success', 'Subtitle');
      service.hide();

      expect(service.visible()).toBeFalsy();
      expect(service.message()).toBe('');
      expect(service.subtitle()).toBe('');
    });
  });
});
