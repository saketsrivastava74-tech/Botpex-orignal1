# Building distributions on Botpex

Botpex's purpose: **anyone can fork the ecosystem, not the framework**. A
"distribution" is an independent bot product built on the kernel — Crystal PvP
Bot, Survival Automation Bot, Parkour Bot, NPC Framework — each with its own
name, roadmap and community.

## What a distribution is

```
my-pvp-bot/
├── botpex.json        # the distribution manifest
├── package.json
├── src/               # your behaviours, brains, FSMs, adapters, extensions
└── README.md          # your product, your docs
```

`botpex.json` (spec v1, validated by `@botpex/package-spec`):

```jsonc
{
  "spec": "botpex/v1",
  "name": "crystal-pvp-bot",
  "version": "0.1.0",
  "main": "./dist/main.js",
  "kernel": { "api": "^0.1.0" },       // semver range against the kernel API
  "runtimes": ["native", "mineflayer"],
  "permissions": ["world:read", "movement:control", "combat:attack", "events:subscribe"],
  "bot": { "displayName": "Crystal PvP Bot", "tags": ["pvp", "1.21"] }
}
```

The kernel API range is enforced at load: a distribution built for
`^0.1.0` refuses to run on an incompatible kernel (`BOTPEX/ADAPTER/API_MISMATCH`)
instead of misbehaving.

## Entry convention

```ts
// src/main.ts → built to dist/main.js
import type { CreateBotConfig } from '@botpex/sdk';
export default async function main(ctx: { createBot: ...; runtime: string }) {
  const bot = await ctx.createBot({ /* your config */ });
  await bot.start();
}
```

`botpex run <dir>` validates the package, then executes the entry.

## Rules of the ecosystem

1. **Do not fork the kernel to customize a bot.** Behaviours/brains/adapters
   are extension points; kernel PRs are for everyone.
2. **Distributions may be licensed differently** — they are your work. The
   kernel stays Apache-2.0.
3. **Declare runtimes honestly** in `runtimes` — the loader checks them.
4. **Permission strings in `botpex.json`** document what your bot does; hosts
   may use them for consent UIs.
5. Ship a CHANGELOG and SECURITY contact — you are an infrastructure project
   now.

## Why this works (the Linux analogy)

| Linux | Botpex |
| --- | --- |
| kernel | `@botpex/kernel` (systems: entity, perception, movement, navigation, combat, inventory, behaviour, intelligence, event, runtime) |
| drivers | runtime adapters (`IDriver`) |
| distros | bot distributions (`botpex.json` packages) |
| packages | extensions (permission-gated) |
| POSIX | `@botpex/api` + `@botpex/sdk` |

Examples to copy: `examples/hello-bot` (minimal), `examples/patrol-guard`
(FSM + BT + brain), `templates/basic-bot` (scaffold).
