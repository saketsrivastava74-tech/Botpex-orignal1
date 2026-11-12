# Verification report — Botpex Kernel 0.1

> Date: 2026-11-10 · Environment: Linux sandbox, Node v24.22.2, npm 11.19.1,
> TypeScript 5.9.x, vitest 3.2.7. All commands below were executed in the
> development workspace; results are recorded verbatim.

## 1. Build

```
node scripts/build.mjs          # ordered workspace build (14 workspaces)
→ [botpex] build complete.
```

All 14 workspaces compile under `strict` TypeScript with
`noUncheckedIndexedAccess` (api → kernel → testing → compatibility → adapters →
package-specification → extensions → runtimes/native → runtimes/mineflayer →
sdk → developer-tools → examples → templates).

## 2. Tests

```
npx vitest run
Test Files  15 passed | 1 skipped (16)
     Tests  88 passed | 2 skipped (90)
Duration  ~11 s
```

| Suite | File | Cases | Covers |
| --- | --- | --- | --- |
| Event bus | kernel/tests/bus.test.ts | 6 | priority, once, off, error isolation, waitFor+timeout |
| Capabilities | kernel/tests/capabilities.test.ts | 4 | gating, feature report |
| Entity registry | kernel/tests/entity.test.ts | 4 | diff, radius query, cache eviction |
| World model | kernel/tests/world.test.ts | 3 | read-through cache, LRU, invalidation |
| A* | kernel/tests/astar.test.ts | 8 | straight, detour, sealed goal, step-up, fall, budget, partial, zero-cost |
| Behaviour (BT+FSM) | kernel/tests/behaviour.test.ts | 14 | all node types, async actions, blackboard, FSM guards/wildcards |
| Driver contract | testing/tests/contract.test.ts | 3 | full contract pass on mock, capability skips, notes rule |
| Kernel E2E | testing/tests/e2e.test.ts | 7 | navigation arrival, NO_PATH, **mid-route replan**, combat kill, perception events, capability gating |
| Adapters | adapters/tests/adapters.test.ts | 7 | manifest validation, API ranges, grant intersection |
| Extensions | extensions/tests/extensions.test.ts | 4 | permission denial, scoped events, API ranges |
| Package spec | package-specification/tests/package.test.ts | 5 | schema, loader, API mismatch |
| Compatibility | compatibility/tests/matrix.test.ts | 6 | calendar-vs-classic version ordering, feature flags |
| Native runtime | runtimes/native/tests/util.test.ts | 8 | chat flatten, rel-move factor, packet shapes, capability honesty |
| SDK E2E | tests/sdk-e2e.test.ts | 4 | createBot lifecycle, behaviours+brains on tick, runtime resolution errors, BotManager pool |
| CLI | tests/cli.test.ts | 5 | doctor, list-runtimes, init scaffold + validation, overwrite refusal |
| Live-server integration | tests/integration/native-live.test.ts | 2 | **skipped** — opt-in via `BOTPEX_MC_HOST` (no server in sandbox) |

## 3. Benchmarks (`npx tsx benchmarks/run.ts`)

| Benchmark | Result |
| --- | --- |
| Event bus emit+handle | **14.7M ops/s** (200k iterations, 13.6 ms) |
| A* (200 paths, 128² world) | **200/200 found**, 69.1 ms total ≈ **0.35 ms/path** |
| Entity radius query (1000 entities × 50) | 2.8 ms total ≈ 0.06 ms/query |

All exceed the §6 budgets in FEASIBILITY.md by 2–3 orders of magnitude.

## 4. Runtime behaviour (example smoke tests)

- `npm run example:hello` — hello-bot on mock runtime: started, navigated
  repeatedly (arrival events: 901/848/699 ms), clean stop. ✅
- `npm run example:guard` — patrol-guard: reached waypoints 1–2, detected the
  scripted zombie intrusion, engaged combat (`guard: engaging zombie #1001`),
  demo stop. ✅
- `botpex doctor` / `botpex list-runtimes` — correct matrix + capability
  tables (covered by CLI tests). ✅

## 5. API consistency checks

- Kernel imports **zero** Minecraft libraries (verified by dependency trees:
  `@botpex/kernel` deps = `@botpex/api` only).
- Every runtime's `supported: false` capability carries `notes` (contract
  check).
- Every public error carries `code` (+ `hint` where remediation exists).
- Driver contract suite is runtime-agnostic and executed in CI for the mock
  driver; native/mineflayer run it under `tests/integration` when a server is
  provided.

## 6. Honest gaps (also in TODO.md "Known 0.1 limitations")

1. **Native runtime movement is kinematic** (walk/sprint/sneak/jump speeds,
   collision, auto-step) — not full client physics; `movement.physics: false`
   declared with note; anti-cheat servers may rubber-band (detection warns).
2. **Live-server integration not executed in this sandbox** (no Minecraft
   server available); the opt-in suite + flying-squid CI job are prepared
   (NR-012).
3. Native item naming exact for 1.13+; chat unsigned on 1.19.1+; enemy health
   unknown on the protocol runtime — all declared in capability notes.
4. No sandboxed extension isolation yet (EXT-002) — documented trust model.
5. npm publishing deferred (TRL-004 "Partial") until a repository host exists;
   packages are `files`/`exports` ready.

## 7. TODO.md accuracy

Statuses in TODO.md were updated to match this report: everything marked
`Done` has a test or a recorded runtime verification above; everything marked
`Todo`/`Partial` is listed in §6.
