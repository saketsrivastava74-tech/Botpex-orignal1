# Getting started with Botpex

> **Botpex is the kernel, not the bot.** You build bots *on* it — the way distros build on Linux.

## Install / build (monorepo)

```bash
git clone <repo> Botpex && cd Botpex
npm ci
npm run build     # builds workspaces in dependency order
npm test          # 88 unit/contract/E2E tests
```

Node.js ≥ 20 required.

## Your first bot (60 seconds)

```bash
node developer-tools/dist/bin.js init my-bot
cd my-bot && npm install
npm run dev       # runs on the deterministic mock runtime — no server needed
```

Or programmatically:

```ts
import { createBot, defineBehaviour } from '@botpex/sdk';
import { bt } from '@botpex/kernel';

const wander = defineBehaviour('wander', bt.sequence(
  'wander',
  bt.wait('breathe', 1000),
  bt.action('step', async (ctx) => {
    const self = ctx.bot.self();
    await ctx.bot.moveTo(
      { x: Math.floor(self.position.x) + 3, y: Math.floor(self.position.y), z: Math.floor(self.position.z) },
      { timeoutMs: 20_000 }
    ).catch(() => {});           // navigation:failed events carry the reason
    return 'success' as const;
  })
));

const bot = await createBot({
  botId: 'my-first-bot',
  runtime: 'mock',               // 'mock' | 'native' | 'mineflayer' | DriverFactory
  driver: { host: 'localhost', username: 'Wanderer' },
  behaviours: [wander]
});
await bot.start();

bot.on('perception:entitySpawned', (e) => console.log('saw', e.kind, e.username ?? e.type));
```

The same code connects to a real server by changing one line: `runtime: 'native'`
(protocol client, kinematic movement in 0.1) or `runtime: 'mineflayer'`
(external engine, full physics). Capabilities are negotiated at start —
`createBot` fails fast with `BOTPEX/CAPABILITY/UNSUPPORTED` + a hint if a
requested feature is unavailable (see `CAPABILITIES.md`).

## Run against a real Minecraft server

```bash
npm run start:native -- --runtime native --host localhost --port 25565 --username MyBot
```

- **Offline-mode / local servers**: work out of the box (`auth: 'offline'`).
- **Microsoft accounts**: `auth: 'microsoft'` (handled by the protocol stack).
- Version support: `botpex doctor` prints the full matrix (1.20.4 → 26.1).

## The three layers you will touch

| Layer | Import | Purpose |
| --- | --- | --- |
| Behaviours | `defineBehaviour` + `bt.*` | Trees ticking every kernel tick (50 ms) |
| Brain | `defineBrain` / `RuleBrain` | Decisions from world state (rules, custom, AI) |
| FSM | `defineFSM` | High-level modes with guarded transitions |

All three see the world through the same `BotFacade` (`ctx.bot`): `self()`,
`entities()`, `blockAt()`, `moveTo()`, `attack()`, `sendChat()` — every call
capability-gated and every event on `bot.events`.

## CLI

```
botpex init [dir]            scaffold a project (templates/basic-bot)
botpex run <dir>             run a bot package (botpex.json)
botpex doctor                env + version-matrix diagnostics
botpex list-runtimes         builtin runtimes and their capability tables
```

## Next steps

- `ADVANCED_BOTS.md` — behaviour composition, brains, multi-bot pools, AI integration
- `BUILDING_DISTRIBUTIONS.md` — ship your own bot product on the kernel
- `ADAPTER_GUIDE.md` — connect a new runtime/engine
- `ARCHITECTURE.md` — how the kernel works inside
