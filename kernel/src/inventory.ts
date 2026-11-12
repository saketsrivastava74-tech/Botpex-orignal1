import type { CapabilityRegistry } from './capabilities.js';
import {
  type IEventBus,
  type Logger,
  type IDriver,

  type InventorySnapshot,
  type ItemStack,
  findItem,
  Errors
} from '@botpex/api';

export interface InventoryConfig {
  /** Poll interval for snapshot refresh (default 500 ms). */
  pollMs?: number;
}

/** Block-name fragment → tool-name fragment affinity used by equipBestTool. */
const TOOL_AFFINITY: readonly { block: string; tool: string }[] = [
  { block: 'stone', tool: 'pickaxe' },
  { block: 'cobble', tool: 'pickaxe' },
  { block: 'ore', tool: 'pickaxe' },
  { block: 'deepslate', tool: 'pickaxe' },
  { block: 'obsidian', tool: 'pickaxe' },
  { block: 'log', tool: 'axe' },
  { block: 'wood', tool: 'axe' },
  { block: 'planks', tool: 'axe' },
  { block: 'fence', tool: 'axe' },
  { block: 'dirt', tool: 'shovel' },
  { block: 'grass_block', tool: 'shovel' },
  { block: 'sand', tool: 'shovel' },
  { block: 'gravel', tool: 'shovel' },
  { block: 'snow', tool: 'shovel' }
];

/**
 * Inventory System — snapshot cache over the driver's inventory, hotbar
 * equipping with material affinity, and item usage. All actions are
 * capability-gated; container windows are a declared 0.1 gap.
 */
export class InventorySystem {
  private snapshot: InventorySnapshot | null = null;
  private lastPoll = 0;
  private readonly pollMs: number;
  private lastSignature = '';

  constructor(
    private readonly driver: IDriver,
    private readonly caps: CapabilityRegistry,
    private readonly bus: IEventBus,
    private readonly log: Logger,
    config: InventoryConfig = {}
  ) {
    this.pollMs = config.pollMs ?? 500;
  }

  get current(): InventorySnapshot | null {
    return this.snapshot;
  }

  /** Pull a fresh snapshot from the driver; emits inventory:updated on change. */
  refresh(now: number = Date.now()): InventorySnapshot | null {
    if (!this.caps.has('inventory.read')) return null;
    if (now - this.lastPoll < this.pollMs) return this.snapshot;
    this.lastPoll = now;
    try {
      const snap = this.driver.getInventory();
      const changed = signature(snap) !== this.lastSignature;
      this.snapshot = snap;
      if (snap !== null && changed) {
        this.lastSignature = signature(snap);
        this.bus.emit('inventory:updated', { snapshot: snap });
      }
      return snap;
    } catch (error) {
      this.log.debug('inventory refresh failed', { error: String(error) });
      return this.snapshot;
    }
  }

  invalidate(): void {
    this.lastPoll = 0;
  }

  /** Best hotbar item for the given block name, by material affinity. */
  bestToolFor(blockName: string): ItemStack | null {
    const inv = this.snapshot;
    if (inv === null) return null;
    const lower = blockName.toLowerCase();
    for (const { block, tool } of TOOL_AFFINITY) {
      if (lower.includes(block)) {
        const found = findItem(inv, tool);
        if (found !== null) return found;
      }
    }
    return null;
  }

  /** Select the best hotbar tool for a block, if the runtime supports equipping. */
  async equipBestTool(blockName: string): Promise<ItemStack | null> {
    this.caps.require('inventory.equip');
    const tool = this.bestToolFor(blockName);
    if (tool === null) return null;
    await this.selectHotbar(tool.slot);
    return tool;
  }

  async selectHotbar(slot: number): Promise<void> {
    this.caps.require('inventory.equip');
    if (!Number.isInteger(slot) || slot < 0 || slot > 8) {
      throw Errors.configInvalid('slot', `hotbar slot must be an integer 0–8, got ${slot}`);
    }
    await this.driver.selectHotbarSlot(slot);
  }

  async useHeldItem(): Promise<void> {
    this.caps.require('inventory.useItem');
    await this.driver.useHeldItem();
  }
}

function signature(snap: InventorySnapshot | null): string {
  if (snap === null) return 'null';
  return `${snap.heldSlot}|${snap.items
    .map((i) => `${i.slot}:${i.name}x${i.count}`)
    .sort()
    .join(',')}`;
}
