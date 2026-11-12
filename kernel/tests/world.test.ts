import { describe, it, expect } from 'vitest';
import { WorldModel } from '../src/world.js';
import { EntityRegistry } from '../src/entity.js';
import type { BlockSource, } from '../src/world.js';
import { blockPos, type BlockInfo, type BlockPos, type Bounds } from '@botpex/api';

function fakeSource(): BlockSource & { setBlock(p: BlockPos, b: BlockInfo | null): void } {
  const data = new Map<string, BlockInfo | null>();
  const solid: BlockInfo = { name: 'stone', flags: { solid: true, liquid: false, passable: false }, hardness: 1.5 };
  const air: BlockInfo = { name: 'air', flags: { solid: false, liquid: false, passable: true }, hardness: 0 };
  return {
    getBlock(pos) {
      return data.has(`${pos.x},${pos.y},${pos.z}`) ? (data.get(`${pos.x},${pos.y},${pos.z}`) ?? null) : air;
    },
    isLoaded() {
      return true;
    },
    loadedBounds(): Bounds | null {
      return { min: blockPos(-64, -64, -64), max: blockPos(64, 320, 64) };
    },
    setBlock(p, b) {
      data.set(`${p.x},${p.y},${p.z}`, b);
    }
  };
}

describe('WorldModel', () => {
  it('caches read-through block data and invalidates on update', () => {
    const src = fakeSource();
    const entities = new EntityRegistry();
    const world = new WorldModel(src, entities, { blockCacheSize: 100 });
    const p = blockPos(1, 8, 1);
    expect(world.getBlock(p)?.name).toBe('air');
    src.setBlock(p, { name: 'stone', flags: { solid: true, liquid: false, passable: false }, hardness: 1.5 });
    // cached value still served until invalidation
    expect(world.getBlock(p)?.name).toBe('air');
    world.invalidate(p);
    expect(world.getBlock(p)?.name).toBe('stone');
  });

  it('evicts least-recently-used entries beyond capacity', () => {
    const src = fakeSource();
    const world = new WorldModel(src, new EntityRegistry(), { blockCacheSize: 2 });
    const a = blockPos(0, 0, 0);
    const b = blockPos(1, 0, 0);
    const c = blockPos(2, 0, 0);
    world.getBlock(a);
    world.getBlock(b);
    world.getBlock(a); // refresh a
    world.getBlock(c); // evicts b
    expect(world.cachedBlockCount).toBe(2);
  });

  it('delegates entity queries to the registry', () => {
    const world = new WorldModel(fakeSource(), new EntityRegistry());
    expect(world.entities()).toEqual([]);
    expect(world.entity(42)).toBeNull();
  });
});
