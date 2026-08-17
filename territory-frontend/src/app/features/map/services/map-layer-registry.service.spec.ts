import { describe, it, expect, beforeEach } from 'vitest';
import { MapLayerRegistry } from './map-layer-registry.service';
import type { Path } from 'leaflet';

describe('MapLayerRegistry', () => {
  let registry: MapLayerRegistry;
  const fakeLayer = (id: string) => ({ __id: id }) as unknown as Path;

  beforeEach(() => {
    registry = new MapLayerRegistry();
  });

  it('starts empty', () => {
    expect(registry.get('m1')).toBeNull();
    expect(Array.from(registry.values())).toEqual([]);
  });

  it('returns null for an unregistered id', () => {
    expect(registry.get('missing')).toBeNull();
  });

  it('registers and retrieves a layer', () => {
    const layer = fakeLayer('m1');
    registry.register('m1', layer);

    expect(registry.get('m1')).toBe(layer);
  });

  it('overwrites a layer registered under the same id', () => {
    const first = fakeLayer('a');
    const second = fakeLayer('b');
    registry.register('m1', first);
    registry.register('m1', second);

    expect(registry.get('m1')).toBe(second);
  });

  it('unregisters a layer by id', () => {
    registry.register('m1', fakeLayer('a'));
    registry.unregister('m1');

    expect(registry.get('m1')).toBeNull();
  });

  it('clears all layers', () => {
    registry.register('m1', fakeLayer('a'));
    registry.register('m2', fakeLayer('b'));
    registry.clear();

    expect(registry.get('m1')).toBeNull();
    expect(registry.get('m2')).toBeNull();
    expect(Array.from(registry.values())).toEqual([]);
  });

  it('hasLayer detects tracked live layers by reference', () => {
    const layer = fakeLayer('a');
    const other = fakeLayer('b');
    registry.register('m1', layer);

    expect(registry.hasLayer(layer)).toBe(true);
    expect(registry.hasLayer(other)).toBe(false);
  });

  it('values iterates the tracked layers', () => {
    const a = fakeLayer('a');
    const b = fakeLayer('b');
    registry.register('m1', a);
    registry.register('m2', b);

    expect(Array.from(registry.values())).toEqual([a, b]);
  });
});
