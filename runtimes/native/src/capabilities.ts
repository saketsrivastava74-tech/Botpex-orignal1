import type { CapabilityMap } from '@botpex/api';

/**
 * Capability map for the native runtime. Notes are explicit about accuracy
 * limits so the kernel and developers never over-trust a value.
 */
export function nativeCapabilities(): CapabilityMap {
  return {
    'world.blockQueries': { supported: true, notes: 'loaded chunks only; null outside them' },
    'world.entityTracking': {
      supported: true,
      notes: 'positions reliable; kind/type best-effort from entity ids; enemy health unknown'
    },
    'world.blockUpdates': { supported: true },
    'movement.controlStates': { supported: true, notes: 'kinematic client-side model' },
    'movement.look': { supported: true },
    'movement.physics': {
      supported: false,
      notes: '0.1 ships kinematic movement with collision, not full client physics (TODO NR-010); anti-cheat servers may rubber-band'
    },
    'combat.attack': { supported: true, notes: 'use_entity attack + swing; no client-side cooldown enforcement' },
    'combat.dig': { supported: true, notes: 'hardness-based timing estimate, no tool efficiency' },
    'combat.placeBlock': { supported: true, notes: 'basic placement, no cursor precision' },
    'inventory.read': { supported: true, notes: 'item naming exact for 1.13+; older ids unmapped' },
    'inventory.equip': { supported: true, notes: 'hotbar select only; cross-inventory moves pending (TODO NR-011)' },
    'inventory.useItem': { supported: true },
    'inventory.containers': { supported: false, notes: 'container windows pending (TODO NR-011)' },
    'chat.send': { supported: true, notes: 'unsigned chat only; 1.19.1+ servers accept but do not sign' },
    'chat.receive': { supported: true, notes: 'system + player chat flattened to text' },
    'self.health': { supported: true },
    'self.position': { supported: true, notes: 'server-confirmed position with teleport acknowledgements' }
  };
}
