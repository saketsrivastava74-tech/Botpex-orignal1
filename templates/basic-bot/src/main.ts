/**
 * My Botpex bot — starter template.
 *
 * Layers to grow into (see documentation/ADVANCED_BOTS.md):
 *   1. Behaviours  — behaviour trees that run every tick (defineBehaviour)
 *   2. Brain       — decisions from world state (RuleBrain / custom / AI)
 *   3. FSM         — high-level modes (idle/patrol/combat/...)
 *   4. Extensions  — packaged, permission-gated add-ons
 *
 * Run with:
 *   npm run dev               # in-memory mock runtime
 *   npm run start:native      # a real Minecraft server (add --host ...)
 */
import { createBot, defineBehaviour } from '@botpex/sdk';
import { bt } from '@botpex/kernel';
import { blockPos } from '@botpex/api';

const runtime = process.argv.includes('--runtime')
  ? (process.argv[process.argv.indexOf('--runtime') + 1] ?? 'mock')
  : 'mock';

/** Stand still and look around, politely. Replace with your own logic. */
const idle = defineBehaviour(
  'idle',
  bt.sequence(
    'idle-tree',
    bt.wait('pause', 2000),
    bt.action('look-around', async (ctx) => {
      await ctx.bot.look(45, 10).catch(() => {
        /* runtime without look capability — fine, we simply don't rotate */
      });
      return 'success' as const;
    })
  )
);

const handle = await createBot({
  botId: 'my-bot',
  runtime,
  driver: {
    host: process.env.BOTPEX_HOST ?? 'localhost',
    port: process.env.BOTPEX_PORT !== undefined ? Number(process.env.BOTPEX_PORT) : undefined,
    username: process.env.BOTPEX_USERNAME ?? 'MyBot',
    version: runtime === 'mock' ? '1.21.4' : process.env.BOTPEX_VERSION
  },
  behaviours: [idle]
});

handle.on('bot:phase', ({ to }) => console.log(`[my-bot] phase → ${to}`));
handle.on('perception:entitySpawned', (e) => console.log(`[my-bot] saw ${e.kind} "${e.username ?? e.type}"`));

await handle.start();
console.log(`[my-bot] running on "${runtime}"`);

process.on('SIGINT', () => {
  void handle.stop('SIGINT').then(() => process.exit(0));
});
