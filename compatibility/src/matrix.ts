import matrix from '../data/versions.json' with { type: 'json' };

export interface VersionEntry {
  mc: string;
  /** Protocol version number, or null when resolved at runtime via minecraft-data. */
  protocol: number | null;
  native: 'supported' | 'best-effort' | 'untested';
  mineflayer: 'supported' | 'best-effort' | 'untested';
  notes?: string;
}

export const VERSION_MATRIX: VersionEntry[] = matrix as VersionEntry[];

export type RuntimeId = 'native' | 'mineflayer';

/**
 * Feature thresholds. Values reflect researched facts (see
 * documentation/research/RESEARCH.md): calendar-year versioning started
 * with the 26.x series; signed chat arrived in 1.19.1; the dedicated
 * configuration phase in 1.20.2; attack cooldown in 1.9.
 */
export const FEATURE_FLAGS = {
  attackCooldown: { since: '1.9', description: '1.9+ weapon cooldown mechanics' },
  chatSigning: { since: '1.19.1', description: 'signed chat (Botpex sends unsigned only)' },
  configurationPhase: { since: '1.20.2', description: 'login/configuration/gameplay state machine' },
  calendarVersioning: { since: '26.0', description: 'Mojang calendar-year version numbers' }
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

function parts(version: string): number[] {
  return version.split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

/**
 * Compare two Minecraft versions. Numeric per-component comparison handles
 * both classic (1.21.4) and calendar (26.1) schemes: 26.1 > 1.21.11.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function isVersionAtLeast(version: string, since: string): boolean {
  return compareVersions(version, since) >= 0;
}

export function featureEnabled(flag: FeatureFlag, mcVersion: string): boolean {
  return isVersionAtLeast(mcVersion, FEATURE_FLAGS[flag].since);
}

export function findEntry(mcVersion: string): VersionEntry | null {
  const normalized = mcVersion.trim();
  return VERSION_MATRIX.find((e) => e.mc === normalized) ?? null;
}

export type SupportLevel = VersionEntry['native'] | 'unknown';

export function supportLevel(mcVersion: string, runtime: RuntimeId): SupportLevel {
  const entry = findEntry(mcVersion);
  if (entry === null) return 'unknown';
  return entry[runtime];
}

export function isSupported(mcVersion: string, runtime: RuntimeId): boolean {
  return supportLevel(mcVersion, runtime) === 'supported';
}

export function protocolOf(mcVersion: string): number | null {
  return findEntry(mcVersion)?.protocol ?? null;
}

/** Human-readable matrix (used by `botpex doctor`). */
export function summary(): string {
  const rows = VERSION_MATRIX.map(
    (e) =>
      `${e.mc.padEnd(9)} protocol=${String(e.protocol ?? '?').padEnd(5)} native=${e.native.padEnd(11)} mineflayer=${e.mineflayer}${e.notes ? `  // ${e.notes}` : ''}`
  );
  return ['Minecraft version support matrix (Botpex 0.1):', ...rows].join('\n');
}
