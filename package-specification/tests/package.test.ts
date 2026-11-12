import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateBotPackage, loadBotPackage, SAMPLE_MANIFEST } from '../src/index.js';

describe('validateBotPackage', () => {
  it('accepts the sample manifest', () => {
    expect(validateBotPackage(SAMPLE_MANIFEST).ok).toBe(true);
  });

  it('collects problems for garbage input', () => {
    const res = validateBotPackage({ spec: 'wrong', name: 'Not Kebab!' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe('loadBotPackage', () => {
  it('loads a valid package dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botpex-pkg-'));
    writeFileSync(join(dir, 'botpex.json'), JSON.stringify(SAMPLE_MANIFEST));
    mkdirSync(join(dir, 'dist'));
    const loaded = loadBotPackage(dir);
    expect(loaded.manifest.name).toBe('example-bot');
    expect(loaded.entryUrl.endsWith('dist/main.js')).toBe(true);
  });

  it('rejects missing manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botpex-pkg-'));
    expect(() => loadBotPackage(dir)).toThrowError(/botpex.json/);
  });

  it('rejects API mismatch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botpex-pkg-'));
    writeFileSync(
      join(dir, 'botpex.json'),
      JSON.stringify({ ...SAMPLE_MANIFEST, kernel: { api: '^9.9.9' } })
    );
    expect(() => loadBotPackage(dir)).toThrowError(/API/);
  });
});
