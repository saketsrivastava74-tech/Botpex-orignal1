import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { basename, join, resolve } from 'node:path';

const TEMPLATE_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../templates');

export function runInit(target: string, template: string): number {
  const outDir = resolve(process.cwd(), target);
  const srcDir = resolve(TEMPLATE_DIR, template);
  if (!existsSync(srcDir)) {
    console.error(`Template "${template}" not found (looked at ${srcDir}).`);
    console.error('Available templates: basic-bot');
    return 1;
  }
  if (existsSync(join(outDir, 'botpex.json'))) {
    console.error(`Refusing to overwrite: ${outDir} already contains botpex.json.`);
    return 1;
  }
  mkdirSync(outDir, { recursive: true });
  cpSync(srcDir, outDir, { recursive: true });

  // Rename template package name based on target dir
  const pkgPath = join(outDir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    pkg.name = dirToName(target);
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  const manifestPath = join(outDir, 'botpex.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.name = dirToName(target);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`Scaffolded a new Botpex bot in ${outDir} (template: ${template}).`);
  console.log('');
  console.log('Next steps:');
  console.log(`  cd ${target}`);
  console.log('  npm install');
  console.log('  npm run dev        # runs against the in-memory mock runtime');
  console.log('  # then point --runtime native at a real server');
  return 0;
}

function dirToName(dir: string): string {
  const base = basename(resolve(dir));
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-bot';
}
