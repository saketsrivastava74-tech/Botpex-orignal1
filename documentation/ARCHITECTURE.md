# Botpex — System Architecture

> Version 0.1 · Status: implemented subset marked in `TODO.md` · This document is normative for
> contributors: module responsibilities, API boundaries, capability model, runtime communication,
> and the explicit trade-offs (ADRs) behind each decision.

**Botpex is the kernel, not the bot.** It is the common foundation on which independent Minecraft bot
projects ("distributions") are built — the way Linux is the common foundation of distros.

## 1. Architectural overview

Hybrid kernel = a small, independent, zero-framework core (monolithic in memory, modular by system),
surrounded by isolated runtimes/adapters and a developer-facing SDK. Hexagonal (ports & adapters) at
the runtime boundary; event-driven internally.

```
                            ┌─────────────────────────────────────────────────┐
                            │              developer project / distro         │
                            │   behaviours · brains · config · botpex.json    │
                            └───────────────────────┬─────────────────────────┘
                                                    │ @botpex/sdk (public API)
                            ┌───────────────────────▼─────────────────────────┐
                            │                 Botpex KERNEL                   │
                            │                                                 │
                            │  RuntimeSystem ── EventBus ── CapabilityRegistry │
                            │  Perception ──► EntityRegistry + WorldModel     │
                            │  Movement ◄── Navigation    Combat   Inventory  │
                            │  BehaviourSystem (FSM + Behaviour Trees)        │
                            │  Intelligence (Brain port: rules / custom / AI) │
                            └───────┬─────────────────────────────┬───────────┘
                                    │ IDriver (port)              │ extension ports
                    ┌───────────────▼───────────────┐   ┌───────────▼───────────┐
                    │      RUNTIME ADAPTERS         │   │  extensions (scoped,  │
                    │  native  │ mineflayer │ …     │   │  permission-gated)    │
                    │ protocol │ engine    │ custom │   └───────────────────────┘
                    └───────┬───────────────────────┘
                            │ Minecraft protocol / engine APIs
                    ┌───────▼────────┐   ┌──────────────┐
                    │ MC Java server │   │ test servers │
                    └────────────────┘   └──────────────┘
```

**The dependency rule:** `api` depends on nothing; `kernel` depends only on `api`; runtimes/adapters
depend on `api` (+ external libraries, never on each other); `sdk` depends on `api`+`kernel` and
resolves runtimes dynamically. The kernel has **zero Minecraft dependencies** — it cannot tell which
runtime it is running on except through its capability map.

## 2. Module responsibilities

| Module (workspace) | npm name | Responsibility | May depend on |
| --- | --- | --- | --- |
| `api/` | `@botpex/api` | All public contracts: math, errors, capabilities, world/entity/inventory types, event catalog, `IDriver` port, behaviour/brain types | — (zero deps) |
| `kernel/` | `@botpex/kernel` | The 10 kernel systems + `BotKernel` orchestrator + `EventBus`, `WorldModel`, `EntityRegistry`, tick loop | `api` |
| `testing/` | `@botpex/testing` | Deterministic in-memory driver + world, driver **contract suite**, test harness | `api`, `kernel` |
| `sdk/` | `@botpex/sdk` | `createBot`, `defineBehaviour/Brain/BT`, `BotManager`, `BotHandle` facade | `api`, `kernel` (dynamic-imports runtimes) |
| `runtimes/native/` | `@botpex/runtime-native` | Protocol-speaking driver: connection, world/entity/inventory/self trackers, kinematic movement stepper | `api`, minecraft-protocol, minecraft-data, prismarine-world, prismarine-chunk, vec3 |
| `runtimes/mineflayer/` | `@botpex/runtime-mineflayer` | External-engine adapter wrapping a Mineflayer bot behind `IDriver` | `api`, mineflayer |
| `adapters/` | `@botpex/adapters` | Adapter manifest schema, registry, host (validation, API-range checks, capability grants) | `api`, semver |
| `extensions/` | `@botpex/extensions` | Extension manifest, permission model, scoped facades/event scopes | `api`, `adapters` |
| `package-specification/` | `@botpex/package-spec` | `botpex.json` package format v1: schema, validation, loading | `api`, semver |
| `compatibility/` | `@botpex/compatibility` | Version matrix (MC releases × runtimes × features), version resolver | `api` |
| `developer-tools/` | `@botpex/cli` | `botpex init/run/doctor/list-runtimes` | `sdk`, `package-spec`, `compatibility`, `api` |
| `examples/`, `templates/`, `benchmarks/`, `tests/` | — | Consumer-side artifacts | sdk/api |

