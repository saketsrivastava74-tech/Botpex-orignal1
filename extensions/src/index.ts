import {
  type BotFacade,
  type BlockInfo,
  type BlockPos,
  type EntityId,
  type EntitySnapshot,
  type IEventBus,
  type KernelEventMap,
  type Logger,
  type MoveOptions,
  type SelfState,
  type Vec3,
  type ControlSet,
  KERNEL_API_VERSION,
  Errors
} from '@botpex/api';
import semver from 'semver';

export type ExtensionPermission =
  | 'events:subscribe'
  | 'world:read'
  | 'movement:control'
  | 'combat:attack'
  | 'inventory:read'
  | 'inventory:equip'
  | 'inventory:useItem'
  | 'chat:send'
  | 'navigation:use';

export const EXTENSION_PERMISSIONS: readonly ExtensionPermission[] = [
  'events:subscribe',
  'world:read',
  'movement:control',
  'combat:attack',
  'inventory:read',
  'inventory:equip',
  'inventory:useItem',
  'chat:send',
  'navigation:use'
];

export interface ExtensionManifest {
  spec: '@botpex/extension/v1';
  id: string;
  name: string;
  version: string;
  api: string;
  entry: string;
  license: string;
  permissions: ExtensionPermission[];
  provides?: ('behaviour' | 'brain' | 'hooks')[];
  description?: string;
}

const KEBAK = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[\w.-]+)?$/;

export function validateExtensionManifest(value: unknown): { ok: true; manifest: ExtensionManifest } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (value === null || typeof value !== 'object') return { ok: false, problems: ['manifest must be an object'] };
  const m = value as Record<string, unknown>;
  if (m.spec !== '@botpex/extension/v1') problems.push('spec must be "@botpex/extension/v1"');
  if (typeof m.id !== 'string' || !KEBAK.test(m.id)) problems.push('id must be kebab-case');
  if (typeof m.name !== 'string' || m.name.length === 0) problems.push('name required');
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) problems.push('version must be semver');
  if (typeof m.api !== 'string' || !semver.validRange(m.api)) problems.push('api must be a semver range');
  if (typeof m.entry !== 'string' || m.entry.length === 0) problems.push('entry required');
  if (typeof m.license !== 'string' || m.license.length === 0) problems.push('license required');
  if (!Array.isArray(m.permissions)) problems.push('permissions must be an array');
  else {
    for (const p of m.permissions) {
      if (!EXTENSION_PERMISSIONS.includes(p as ExtensionPermission)) {
        problems.push(`unknown permission "${String(p)}"`);
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, manifest: value as unknown as ExtensionManifest };
}

export interface ExtensionContext {
  manifest: ExtensionManifest;
  /** Permission-gated view of the bot. */
  bot: BotFacade;
  /** Event subscription (requires 'events:subscribe'). */
  on<K extends keyof KernelEventMap & string>(event: K, handler: (payload: KernelEventMap[K]) => void): () => void;
  log: Logger;
}

export type ExtensionEntry = (ctx: ExtensionContext) => void | Promise<void>;

/**
 * ExtensionHost — activates extensions with:
 * - manifest validation + API range checks,
 * - a permission-gated ScopedFacade (every method checks a permission and
 *   throws BOTPEX/EXT/PERMISSION_DENIED when absent),
 * - namespaced logging,
 * - event subscriptions only with 'events:subscribe'.
 *
 * 0.1 runs extensions in-process (documented); sandboxed isolation is
 * tracked as TODO EXT-002.
 */
export class ExtensionHost {
  private readonly extensions = new Map<string, { manifest: ExtensionManifest; entry: ExtensionEntry; active: boolean }>();

  constructor(
    private readonly bot: BotFacade,
    private readonly bus: IEventBus,
    private readonly log: Logger
  ) {}

  register(manifest: unknown, entry: ExtensionEntry): ExtensionManifest {
    const res = validateExtensionManifest(manifest);
    if (!res.ok) throw Errors.manifestInvalid('extension', String((manifest as { id?: string })?.id ?? '?'), res.problems);
    if (!semver.satisfies(KERNEL_API_VERSION, res.manifest.api)) {
      throw Errors.apiMismatch('extension', res.manifest.id, res.manifest.api, KERNEL_API_VERSION);
    }
    this.extensions.set(res.manifest.id, { manifest: res.manifest, entry, active: false });
    return res.manifest;
  }

  list(): ExtensionManifest[] {
    return [...this.extensions.values()].map((e) => e.manifest);
  }

  async activate(id: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) throw Errors.adapterNotFound(id, [...this.extensions.keys()]);
    if (ext.active) return;
    ext.active = true;
    const perms = new Set<ExtensionPermission>(ext.manifest.permissions);
    const ctx: ExtensionContext = {
      manifest: ext.manifest,
      bot: new ScopedFacade(this.bot, id, perms),
      on: (event, handler) => {
        if (!perms.has('events:subscribe')) {
          throw Errors.permissionDenied('events:subscribe', `extension "${id}"`);
        }
        return this.bus.on(event, handler);
      },
      log: this.log.child(`ext.${id}`)
    };
    await ext.entry(ctx);
  }
}

