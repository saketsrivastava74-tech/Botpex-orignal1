import { createConsoleLogger } from '@botpex/kernel';
import { loadBotPackage } from '@botpex/package-spec';
import { createBot } from '@botpex/sdk';
import type { RuntimeId } from '@botpex/api';

/**
 * botpex run — validate a bot package and execute its entry in-process.
 * Convention (see documentation/PACKAGE_SPEC.md): the entry module default-exports
 * `async function main(ctx: { createBot })`.
 */
export async function runRun(projectDir: string, flags: Map<string, string | boolean>): Promise<number> {
  const loaded = loadBotPackage(projectDir);
  console.log(`Loading package "${loaded.manifest.name}" v${loaded.manifest.version}`);
  const runtimeFlag = flags.get('runtime');
  const runtime = (typeof runtimeFlag === 'string' ? runtimeFlag : loaded.manifest.runtimes[0]) as RuntimeId;
  if (!loaded.manifest.runtimes.includes(runtime)) {
    console.error(`Runtime "${runtime}" is not declared in botpex.json (declared: ${loaded.manifest.runtimes.join(', ')}).`);
    return 1;
  }
  console.log(`Runtime: ${runtime}`);

  const mod = (await import(loaded.entryUrl)) as {
    default?: (ctx: { createBot: typeof createBot; runtime: RuntimeId; flags: Map<string, string | boolean> }) => Promise<void> | void;
    main?: (ctx: { createBot: typeof createBot; runtime: RuntimeId; flags: Map<string, string | boolean> }) => Promise<void> | void;
  };
  const entry = mod.default ?? mod.main;
  if (typeof entry !== 'function') {
    console.error('Package entry must default-export `async function main(ctx)` (see documentation/PACKAGE_SPEC.md).');
    return 1;
  }
  await entry({ createBot, runtime, flags });
  void createConsoleLogger; // imported for side-effect-free parity with sdk logging
  return 0;
}
