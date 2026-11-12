import { mineflayerCapabilities } from '@botpex/runtime-mineflayer';
import { nativeCapabilities } from '@botpex/runtime-native';

export function runListRuntimes(): number {
  console.log('Builtin Botpex runtimes\n');

  console.log('mock (@botpex/testing) — deterministic in-memory driver for tests and demos');
  console.log('  all core capabilities supported; physics simulated\n');

  console.log('native (@botpex/runtime-native) — protocol-speaking client');
  console.log('  capabilities:');
  for (const [key, info] of Object.entries(nativeCapabilities())) {
    console.log(`    ${info?.supported ? '✓' : '✗'} ${key}${info?.notes ? ` — ${info.notes}` : ''}`);
  }
  console.log('');

  console.log('mineflayer (@botpex/runtime-mineflayer) — external engine adapter');
  console.log('  capabilities:');
  for (const [key, info] of Object.entries(mineflayerCapabilities())) {
    console.log(`    ${info?.supported ? '✓' : '✗'} ${key}${info?.notes ? ` — ${info.notes}` : ''}`);
  }
  return 0;
}
