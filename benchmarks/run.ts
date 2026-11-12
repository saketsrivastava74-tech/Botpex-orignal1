/**
 * Botpex benchmarks: event bus throughput, A* pathfinding latency,
 * entity-diff cost. Run: npm run bench [-- --smoke]
 */
import { performance } from 'node:perf_hooks';
import { EventBus } from '@botpex/kernel';
import { findPath } from '@botpex/kernel';
import { EntityRegistry } from '@botpex/kernel';
import { blockPos, vec3, type BlockInfo, type BlockPos } from '@botpex/api';

const smoke = process.argv.includes('--smoke');

function groundGrid(size: number): { getBlock(p: BlockPos): BlockInfo | null; isLoaded(p: BlockPos): boolean } {
  const solid: BlockInfo = { name: 'grass_block', flags: { solid: true, liquid: false, passable: false }, hardness: 0.6 };
  const air: BlockInfo = { name: 'air', flags: { solid: false, liquid: false, passable: true }, hardness: 0 };
  return {
    getBlock(p) {
      if (p.y < 8) return solid;
      return air;
    },
    isLoaded(p) {
      return p.x >= 0 && p.z >= 0 && p.x < size && p.z < size;
    }
  };
}

function bench(name: string, fn: () => number): void {
  const ms = fn();
  console.log(`${name.padEnd(34)} ${ms.toFixed(1)} ms`);
}

console.log(`Botpex benchmarks${smoke ? ' (smoke)' : ''}\n`);

// 1. Event bus throughput
bench('event bus: emit+handle ops', () => {
  const bus = new EventBus();
  let sum = 0;
  bus.on('bot:tick', (p) => {
    sum += p.tick;
  });
  const iterations = smoke ? 20_000 : 200_000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) bus.emit('bot:tick', { tick: i, dtMs: 50 });
  const ms = performance.now() - start;
  const opsPerSec = (iterations / ms) * 1000;
  console.log(`  → ${(opsPerSec / 1000).toFixed(0)}k ops/s (sum=${sum > 0 ? 'ok' : '??'})`);
  return ms;
});

// 2. A* pathfinding
{
  const grid = groundGrid(128);
  const paths = smoke ? 20 : 200;
  let planned = 0;
  bench(`A*: ${paths} paths across a 128² world`, () => {
    const start = performance.now();
    for (let i = 0; i < paths; i++) {
      const sx = (i * 13) % 100;
      const sz = (i * 29) % 100;
      const res = findPath(grid, vec3(sx + 0.5, 8, sz + 0.5), blockPos((sx + 40) % 128, 8, (sz + 40) % 128), {
        maxNodes: 20_000
      });
      if (res !== null) planned++;
    }
    return performance.now() - start;
  });
  console.log(`  → ${planned}/${paths} paths found (walking surface y=8)`);
}

// 3. Entity diff / radius query
bench(`entity registry: ${smoke ? 5 : 50} radius queries over 1000 entities`, () => {
  const reg = new EntityRegistry();
  for (let i = 0; i < 1000; i++) {
    reg.upsert({
      id: i,
      kind: i % 5 === 0 ? 'player' : 'mob',
      type: 'zombie',
      position: { x: (i * 7) % 100, y: 9, z: (i * 3) % 100 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      health: 20,
      lastSeenMs: i
    });
  }
  const start = performance.now();
  const queries = smoke ? 5 : 50;
  for (let q = 0; q < queries; q++) {
    reg.byRadius(vec3(q % 100, 9, (q * 2) % 100), 25);
  }
  return performance.now() - start;
});
