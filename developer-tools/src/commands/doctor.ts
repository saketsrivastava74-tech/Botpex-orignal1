import { KERNEL_API_VERSION } from '@botpex/api';
import { summary } from '@botpex/compatibility';

export function runDoctor(): number {
  const lines: string[] = [];
  lines.push('Botpex doctor');
  lines.push('─────────────');
  lines.push(`node       : ${process.version} (${process.platform}-${process.arch})`);
  lines.push(`kernel API : ${KERNEL_API_VERSION}`);

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  lines.push(
    `node req   : ${nodeMajor >= 20 ? 'OK (>= 20)' : `TOO OLD — Botpex requires Node >= 20 (found ${process.versions.node})`}`
  );

  lines.push('');
  lines.push(summary());

  lines.push('');
  lines.push('Builtin runtimes:');
  lines.push('  mock       — always available (in-memory, deterministic)');
  lines.push('  native     — @botpex/runtime-native (protocol client; kinematic movement in 0.1)');
  lines.push('  mineflayer — @botpex/runtime-mineflayer (external engine; full physics)');
  lines.push('');
  lines.push('Check installed runtime packages:');
  for (const pkg of ['@botpex/runtime-native', '@botpex/runtime-mineflayer']) {
    lines.push(`  ${pkg.padEnd(26)} ${isInstalled(pkg) ? 'installed' : 'not installed (optional)'}`);
  }
  console.log(lines.join('\n'));
  return 0;
}

function isInstalled(pkg: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    import.meta.resolve?.(pkg);
    return true;
  } catch {
    return false;
  }
}
