/**
 * Version-sensitive helpers for the native runtime.
 * Every constant here is isolated so protocol drops are a one-file change.
 */

/**
 * Fixed-point factor for entity relative-move packets.
 * Both classic (1.8–1.13: Δ×32×128) and modern (1.14+: Δ×4096) encodings
 * resolve to a ÷4096 scale; isolated here for future changes.
 */
export function relativeMoveFactor(_version: string): number {
  return 4096;
}

/** Velocity packet scale (÷8000 on all supported versions). */
export const VELOCITY_FACTOR = 8000;

/** Server sends position corrections per minute before we warn (tunable). */
export const CORRECTIONS_WARN_PER_MIN = 12;

type JsonChat = unknown;

/**
 * Flatten a Minecraft JSON text component to plain text (recursive:
 * {text, extra[], translate, with[]}, arrays, nested).
 */
export function flattenChat(node: JsonChat): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.map(flattenChat).join('');
  if (typeof node === 'object') {
    const obj = node as Record<string, JsonChat>;
    let out = '';
    if (typeof obj.text === 'string') out += obj.text;
    if (obj.translate !== undefined && typeof obj.translate === 'string') {
      const withParts = Array.isArray(obj.with) ? obj.with.map(flattenChat) : [];
      out += interpolate(obj.translate, withParts);
    }
    if (Array.isArray(obj.extra)) out += obj.extra.map(flattenChat).join('');
    return out;
  }
  return '';
}

/** Minimal translation interpolation: %s placeholders and %1$s indices. */
function interpolate(translate: string, args: string[]): string {
  let index = 0;
  return translate.replace(/%(\d+)?\$?s/g, (_m, num) => {
    if (num !== undefined) {
      const i = Number.parseInt(num, 10) - 1;
      return args[i] ?? '';
    }
    const value = args[index] ?? '';
    index += 1;
    return value;
  });
}

/**
 * Kinematic speeds (m/s) — vanilla walking values.
 */
export const SPEEDS = {
  walk: 4.317,
  sprint: 5.612,
  sneak: 1.31
} as const;

export const GRAVITY = 32; // m/s²
export const JUMP_VELOCITY = 8.4; // ≈ vanilla 1.25-block jump

/** Convert Minecraft yaw degrees to a unit direction vector (x, z). */
export function yawToDirection(yawDeg: number): { x: number; z: number } {
  const rad = (yawDeg * Math.PI) / 180;
  return { x: -Math.sin(rad), z: Math.cos(rad) };
}

/** Normalize a version string like "1.21.4" for comparisons. */
export function normalizeVersion(v: string): string {
  return v.trim();
}

/** True for 1.17+ packet field shapes ('use_entity' type enum etc.). */
export function isModernPacketShape(version: string): boolean {
  const parts = normalizeVersion(version).split('.').map((p) => Number.parseInt(p, 10));
  const major = parts[0] ?? 1;
  const minor = parts[1] ?? 0;
  if (Number.isNaN(major) || Number.isNaN(minor)) return true;
  if (major >= 26) return true;
  return major > 1 || (major === 1 && minor >= 17);
}

/** 1.13 flattened item ids (protocol ≥ 401). */
export function hasFlattenedItemIds(version: string): boolean {
  const parts = normalizeVersion(version).split('.').map((p) => Number.parseInt(p, 10));
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  if (Number.isNaN(minor)) return true;
  return minor > 13 || (minor === 13 && patch >= 2);
}
