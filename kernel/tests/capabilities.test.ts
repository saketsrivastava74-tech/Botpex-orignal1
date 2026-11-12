import { describe, it, expect } from 'vitest';
import { CapabilityRegistry } from '../src/capabilities.js';
import { isBotpexError, type CapabilityMap } from '@botpex/api';

const full: CapabilityMap = {
  'world.blockQueries': { supported: true },
  'world.entityTracking': { supported: true },
  'movement.controlStates': { supported: true },
  'movement.look': { supported: true },
  'combat.attack': { supported: true },
  'inventory.read': { supported: true },
  'inventory.equip': { supported: true },
  'inventory.useItem': { supported: true },
  'chat.send': { supported: true, notes: 'unsigned only' },
  'self.position': { supported: true }
};

describe('CapabilityRegistry', () => {
  it('requires present capabilities silently', () => {
    const caps = new CapabilityRegistry(full, 'mock');
    expect(() => caps.require('movement.controlStates')).not.toThrow();
    expect(caps.has('movement.controlStates')).toBe(true);
  });

  it('throws BOTPEX/CAPABILITY/UNSUPPORTED with driver name and note', () => {
    const caps = new CapabilityRegistry({}, 'native');
    expect(() => caps.require('combat.attack')).toThrowError(/native/);
    try {
      caps.require('combat.attack');
    } catch (error) {
      expect(isBotpexError(error)).toBe(true);
      if (isBotpexError(error)) {
        expect(error.code).toBe('BOTPEX/CAPABILITY/UNSUPPORTED');
        expect(error.details).toMatchObject({ capability: 'combat.attack', driver: 'native' });
        expect(error.hint).toContain('CAPABILITIES');
      }
    }
  });

  it('reports missing capabilities per feature', () => {
    const caps = new CapabilityRegistry(
      { 'world.blockQueries': { supported: true } },
      'lim'
    );
    const report = caps.missingForFeatures(['navigation', 'combat']);
    const nav = report.find((r) => r.feature === 'navigation');
    const combat = report.find((r) => r.feature === 'combat');
    expect(nav?.missing).toEqual(['movement.controlStates']);
    expect(combat?.missing).toEqual(['combat.attack']);
  });

  it('empty report when everything is supported', () => {
    const caps = new CapabilityRegistry(full, 'mock');
    expect(caps.missingForFeatures(['navigation', 'combat', 'chat'])).toEqual([]);
  });
});
