/**
 * hello-bot — the smallest useful Botpex bot.
 *
 *   npm run start            # mock runtime (no server needed)
 *   npm run start:native     # real server (set --host/--username)
 *
 * Demonstrates: createBot, behaviours (behaviour tree), brains (rules),
 * perception events, capability-aware actions.
 */
import { createBot, defineBehaviour, defineFSM } from '@botpex/sdk';
import { bt } from '@botpex/kernel';
import { blockPos, distance } from '@botpex/api';

const argv = process.argv;
function argOf(name: string, fallback: string): string {
  const idx = argv.indexOf(name);
  return idx >= 0 ? (argv[idx + 1] ?? fallback) : fallback;
}
const runtime = argOf('--runtime', 'mock');
const host = argOf('--host', 'localhost');
const username = argOf('--username', 'Greeter');

const greeted = new Set<number>();

/** Wander: every few seconds, walk to a random nearby block. */
const wander = defineBehaviour(
  'wander',
  bt.sequence(
    'wander-tree',
    bt.wait('breathe', 800),
    bt.condition('cooled-down', (ctx) => (ctx.blackboard.get<number>('nextWanderAt') ?? 0) <= ctx.now),
    bt.action('pick-nearby-goal', async (ctx) => {
      const self = ctx.bot.self();
      const dx = Math.floor((Math.random() - 0.5) * 12);
      const dz = Math.floor((Math.random() - 0.5) * 12);
      const goal = blockPos(self.position.x + dx, self.position.y, self.position.z + dz);
      if (ctx.bot.blockAt(goal) === null) return 'failure' as const;
      ctx.blackboard.set('nextWanderAt', ctx.now + 4000);
      await ctx.bot.moveTo(goal, { timeoutMs: 15_000, goalRadius: 1.2 }).catch(() => {
        /* unreachable goals are skipped quietly — navigation:failed carries details */
      });
      return 'success' as const;
    })
  )
);

/** Brain: greet nearby players exactly once each. */
const brain = (ctx: import('@botpex/api').BrainContext) => {
  const self = ctx.self;
  const player = ctx.entities.find((e) => e.kind === 'player' && distance(e.position, self.position) < 6);
  if (player === undefined) return null;
  if (greeted.has(player.id)) return null;
  greeted.add(player.id);
  return { kind: 'chat' as const, message: `Hello ${player.username ?? 'player'}! I am ${ctx.bot.botId}.` };
};

async function main(): Promise<void> {
  const handle = await createBot({
    botId: 'hello-bot',
    runtime,
    driver: { host, username, version: runtime === 'mock' ? '1.21.4' : undefined },
    behaviours: [wander],
    brain,
    fsm: defineFSM({
      initial: 'wander',
      states: [{ name: 'wander' }, { name: 'social' }],
      transitions: [
        { from: 'wander', to: 'social', when: (ctx) => ctx.bot.entities().some((e) => e.kind === 'player') },
        { from: 'social', to: 'wander', when: (ctx) => ctx.bot.entities().every((e) => e.kind !== 'player') }
      ]
    })
  });

  handle.on('perception:entitySpawned', (e) => {
    console.log(
      `[hello-bot] noticed ${e.kind} "${e.username ?? e.type}" at ${Math.round(e.position.x)},${Math.round(e.position.z)}`
    );
  });
  handle.on('driver:chat', ({ message }) => {
    console.log(`[hello-bot] chat: ${message}`);
  });
  handle.on('navigation:arrived', ({ elapsedMs }) => {
    console.log(`[hello-bot] arrived (took ${elapsedMs} ms)`);
  });
  handle.on('runtime:warning', ({ scope, message }) => {
    console.warn(`[hello-bot] warning/${scope}: ${message}`);
  });

  await handle.start();
  console.log(`[hello-bot] started on runtime "${runtime}" — Ctrl+C to stop`);

  const shutdown = (): void => {
    void handle.stop('SIGINT').then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (runtime === 'mock') {
    // Drive the mock physics clock so movement actually happens in the demo.
    (handle.kernel.driver as unknown as { startClock?: () => void }).startClock?.();
    setTimeout(() => {
      console.log('[hello-bot] demo complete — stopping');
      void handle.stop('demo complete').then(() => process.exit(0));
    }, 12_000);
  }
}

await main();
