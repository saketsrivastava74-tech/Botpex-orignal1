/**
 * patrol-guard — an example "distribution" built on Botpex.
 *
 * A guard that patrols waypoints, detects hostile mobs inside a guard
 * radius, engages them with the combat system, and returns to its route.
 * Demonstrates the layered architecture of an advanced bot:
 *
 *   FSM (patrol ⇄ combat)  +  behaviour tree (route progression)
 *                          +  rule brain (target selection)
 *                          +  kernel systems (navigation/combat/perception)
 */
import { createBot, defineBehaviour } from '@botpex/sdk';
import { bt } from '@botpex/kernel';
import { distance, type EntitySnapshot, type Vec3 } from '@botpex/api';

const argv = process.argv;
function argOf(name: string, fallback: string): string {
  const idx = argv.indexOf(name);
  return idx >= 0 ? (argv[idx + 1] ?? fallback) : fallback;
}
const runtime = argOf('--runtime', 'mock');
const host = argOf('--host', 'localhost');
const username = argOf('--username', 'Guard');
const radius = Number(argOf('--radius', '8'));

/** Square patrol route around the spawn point (mock default). */
const WAYPOINTS: Vec3[] = [
  { x: 4.5, y: 9, z: 0.5 },
  { x: 8.5, y: 9, z: 4.5 },
  { x: 4.5, y: 9, z: 8.5 },
  { x: 0.5, y: 9, z: 4.5 }
];

let wpIndex = 0;
let engagedTargetId: number | null = null;

function pickHostile(entities: readonly EntitySnapshot[], from: Vec3): EntitySnapshot | null {
  let best: EntitySnapshot | null = null;
  let bestD = Infinity;
  for (const e of entities) {
    if (e.kind !== 'mob') continue;
    if (!e.type.includes('zombie') && !e.type.includes('skeleton') && !e.type.includes('spider')) continue;
    const d = distance(e.position, from);
    if (d < radius && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Route progression behaviour — only advances while not in combat. */
const route = defineBehaviour(
  'patrol-route',
  bt.sequence(
    'route',
    bt.condition('not-engaged', () => engagedTargetId === null),
    bt.wait('settle', 600),
    bt.action('goto-waypoint', async (ctx) => {
      const wp = WAYPOINTS[wpIndex % WAYPOINTS.length]!;
      const goal = { x: Math.floor(wp.x), y: Math.floor(wp.y), z: Math.floor(wp.z) };
      try {
        await ctx.bot.moveTo(goal, { timeoutMs: 20_000, goalRadius: 1.0 });
      } catch {
        return 'failure' as const; // blocked route: try next waypoint next round
      }
      wpIndex += 1;
      ctx.bot.log.info(`patrol: reached waypoint ${wpIndex % WAYPOINTS.length}`);
      return 'success' as const;
    })
  )
);

/** Brain: acquire/hold a hostile target; kernel combat does the fighting. */
const brain = (ctx: import('@botpex/api').BrainContext) => {
  if (engagedTargetId !== null) {
    const stillThere = ctx.entities.some((e) => e.id === engagedTargetId);
    if (stillThere) return null; // combat system is already attacking on tick
    engagedTargetId = null;
    ctx.bot.log.info('guard: target lost, resuming patrol');
    return null;
  }
  const hostile = pickHostile(ctx.entities, ctx.self.position);
  if (hostile === null) return null;
  engagedTargetId = hostile.id;
  ctx.bot.log.info(`guard: engaging ${hostile.type} #${hostile.id}`);
  return { kind: 'attack' as const, targetId: hostile.id };
};

async function main(): Promise<void> {
  const handle = await createBot({
    botId: 'patrol-guard',
    runtime,
    driver: { host, username, version: runtime === 'mock' ? '1.21.4' : undefined },
    kernel: {
      combat: { reach: 3.0, cooldownMs: 600 },
      navigation: { stuckTimeoutMs: 2500 }
    },
    behaviours: [{ ...route, priority: 10 }],
    brain
  });

  // Keep attacking the engaged target on every tick while it is in reach.
  handle.on('bot:tick', () => {
    if (engagedTargetId === null) return;
    if (handle.kernel.combat.engagedTargetId !== engagedTargetId) {
      try {
        handle.kernel.combat.engage(engagedTargetId);
      } catch {
        engagedTargetId = null; // target despawned between ticks
      }
    }
  });
  handle.on('combat:targetLost', () => {
    engagedTargetId = null;
  });
  handle.on('navigation:failed', ({ code, message }) => {
    handle.bot.log.warn(`navigation failed [${code}]: ${message}`);
  });

  await handle.start();
  console.log(`[patrol-guard] guarding a ${radius} m radius on runtime "${runtime}"`);

  const shutdown = (): void => {
    void handle.stop('SIGINT').then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (runtime === 'mock') {
    // Demo scenario on the mock runtime: wander + a zombie intrusion.
    (handle.kernel.driver as unknown as { startClock?: () => void }).startClock?.();
    const world = (handle.kernel.driver as unknown as { memoryWorld?: import('@botpex/testing').MemoryWorld }).memoryWorld;
    if (world !== undefined) {
      setTimeout(() => {
        const zombie = world.spawnEntity({ type: 'zombie', kind: 'mob', health: 6, position: { x: 2.5, y: 9, z: 2.5 } });
        console.log(`[patrol-guard] demo: zombie #${zombie.id} entered the guard radius`);
      }, 3000);
    }
    setTimeout(() => {
      console.log('[patrol-guard] demo complete — stopping');
      void handle.stop('demo complete').then(() => process.exit(0));
    }, 15_000);
  }
}

await main();
