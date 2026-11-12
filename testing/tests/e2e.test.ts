/**
 * Kernel E2E over the mock runtime: navigation (arrival, no-path, replan),
 * combat (engage → kill), perception events, capability gating.
 */
import { describe, it, expect, vi } from 'vitest';
import { createTestBot, simulate, advanceTicks, type TestBot } from '../src/index.js';
import { isBotpexError, blockPos, distance, vec3 } from '@botpex/api';

async function stopped(bot: Promise<TestBot> | TestBot): Promise<TestBot> {
  const b = await bot;
  return b;
}

describe('navigation E2E', () => {
  it('walks to a goal across the mock world', async () => {
    const b = await stopped(createTestBot({ botId: 'nav-e2e' }));
    b.driver.startClock();
    await b.kernel.navigation.goto(blockPos(10, 9, 0), { timeoutMs: 30_000 });
    b.driver.stopClock();
    expect(distance(b.driver.self().position, { x: 10.5, y: 9, z: 0.5 })).toBeLessThan(2);
    await b.stop();
  });

  it('rejects unreachable goals with BOTPEX/NAV/NO_PATH', async () => {
    const b = await stopped(createTestBot({ botId: 'nav-blocked' }));
    // seal the bot in a box (walls at feet+head level, y=9 and y=10)
    const self = b.driver.self().position;
    const x = Math.floor(self.x);
    const z = Math.floor(self.z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      b.driver.memoryWorld.setBlock({ x: x + dx, y: 9, z: z + dz }, 'stone');
      b.driver.memoryWorld.setBlock({ x: x + dx, y: 10, z: z + dz }, 'stone');
    }
    await expect(b.kernel.navigation.goto(blockPos(x + 6, 9, z), { timeoutMs: 10_000 })).rejects.toMatchObject({
      code: 'BOTPEX/NAV/NO_PATH'
    });
    await b.stop();
  });

  it('replans when the path is blocked mid-route', async () => {
    const b = await stopped(createTestBot({ botId: 'nav-replan' }));
    b.driver.startClock();
    const goal = blockPos(12, 9, 0);
    const arrival = b.kernel.navigation.goto(goal, { timeoutMs: 40_000, maxReplans: 3 });
    // let it start walking, then drop a wall ahead of it
    setTimeout(() => {
      for (let y = 9; y <= 10; y++) {
        for (let z = -3; z <= 3; z++) {
          b.driver.memoryWorld.setBlock({ x: 5, y, z }, 'stone');
        }
      }
    }, 400);
    await arrival; // must eventually arrive (around the wall via replanning)
    b.driver.stopClock();
    expect(b.driver.self().position.x).toBeGreaterThan(8);
    await b.stop();
  }, 30_000);
});

describe('combat E2E', () => {
  it('engages and kills a nearby hostile, then reports target lost', async () => {
    const b = await stopped(createTestBot({ botId: 'combat-e2e' }));
    const zombie = b.driver.memoryWorld.spawnEntity({
      type: 'zombie',
      kind: 'mob',
      position: vec3(2.5, 9, 0.5),
      health: 4
    });

    const lost = new Promise<string>((resolve) => {
      b.kernel.bus.on('combat:targetLost', (e) => resolve(e.reason));
    });
    b.kernel.combat.engage(zombie.id);
    await simulate(b.kernel, b.driver, 2500);
    const reason = await lost;
    expect(reason).toBe('target disappeared');
    expect(b.driver.memoryWorld.entity(zombie.id)).toBeNull();
    expect(b.kernel.combat.engagedTargetId).toBeNull();
    await b.stop();
  });

  it('refuses out-of-reach attacks', async () => {
    const b = await stopped(createTestBot({ botId: 'combat-range' }));
    const far = b.driver.memoryWorld.spawnEntity({
      type: 'zombie',
      kind: 'mob',
      position: vec3(30.5, 9, 0.5),
      health: 20
    });
    await expect(b.kernel.combat.attack(far.id)).rejects.toMatchObject({ code: 'BOTPEX/COMBAT/NO_TARGET' });
    await b.stop();
  });
});

describe('perception E2E', () => {
  it('emits semantic spawn/move/despawn events', async () => {
    const b = await stopped(createTestBot({ botId: 'perc-e2e' }));
    const spawned = vi.fn();
    const despawned = vi.fn();
    b.kernel.bus.on('perception:entitySpawned', spawned);
    b.kernel.bus.on('perception:entityDespawned', despawned);

    const cow = b.driver.memoryWorld.spawnEntity({ type: 'cow', kind: 'mob', position: vec3(3.5, 9, 3.5) });
    await advanceTicks(b.kernel, 2);
    expect(spawned).toHaveBeenCalled();

    b.driver.memoryWorld.removeEntity(cow.id);
    await advanceTicks(b.kernel, 2);
    expect(despawned).toHaveBeenCalled();
    await b.stop();
  });

  it('gates actions behind capabilities with loud errors', async () => {
    const b = await stopped(
      createTestBot({ botId: 'cap-gate', disableCapabilities: ['combat.attack'] })
    );
    const zombie = b.driver.memoryWorld.spawnEntity({ type: 'zombie', kind: 'mob', position: vec3(2.5, 9, 0.5) });
    try {
      await b.kernel.combat.attack(zombie.id);
      throw new Error('should have thrown');
    } catch (error) {
      expect(isBotpexError(error)).toBe(true);
      if (isBotpexError(error)) {
        expect(error.code).toBe('BOTPEX/CAPABILITY/UNSUPPORTED');
        expect(error.hint).toContain('CAPABILITIES');
      }
    }
    await b.stop();
  });
});
