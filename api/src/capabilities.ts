/**
 * Capability model — the "no silent failures" contract.
 *
 * Every runtime declares which capabilities it supports. The kernel refuses
 * (with BotpexError + hint) any operation whose capability is absent, and
 * `createBot` fails fast when requested features are not available.
 */

export const CAPABILITIES = [
  // world
  'world.blockQueries', // getBlock returns decoded block data for loaded chunks
  'world.entityTracking', // entity snapshots for nearby entities
  'world.blockUpdates', // driver emits blockUpdated events
  // movement
  'movement.controlStates', // setControlState supported (forward/back/.../jump)
  'movement.look', // look(yaw, pitch) supported
  'movement.physics', // full client-side physics (server-identical); false = kinematic approximation
  // combat
  'combat.attack', // attack(entityId)
  'combat.dig', // digBlock(pos) — may be approximate timing, see notes
  'combat.placeBlock', // placeBlock(pos, face)
  // inventory
  'inventory.read', // getInventory() snapshot
  'inventory.equip', // selectHotbarSlot()
  'inventory.useItem', // useHeldItem()
  'inventory.containers', // container windows (chests...) — 0.1: future
  // chat
  'chat.send', // may be unsigned-only on 1.19.1+, see notes
  'chat.receive',
  // self
  'self.health', // health/food reported
  'self.position' // position/velocity/yaw/pitch reported
] as const;

export type CapabilityKey = (typeof CAPABILITIES)[number];

export interface CapabilityInfo {
  readonly supported: boolean;
  /** Honest accuracy notes, e.g. "kinematic movement; no full client physics". */
  readonly notes?: string;
}

/** Missing entries mean "unsupported". */
export type CapabilityMap = Readonly<Partial<Record<CapabilityKey, CapabilityInfo>>>;

export function isCapabilityKey(value: string): value is CapabilityKey {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function capabilitySupported(map: CapabilityMap, key: CapabilityKey): boolean {
  return map[key]?.supported === true;
}

export function capabilityNotes(map: CapabilityMap, key: CapabilityKey): string | undefined {
  return map[key]?.notes;
}

/**
 * Kernel features mapped to the capabilities they require.
 * `createBot` validates requested features against the driver and fails fast
 * with a combined report listing every missing capability.
 */
export const FEATURE_REQUIREMENTS = {
  navigation: ['world.blockQueries', 'movement.controlStates'],
  movement: ['movement.controlStates'],
  look: ['movement.look'],
  combat: ['combat.attack'],
  dig: ['combat.dig'],
  placeBlock: ['combat.placeBlock'],
  inventoryRead: ['inventory.read'],
  hotbarEquip: ['inventory.equip'],
  useItem: ['inventory.useItem'],
  chat: ['chat.send'],
  perception: ['world.entityTracking'],
  selfMonitoring: ['self.position']
} as const satisfies Record<string, readonly CapabilityKey[]>;

export type FeatureKey = keyof typeof FEATURE_REQUIREMENTS;

export function missingCapabilities(map: CapabilityMap, feature: FeatureKey): CapabilityKey[] {
  return FEATURE_REQUIREMENTS[feature].filter((key) => !capabilitySupported(map, key));
}

export function missingForFeatures(
  map: CapabilityMap,
  features: readonly FeatureKey[]
): { feature: FeatureKey; missing: CapabilityKey[] }[] {
  const report: { feature: FeatureKey; missing: CapabilityKey[] }[] = [];
  for (const feature of features) {
    const missing = missingCapabilities(map, feature);
    if (missing.length > 0) report.push({ feature, missing });
  }
  return report;
}
