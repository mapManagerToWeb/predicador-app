import '@analogjs/vitest-angular/setup-zone';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

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
