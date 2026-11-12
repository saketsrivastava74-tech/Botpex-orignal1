# Changelog

All notable changes to Botpex are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org).

## [Unreleased]

## [0.1.0] — 2026-11-10

First release: **Botpex Kernel 0.1 — a genuinely working foundation.**

### Added
- `@botpex/api` — public contracts: math, error taxonomy with codes/hints, capability keys and
  feature requirement sets, world/entity/inventory snapshots, `IDriver` port, kernel event catalog,
  behaviour/brain types, `BotFacade`.
- `@botpex/kernel` — the 10 kernel systems: event bus (typed, priority, cancellation), entity
  registry, world model (LRU block cache), perception, movement, grid-A* navigation with replanning
  and stuck detection, combat (target selection, reach, line-of-sight, cooldowns), inventory,
  behaviour engine (behaviour trees + FSM + blackboard), intelligence (Brain port + RuleBrain),
  runtime (lifecycle FSM, 50 ms drift-compensated tick, scheduler, watchdog), capability registry,
  `BotKernel` orchestrator.
- `@botpex/testing` — deterministic in-memory driver + world generator, driver **contract suite**,
  test harness (`createTestBot`, `advanceTicks`, `waitFor`).
- `@botpex/runtime-native` — protocol-speaking runtime over `minecraft-protocol` + `minecraft-data` +
  `prismarine-world/chunk`: connection (offline/Microsoft), chunk world tracker, entity tracker with
  version-aware relative-move factors, self tracker, kinematic movement stepper with collision,
  combat/dig/place/use packets, inventory (1.13+ naming), unsigned chat.
- `@botpex/runtime-mineflayer` — external-engine adapter mapping Mineflayer behind `IDriver`
  (`movement.physics: true`).
- `@botpex/adapters` — adapter manifest v1, registry + host with API-range checks and capability
  grants.
- `@botpex/extensions` — extension manifests, permission model, scoped facades and event scopes.
- `@botpex/package-spec` — `botpex.json` package format v1: schema, validator, loader.
- `@botpex/compatibility` — Minecraft version matrix (1.20.4 → 26.1) with runtime support and
  feature flags; version resolver.
- `@botpex/cli` — `botpex init | run | doctor | list-runtimes`.
- SDK: `createBot`, `defineBehaviour/defineBrain`, behaviour-tree builders, `BotHandle`, `BotManager`.
- Examples: `hello-bot`, `patrol-guard` (patrol → detect → engage → return); template `basic-bot`.
- Documentation: RESEARCH (cited), FEASIBILITY, ARCHITECTURE (+ ADR-001..008), CAPABILITIES,
  GETTING_STARTED, API_GUIDELINES, ADAPTER_GUIDE, EXTENSION_GUIDE, BUILDING_DISTRIBUTIONS,
  LICENSING, PERFORMANCE, ADVANCED_BOTS.
- Community: LICENSE (Apache-2.0), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, CI.

### Known limitations
See `TODO.md` §"Known 0.1 limitations" (kinematic native movement, unsigned chat on 1.19.1+,
opt-in live-server integration tests, no sandboxed extension isolation yet).
