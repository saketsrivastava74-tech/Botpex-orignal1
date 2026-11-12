import type { Blackboard } from '@botpex/api';

/** Thread-unsafe (single-tick) key/value store shared by behaviours and brains. */
export class SimpleBlackboard implements Blackboard {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, fallback: T): T;
  get<T>(key: string, fallback?: T): T | undefined {
    if (!this.data.has(key)) return fallback;
    return this.data.get(key) as T;
  }

  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  remove(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}
