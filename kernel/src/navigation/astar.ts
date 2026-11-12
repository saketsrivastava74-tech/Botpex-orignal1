import {
  type BlockInfo,
  type BlockPos,
  type NavPath,
  type Vec3,
  AIR_BLOCK,
  blockKey,
  distance
} from '@botpex/api';

/** Block accessor contract for pathfinding. */
export interface NavBlockAccessor {
  getBlock(pos: BlockPos): BlockInfo | null;
  isLoaded(pos: BlockPos): boolean;
}

export interface AStarOptions {
  /** Node expansion budget (default 20000). Prevents CPU blowups on bad terrain. */
  maxNodes?: number;
  /** Allow diagonal movement (default true). */
  allowDiagonal?: boolean;
  /** Maximum fall distance in blocks (default 3). */
  maxFall?: number;
  /** Treat liquids as walkable with penalty (default false). */
  allowLiquid?: boolean;
}

interface Node {
  pos: BlockPos;
  g: number;
  f: number;
  parent: Node | null;
}

/** Minimal binary min-heap on `f`. */
class MinHeap {
  private items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const parentItem = this.items[parent];
      const item = this.items[i];
      if (!parentItem || !item) break;
      if (parentItem.f <= item.f) break;
      this.items[parent] = item;
      this.items[i] = parentItem;
      i = parent;
    }
  }

  pop(): Node | null {
    const top = this.items[0];
    const last = this.items.pop();
    if (!top) return null;
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        const a = this.items[l];
        const b = this.items[r];
        const cur = this.items[smallest];
        if (a && cur && a.f < cur.f) smallest = l;
        if (b && cur && b.f < (this.items[smallest]?.f ?? Infinity)) smallest = r;
        if (smallest === i) break;
        const tmp = this.items[i];
        const swap = this.items[smallest];
        if (!tmp || !swap) break;
        this.items[i] = swap;
        this.items[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }
}

const JUMP_COST = 1.6;
const DIAGONAL_COST = Math.SQRT2;
const FALL_COST_PER_BLOCK = 0.25;

function isWalkable(
  acc: NavBlockAccessor,
  pos: BlockPos,
  allowLiquid: boolean
): boolean {
  const feet = acc.getBlock(pos);
  if (feet === null) return false;
  if (feet.flags.passable) {
    const surface = acc.getBlock({ x: pos.x, y: pos.y - 1, z: pos.z });
    if (surface === null) return false;
    if (!surface.flags.solid) return false;
    const head = acc.getBlock({ x: pos.x, y: pos.y + 1, z: pos.z });
    return head !== null && head.flags.passable;
  }
  if (allowLiquid && feet.flags.liquid) return true;
  return false;
}

function walkableAt(acc: NavBlockAccessor, pos: BlockPos, allowLiquid: boolean): boolean {
  return isWalkable(acc, pos, allowLiquid);
}

/**
 * Terrain-aware grid A* over the loaded world model.
 * Supports flat walking, 1-block step-ups (jump), falls up to `maxFall`,
 * diagonal movement with corner protection, and per-terrain costs.
 *
 * Throws nothing: returns `{ path, cost }` or `null` (caller converts to
 * BOTPEX/NAV/NO_PATH). A partial best-effort path is returned when
 * `acceptPartial` is set and the budget is exhausted.
 */
