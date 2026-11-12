import { describe, it, expect } from 'vitest';
import { EntityRegistry } from '../src/entity.js';
import { entitySnapshot, type EntitySnapshot } from './helpers.js';
import { vec3 } from '@botpex/api';

describe('EntityRegistry', () => {
  it('upsert returns spawned then updated', () => {
    const reg = new EntityRegistry();
    const e = entitySnapshot(1, { position: vec3(0, 8, 0) });
    expect(reg.upsert(e)).toBe('spawned');
    expect(reg.upsert({ ...e, health: 5 })).toBe('updated');
    expect(reg.count()).toBe(1);
  });

  it('radius query sorts by distance and filters', () => {
    const reg = new EntityRegistry();
    reg.upsert(entitySnapshot(1, { position: vec3(1, 8, 1) }));
    reg.upsert(entitySnapshot(2, { position: vec3(5, 8, 5) }));
    reg.upsert(entitySnapshot(3, { position: vec3(2, 8, 2), kind: 'player' }));
    const near = reg.byRadius(vec3(0, 8, 0), 10, (e) => e.kind === 'mob');
    expect(near.map((e) => e.id)).toEqual([1, 2]);
    const closest = reg.byRadius(vec3(0, 8, 0), 100);
    expect(closest[0]?.id).toBe(1);
  });

  it('remove returns the last snapshot', () => {
    const reg = new EntityRegistry();
    const e: EntitySnapshot = entitySnapshot(7, {});
    reg.upsert(e);
    expect(reg.remove(7)).toMatchObject({ id: 7 });
    expect(reg.remove(7)).toBeNull();
  });

  it('evicts oldest non-player entities beyond cache cap', () => {
    const reg = new EntityRegistry({ cacheCap: 3 });
    const mk = (id: number, kind: 'mob' | 'player', seen: number) =>
      entitySnapshot(id, { kind, lastSeenMs: seen });
    reg.upsert(mk(1, 'mob', 1));
    reg.upsert(mk(2, 'mob', 2));
    reg.upsert(mk(3, 'player', 3));
    reg.upsert(mk(4, 'mob', 4));
    reg.upsert(mk(5, 'mob', 5));
    expect(reg.count()).toBe(3);
    // oldest mob (id 1) gone, player kept
    expect(reg.get(1)).toBeNull();
    expect(reg.get(3)).not.toBeNull();
  });
});