### The 10 kernel systems (§3 of the master spec)

| System | Class(es) | Contract highlights |
| --- | --- | --- |
| Entity | `EntityRegistry` | upsert/despawn/query-by-radius, snapshot diffing, cache cap |
| Perception | `PerceptionSystem` | bridges driver events → world/entity stores, diff events (`perception:*`), staleness tracking |
| Movement | `MovementSystem` | control-state aggregation, look/face math (MC yaw/pitch), gated by `movement:*` caps |
| Navigation | `NavigationSystem` + `astar` | grid A* over `WorldModel` (diagonals, step-up, falls, terrain costs, node budget), executor with replanning + stuck detection |
| Combat | `CombatSystem` | target selection (nearest/scorer), reach + line-of-sight (DDA raycast), cooldowns, engage/disengage, events |
| Inventory | `InventorySystem` | snapshot cache, hotbar equip (`bestToolFor` material affinity), use-item, container capability noted for later |
| Behaviour | `BehaviourSystem`, `bt.*`, `StateMachine` | behaviour trees (sequence/selector/parallel/decorators/conditions/actions), blackboard, FSM with guarded transitions |
| Intelligence | `IntelligenceSystem`, `RuleBrain` | `Brain` port: rule-based default, async/custom brains, decision arbitration → decisions executed on facade; no mandatory paid API |
| Event | `EventBus` | typed sync bus, priority, once, cancellation for `before:*` events, `waitFor` |
| Runtime | `RuntimeSystem` (lifecycle FSM, `Scheduler`, watchdog) | lifecycle phases with legal-transition guard, drift-compensated 50 ms tick, cancellable tasks, heartbeat watchdog |

## 3. Capability model (the "no silent failures" guarantee)

1. Every runtime declares a `CapabilityMap` at construction: `key → { supported, notes }`.
2. `CapabilityRegistry` exposes `require(key)` — throws `BOTPEX/CAPABILITY/UNSUPPORTED` with driver id,
   the declared note, and a remediation hint.
3. Every kernel feature maps to required capabilities (`REQUIRED_FOR`); `createBot` fails fast with a
   combined report if the selected runtime cannot satisfy the requested features.
4. Feature-completeness is enforced by the **driver contract suite** (`@botpex/testing`): every runtime
   must pass behaviour verification for each capability it claims, or CI fails. Supported-but-rough
   features are declared with `notes` (e.g. `"kinematic movement; no full client physics"`), never
   silently.

Canonical capability keys live in `@botpex/api` (`src/capabilities.ts`) and are documented in
`documentation/CAPABILITIES.md`.

## 4. Runtime communication & data flow

One tick (default 50 ms), single-threaded, in this order:

```
driver events (async, queued) ─► Perception ─► WorldModel/EntityRegistry (diff)
        │                                             │
        ▼                                             ▼
RuntimeSystem tick ◄── BehaviourSystem (FSM+BT) ◄── Intelligence.decide()
        │                    │                            (uses BotFacade)
        ▼                    ▼
   Navigation.goto executor ─► MovementSystem ─► IDriver.setControlState/look/attack
        (A*, replan, stuck)        (gated calls)        │
                                                        ▼
                                              Minecraft server / engine
```

- Driver events are bridged verbatim into the kernel bus (`driver:*`), then normalized by Perception
  into semantic events (`perception:*`, `self:*`).
- The executor of `Navigation.goto` resolves/rejects its promise on `navigation:arrived/failed` —
  behaviours can simply `await bot.moveTo(goal)`.
- Concurrency model: one event loop thread per process; one `BotKernel` per bot; `BotManager` staggers
  bot phases within the tick; process-level scaling documented (ADR-005).

## 5. Public API boundaries

