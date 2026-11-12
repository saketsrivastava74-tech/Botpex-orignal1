import type { EntitySnapshot, EntityKind, Vec3 } from '@botpex/api';

let seq = 100;

export function entitySnapshot(
  id: number,
  over: Partial<{
    kind: EntityKind;
    type: string;
    position: Vec3;
    health: number | null;
    username?: string;
    lastSeenMs?: number;
    yaw: number;
    pitch: number;
  }> & Record<string, unknown>
): EntitySnapshot {
  seq += 1;
  return {
    id,
    kind: (over.kind as EntityKind | undefined) ?? 'mob',
    type: (over.type as string | undefined) ?? 'zombie',
    position: (over.position as Vec3 | undefined) ?? { x: 0, y: 8, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: (over.yaw as number | undefined) ?? 0,
    pitch: (over.pitch as number | undefined) ?? 0,
    health: (over.health as number | null | undefined) ?? 20,
    username: over.username as string | undefined,
    lastSeenMs: (over.lastSeenMs as number | undefined) ?? seq
  };
}
