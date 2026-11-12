import { AIR_BLOCK, UNKNOWN_BLOCK, type BlockInfo } from '@botpex/api';

const def = (
  name: string,
  solid: boolean,
  liquid = false,
  hardness: number | null = null
): BlockInfo => ({
  name,
  flags: { solid, liquid, passable: !solid && !liquid ? true : liquid },
  hardness
});

/**
 * Block table for the in-memory world. Values mirror vanilla semantics well
 * enough for navigation/combat tests. Extend as needed; keep names identical
 * to vanilla ids so tool-affinity logic works unchanged.
 */
export const BLOCKS: Record<string, BlockInfo> = {
  air: AIR_BLOCK,
  stone: def('stone', true, false, 1.5),
  cobblestone: def('cobblestone', true, false, 2.0),
  dirt: def('dirt', true, false, 0.5),
  grass_block: def('grass_block', true, false, 0.6),
  sand: def('sand', true, false, 0.5),
  oak_log: def('oak_log', true, false, 2.0),
  oak_planks: def('oak_planks', true, false, 2.0),
  water: def('water', false, true, 100),
  bedrock: def('bedrock', true, false, -1),
  unknown: UNKNOWN_BLOCK
};

export function blockByName(name: string): BlockInfo {
  return BLOCKS[name] ?? UNKNOWN_BLOCK;
}
