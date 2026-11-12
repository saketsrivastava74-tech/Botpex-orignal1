import { type CapabilityMap, type CapabilityKey, type FeatureKey, Errors } from '@botpex/api';

/**
 * Stores a driver's declared capabilities and gates every kernel feature.
 * `require()` throws BOTPEX/CAPABILITY/UNSUPPORTED with the driver's own
 * accuracy note plus remediation hint — never a silent fallback.
 */
export class CapabilityRegistry {
  constructor(
    private readonly map: CapabilityMap,
    private readonly driverName: string
  ) {}

  get declared(): CapabilityMap {
    return this.map;
  }

  get driver(): string {
    return this.driverName;
  }

  has(key: CapabilityKey): boolean {
    return this.map[key]?.supported === true;
  }

  notes(key: CapabilityKey): string | undefined {
    return this.map[key]?.notes;
  }

  require(key: CapabilityKey): void {
    if (!this.has(key)) {
      throw Errors.capabilityUnsupported(key, this.driverName, this.map[key]?.notes);
    }
  }

  requireAll(keys: readonly CapabilityKey[]): void {
    for (const key of keys) this.require(key);
  }

  /** Report of missing capabilities per requested feature (for fail-fast startup). */
  missingForFeatures(features: readonly FeatureKey[]): { feature: FeatureKey; missing: CapabilityKey[] }[] {
    const report: { feature: FeatureKey; missing: CapabilityKey[] }[] = [];
    for (const feature of features) {
      const miss = (FEATURE_KEYS[feature] ?? []).filter((k) => !this.has(k));
      if (miss.length > 0) report.push({ feature, missing: miss });
    }
    return report;
  }
}

// Local alias to the canonical feature table in @botpex/api.
import { FEATURE_REQUIREMENTS } from '@botpex/api';
const FEATURE_KEYS: Record<FeatureKey, readonly CapabilityKey[]> = FEATURE_REQUIREMENTS;
