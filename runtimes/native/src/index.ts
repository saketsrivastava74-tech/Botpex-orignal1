import { NativeDriver, type NativeOptions } from './driver.js';
import { nativeCapabilities } from './capabilities.js';
import type { DriverFactory } from '@botpex/api';

export { NativeDriver } from './driver.js';
export { nativeCapabilities } from './capabilities.js';
export * from './util.js';

/**
 * DriverFactory used by @botpex/sdk's `runtime: 'native'` resolution.
 */
export function createNativeDriver(options?: NativeOptions): NativeDriver {
  return new NativeDriver(options);
}

export const factoryMeta = {
  name: 'native',
  version: '0.1.0',
  capabilities: nativeCapabilities()
} as const;

export const createDriver: DriverFactory = () => createNativeDriver();
