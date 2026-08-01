import { Injectable, signal } from '@angular/core';
import { UserProfile } from '../models/models';

const STORAGE_KEY = 'predicador_profile';

function isUserProfile(value: unknown): value is UserProfile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile['name'] === 'string' &&
    profile['name'].trim().length > 0 &&
    typeof profile['lastName'] === 'string' &&
    profile['lastName'].trim().length > 0 &&
    typeof profile['avatar'] === 'number' &&
    Number.isInteger(profile['avatar'])
  );
}

@Injectable({ providedIn: 'root' })
export class Profile {
  currentUser = signal<UserProfile | null>(this.load());

  private load(): UserProfile | null {
    if (typeof localStorage === 'undefined') return null;

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      const parsed: unknown = JSON.parse(data);
      if (isUserProfile(parsed)) return parsed;
    } catch {
      // Storage can be unavailable or contain data from an older client.
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // A storage failure must not prevent the application from starting.
    }
    return null;
  }

  save(profile: UserProfile): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    this.currentUser.set(profile);
  }

  hasProfile(): boolean {
    return this.currentUser() !== null;
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.currentUser.set(null);
  }
}
