import {
  type CapabilityMap,
  type CapabilityKey,
  type IDriver,
  type Logger,
  KERNEL_API_VERSION,
  CAPABILITIES,
  Errors
} from '@botpex/api';
import semver from 'semver';

export type AdapterKind = 'driver' | 'server' | 'engine' | 'custom';

export interface AdapterManifest {
  spec: '@botpex/adapter/v1';
  /** Kebab-case adapter id, e.g. "runtime-hero". */
  id: string;
  name: string;
  version: string;
  /** Semver range of @botpex/api this adapter was built against. */
  api: string;
  provides: AdapterKind;
  entry: string;
  /** Declared capabilities; the host intersects these with its grants. */
  capabilities?: CapabilityMap;
  license: string;
  description?: string;
}

export type AdapterFactory = (context: AdapterContext) => IDriver | Promise<IDriver>;

export interface AdapterContext {
  log: Logger;
  apiVersion: string;
}

const KEBAK = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[\w.-]+)?$/;
const KNOWN_CAPS = new Set<string>(CAPABILITIES);

export function validateAdapterManifest(value: unknown): { ok: true; manifest: AdapterManifest } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (value === null || typeof value !== 'object') {
    return { ok: false, problems: ['manifest must be an object'] };
  }
  const m = value as Record<string, unknown>;
  if (m.spec !== '@botpex/adapter/v1') problems.push(`spec must be "@botpex/adapter/v1", got "${String(m.spec)}"`);
  if (typeof m.id !== 'string' || !KEBAK.test(m.id)) problems.push('id must be kebab-case');
  if (typeof m.name !== 'string' || m.name.length === 0) problems.push('name required');
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) problems.push('version must be semver (x.y.z)');
  if (typeof m.api !== 'string' || !semver.validRange(m.api)) problems.push('api must be a semver range');
  if (!['driver', 'server', 'engine', 'custom'].includes(String(m.provides))) problems.push('provides must be driver|server|engine|custom');
  if (typeof m.entry !== 'string' || m.entry.length === 0) problems.push('entry required');
  if (typeof m.license !== 'string' || m.license.length === 0) problems.push('license (SPDX) required — license hygiene is a Botpex policy');
  if (m.capabilities !== undefined) {
    if (typeof m.capabilities !== 'object' || m.capabilities === null) {
      problems.push('capabilities must be an object');
    } else {
      for (const key of Object.keys(m.capabilities)) {
        if (!KNOWN_CAPS.has(key)) problems.push(`unknown capability "${key}"`);
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, manifest: value as unknown as AdapterManifest };
}

interface Registered {
  manifest: AdapterManifest;
  factory: AdapterFactory;
}

/**
 * AdapterRegistry — validates manifests, checks API semver ranges and
 * stores factories. Loading from npm packages is supported via loadFrom().
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, Registered>();

  register(manifest: unknown, factory: AdapterFactory): AdapterManifest {
    const result = validateAdapterManifest(manifest);
    if (!result.ok) throw Errors.manifestInvalid('adapter', String((manifest as { id?: string })?.id ?? '?'), result.problems);
    if (!semver.satisfies(KERNEL_API_VERSION, result.manifest.api)) {
      throw Errors.apiMismatch('adapter', result.manifest.id, result.manifest.api, KERNEL_API_VERSION);
    }
    if (this.adapters.has(result.manifest.id)) {
      throw new Error(`adapter "${result.manifest.id}" is already registered`);
    }
    this.adapters.set(result.manifest.id, { manifest: result.manifest, factory });
    return result.manifest;
  }

  get(id: string): AdapterManifest | null {
    return this.adapters.get(id)?.manifest ?? null;
  }

  list(): AdapterManifest[] {
    return [...this.adapters.values()].map((r) => r.manifest);
  }

  factory(id: string): AdapterFactory {
    const found = this.adapters.get(id);
    if (!found) throw Errors.adapterNotFound(id, this.adapters.size > 0 ? [...this.adapters.keys()] : []);
    return found.factory;
  }

  /**
   * Dynamically import an adapter package; it must export its manifest as
   * `manifest` (or default) and a `create` factory.
   */
  async loadFrom(specifier: string): Promise<AdapterManifest> {
    const mod = (await import(specifier)) as Record<string, unknown>;
    const manifest = (mod.manifest ?? mod.default) as unknown;
    const factory = mod.create as AdapterFactory | undefined;
    if (typeof factory !== 'function') {
      throw Errors.manifestInvalid('adapter', specifier, ['module does not export a create() factory']);
    }
    return this.register(manifest, factory);
  }
}

export interface AdapterGrants {
  /** Capability keys the host is willing to grant (default: all declared). */
  allow?: readonly CapabilityKey[];
}

/**
 * AdapterHost — instantiates drivers with capability-grant intersection and
 * namespaced logging. Unsupported grants are reported via the log, and the
 * driver's capability map is the *intersection*, so the kernel can never
 * reach a feature the host did not allow.
 */
export class AdapterHost {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly log: Logger
  ) {}

  async create(id: string, grants: AdapterGrants = {}): Promise<IDriver> {
    const reg = this.registry.list().find((m) => m.id === id);
    const factory = this.registry.factory(id);
    const driver = await factory({ log: this.log.child(`adapter.${id}`), apiVersion: KERNEL_API_VERSION });
    // Merge: driver-declared capabilities overlaid by manifest declarations
    // (the manifest is the adapter author's authoritative statement).
    const declared: Record<string, { supported: boolean; notes?: string }> = {
      ...(driver.capabilities() as Record<string, { supported: boolean; notes?: string }>),
      ...((reg?.capabilities ?? {}) as Record<string, { supported: boolean; notes?: string }>)
    };
    const allowed = grants.allow;
    const capped: Record<string, { supported: boolean; notes?: string }> = {};
    for (const [key, info] of Object.entries(declared)) {
      const grantAllowed = allowed === undefined || allowed.includes(key as CapabilityKey);
      if (info?.supported === true && !grantAllowed) {
        capped[key] = { supported: false, notes: 'not granted by adapter host policy' };
        this.log.warn('capability withheld by host policy', { adapter: id, capability: key });
      } else if (info !== undefined) {
        capped[key] = { ...info };
      }
    }
    const wrappedImpl: IDriver = {
      name: driver.name,
      runtimeVersion: driver.runtimeVersion,
      capabilities: () => capped,
      connect: (o) => driver.connect(o),
      disconnect: (r) => driver.disconnect(r),
      get connected() {
        return driver.connected;
      },
      world: () => driver.world(),
      self: () => driver.self(),
      setControlState: (c, a) => driver.setControlState(c, a),
      look: (y, p) => driver.look(y, p),
      attack: (e) => driver.attack(e),
      digBlock: (p) => driver.digBlock(p),
      placeBlock: (p, f) => driver.placeBlock(p, f),
      useHeldItem: () => driver.useHeldItem(),
      selectHotbarSlot: (s) => driver.selectHotbarSlot(s),
      getInventory: () => driver.getInventory(),
      sendChat: (m) => driver.sendChat(m),
      on: (e, h) => driver.on(e, h)
    };
    const wrapped: IDriver = Object.freeze(wrappedImpl) as IDriver;
    return wrapped;
  }
}
