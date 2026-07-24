import { Injectable, signal } from '@angular/core';
import { UserProfile } from '../models/models';

const STORAGE_KEY = 'predicador_profile';

@Injectable({ providedIn: 'root' })
export class Profile {
  currentUser = signal<UserProfile | null>(this.load());

  private load(): UserProfile | null {
    if (typeof localStorage === 'undefined') return null;
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
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
