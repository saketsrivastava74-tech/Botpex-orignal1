import { MockDriver, type MockDriverOptions } from './mock-driver.js';

export * from './blocks.js';
export * from './memory-world.js';
export * from './mock-driver.js';
export * from './harness.js';
export * from './contract.js';

/** DriverFactory-compatible constructor used by @botpex/sdk runtime resolution. */
export function createMockDriver(options?: MockDriverOptions): MockDriver {
  // SDK-facing factory: real-time physics clock on by default (drivers
  // self-animate; tests wanting determinism construct MockDriver directly
  // or call stopClock()).
  return new MockDriver({ autoClock: true, ...options });
}
