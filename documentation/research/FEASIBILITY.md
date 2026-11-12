# Botpex — Stage 2 Technical Feasibility & Risk Analysis

> Date: 2026-11-10. Companion to `RESEARCH.md`. Each risk lists: description, impact, likelihood,
> mitigation, and residual risk after mitigation.

## 1. Protocol & version churn

- **Fact:** Minecraft now ships calendar-year versions (26.x). Node-minecraft-protocol tracked 26.1
  within weeks of release (v1.68.0, 2026-08); Mineflayer's README claims 1.8→26.1 support, but issue
  history ([#3714](https://github.com/PrismarineJS/mineflayer/issues/3714),
  [#3641](https://github.com/PrismarineJS/mineflayer/issues/3641)) shows each drop takes weeks to
  stabilize (chunk format, item components, entity metadata changes).
- **Impact:** any hard-coded packet handling can break every drop. **Likelihood:** certain.
- **Mitigation:** all version-sensitive data comes from `minecraft-data` at runtime (block/item tables,
  packet field shapes); version-specific logic is isolated in `runtimes/native/src/trackers` and behind
  feature flags in `compatibility/`; the kernel itself never sees a protocol detail.
- **Residual risk:** medium — new drops can temporarily reduce native-runtime fidelity; the capability
  map reports degraded support instead of misbehaving.

## 2. Native-runtime physics gap

- **Fact:** a real client runs full collision/physics simulation. Replicating it exactly is a large,
  ongoing effort (mineflayer has `prismarine-physics`; years of edge cases).
- **Botpex 0.1 approach:** the native runtime implements a **kinematic movement model with world-informed
  collision** (walk/sprint/sneak speeds, jump arcs, solid-block collision, auto-step) and *declares*
  `movement.physics: false` with an explanatory note. Servers that validate motion strictly (anti-cheat
  plugins) may rubber-band such movement. Mineflayer-backed bots report `movement.physics: true`.
- **Detection:** the runtime counts server position corrections ("teleports") per minute and emits
  `runtime:warning` when the server appears to reject our motion — the operator gets a diagnostic, not a
  silent failure.
- **Residual risk:** medium-low for vanilla/lenient servers; high for hardened anti-cheat servers
  (documented; use the mineflayer runtime there until physics integration lands, see TODO NR-30x).

## 3. Entity tracking fidelity (protocol clients)

- Relative-position packets use version-dependent fixed-point factors (÷4096 on ≥1.14, ÷128 on older
  versions); metadata layouts change per drop.
- **Mitigation:** factors isolated in one module with unit tests; absolute positions always win over
  deltas; snapshots carry `lastSeen` and staleness is reported through perception events.
- **Residual risk:** low for position tracking; medium for metadata-derived fields (health of other
  entities is *not* reliably available in 0.1 → combat treats it as unknown, see §5).

## 4. Chat signing (1.19.1+)

- Signed chat restricts what an unsigned client may send/receive. Vanilla still accepts unsigned chat.
- **Mitigation:** send unsigned messages only; parse `player_chat`/`system_chat_message` defensively;
  capability `chat.send` carries a `notes` field stating the limitation.
- **Residual risk:** low (feature degradation, not breakage).

## 5. Combat correctness without enemy health data

- Protocol clients cannot generally read other entities' health; the 1.9 attack-cooldown mechanic is
  server-side.
- **Mitigation:** the combat system treats enemy health as *unknown* by default (target validity =
  distance + line-of-sight + despawn tracking), uses a configurable cooldown with 1.9+ defaults
  (600 ms full charge), and lets higher-level behaviours add heuristics (hit-response, armor detection
  via metadata when present).
- **Residual risk:** acceptable — PvP bots on the mineflayer runtime can layer richer data later.

## 6. Performance & scalability

- Node.js is single-threaded per process. Budgets for 0.1 (verified in `benchmarks/`, results in
  `VERIFICATION.md`): event bus ≥ 100k ops/s, A* replanning of a 20-block path < 15 ms on loaded chunks,
  entity diff for 500 entities < 2 ms/tick.
- **Mitigations:** fixed 50 ms kernel tick with drift compensation; bounded work per tick (pathfinder
  node budget, LRU chunk cache, entity cache caps); one scheduler per bot; `BotManager` spreads bots
  across staggered ticks; scaling path documented = one OS process per N bots / `worker_threads` later
  (ADR-005).
- **Residual risk:** low for tens of bots per process; known ceiling documented rather than hidden.

## 7. Memory

- Chunk storage dominates. `prismarine-world` keeps loaded columns; a 10×10-chunk area ≈ tens of MB.
- **Mitigation:** chunk cache with LRU eviction and unload-chunk handling; configurable cache size;
  entity cache cap (default 2048, oldest despawned entities pruned).

## 8. Security & abuse

- Bots can be abused (x-ray via direct world reads, spam, crash exploits). Botpex's stance:
  - No client-only "cheat" features: world queries are limited to blocks the server actually sent.
  - Extension/adapter permission model (`extensions/`, `adapters/`) gates every capability; hosts can
    grant subsets.
  - Manifest validation, semver API ranges, frozen API surfaces; no dynamic code loading in 0.1
    (documented; sandboxing roadmap in ADR-007).
  - Security reporting process in SECURITY.md.

## 9. Legal / compliance

- All runtime dependencies verified MIT; Apache-2.0 core remains license-clean (no GPL linkage, no
  vendored third-party source, no Mojang assets). Multi-bot operators must comply with server rules and
  EULA; documented in README + CONTRIBUTING.

## 10. Verdict

**GO.** The hybrid-kernel design is feasible with the chosen stack. The native runtime can deliver a
genuinely working subset in 0.1 (connect, world, entities, movement, combat, inventory basics, chat)
with honest capability reporting; the mineflayer runtime covers full-physics needs on day one; and the
architecture confines every known fragile area (protocol churn, physics, chat signing) behind explicit
boundaries. Hardest open problems (full client physics, signed chat, per-drop metadata) are queued in
TODO.md with dependencies rather than faked.
