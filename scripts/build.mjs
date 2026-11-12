#!/usr/bin/env node
/**
 * Botpex build orchestrator.
 * Builds workspaces in dependency order. Each workspace that has a "build"
 * script is invoked with `npm run build --if-present -w <workspace>`.
 */
import { spawnSync } from 'node:child_process';

const ORDER = [
  'api',
  'kernel',
  'testing',
  'compatibility',
  'adapters',
  'package-specification',
  'extensions',
  'runtimes/native',
  'runtimes/mineflayer',
  'sdk',
  'developer-tools',
  'examples/hello-bot',
  'examples/patrol-guard',
  'templates/basic-bot'
];

for (const ws of ORDER) {
  const res = spawnSync('npm', ['run', 'build', '--if-present', '-w', ws], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (res.status !== 0) {
    console.error(`\n[botpex] build FAILED in workspace: ${ws}`);
    process.exit(res.status ?? 1);
  }
}
console.log('\n[botpex] build complete.');
