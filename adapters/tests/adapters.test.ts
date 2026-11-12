import { describe, it, expect } from 'vitest';
import { AdapterRegistry, AdapterHost, validateAdapterManifest } from '../src/index.js';
import { createConsoleLogger, MemoryLogger } from '@botpex/kernel';
import type { IDriver, CapabilityMap, DriverOptions, SpawnInfo, IWorldView, SelfState, MoveControl, EntityId, Direction, InventorySnapshot, DriverEventMap } from '@botpex/api';

const goodManifest = {
  spec: '@botpex/adapter/v1',
  id: 'runtime-example',
  name: 'Example Adapter',
  version: '1.0.0',
  api: '^0.1.0',
  provides: 'driver',
  entry: './dist/index.js',
  license: 'MIT',
  capabilities: { 'movement.physics': { supported: false, notes: 'kinematic' } }
};

function stubDriver(caps: CapabilityMap = {}): IDriver {
  return {
    name: 'stub',
    runtimeVersion: '0.0.1',
    capabilities: () => caps,
    connect: async (o: DriverOptions): Promise<SpawnInfo> => ({ entityId: 1, position: { x: 0, y: 0, z: 0 }, gameMode: null, version: null, dimension: null, ...({ username: o.username } as object) }),
    disconnect: async () => {},
    connected: false,
    world: () => ({ getBlock: () => null, isLoaded: () => false, loadedBounds: () => null, entities: () => [], entity: () => null }) as IWorldView,
    self: () => ({ position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, onGround: true, health: null, food: null, gameMode: null }) as SelfState,
    setControlState: async (_c: MoveControl, _a: boolean) => {},
    look: async () => {},
    attack: async (_e: EntityId) => {},
    digBlock: async () => {},
    placeBlock: async (_p: never, _f?: Direction) => {},
    useHeldItem: async () => {},
    selectHotbarSlot: async (_s: number) => {},
    getInventory: (): InventorySnapshot | null => null,
    sendChat: async () => {},
    on: ((..._args: unknown[]) => () => {}) as unknown as IDriver['on']
  };
}

describe('validateAdapterManifest', () => {
  it('accepts a valid manifest', () => {
    const res = validateAdapterManifest(goodManifest);
    expect(res.ok).toBe(true);
  });

  it('collects multiple problems', () => {
    const res = validateAdapterManifest({ spec: 'nope', id: 'Bad_Id' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.problems.length).toBeGreaterThan(3);
  });

  it('rejects unknown capability keys', () => {
    const res = validateAdapterManifest({ ...goodManifest, capabilities: { 'made.up.cap': { supported: true } } });
    expect(res.ok).toBe(false);
  });
});

describe('AdapterRegistry + Host', () => {
  it('registers and creates drivers with namespaced logs', async () => {
    const registry = new AdapterRegistry();
    registry.register(goodManifest, () => stubDriver({ 'movement.look': { supported: true } }));
    const host = new AdapterHost(registry, createConsoleLogger('test', 'error'));
    const driver = await host.create('runtime-example');
    expect(driver.name).toBe('stub');
    expect(driver.capabilities()['movement.look']?.supported).toBe(true);
  });

  it('enforces API semver ranges', () => {
    const registry = new AdapterRegistry();
    expect(() =>
      registry.register({ ...goodManifest, api: '^99.0.0' }, () => stubDriver())
    ).toThrowError(/API/);
  });

  it('withholds capabilities not granted by host policy', async () => {
    const registry = new AdapterRegistry();
    registry.register(
      goodManifest,
      () => stubDriver({ 'movement.look': { supported: true }, 'combat.attack': { supported: true } })
    );
    const logger = new MemoryLogger('host');
    const host = new AdapterHost(registry, logger);
    const driver = await host.create('runtime-example', { allow: ['movement.look'] });
    expect(driver.capabilities()['movement.look']?.supported).toBe(true);
    expect(driver.capabilities()['combat.attack']?.supported).toBe(false);
    expect(logger.has('capability withheld')).toBe(true);
  });

  it('rejects duplicate ids and unknown ids', async () => {
    const registry = new AdapterRegistry();
    registry.register(goodManifest, () => stubDriver());
    expect(() => registry.register(goodManifest, () => stubDriver())).toThrowError(/already registered/);
    const host = new AdapterHost(registry, createConsoleLogger('test', 'error'));
    await expect(host.create('missing-adapter')).rejects.toMatchObject({ code: 'BOTPEX/ADAPTER/NOT_FOUND' });
  });
});
