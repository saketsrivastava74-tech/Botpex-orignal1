# Performance

Budgets, measured results and the scaling model. Re-measure with
`npm run bench`; record deltas in PRs that touch hot paths.

## Measured (2026-11-10, sandbox: Node 24, single process)

| Benchmark | Result | Budget | Status |
| --- | --- | --- | --- |
| Event bus emit+handle | ~14–15M ops/s | ≥ 100k ops/s | ✅ 140× headroom |
| A* path (128² flat world, 200 paths) | ~0.35 ms/path (69 ms total, 200/200 found) | ≤ 15 ms per 20-block replan | ✅ |
| Entity radius query (1000 entities, 50 queries) | ~0.06 ms/query | ≤ 2 ms per tick for 500 entities | ✅ |

Interpretation: the tick loop's dominant costs are I/O (packets) and physics,
not kernel bookkeeping. Navigation replans are cheap enough to run every tick
if needed (the executor still debounces them).

## Tick model

- 50 ms fixed tick, drift-compensated (`RuntimeSystem`): next deadline =
  last tick + interval — no cumulative drift.
- Slow-tick detection: warnings at > 80% interval via `runtime:warning`.
- Watchdog: 1 s heartbeat; tick stalls > 5 s produce watchdog warnings.
- Order per tick: perception → inventory → behaviours (FSM+trees) → combat →
  navigation → intelligence → scheduler.

## Memory

- World block cache: LRU, default 60 000 entries (`WorldModel`).
- Entity cache: 2048 snapshots, oldest non-player evicted (`EntityRegistry`).
- Chunk storage (native runtime): prismarine-world columns; unload_chunk
  releases them. A 10×10-chunk area is on the order of tens of MB.
- Scheduler prunes completed tasks each tick.

## Scaling to many bots

"One Kernel. Unlimited Bots" in practice:

1. **One process, many kernels** — `BotManager` staggers startups (default
   150 ms apart) and reports aggregate status. Rule of thumb for 0.1:
   10–50 lightweight bots per GB of heap (mock: thousands; native connected to
   real servers: bounded by sockets + chunk memory).
2. **Process fan-out** — group bots per server/world; the kernel has no global
   state, so processes are independent. A supervisor (systemd/pm2/kubernetes)
   manages pools.
3. **worker_threads** — viable for CPU-heavy behaviour/isolation; roadmap item
   (not required by 0.1 budgets; measured headroom is large).

## Hot-path rules for contributors

- No allocations per tick in steady state beyond snapshot objects (they are
  the API).
- Event handlers: O(listeners); prefer targeted subscriptions over wildcard
  scans.
- Pathfinding: node budget caps worst case (`maxSearchNodes`, default 20k);
  never remove the budget.
- Never block the loop with sync I/O in handlers — schedule a task.
