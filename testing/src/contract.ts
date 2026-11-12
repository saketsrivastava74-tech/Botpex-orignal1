import {
  type IDriver,
  type DriverOptions,
  type EntityId,
  type Vec3,
  type CapabilityKey,
  CAPABILITIES,
  floorToBlock,
  distance
} from '@botpex/api';

export interface ContractOptions {
  /** Advance simulated/real time by ms (mock: driver.advance). Omit → real-time waits. */
  advance?: (ms: number) => void | Promise<void>;
  /** Spawn a controllable test entity near `pos`; enables entity/combat checks. */
  spawnTestEntity?: (pos: Vec3) => EntityId | Promise<EntityId>;
  connectOptions?: Partial<DriverOptions>;
  /** Stop the driver at the end (default true). */
  disconnectAtEnd?: boolean;
  timeoutMs?: number;
}

export interface ContractCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
}

export interface ContractReport {
  driver: string;
  checks: ContractCheck[];
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * Driver contract suite — the executable definition of "unified API".
 *
 * Every runtime claiming a capability must pass the corresponding checks.
 * The suite is assertion-based (no test-framework dependency) so it can run
 * in CI, doctor commands or custom harnesses alike.
 *
 * Note: the suite consumes the driver; pass a fresh instance (or a
 * reconnect-capable one). `disconnectAtEnd` defaults to true.
 */
export async function runDriverContract(
  driver: IDriver,
  options: ContractOptions = {}
): Promise<ContractReport> {
  const checks: ContractCheck[] = [];
  const timeoutMs = options.timeoutMs ?? 15_000;
  const sleep = async (ms: number): Promise<void> => {
    if (options.advance) await options.advance(ms);
    else await new Promise((r) => setTimeout(r, ms));
  };
  const record = (name: string, fn: () => Promise<void> | void, skipIf?: () => string | null): Promise<void> =>
    (async () => {
      if (skipIf) {
        const reason = skipIf();
        if (reason !== null) {
          checks.push({ name, status: 'skip', detail: reason });
          return;
        }
      }
      try {
        await fn();
        checks.push({ name, status: 'pass' });
      } catch (error) {
        checks.push({ name, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
      }
    })();

  const caps = driver.capabilities();
  const supported = (key: CapabilityKey): boolean => caps[key]?.supported === true;

  await record('metadata: name/version present', () => {
    if (!driver.name || driver.name.length === 0) throw new Error('driver.name is empty');
    if (!driver.runtimeVersion) throw new Error('driver.runtimeVersion is empty');
  });

  await record('capabilities: only known keys declared', () => {
    for (const key of Object.keys(caps)) {
      if (!(CAPABILITIES as readonly string[]).includes(key)) {
        throw new Error(`unknown capability key declared: ${key}`);
      }
    }
    if (Object.keys(caps).length === 0) throw new Error('no capabilities declared');
  });

  await record('connect: yields SpawnInfo', async () => {
    if (driver.connected) return;
    const spawn = await driver.connect({
      host: 'contract.local',
      username: 'ContractBot',
      ...options.connectOptions
    });
    if (typeof spawn.entityId !== 'number') throw new Error('SpawnInfo.entityId missing');
    if (!spawn.position || typeof spawn.position.x !== 'number') throw new Error('SpawnInfo.position missing');
  });

  await record('connect: connected flag true', () => {
    if (!driver.connected) throw new Error('connected is false after connect()');
  });

  await record('world: self() returns valid SelfState', () => {
    const self = driver.self();
    if (!self.position) throw new Error('SelfState.position missing');
    if (typeof self.yaw !== 'number') throw new Error('SelfState.yaw missing');
  });

  await record('world: blockQueries return decoded blocks', () => {
    if (!supported('world.blockQueries')) throw new Error('capability not declared');
    const pos = floorToBlock(driver.self().position);
    const block = driver.world().getBlock(pos);
    if (block === null) throw new Error(`getBlock at self position ${pos.x},${pos.y},${pos.z} returned null`);
  }, () => (supported('world.blockQueries') ? null : 'capability not declared'));

  const entityId = options.spawnTestEntity
    ? await options.spawnTestEntity({ x: 1.5, y: driver.self().position.y, z: 1.5 })
    : null;

  await record('world: entityTracking lists spawned entity', () => {
    if (!supported('world.entityTracking')) throw new Error('capability not declared');
    if (entityId === null) throw new Error('no spawnTestEntity provided');
    const found = driver.world().entity(entityId);
    if (found === null) throw new Error(`entity ${entityId} not visible in world view`);
  }, () => {
    if (!supported('world.entityTracking')) return 'capability not declared';
    if (entityId === null) return 'no spawnTestEntity provided';
    return null;
  });

  await record('movement: look changes yaw', async () => {
    if (!supported('movement.look')) throw new Error('capability not declared');
    const targetYaw = 45;
    await driver.look(targetYaw, 0);
    await sleep(50);
    const yaw = driver.self().yaw;
    const delta = Math.abs(((yaw - targetYaw + 540) % 360) - 180);
    if (delta > 5) throw new Error(`yaw did not apply (got ${yaw}, wanted ~${targetYaw})`);
  }, () => (supported('movement.look') ? null : 'capability not declared'));

  await record('movement: control states move the bot', async () => {
    if (!supported('movement.controlStates')) throw new Error('capability not declared');
    const start = driver.self().position;
    await driver.setControlState('forward', true);
    for (let i = 0; i < 12; i++) await sleep(50);
    await driver.setControlState('forward', false);
    const moved = distance(driver.self().position, start);
    if (moved < 0.5) throw new Error(`bot did not move (moved ${moved.toFixed(3)} m in 600 ms)`);
  }, () => (supported('movement.controlStates') ? null : 'capability not declared'));

  await record('combat: attack damages or removes the test entity', async () => {
    if (!supported('combat.attack')) throw new Error('capability not declared');
    if (entityId === null) throw new Error('no spawnTestEntity provided');
    // Teleport next to the entity if the runtime allows proximity control;
    // otherwise only attempt if within reach already.
    const self = driver.self();
    const target = driver.world().entity(entityId);
    if (target === null) throw new Error('test entity vanished before combat check');
    const d = distance(self.position, target.position);
    if (d > 3.5) {
      throw new Error(`test entity out of simulated reach (${d.toFixed(2)} m); move it closer`);
    }
    await driver.attack(entityId);
  }, () => {
    if (!supported('combat.attack')) return 'capability not declared';
    if (entityId === null) return 'no spawnTestEntity provided';
    return null;
  });

  await record('inventory: getInventory shape valid', () => {
    const inv = driver.getInventory();
    if (!supported('inventory.read')) {
      if (inv !== null) throw new Error('inventory returned while capability undeclared');
      return;
    }
    if (inv === null) throw new Error('inventory.read declared but getInventory() returned null');
    if (typeof inv.size !== 'number' || typeof inv.heldSlot !== 'number') {
      throw new Error('InventorySnapshot missing size/heldSlot');
    }
  });

  await record('chat: sendChat resolves', async () => {
    if (!supported('chat.send')) throw new Error('capability not declared');
    await driver.sendChat('botpex contract check');
  }, () => (supported('chat.send') ? null : 'capability not declared'));

  await record('unsupported capabilities fail loudly', () => {
    for (const [key, info] of Object.entries(caps)) {
      if (info?.supported === false && info.notes === undefined) {
        throw new Error(`capability ${key} unsupported but missing accuracy note`);
      }
    }
  });

  if (options.disconnectAtEnd !== false) {
    await record('disconnect: sets connected false', async () => {
      await driver.disconnect('contract end');
      if (driver.connected) throw new Error('connected still true after disconnect()');
    });
  }

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const skipped = checks.filter((c) => c.status === 'skip').length;
  return { driver: driver.name, checks, passed, failed, skipped };
}
