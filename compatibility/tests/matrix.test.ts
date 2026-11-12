import { describe, it, expect } from 'vitest';
import {
  VERSION_MATRIX,
  compareVersions,
  featureEnabled,
  supportLevel,
  isSupported,
  protocolOf,
  summary
} from '../src/index.js';

describe('version matrix', () => {
  it('loads curated entries', () => {
    expect(VERSION_MATRIX.length).toBeGreaterThanOrEqual(10);
    expect(isSupported('1.20.4', 'native')).toBe(true);
    expect(isSupported('1.20.4', 'mineflayer')).toBe(true);
  });

  it('orders classic and calendar versions correctly', () => {
    expect(compareVersions('1.21.4', '1.21.3')).toBeGreaterThan(0);
    expect(compareVersions('1.21.11', '1.21.9')).toBeGreaterThan(0);
    expect(compareVersions('26.1', '1.21.11')).toBeGreaterThan(0);
    expect(compareVersions('1.20.4', '26.1')).toBeLessThan(0);
    expect(compareVersions('1.21', '1.21')).toBe(0);
  });

  it('evaluates feature flags', () => {
    expect(featureEnabled('attackCooldown', '1.8.9')).toBe(false);
    expect(featureEnabled('attackCooldown', '1.9')).toBe(true);
    expect(featureEnabled('chatSigning', '1.19.1')).toBe(true);
    expect(featureEnabled('chatSigning', '1.19')).toBe(false);
    expect(featureEnabled('configurationPhase', '1.20.2')).toBe(true);
    expect(featureEnabled('calendarVersioning', '26.1')).toBe(true);
    expect(featureEnabled('calendarVersioning', '1.21.11')).toBe(false);
  });

  it('resolves support levels and unknown versions honestly', () => {
    expect(supportLevel('1.20.4', 'native')).toBe('supported');
    expect(supportLevel('26.1', 'native')).toBe('best-effort');
    expect(supportLevel('1.2.3', 'native')).toBe('unknown');
    expect(isSupported('1.2.3', 'mineflayer')).toBe(false);
  });

  it('maps known protocol numbers and nulls otherwise', () => {
    expect(protocolOf('1.20.4')).toBe(765);
    expect(protocolOf('1.21.4')).toBe(769);
    expect(protocolOf('26.1')).toBeNull();
  });

  it('summary renders rows', () => {
    const s = summary();
    expect(s).toContain('1.20.4');
    expect(s).toContain('26.1');
  });
});
