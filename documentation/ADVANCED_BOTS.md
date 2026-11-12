# Building hyper-advanced bots

Botpex's advanced surface is deliberately composable: **FSM for modes,
behaviour trees for tactics, brains for decisions, kernel systems for skills,
events for reactivity, extensions for packaging.** This guide shows the
patterns; the full working example is `examples/patrol-guard`.

## 1. Layer the control loop

```
Brain (decides goals)  ──►  FSM (selects mode)  ──►  BT (executes tactics)
        ▲                                                      │
        └────────────── perception events ◄──── kernel systems ◘
```

- **Brain** answers "what matters right now?" (targets, goals, priorities).
- **FSM** answers "what mode am I in?" (patrol / combat / retreat / follow).
- **Behaviour trees** answer "how do I execute this mode?" with retry,
  fallback and parallelism.

## 2. Behaviour tree toolkit

```ts
import { bt } from '@botpex/kernel';

bt.sequence('fight',            // all must succeed, resumes at running child
  bt.condition('target-in-reach', (ctx) => nearestHostile(ctx.bot) !== null),
  bt.timeout('attack-window',   // give up if this takes too long
    bt.action('attack', async (ctx) => {
      const target = nearestHostile(ctx.bot);
      if (target === null) return 'failure' as const;
      await ctx.bot.attack(target.id);           // reach+LOS validated by kernel
      return 'success' as const;
    }), 1500),
  bt.wait('cooldown', 550)
);

bt.parallel('sense-and-act', { success: 'all', failure: 'all' },
  perceptionTask, motorTask);

bt.selector('survive',          // priority fallbacks
  bt.condition('not-critical', (ctx) => ctx.bot.self().health === null || ctx.bot.self().health > 8),
  retreatTree
);
```

Async actions run as promises; nodes return `running` until they settle. Use
`ctx.blackboard` for cross-node memory (never module globals for bot state —
breaks multi-bot).

## 3. Brains: rules today, AI tomorrow

```ts
import { RuleBrain } from '@botpex/sdk';

const brain = new RuleBrain('guard-brain', [
  { name: 'retreat-low-hp',
    when: (c) => (c.self.health ?? 20) < 6,
    then: { kind: 'goto', goal: homeBlock, options: { sprint: true } } },
  { name: 'fight-nearest',
    when: (c) => pickHostile(c.entities, c.self.position) !== null,
    then: (c) => ({ kind: 'attack', targetId: pickHostile(c.entities, c.self.position)!.id }) },
  { name: 'resume-patrol', when: () => true, then: null }
]);
```

Decisions are declarative (`Decision` union) → logged on
`intelligence:decision`, inspectable, testable. To integrate an external AI
(LLM, planner, RL policy): implement `Brain`, call your service inside
`decide()` (self-hosted or your own API key — **the kernel never requires a
paid API**), return `Decision`s. Debounce inside the brain; the kernel calls
it once per tick when idle.

## 4. Multi-mode FSM with guarded transitions

```ts
bot.behaviour.setFSM({
  initial: 'patrol',
  states: [
    { name: 'patrol', enter: (ctx) => void startRoute(ctx.bot) },
    { name: 'combat', enter: (ctx) => engageNearest(ctx.bot) },
    { name: 'retreat', enter: (ctx) => void ctx.bot.moveTo(homeBlock, { sprint: true }) }
  ],
  transitions: [
    { from: 'patrol', to: 'combat', when: (ctx) => hostileNear(ctx.bot, 8) },
    { from: '*',     to: 'retreat', when: (ctx) => criticalHealth(ctx.bot) },
    { from: 'retreat', to: 'patrol', when: (ctx) => safeHealth(ctx.bot) },
    { from: 'combat', to: 'patrol', when: (ctx) => noHostiles(ctx.bot) }
  ]
});
```

## 5. Event-driven reflexes (bypassing the brain)

For sub-tick reactions, subscribe directly:

```ts
bot.on('combat:targetLost', ({ reason }) => resumeRoute());
bot.on('perception:blockUpdated', ({ pos }) => invalidateBridgePath(pos));
bot.on('self:health', ({ health, prev }) => health < prev && maybePanic());
```

Cancellation pattern: kernel events are synchronous; guard long work with
phase checks (`if (bot.phase !== 'active') return`).

## 6. Many bots at once

```ts
import { BotManager } from '@botpex/sdk';

const manager = new BotManager({ staggerMs: 100 });
for (const name of ['alpha', 'bravo', 'charlie']) {
  await manager.spawnStaggered(name, {
    runtime: 'native',
    driver: { host: 'mc.example.net', username: name },
    behaviours: [routeFor(name)],
    brain: sharedBrainFactory(name)
  });
}
console.log(manager.status());
```

Each bot = own kernel, own scheduler, own blackboard. Share nothing mutable;
coordinate through the game world or an external service, not globals.

## 7. Skill checklist for "hyper-advanced"

- Navigation: `moveTo` with `sprint`, replans, stuck handling; chain goals for
  routes; `navigation:waypoint` for progress UIs.
- Combat: `combat.engage()` for persistent fights, `combat:attack/hit` for
  triggers, custom `CombatConfig` (reach/cooldown) per bot archetype.
- Inventory: `equipBestTool(blockName)` before digging; `useHeldItem` for
  food/potions; poll `inventory:updated`.
- World: `blockAt` + `raycastClear` (exported from kernel) for custom LOS,
  bridge checks, farm scanning.
- Diagnostics: subscribe `runtime:warning`, `navigation:failed`,
  `bot:capabilityReport` — advanced bots surface their own state.
