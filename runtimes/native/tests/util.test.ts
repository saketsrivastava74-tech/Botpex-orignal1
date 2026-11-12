import { describe, it, expect } from 'vitest';
import {
  flattenChat,
  relativeMoveFactor,
  isModernPacketShape,
  hasFlattenedItemIds,
  yawToDirection,
  SPEEDS
} from '../src/util.js';
import { nativeCapabilities } from '../src/capabilities.js';

describe('native util', () => {
  it('relativeMoveFactor is stable and documented', () => {
    expect(relativeMoveFactor('1.8.9')).toBe(4096);
    expect(relativeMoveFactor('1.21.4')).toBe(4096);
  });

  it('flattens JSON text components', () => {
    expect(flattenChat('hello')).toBe('hello');
    expect(flattenChat({ text: 'hi' })).toBe('hi');
    expect(flattenChat({ text: 'a', extra: [{ text: 'b' }, 'c'] })).toBe('abc');
    expect(flattenChat({ translate: '%s joined', with: [{ text: 'Bob' }] })).toBe('Bob joined');
    expect(flattenChat({ translate: '%2$s then %1$s', with: ['A', 'B'] })).toBe('B then A');
    expect(flattenChat([{ text: 'x' }, { text: 'y' }])).toBe('xy');
    expect(flattenChat(null)).toBe('');
  });

  it('classifies packet shapes per version', () => {
    expect(isModernPacketShape('1.16.5')).toBe(false);
    expect(isModernPacketShape('1.17.1')).toBe(true);
    expect(isModernPacketShape('1.21.4')).toBe(true);
    expect(isModernPacketShape('26.1')).toBe(true);
  });

  it('detects flattened item ids (1.13.2+)', () => {
    expect(hasFlattenedItemIds('1.12.2')).toBe(false);
    expect(hasFlattenedItemIds('1.13.2')).toBe(true);
    expect(hasFlattenedItemIds('1.20.4')).toBe(true);
  });

  it('yaw directions follow Minecraft conventions', () => {
    expect(yawToDirection(0)).toEqual({ x: -0, z: 1 }); // south
    expect(yawToDirection(90).x).toBeCloseTo(-1); // west
    expect(yawToDirection(180).z).toBeCloseTo(-1); // north
  });

  it('vanilla speeds', () => {
    expect(SPEEDS.walk).toBeCloseTo(4.317);
    expect(SPEEDS.sprint).toBeCloseTo(5.612);
  });
});

describe('native capabilities', () => {
  it('declares movement.physics unsupported with an explanatory note', () => {
    const caps = nativeCapabilities();
    expect(caps['movement.physics']?.supported).toBe(false);
    expect(caps['movement.physics']?.notes).toContain('kinematic');
  });

  it('every unsupported entry carries a note (contract rule)', () => {
    for (const info of Object.values(nativeCapabilities())) {
      if (info.supported === false) expect(info.notes).toBeDefined();
    }
  });
});
