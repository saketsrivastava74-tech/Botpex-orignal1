# Botpex — TODO & Milestones

> Dependency-aware development plan. Statuses are authoritative: `Done` = implemented **and** verified
> (see `VERIFICATION.md`); `In progress` = partially implemented with explicit gaps; `Todo` = not
> started. Never mark incomplete functionality as done.
>
> Milestones: **FND** Foundation · **CK** Core Kernel · **NR** Native Runtime · **ER** External Runtime
> · **ADP** Adapter System · **SDK** Developer SDK · **CMP** Compatibility · **DT** Developer Tools ·
> **DOC** Documentation · **TRL** Testing & Release.

## M0 — Foundation (FND)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| FND-001 | Monorepo scaffold: npm workspaces, TS strict config, build order script, CI workflow | — | `npm ci && npm run build && npm test` green from clean clone | Done |
| FND-002 | `@botpex/api`: math, error taxonomy (codes+hints), capability keys/sets | FND-001 | compiles; all kernel code imports types only from here | Done |
| FND-003 | `@botpex/api`: world/entity/inventory snapshots, `IDriver` port, event catalog, behaviour/brain types | FND-002 | contract types complete for all 0.1 systems | Done |
| FND-004 | Community files: LICENSE (Apache-2.0), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, CI | FND-001 | files present, CI runs build+test on push | Done |
| FND-005 | `documentation/LICENSING.md` + third-party notice policy | FND-004 | MIT deps listed with links; no vendored code | Done |

## M1 — Core Kernel (CK)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| CK-001 | Typed `EventBus`: priority, once, cancellation on `before:*`, `waitFor`, error isolation | FND-003 | unit tests: ordering/priority/once/cancel/waitFor/error-isolation | Done |
| CK-002 | `EntityRegistry` with snapshot diff + radius query + cache cap | FND-003 | unit tests incl. cache eviction | Done |
| CK-003 | `WorldModel` over `IWorldView`: block cache, LRU, block-update invalidation, loaded bounds | FND-003 | unit tests | Done |
| CK-004 | `CapabilityRegistry`: driver map ingestion, `require()`, feature requirement sets | FND-003 | unit tests incl. combined report | Done |
| CK-005 | `PerceptionSystem`: driver-event bridge, semantic diff events, staleness | CK-001..003 | emits spawned/moved/despawned + self diffs in tests | Done |
| CK-006 | `MovementSystem`: controls, face/look math, capability gating | CK-004 | unit tests: gating errors, yaw/pitch math | Done |
| CK-007 | `NavigationSystem`: grid A* (diagonals, step-up, falls, costs, node budget) + executor (replan, stuck, arrival promise) | CK-003,006 | unit tests: path around wall, no-path error, goto integration reaches goal, replan on block change | Done |
| CK-008 | `CombatSystem`: target selection, reach + DDA line-of-sight, cooldowns, engage/disengage | CK-005 | unit tests incl. LOS blocked case | Done |
| CK-009 | `InventorySystem`: snapshot cache, hotbar equip, use-item, best-tool affinity | CK-004 | unit tests | Done |
| CK-010 | Behaviour engine: BT nodes (seq/sel/par/decorators/cond/action), Blackboard, FSM with guarded transitions | FND-003 | unit tests for all node types + FSM transitions | Done |
| CK-011 | `IntelligenceSystem` + `RuleBrain`: decision arbitration, async brains, event emission | CK-010 | unit tests: rule order, decision execution | Done |
| CK-012 | `RuntimeSystem`: lifecycle FSM, 50 ms drift-compensated tick, Scheduler, watchdog | CK-001 | unit tests: illegal transition throws, scheduler caps/cancels, watchdog fires | Done |
| CK-013 | `BotKernel` orchestrator wiring all systems + `BotFacade` impl | CK-001..012 | E2E in-memory: perceive→navigate→combat→stop | Done |
| CK-014 | Multi-instance hardening: per-bot log scopes, shared-scheduler stats | CK-013 | BotManager stats test | Done |