/**
 * A BotFacade that enforces the extension's permission set. Denials throw
 * BotpexError('BOTPEX/EXT/PERMISSION_DENIED') — never silent degradation.
 */
class ScopedFacade implements BotFacade {
  constructor(
    private readonly inner: BotFacade,
    private readonly subject: string,
    private readonly perms: Set<ExtensionPermission>
  ) {}

  private require(permission: ExtensionPermission): void {
    if (!this.perms.has(permission)) throw Errors.permissionDenied(permission, this.subject);
  }

  get botId(): string {
    return this.inner.botId;
  }
  get phase() {
    return this.inner.phase;
  }
  get capabilities() {
    return this.inner.capabilities;
  }
  get events(): IEventBus {
    return this.inner.events;
  }
  get blackboard() {
    return this.inner.blackboard;
  }
  get log(): Logger {
    return this.inner.log;
  }

  self(): SelfState {
    this.require('world:read');
    return this.inner.self();
  }

  entities(): EntitySnapshot[] {
    this.require('world:read');
    return this.inner.entities();
  }

  entity(id: EntityId): EntitySnapshot | null {
    this.require('world:read');
    return this.inner.entity(id);
  }

  blockAt(pos: BlockPos): BlockInfo | null {
    this.require('world:read');
    return this.inner.blockAt(pos);
  }

  async moveTo(goal: BlockPos, options?: MoveOptions): Promise<void> {
    this.require('navigation:use');
    return this.inner.moveTo(goal, options);
  }

  stopMove(): void {
    this.require('movement:control');
    this.inner.stopMove();
  }

  async lookAt(position: Vec3): Promise<void> {
    this.require('movement:control');
    return this.inner.lookAt(position);
  }

  async look(yaw: number, pitch: number): Promise<void> {
    this.require('movement:control');
    return this.inner.look(yaw, pitch);
  }

  async applyControls(controls: ControlSet): Promise<void> {
    this.require('movement:control');
    return this.inner.applyControls(controls);
  }

  async attack(entityId: EntityId): Promise<void> {
    this.require('combat:attack');
    return this.inner.attack(entityId);
  }

  async selectHotbar(slot: number): Promise<void> {
    this.require('inventory:equip');
    return this.inner.selectHotbar(slot);
  }

  async useHeldItem(): Promise<void> {
    this.require('inventory:useItem');
    return this.inner.useHeldItem();
  }

  async sendChat(message: string): Promise<void> {
    this.require('chat:send');
    return this.inner.sendChat(message);
  }

  now(): number {
    return this.inner.now();
  }

  on<K extends keyof KernelEventMap & string>(event: K, handler: (payload: KernelEventMap[K]) => void): () => void {
    this.require('events:subscribe');
    return this.inner.on(event, handler);
  }
}
