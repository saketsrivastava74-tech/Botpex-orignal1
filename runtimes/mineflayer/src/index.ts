import { MineflayerDriver, mineflayerCapabilities, primeVec3 } from './driver.js';
import type { DriverFactory } from '@botpex/api';

export { MineflayerDriver, mineflayerCapabilities, primeVec3 } from './driver.js';

/**
 * DriverFactory used by @botpex/sdk's `runtime: 'mineflayer'` resolution.
 */
export function createMineflayerDriver(): MineflayerDriver {
  void primeVec3();
  return new MineflayerDriver();
}

export const factoryMeta = {
  name: 'mineflayer',
  version: '0.1.0',
  capabilities: mineflayerCapabilities()
} as const;

export const createDriver: DriverFactory = () => new MineflayerDriver();