export function findPath(
  acc: NavBlockAccessor,
  start: Vec3,
  goal: BlockPos,
  options: AStarOptions & { acceptPartial?: boolean } = {}
): { path: NavPath } | null {
  const maxNodes = options.maxNodes ?? 20_000;
  const allowDiagonal = options.allowDiagonal !== false;
  const maxFall = options.maxFall ?? 3;
  const allowLiquid = options.allowLiquid === true;

  const startBlock: BlockPos = {
    x: Math.floor(start.x),
    y: Math.floor(start.y),
    z: Math.floor(start.z)
  };
  const goalKey = blockKey(goal);

  if (!acc.isLoaded(startBlock) || !acc.isLoaded(goal)) return null;
  if (blockKey(startBlock) === goalKey) {
    return { path: { points: [{ ...start }], cost: 0, computedAt: Date.now() } };
  }
  // Goal must be standable: try goal, then above (goal marker on a block top).
  let goalStand: BlockPos | null = null;
  for (const dy of [0, 1, 2]) {
    const cand = { x: goal.x, y: goal.y + dy, z: goal.z };
    if (walkableAt(acc, cand, allowLiquid)) {
      goalStand = cand;
      break;
    }
  }
  if (goalStand === null) return null;

  const heuristic = (p: BlockPos): number => {
    const dx = Math.abs(p.x - goalStand!.x);
    const dz = Math.abs(p.z - goalStand!.z);
    const dy = Math.abs(p.y - goalStand!.y);
    const D = 1;
    const D2 = Math.SQRT2;
    const h = D * (dx + dz) + (D2 - 2 * D) * Math.min(dx, dz);
    return h + dy * 1.5;
  };

  const open = new MinHeap();
  const gScore = new Map<string, number>();
  const startNode: Node = { pos: startBlock, g: 0, f: heuristic(startBlock), parent: null };
  open.push(startNode);
  gScore.set(blockKey(startBlock), 0);

  let expanded = 0;
  let best: Node | null = startNode;
  let bestH = heuristic(startBlock);

  const neighborsOf = (node: Node): { pos: BlockPos; cost: number }[] => {
    const out: { pos: BlockPos; cost: number }[] = [];
    const { x, y, z } = node.pos;
    const cardinals: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dz] of cardinals) {
      const nx = x + dx;
      const nz = z + dz;
      // same level
      if (walkableAt(acc, { x: nx, y, z: nz }, allowLiquid)) {
        out.push({ pos: { x: nx, y, z: nz }, cost: 1 });
        continue;
      }
      // step up (jump)
      if (walkableAt(acc, { x: nx, y: y + 1, z: nz }, allowLiquid)) {
        const headroom = acc.getBlock({ x, y: y + 2, z });
        if (headroom !== null && headroom.flags.passable) {
          out.push({ pos: { x: nx, y: y + 1, z: nz }, cost: JUMP_COST });
        }
        continue;
      }
      // fall
      for (let d = 1; d <= maxFall; d++) {
        const fy = y - d;
        if (d === 1) {
          // falling one block needs the column above the target passable
          const above = acc.getBlock({ x: nx, y, z: nz });
          if (above !== null && !above.flags.passable) break;
        }
        if (walkableAt(acc, { x: nx, y: fy, z: nz }, allowLiquid)) {
          out.push({ pos: { x: nx, y: fy, z: nz }, cost: 1 + d * FALL_COST_PER_BLOCK });
          break;
        }
        const mid = acc.getBlock({ x: nx, y: fy, z: nz });
        if (mid !== null && !mid.flags.passable) break;
      }
    }
    if (allowDiagonal) {
      const diagonals: [number, number][] = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ];
      for (const [dx, dz] of diagonals) {
        const nx = x + dx;
        const nz = z + dz;
        if (!walkableAt(acc, { x: nx, y, z: nz }, allowLiquid)) continue;
        // corner protection: both adjacent cardinals must be walkable
        if (
          !walkableAt(acc, { x: x + dx, y, z }, allowLiquid) ||
          !walkableAt(acc, { x, y, z: z + dz }, allowLiquid)
        ) {
          continue;
        }
        out.push({ pos: { x: nx, y, z: nz }, cost: DIAGONAL_COST });
      }
    }
    return out;
  };

  while (open.size > 0) {
    const current = open.pop();
    if (current === null) break;
    const currentKey = blockKey(current.pos);
    if ((gScore.get(currentKey) ?? Infinity) < current.g) continue; // stale entry
    if (currentKey === goalKey) {
      return { path: reconstruct(current, start) };
    }
    expanded++;
    if (expanded > maxNodes) {
      if (options.acceptPartial && best !== null) {
        return { path: reconstruct(best, start) };
      }
      return null;
    }
    const h = heuristic(current.pos);
    if (h < bestH) {
      bestH = h;
      best = current;
    }
    for (const n of neighborsOf(current)) {
      const key = blockKey(n.pos);
      const tentative = current.g + n.cost;
      if (tentative < (gScore.get(key) ?? Infinity)) {
        gScore.set(key, tentative);
        open.push({ pos: n.pos, g: tentative, f: tentative + heuristic(n.pos), parent: current });
      }
    }
  }

  if (options.acceptPartial && best !== null && best.parent !== null) {
    return { path: reconstruct(best, start) };
  }
  return null;
}

function reconstruct(end: Node, _start: BlockPos): NavPath {
  const points: Vec3[] = [];
  let node: Node | null = end;
  let cost = end.g;
  while (node !== null) {
    // waypoint at the centre of the block, feet height
    points.push({ x: node.pos.x + 0.5, y: node.pos.y, z: node.pos.z + 0.5 });
    node = node.parent;
  }
  points.reverse();
  if (points.length === 0) points.push({ x: _start.x + 0.5, y: _start.y, z: _start.z + 0.5 });
  return { points, cost, computedAt: Date.now() };
}

/** Straight-line distance helper for navigation diagnostics. */
export function pathLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += distance(a, b);
  }
  return total;
}

export { AIR_BLOCK };