## M2 — Native Runtime (NR)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| NR-001 | Connection lifecycle over `minecraft-protocol` (offline + Microsoft auth), spawn detection | FND-003 | connect→SpawnInfo on mock-protocol unit fixtures; integration script for live server | Done (code) / Live-server test = opt-in |
| NR-002 | World tracker: chunk load/unload/block updates via prismarine-world/chunk; `IWorldView` | NR-001 | unit tests on serialized chunk fixtures; capability `world.blockQueries` verified | Done (code) |
| NR-003 | Entity tracker: spawn/despawn/relative-move (versioned factor), teleport | NR-001 | unit tests incl. factor math | Done (code) |
| NR-004 | Self tracker: position/teleport-confirm, health/food | NR-001 | unit tests | Done (code) |
| NR-005 | Kinematic movement stepper (walk/sprint/sneak speeds, jump arc, collision, auto-step) + correction watchdog | NR-002 | unit tests: reaches waypoint on synthetic world; capability reports `movement.physics:false` with note | Done (code) |
| NR-006 | Combat packets: `use_entity`(attack)+swing, version-shaped; dig with hardness timing; place/use-item | NR-003 | unit tests on packet shaping for 1.20.x profile | Done (code) |
| NR-007 | Inventory: window parse (1.13+ naming), hotbar select, basic window click | NR-001 | unit tests with slot fixtures | Done (code, 1.13+ naming) |
| NR-008 | Chat: send unsigned (version-shaped), receive player/system chat flatten | NR-001 | unit tests incl. JSON text flatten | Done (code) |
| NR-009 | Capability map + contract-suite pass on in-process fixtures | NR-001..008 | `runDriverContractSuite` green for native fixture driver | Partial — fixture-level only; live-server run pending (NR-012) |
| NR-010 | Full client physics via prismarine-physics (replace kinematic) | NR-005 | `movement.physics:true` on anti-cheat test server | Todo |
| NR-011 | Container windows (chest/furnace) protocol | NR-007 | open/read/move items on vanilla server | Todo |
| NR-012 | CI integration job against flying-squid | NR-001..009 | nightly job connects, spawns, navigates | Todo |

## M3 — External Runtime (ER)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| ER-001 | Mineflayer adapter: full `IDriver` mapping (world/entities/movement/attack/inventory/chat) | FND-003 | unit tests with mocked `bot` object; capability map incl. `movement.physics:true` | Done (code) |
| ER-002 | Mineflayer plugin bridges (pathfinder presence detection) | ER-001 | capability note reflects installed plugins | Todo |
| ER-003 | HeroBot (Fabric server-side) adapter — protocol/process bridge | ADP-002 | manifest + driver feasibility spike | Todo (research done, see RESEARCH §2) |
| ER-004 | PaperMC server-side adapter (FakePlayer-style integration) | ADP-002 | spike documented | Todo |

## M4 — Adapter System (ADP)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| ADP-001 | Adapter manifest v1 (`@botpex/adapter/v1`) + validator | FND-003 | unit tests: valid/invalid manifests | Done |
| ADP-002 | `AdapterRegistry` + `AdapterHost`: api-range check, capability grant intersection, namespaced logging | ADP-001 | unit tests: api mismatch rejected; grants enforced | Done |
| ADP-003 | npm-package adapter resolution (dynamic import contract) | ADP-002 | resolves in-process adapter | Done |
| ADP-004 | Cross-process adapter transport (stdio/WebSocket) | ADP-002 | spec + reference impl | Todo |