- **Public (stable, semver'd):** everything exported from `@botpex/api` and `@botpex/sdk`.
- **Kernel-internal:** `kernel/src/*` classes may change between minors; consumers must go through
  `BotFacade`/`BotHandle`.
- **Driver contract:** `IDriver` is the only integration surface for runtimes; changes to it bump the
  `KERNEL_API_VERSION` in `@botpex/api`, checked semver-style by the adapter host.
- Error taxonomy (`BOTPEX/<AREA>/<REASON>` codes) is part of the public API; every thrown error carries
  `code`, `details`, and a `hint` string.

## 6. Architecture Decision Records (condensed)

**ADR-001 — TypeScript on Node.js for the kernel.**
Chosen for: (a) the only mature, actively maintained multi-version protocol stack is MIT-licensed JS
(node-minecraft-protocol + minecraft-data: 1.7→26.1); (b) async I/O workload fit; (c) type safety with
TS strict; (d) contributor pool. Rejected: Java (MCProtocolLib is solid but a JVM kernel would not reach
a working 0.1 with tests in this timeframe; reserved as future distribution via adapter spec), Rust/Go
(protocol stacks immature), Python (same). *Trade-off:* single-thread CPU ceilings → documented scaling
model; GC pauses acceptable at bot workloads. **This decision is revisitable by design** — the kernel
speaks only `IDriver`/`IWorldView`, so a JVM/C++ kernel re-implementing `@botpex/api` is explicitly in
scope for the ecosystem.

**ADR-002 — Hybrid kernel over hexagonal ports; runtimes as adapters.**
Native protocol runtime and external engines are symmetric behind `IDriver`. *Trade-off:* thin
abstraction layer costs a little latency; gains runtime swapping, testability, license isolation.

**ADR-003 — Native runtime = our core on protocol libraries, not a bot framework.**
`minecraft-protocol`/`minecraft-data`/`prismarine-*` are libraries (protocol + data), not bot
frameworks — using them keeps the kernel independent while avoiding re-deriving packet schemas.
*Trade-off:* inherited version-lag windows (mitigated by capability honesty + compatibility matrix).

**ADR-004 — Typed synchronous event bus.**
Sync dispatch = deterministic ordering inside a tick; async effects are task-scheduled. Cancellation
supported on `before:*` hooks. *Trade-off:* a slow handler can delay a tick → watchdog warns; cross-
process/eventual-consistency use cases are out of scope for 0.1.

**ADR-005 — Kernel-owned A* navigation; in-process scheduler; process-based scaling.**
Kernel pathfinding (grid A*, node budget, replan-on-invalidity) instead of delegating to engine plugins
→ identical semantics on every runtime. Scaling = many bots per process + process fan-out now,
`worker_threads` isolation later. *Trade-off:* mineflayer's pathfinder stays unused (its adapter runs
the kernel navigator over real physics).

**ADR-006 — One adapter per integration, manifests + capability grants.**
Each server/ engine integration is isolated (own package, own manifest, own license compliance);
host validates manifest + `api` semver range and intersects granted capabilities. *Trade-off:* a little
ceremony; prevents dependency entanglement and license leakage into the kernel.

**ADR-007 — Security-conscious extension loading (staged).**
0.1: manifest validation, permission-gated scoped facades, frozen API objects, no eval/dynamic code
loading. Roadmap: worker/VM isolation, signed packages. *Trade-off:* extensions are trusted-verified-
manifest in 0.1; the permission model still limits blast radius.

**ADR-008 — Apache-2.0 core, MIT-only runtime dependencies, no vendoring.**
Verified against RESEARCH §3. External engines are consumed as dependencies or external processes;
never bundled, copied or modified.

## 7. Testing strategy

- **Unit:** every kernel system (event bus ordering, A* correctness on synthetic terrain, lifecycle
  guard, cooldown math, etc.).
- **Contract:** `runDriverContractSuite(driverFactory)` — executed against the in-memory driver in CI
  and available for native/mineflayer against a real server (`tests/integration`, opt-in via env).
- **E2E (in-memory):** `createBot` → behaviours → perception → navigation arrival → combat kills target
  → clean stop, fully deterministic.
- **Benchmarks:** event-bus throughput, A* latency, entity-diff cost (results recorded in
  `VERIFICATION.md`).
