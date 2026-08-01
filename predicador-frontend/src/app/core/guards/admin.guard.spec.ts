import { TestBed } from '@angular/core/testing';
import { AuthTokenService } from '../services/auth-token';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AuthTokenService] });
  });

  it('keeps admin login navigation available without a stored admin role', () => {
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));

    expect(result).toBe(true);
  });

  it('allows navigation when admin role is set', () => {
    TestBed.inject(AuthTokenService).set('admin-token', 'admin');

    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));

    expect(result).toBe(true);
  });

  it('allows navigation when encargado role is set', () => {
    TestBed.inject(AuthTokenService).set('encargado-token', 'encargado');

    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));

    expect(result).toBe(true);
  });
});
