import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const { VERSION } = await import('../dist/version.js');
if (pkg.version !== VERSION) throw new Error('package version and CLI version differ');
chmodSync(path.join(root, 'dist/cli.js'), 0o755);
for (const name of ['hl-converge-ready','hl-converge-integrate']) {
  const scripts = path.join(root, 'skills', name, 'scripts');
  const runtime = path.join(scripts, 'runtime');
  rmSync(runtime, { recursive: true, force: true }); mkdirSync(scripts, { recursive: true });
  cpSync(path.join(root, 'dist'), runtime, { recursive: true });
  writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ type: 'module', version: VERSION }));
  writeFileSync(path.join(scripts, 'hl-converge.mjs'), '#!/usr/bin/env node\nimport "./runtime/cli.js";\n', { mode: 0o755 });
}
