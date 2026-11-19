import '@analogjs/vitest-angular/setup-zone';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

// Polyfill localStorage/sessionStorage for jsdom (not provided by default)
const createStorage = () => {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.get(key) ?? null; },
    setItem(key: string, value: string) { store.set(key, value); },
    removeItem(key: string) { store.delete(key); },
    key(index: number) { return Array.from(store.keys())[index] ?? null; },
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: createStorage(), writable: true });
}
if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', { value: createStorage(), writable: true });
}

// Vitest >=4.0.5 no longer re-executes setup files between spec files when
// `isolate: false` (which Angular's test environments force), so a plain
// `initTestEnvironment` throws "Cannot set base providers because it has
// already been called" on the second file sharing the same worker. Resetting
// first makes the setup idempotent (mirrors analogjs/analog#2244).
getTestBed().resetTestEnvironment();
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);
