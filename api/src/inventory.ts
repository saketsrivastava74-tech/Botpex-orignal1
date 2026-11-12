/**
 * Inventory abstractions.
 *
 * Slot numbering follows the vanilla player inventory (window 0) convention:
 * 0–8 hotbar, 9–35 main inventory, 36–39 armor, 40 off-hand. Runtimes that
 * cannot provide an inventory return `null` from `IDriver.getInventory()`.
 */

export interface ItemStack {
  readonly name: string;
  readonly count: number;
  readonly slot: number;
  readonly displayName?: string;
  readonly durability?: number | null;
}

export interface InventorySnapshot {
  readonly windowId: number;
  readonly size: number;
  /** Currently selected hotbar slot (0–8). */
  readonly heldSlot: number;
  readonly items: readonly ItemStack[];
}

export const HOTBAR_SLOTS = 9;
export const HOTBAR_RANGE = { min: 0, max: 8 } as const;

export function itemAt(inv: InventorySnapshot, slot: number): ItemStack | null {
  return inv.items.find((i) => i.slot === slot) ?? null;
}

export function hotbarItems(inv: InventorySnapshot): ItemStack[] {
  return inv.items
    .filter((i) => i.slot >= HOTBAR_RANGE.min && i.slot <= HOTBAR_RANGE.max)
    .sort((a, b) => a.slot - b.slot);
}

/** First item whose name contains `fragment` (hotbar searched first). */
export function findItem(inv: InventorySnapshot, fragment: string): ItemStack | null {
  const lower = fragment.toLowerCase();
  return (
    hotbarItems(inv).find((i) => i.name.toLowerCase().includes(lower)) ??
    inv.items
      .filter((i) => i.slot < HOTBAR_RANGE.min || i.slot > HOTBAR_RANGE.max)
      .sort((a, b) => a.slot - b.slot)
      .find((i) => i.name.toLowerCase().includes(lower)) ??
    null
  );
}
