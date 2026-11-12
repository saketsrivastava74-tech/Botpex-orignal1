import { describe, it, expect } from 'vitest';
import { findPath } from '../src/navigation/astar.js';
import { blockPos, vec3, type BlockInfo, type BlockPos } from '@botpex/api';

/**
 * Synthetic flat world: ground at y=8 (solid stone), air above, optional
 * walls/holes registered in a map. Unregistered = air.
 */
function grid(walls: string[] = [], holes: string[] = []) {
  const wall: BlockInfo = { name: 'stone', flags: { solid: true, liquid: false, passable: false }, hardness: 1.5 };
  const air: BlockInfo = { name: 'air', flags: { solid: false, liquid: false, passable: true }, hardness: 0 };
  const solidGround: BlockInfo = wall;
  const wallSet = new Set(walls);
  const holeSet = new Set(holes);
  const get = (p: BlockPos): BlockInfo | null => {
    const key = `${p.x},${p.y},${p.z}`;
    if (p.y >= 9) return wallSet.has(key) ? wall : air;
    if (p.y === 8) return holeSet.has(key) ? air : solidGround;
    if (p.y < 8) return solidGround;
    return air;
  };
  return {
    getBlock: get,
    isLoaded: () => true
  };
}

describe('findPath (grid A*)', () => {
  it('walks a straight line', () => {
    const res = findPath(grid(), vec3(0.5, 9, 0.5), blockPos(5, 9, 0));
    expect(res).not.toBeNull();
    const last = res!.path.points[res!.path.points.length - 1];
    expect(last).toEqual({ x: 5.5, y: 9, z: 0.5 });
    expect(res!.path.points.length).toBe(6);
  });

  it('detours around a wall', () => {
    const walls = ['2,9,0', '2,10,0', '2,9,-1', '2,10,-1', '2,9,1', '2,10,1'];
    const res = findPath(grid(walls), vec3(0.5, 9, 0.5), blockPos(4, 9, 0));
    expect(res).not.toBeNull();
    const blocked = new Set(['2,9,-1', '2,9,0', '2,9,1']);
    for (const p of res!.path.points) {
      const key = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
      expect(blocked.has(key)).toBe(false);
    }
    expect(res!.path.cost).toBeGreaterThan(4);
  });

  it('returns null when the goal is sealed off', () => {
    const walls = [
      '3,9,2', '3,10,2', '3,9,3', '3,10,3', '3,9,4', '3,10,4',
      '4,9,2', '4,10,2', '4,9,4', '4,10,4',
      '5,9,2', '5,10,2', '5,9,3', '5,10,3', '5,9,4', '5,10,4'
    ];
    const res = findPath(grid(walls), vec3(0.5, 9, 0.5), blockPos(4, 9, 3));
    expect(res).toBeNull();
  });

  it('steps up one block with jump cost', () => {
    // platform at y=9 for x>=3 (solid block at y=8 in column 3..6 → walking surface y=9? adjust: solid pillar top at y=9)
    const g = grid(['3,9,0', '4,9,0', '5,9,0']);
    // top of pillar at y=9 solid; standable at y=10
    const res = findPath(g, vec3(0.5, 9, 0.5), blockPos(5, 10, 0));
    expect(res).not.toBeNull();
    const costs = res!.path.cost;
    expect(costs).toBeGreaterThan(5); // includes jump penalties
  });

  it('falls up to maxFall blocks', () => {
    const holes = ['2,8,0', '3,8,0'];
    // deep pit below x=2,3 (holes in ground at y=8 → nothing until y<8 which is solid again)
    const g = grid([], holes);
    const res = findPath(g, vec3(0.5, 9, 0.5), blockPos(4, 9, 0));
    expect(res).not.toBeNull();
  });

  it('respects the node budget without partial acceptance', () => {
    const res = findPath(grid(), vec3(0.5, 9, 0.5), blockPos(500, 9, 500), { maxNodes: 10 });
    expect(res).toBeNull();
  });

  it('returns a partial path when accepted', () => {
    const res = findPath(grid(), vec3(0.5, 9, 0.5), blockPos(500, 9, 500), {
      maxNodes: 300,
      acceptPartial: true
    });
    expect(res).not.toBeNull();
    expect(res!.path.points.length).toBeGreaterThan(2);
  });

  it('returns zero-cost path when standing on the goal', () => {
    const res = findPath(grid(), vec3(4.2, 9, 0.2), blockPos(4, 9, 0));
    expect(res).not.toBeNull();
    expect(res!.path.cost).toBe(0);
  });
});