## M5 — Developer SDK (SDK)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| SDK-001 | `createBot`: runtime resolution (mock/native/mineflayer/factory), fail-fast capability report | CK-013, ADP-003 | E2E tests incl. missing-runtime error hint | Done |
| SDK-002 | `defineBehaviour/defineBrain/BT builders` ergonomic layer | CK-010,011 | typed compile + example runs | Done |
| SDK-003 | `BotHandle` facade + lifecycle helpers (`onReady`, `waitFor`) | CK-013 | E2E tests | Done |
| SDK-004 | `BotManager`: pools, staggered ticks, aggregate stats | CK-014 | 5-bot pool test | Done |
| SDK-005 | Starter templates (basic bot) via CLI `init` | SDK-001 | `botpex init` produces runnable project | Done |

## M6 — Compatibility (CMP)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| CMP-001 | Version matrix data (1.20.4→26.1) + resolver + feature flags (attack cooldown, config phase, chat signing) | FND-002 | unit tests incl. calendar-version ordering | Done |
| CMP-002 | Auto-refresh pipeline from minecraft-data version list | CMP-001 | script + docs | Todo |

## M7 — Developer Tools (DT)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| DT-001 | `botpex init` (templates) | SDK-005 | CLI smoke test creates + runs project | Done |
| DT-002 | `botpex run` project loader (botpex.json + entry) | SDK-001, PKG-001 | CLI smoke test | Done |
| DT-003 | `botpex doctor` (env, version matrix, capability report) | CMP-001 | CLI smoke test | Done |
| DT-004 | `botpex dev` watch mode | DT-002 | rebuild+restart loop | Todo |

## M8 — Package spec & Extensions (PKG / EXT)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| PKG-001 | `botpex.json` spec v1: schema doc + validator + loader | FND-002 | unit tests incl. detailed error messages | Done |
| PKG-002 | Distribution guide: how to ship a Botpex-based bot product | PKG-001 | `documentation/BUILDING_DISTRIBUTIONS.md` | Done |
| EXT-001 | Extension manifest + permission model + scoped facades | ADP-002, PKG-001 | unit tests: permission denial, scoped events | Done |
| EXT-002 | Sandboxed extension isolation (worker/VM) | EXT-001 | hostile extension cannot escape scope | Todo (documented) |

## M9 — Documentation (DOC)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| DOC-001 | RESEARCH/FEASIBILITY/ARCHITECTURE + ADRs | — | reviewed, cited | Done |
| DOC-002 | GETTING_STARTED, CAPABILITIES, ADAPTER_GUIDE, EXTENSION_GUIDE | CK, SDK | each guide's snippets compile in tests/examples | Done |
| DOC-003 | ADVANCED_BOTS (behaviour composition, brains, multi-bot, AI integration) | CK-010/011 | examples run | Done |
| DOC-004 | API reference generation (TypeDoc) | SDK-001 | published reference | Todo |
| DOC-005 | Tutorials series (patrol bot, farmer bot) | DOC-002 | — | Todo |

## M10 — Testing & Release (TRL)

| ID | Task | Depends on | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| TRL-001 | Unit suites for all kernel systems | CK-001..012 | all green, no skipped | Done |
| TRL-002 | Driver contract suite (in-memory) + E2E suite | CK-013, testing | green | Done |
| TRL-003 | Benchmarks: event bus, A*, entity diff; record results | CK-001/007 | results in VERIFICATION.md meet §6 budgets | Done |
| TRL-004 | Release 0.1.0: changelog, npm packing, git tag | all above Done | `CHANGELOG.md` + versioned packages | Partial — packaging ready; npm publish deferred to repo host |
| TRL-005 | Coverage threshold gates (≥80% kernel) | TRL-001 | CI coverage step | Todo |

## Known 0.1 limitations (explicit)

- Native runtime movement is kinematic (no full client physics) — `movement.physics:false`.
- Enemy health unknown on native runtime; combat uses distance/LOS validity.
- Chat is unsigned on 1.19.1+; item naming exact for 1.13+ on native inventory parsing.
- Live-server integration run is opt-in (`tests/integration`); CI job pending (NR-012).
- No sandboxed extension isolation yet (EXT-002).
