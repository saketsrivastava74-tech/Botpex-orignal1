/**
 * CLI smoke tests: doctor, list-runtimes, init (+ package validation of the scaffold).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBotPackage } from '@botpex/package-spec';

const BIN = join(process.cwd(), 'developer-tools', 'dist', 'bin.js');

function run(args: string[]): string {
  return execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 60_000 });
}

describe('botpex CLI', () => {
  it('doctor prints environment and matrix', () => {
    const out = run(['doctor']);
    expect(out).toContain('Botpex doctor');
    expect(out).toContain('kernel API');
    expect(out).toContain('1.20.4');
    expect(out).toContain('26.1');
  });

  it('list-runtimes prints capability tables', () => {
    const out = run(['list-runtimes']);
    expect(out).toContain('native');
    expect(out).toContain('mineflayer');
    expect(out).toContain('movement.physics');
  });

  it('init scaffolds a valid bot package', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botpex-cli-'));
    const out = run(['init', join(dir, 'my-guard'), '--template', 'basic-bot']);
    expect(out).toContain('Scaffolded');
    const projectDir = join(dir, 'my-guard');
    expect(existsSync(join(projectDir, 'botpex.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'src', 'main.ts'))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(projectDir, 'botpex.json'), 'utf8'));
    expect(manifest.name).toBe('my-guard');
    // The scaffold must be a valid Botpex package
    const loaded = loadBotPackage(projectDir);
    expect(loaded.manifest.spec).toBe('botpex/v1');
  });

  it('init refuses to overwrite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botpex-cli-'));
    run(['init', join(dir, 'x')]);
    let failed = false;
    try {
      run(['init', join(dir, 'x')]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it('unknown commands exit non-zero', () => {
    let failed = false;
    try {
      run(['frobnicate']);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
