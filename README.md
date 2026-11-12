<div align="center">

# Botpex

### One Kernel. Unlimited Bots.

An open-source, modular **Minecraft bot kernel** — a common foundation for
developers to create, customize, extend and distribute their own Minecraft bot
systems.

[![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-green?style=flat-square)](package.json)
[![Tests](https://img.shields.io/badge/tests-88%20passing-brightgreen?style=flat-square)](VERIFICATION.md)

**Botpex is the kernel, not the bot.** · `Apache-2.0` · TypeScript · Node ≥ 20 · MC 1.20.4 → 26.1

[Why](#why) · [Kernel systems](#the-ten-kernel-systems) · [Runtimes](#runtimes--capability-honesty) ·
[Quick start](#quick-start) · [First bot](#your-first-bot) · [Advanced bots](#building-hyper-advanced-bots) ·
[Packages](#packages) · [Status](#status--honest-limitations) · [Docs](#documentation) · [Contributing](#community)

</div>

---

> Like the Linux ecosystem: one kernel, many distributions. Botpex ships the
> hard, reusable floor every Minecraft bot needs — world state, entities,
> movement, navigation, combat, inventory, behaviour, intelligence, events,
> runtime — and **you** build the bot product on top of it.

## Why

Every Minecraft bot project rebuilds the same floor: connection, world state,
entity tracking, movement, pathfinding, combat, inventory, event plumbing —
usually forked from a framework that couples all of it together. Botpex applies
the Linux model instead: a small, independent **kernel**; swappable
**runtimes/adapters** where protocol and engine knowledge live; and a
**developer SDK** on top. Distros, not forks.

```text
                 your bot project / distribution (botpex.json)
        ┌───────────────────────────────────────────────────────┐
        │  behaviours (trees) · brains · FSM · extensions       │
        ├──────────────────── @botpex/sdk ──────────────────────┤
        │  Botpex KERNEL                                        │
        │  entity · perception · movement · navigation (A*)     │
        │  combat · inventory · behaviour · intelligence        │
        │  event bus · runtime (lifecycle/scheduler/watchdog)   │
        ├────────────────── IDriver port ───────────────────────┤
        │  native (protocol client)   mineflayer (engine)  …    │
        └───────────────────────────────────────────────────────┘
```

| Design pillar | What it means |
| --- | --- |
| **Hybrid kernel** | An independently developed native core *plus* external engine integrations, both behind one unified API. The kernel has **zero** Minecraft dependencies — no external framework is a kernel dependency. |
| **Capability honesty** | Runtimes declare what they support; unsupported operations fail loudly with error codes and hints. Never silent no-ops, never fake success. |
| **Distribution-ready** | The `botpex.json` package format, semver API ranges, permission-gated extensions and adapter manifests let you ship *your* bot as a standalone product. |
| **Hyper-advanced capable** | Behaviour trees, guarded FSMs, pluggable brains (rules today, your own AI tomorrow — no mandatory paid APIs), grid-A* navigation with replanning, reach/LOS combat, multi-bot pools. |

### What Botpex is — and is not

| Botpex **is** | Botpex is **not** |
| --- | --- |
| A modular kernel of reusable bot systems | A predefined collection of ready-made bots |
| A foundation to build bot distributions on | A single-purpose PvP bot |
| A unified SDK over multiple runtimes | A bot management application / control panel |
| An open distribution & extension ecosystem | A cloud service or paid product |
| 100% free and open source (Apache-2.0) | A cheat client — no x-ray, no movement exploits |

## The ten kernel systems

Every system is an independent module with a public API boundary, composed by
the `BotKernel` orchestrator:

| # | System | Responsibility |
| --- | --- | --- |
| 1 | **Entity** | Entity registry: snapshot diffing, radius queries, cache caps |
| 2 | **Perception** | Driver-event bridge, semantic spawn/move/despawn diffs, staleness |
| 3 | **Movement** | Controls, face/look math, capability-gated locomotion |
| 4 | **Navigation** | Grid A* (diagonals, step-up, falls, costs, node budget) + executor with replanning and stuck detection |
| 5 | **Combat** | Target selection, reach, DDA line-of-sight, cooldowns, engage/disengage |
| 6 | **Inventory** | Snapshot cache, hotbar equip, use-item, best-tool affinity |
| 7 | **Behaviour** | Behaviour trees (sequence/selector/parallel/decorators), blackboard, guarded FSMs, priorities |
| 8 | **Intelligence** | `Brain` port + `RuleBrain`: pluggable decision-making, async brains |
| 9 | **Event** | Typed central bus: priorities, once, cancellation, `waitFor`, error isolation |
| 10 | **Runtime** | Lifecycle FSM, 50 ms drift-compensated tick, scheduler, watchdog |

## Runtimes & capability honesty

A runtime is anything that can implement the `IDriver` port. Three built-ins
ship with 0.1:

| Runtime | Package | Nature | Notes |
| --- | --- | --- | --- |
| `mock` | `@botpex/testing` | Deterministic in-memory driver + world generator | No server needed; powers the contract suite and CI |
| `native` | `@botpex/runtime-native` | Protocol-speaking client (`minecraft-protocol` + prismarine) | Connect/world/entities/movement/combat/inventory; kinematic movement (`movement.physics: false`, declared with a note) |
| `mineflayer` | `@botpex/runtime-mineflayer` | External-engine adapter over Mineflayer | Full physics (`movement.physics: true`), behind `IDriver` |

Custom engines integrate through the adapter system: a manifest
(`@botpex/adapter/v1`), registry + host with semver **API-range checks** and
**capability grants**. `createBot` accepts a builtin id, an adapter spec, or
your own `DriverFactory`.

Where runtimes differ, Botpex does not pretend: every unsupported capability
carries `supported: false` **with a machine-readable note**, `require()` fails
fast with a combined report, and every public error carries a `code` (and a
`hint` where remediation exists). See
[documentation/CAPABILITIES.md](documentation/CAPABILITIES.md).

## Quick start

```bash
# from a clone of this repository
npm ci && npm run build && npm test     # 14 workspaces, strict TS, 88 tests green

# run the bundled examples (mock runtime — no Minecraft server needed)
npm run example:hello                   # hello-bot: wander + greet players
npm run example:guard                   # patrol-guard: patrol → detect → engage → return

# scaffold your own bot project
node developer-tools/dist/bin.js init my-bot
cd my-bot && npm install && npm run dev
```

The CLI (`@botpex/cli`):

```text
botpex init [dir] [--template basic-bot]   Scaffold a bot project
botpex run <dir> [--runtime mock|native|mineflayer] [--host H] [--port P] [--username U] [--version V]
botpex doctor                              Environment + compatibility diagnostics
botpex list-runtimes                       Builtin runtimes and their capabilities
```

## Your first bot

Real, runnable code — this is a condensed [`examples/hello-bot`](examples/hello-bot):

```ts
import { createBot, defineBehaviour } from '@botpex/sdk';
import { bt } from '@botpex/kernel';
import { blockPos } from '@botpex/api';

// A behaviour tree: wander to a nearby block every few seconds.
const wander = defineBehaviour('wander',
  bt.sequence('wander-tree',
    bt.wait('breathe', 800),
    bt.action('pick-nearby-goal', async (ctx) => {
      const self = ctx.bot.self();
      const goal = blockPos(self.position.x + 4, self.position.y, self.position.z);
      await ctx.bot.moveTo(goal, { timeoutMs: 15_000, goalRadius: 1.2 });
      return 'success' as const;
    })
  )
);

const bot = await createBot({
  botId: 'my-first-bot',
  runtime: 'native',                                  // 'mock' | 'native' | 'mineflayer' | adapter | factory
  driver: { host: 'localhost', username: 'Wanderer', version: '1.21.4' },
  behaviours: [wander],
  brain: (ctx) =>                                     // inline brain → RuleBrain
    ctx.entities.some((e) => e.kind === 'player')
      ? { kind: 'chat', message: `Hello! I am ${ctx.bot.botId}.` }
      : null,
});

bot.on('navigation:arrived', ({ elapsedMs }) => console.log(`arrived in ${elapsedMs} ms`));
bot.on('driver:chat', ({ message }) => console.log(`chat: ${message}`));

await bot.start();
```

Swap `runtime: 'mock'` and it runs offline with zero setup — same code, same
kernel, same tests.

## Building hyper-advanced bots

Hyper-advanced bots are a first-class design goal:

- **Layered behaviour** — behaviour trees tick by priority; guard them with
  FSM transitions; share state through the per-tick blackboard.
- **Pluggable intelligence** — `defineBrain` / `RuleBrain` for rules; implement
  the `Brain` port for planners, local models or anything else. Nothing in the
  kernel requires a paid cloud API.
- **Direct system access** — `handle.kernel` exposes every system; drop below
  the SDK abstraction when you need full control.
- **Fail-fast composition** — `requiredFeatures` (or `FEATURE_BUNDLES` like
  `combatant`, `navigator`) validates runtime capabilities before your bot
  starts.
- **Deterministic testing** — the mock runtime plus the test harness
  (`createTestBot`, `advanceTicks`, `waitFor`) let you replay scenarios before
  touching a live server.
- **Multi-bot** — `BotManager` pools bots on a shared scheduler with per-bot
  log scopes and stats.

Full patterns: [documentation/ADVANCED_BOTS.md](documentation/ADVANCED_BOTS.md)
and [`examples/patrol-guard`](examples/patrol-guard) (patrol → detect → engage
→ return).

## Distributions

Anything built on Botpex that ships as a complete bot product is a
**distribution** — the Linux-distro model. Distributions, extensions and
adapters all use the `botpex.json` package format (schema, validator, loader in
[`package-specification/`](package-specification)): metadata, dependency
declarations, semver API ranges and permission gates for extensions.

- Format spec: [documentation/PACKAGE_SPEC.md](documentation/PACKAGE_SPEC.md)
- Build guide: [documentation/BUILDING_DISTRIBUTIONS.md](documentation/BUILDING_DISTRIBUTIONS.md)
- Scaffold: [`templates/basic-bot`](templates/basic-bot)

## Packages

| Package | Purpose |
| --- | --- |
| [`api/`](api) | `@botpex/api` — public contracts: types, math, error taxonomy, capabilities, `IDriver`, event catalog |
| [`kernel/`](kernel) | `@botpex/kernel` — the 10 kernel systems + `BotKernel` (zero Minecraft dependencies) |
| [`testing/`](testing) | `@botpex/testing` — deterministic mock runtime + **driver contract suite** |
| [`sdk/`](sdk) | `@botpex/sdk` — `createBot`, `defineBehaviour/defineBrain`, BT builders, `BotHandle`, `BotManager` |
| [`runtimes/native/`](runtimes/native) | `@botpex/runtime-native` — protocol-speaking runtime (`minecraft-protocol` + prismarine) |
| [`runtimes/mineflayer/`](runtimes/mineflayer) | `@botpex/runtime-mineflayer` — external-engine adapter (full physics) |
| [`adapters/`](adapters) | `@botpex/adapters` — adapter manifests, registry, capability grants |
| [`extensions/`](extensions) | `@botpex/extensions` — permission-gated extension host |
| [`package-specification/`](package-specification) | `@botpex/package-spec` — `botpex.json` format + loader |
| [`compatibility/`](compatibility) | `@botpex/compatibility` — MC version matrix (1.20.4 → 26.1) + resolver |
| [`developer-tools/`](developer-tools) | `@botpex/cli` — `botpex init / run / doctor / list-runtimes` |
| [`examples/`](examples) · [`templates/`](templates) · [`benchmarks/`](benchmarks) | Learn, scaffold, measure |

## Repository layout

```text
botpex/
├── api/                     # public contracts & types
├── kernel/                  # the 10 kernel systems
├── sdk/                     # developer SDK
├── testing/                 # mock driver, contract suite, harness
├── runtimes/
│   ├── native/              # protocol-speaking runtime
│   └── mineflayer/          # external-engine adapter
├── adapters/                # adapter manifests & registry
├── extensions/              # extension host & permissions
├── package-specification/   # botpex.json package format
├── compatibility/           # Minecraft version matrix
├── developer-tools/         # botpex CLI
├── examples/                # hello-bot, patrol-guard
├── templates/               # basic-bot scaffold
├── documentation/           # guides, architecture + ADRs, research (cited)
├── tests/                   # cross-package suites (SDK E2E, CLI, live-server)
├── benchmarks/              # performance benchmarks
├── scripts/                 # ordered workspace build
├── .github/                 # CI workflows, issue/PR templates
├── CONTRIBUTING.md · CODE_OF_CONDUCT.md · SECURITY.md
├── TODO.md · VERIFICATION.md · CHANGELOG.md
└── LICENSE
```

## Testing & performance

Quality is a release requirement, not an afterthought:

- **88 tests** across 16 suites — unit, kernel E2E, driver **contract suite**
  (runtime-agnostic), SDK E2E, CLI, package/adapter/extension/compatibility
  validation. Live-server integration tests are opt-in (`BOTPEX_MC_HOST`).
- **Driver contract suite** — every runtime must pass the same behavioral
  contract; capability differences are declared, never hidden.
- **Benchmarks** (`npm run bench`):

| Benchmark | Result |
| --- | --- |
| Event bus emit+handle | ~14.7M ops/s |
| A* pathfinding (200 paths, 128² world) | 200/200 found, ~0.35 ms/path |
| Entity radius query (1000 entities) | ~0.06 ms/query |

Full evidence: [VERIFICATION.md](VERIFICATION.md).

## Status & honest limitations

**Kernel 0.1.0** is released — a genuinely working foundation, and every
shipped feature is real: no fake implementations, no hardcoded demos
masquerading as features, no placeholder methods that silently succeed.

Shipped: kernel systems · event bus · A* navigation + replanning · combat
(reach/LOS/cooldowns) · mock runtime + contract suite · native protocol runtime
(connect/world/entities/movement/combat/inventory) · mineflayer adapter · SDK +
CLI + examples · package format + extensions + compatibility matrix.

Known 0.1 limitations (tracked in [TODO.md](TODO.md), verified in
[VERIFICATION.md](VERIFICATION.md)):

- Native runtime movement is **kinematic** (declared `movement.physics: false`
  with a note); full client physics via prismarine-physics is planned (NR-010).
  Anti-cheat servers may rubber-band kinematic movement (detected and warned).
- Live-server integration tests are prepared but opt-in; a flying-squid CI job
  is planned (NR-012).
- Exact item naming on the protocol runtime requires MC 1.13+; chat is unsigned
  on 1.19.1+; enemy health is unknown on the protocol runtime — all declared in
  capability notes.
- Extension isolation is permission-gated but not yet sandboxed (EXT-002);
  the trust model is documented.
- npm publishing is deferred until a repository host exists; packages are
  already `files`/`exports` ready.

Roadmap highlights: full client physics (NR-010) · container windows
(NR-011) · HeroBot and PaperMC adapters (ER-003/004) · cross-process adapter
transport (ADP-004) · sandboxed extensions (EXT-002).

## Documentation

| Document | Contents |
| --- | --- |
| [GETTING_STARTED.md](documentation/GETTING_STARTED.md) | Install, scaffold, first run |
| [ARCHITECTURE.md](documentation/ARCHITECTURE.md) | System design + ADR-001..008 |
| [CAPABILITIES.md](documentation/CAPABILITIES.md) | Capability keys, gating, honesty model |
| [ADVANCED_BOTS.md](documentation/ADVANCED_BOTS.md) | Behaviour trees, brains, FSMs at scale |
| [API_GUIDELINES.md](documentation/API_GUIDELINES.md) | Public API rules & versioning |
| [ADAPTER_GUIDE.md](documentation/ADAPTER_GUIDE.md) | Writing a runtime adapter |
| [EXTENSION_GUIDE.md](documentation/EXTENSION_GUIDE.md) | Extensions & permissions |
| [BUILDING_DISTRIBUTIONS.md](documentation/BUILDING_DISTRIBUTIONS.md) | Shipping your bot product |
| [PACKAGE_SPEC.md](documentation/PACKAGE_SPEC.md) | `botpex.json` reference |
| [PERFORMANCE.md](documentation/PERFORMANCE.md) | Budgets & benchmark methodology |
| [LICENSING.md](documentation/LICENSING.md) | Apache-2.0 core over MIT-verified dependencies |
| [research/](documentation/research) | RESEARCH (cited) & FEASIBILITY reports |

## Community

- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow, coding standards; the
  kernel's zero-Minecraft-dependency rule is enforced in review.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community rules.
- [SECURITY.md](SECURITY.md) — responsible disclosure.

**Anti-abuse stance.** Botpex provides no cheat features: world queries only
see what the server legitimately sent, and no movement exploits are provided.
Operators must follow the rules of the servers they connect to.

## License

[Apache License 2.0](LICENSE). Third-party engines integrated through external
runtime adapters (e.g. Mineflayer) remain under their own licenses; Botpex
integrates them as peer dependencies and never redistributes them in violation
of their terms.

---

<div align="center"><b>ONE KERNEL. UNLIMITED BOTS.</b></div>
