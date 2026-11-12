# Capability reference

Capabilities are the kernel's honesty contract: a runtime declares what it can
do, the kernel refuses what it cannot — loudly, with a hint. Declared in
`@botpex/api/src/capabilities.ts`; feature bundles in `FEATURE_REQUIREMENTS`.

## Keys

| Key | Meaning | Notes on limits |
| --- | --- | --- |
| `world.blockQueries` | `getBlock` decodes loaded chunks | `null` outside loaded chunks (never treated as air) |
| `world.entityTracking` | entity snapshots available | native: positions reliable, enemy health unknown |
| `world.blockUpdates` | driver emits block-update events | |
| `movement.controlStates` | forward/back/left/right/jump/sneak/sprint | |
| `movement.look` | yaw/pitch control | |
| `movement.physics` | **full client physics** | native 0.1: `false` (kinematic + collision) |
| `combat.attack` | validated attacks | cooldown enforced kernel-side |
| `combat.dig` | block breaking | native: hardness-based estimate |
| `combat.placeBlock` | block placement | |
| `inventory.read` | inventory snapshots | native: item names exact for 1.13+ |
| `inventory.equip` | hotbar selection | |
| `inventory.useItem` | use held item | |
| `inventory.containers` | chest/furnace windows | 0.1: unsupported (TODO NR-011) |
| `chat.send` | chat | unsigned only on 1.19.1+ |
| `chat.receive` | chat events | |
| `self.health` | health/food reporting | |
| `self.position` | position/yaw/pitch | |

## Feature requirements (used by `createBot` fail-fast)

| Feature | Requires |
| --- | --- |
| `navigation` | `world.blockQueries`, `movement.controlStates` |
| `movement` | `movement.controlStates` |
| `look` | `movement.look` |
| `combat` | `combat.attack` |
| `perception` | `world.entityTracking` |
| `chat` | `chat.send` |

```ts
import { missingForFeatures } from '@botpex/api';
const report = missingForFeatures(driver.capabilities(), ['navigation', 'combat']);
// [{ feature: 'combat', missing: ['combat.attack'] }]
```

## Rules

1. **Unsupported ≠ silent.** Calling a gated API throws
   `BotpexError('BOTPEX/CAPABILITY/UNSUPPORTED')` with driver name, note, hint.
2. **Every `supported: false` entry must carry `notes`** — enforced by the
   driver contract suite.
3. **Rough-but-working is allowed, but must be labelled** (e.g. kinematic
   movement).
4. Runtime comparison cheat-sheet:

| | mock | native 0.1 | mineflayer |
| --- | --- | --- | --- |
| movement.physics | ✓ (simulated) | ✗ kinematic | ✓ full |
| inventory.containers | ✗ | ✗ | ✗ (planned) |
| world fidelity | synthetic flat world | loaded chunks | loaded chunks |

Run `botpex list-runtimes` for the live tables.
