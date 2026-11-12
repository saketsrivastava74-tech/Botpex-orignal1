# Adapter guide

An adapter connects an execution environment (protocol client, external bot
engine, server-side integration) to the kernel through the single `IDriver`
port. Adapters are isolated packages — the kernel never imports them.

## 1. Manifest

```jsonc
// src/manifest.ts (exported as `manifest`)
{
  "spec": "@botpex/adapter/v1",
  "id": "runtime-hero",              // kebab-case, unique
  "name": "HeroBot Runtime Adapter",
  "version": "0.1.0",
  "api": "^0.1.0",                   // @botpex/api semver range
  "provides": "driver",              // driver | server | engine | custom
  "entry": "./dist/index.js",
  "license": "MIT",                  // SPDX — required
  "capabilities": {                  // optional overlay over driver-declared caps
    "movement.physics": { "supported": true, "notes": "engine-provided" }
  }
}
```

The host validates the manifest, checks the `api` range against
`KERNEL_API_VERSION` (`BOTPEX/ADAPTER/API_MISMATCH`), and intersects the
declared capabilities with host policy grants.

## 2. Implement `IDriver`

Minimum surface for a *driver* adapter:

```ts
import type { IDriver } from '@botpex/api';

export class MyDriver implements IDriver {
  name = 'my-runtime';
  runtimeVersion = '0.1.0';
  connected = false;

  capabilities(): CapabilityMap { /* declare honestly; notes for false */ }
  async connect(options: DriverOptions): Promise<SpawnInfo> { /* ... */ }
  async disconnect(reason?: string): Promise<void> {}
  world(): IWorldView { /* getBlock: null when unloaded! */ }
  self(): SelfState { /* position/yaw/pitch/health */ }
  // Actions: throw BOTPEX/CAPABILITY/UNSUPPORTED when the feature is absent,
  // BOTPEX/DRIVER/NOT_CONNECTED before connect.
  async setControlState(c: MoveControl, on: boolean): Promise<void> {}
  async look(yaw: number, pitch: number): Promise<void> {}
  async attack(id: EntityId): Promise<void> {}
  // ... digBlock / placeBlock / useHeldItem / selectHotbarSlot /
  //     getInventory / sendChat (return null from getInventory if unreadable)
  on<K>(event: K, handler): Unsubscribe { /* emit the DriverEventMap catalog */ }
}
```

**Event contract:** emit at least `driver:connected`, `driver:disconnected`,
`driver:selfUpdated` and — for the capabilities you declare —
`driver:entitySpawned/Updated/Despawned`, `driver:blockUpdated`, `driver:chat`.

## 3. Register & use

```ts
import { AdapterRegistry, AdapterHost } from '@botpex/adapters';

const registry = new AdapterRegistry();
registry.register(manifest, () => new MyDriver());
// or from an npm package: await registry.loadFrom('@my-org/botpex-adapter-x');

const host = new AdapterHost(registry, logger);
const driver = await host.create('runtime-hero', { allow: ['movement.look', 'combat.attack'] });

const bot = await createBot({ runtime: driver, driver: { host: '…', username: '…' } });
```

The host wraps your driver: capability map = driver ∩ manifest ∩ grants, logs
namespaced. Withheld capabilities are logged and reported as
`{ supported: false, notes: 'not granted by adapter host policy' }`.

## 4. Verify with the contract suite

```ts
import { runDriverContract } from '@botpex/testing';
const report = await runDriverContract(new MyDriver(), {
  advance: (ms) => myDriver.advance?.(ms),
  spawnTestEntity: (pos) => myWorld.spawnAt(pos)
});
expect(report.failed).toBe(0);
```

CI failing on the contract suite means your runtime does not do what it
declares — that is the system working.

## 5. License rules (non-negotiable)

- Declare your SPDX license; keep third-party engine code out of this repo.
- Engine adapters consume engines as dependencies or external processes.
- GPL/LGPL engines must stay out-of-tree; the adapter spec supports
  cross-process transports precisely for that (TODO ADP-004).

See `runtimes/mineflayer` for a complete real adapter (~350 lines) and
`runtimes/native` for a protocol-level one.
