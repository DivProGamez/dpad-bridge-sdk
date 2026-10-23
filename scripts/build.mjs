// Bundles src/ into dist/ with esbuild:
//   dist/dpad-bridge.js   IIFE exposing window.DPadBridge (works from file:// and <script src>)
//   dist/dpad-bridge.mjs  single-file ES module
// `node scripts/build.mjs --check` fails if the committed dist/ is out of date.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const banner = `/*! DPadBridge SDK v${pkg.version} | MIT License | https://github.com/DivProGamez/dpad-bridge-sdk */`;
const check = process.argv.includes('--check');

const outputs = [
  { file: 'dist/dpad-bridge.js', format: 'iife', globalName: 'DPadBridge' },
  { file: 'dist/dpad-bridge.mjs', format: 'esm' },
];

let stale = [];
for (const out of outputs) {
  const result = await build({
    entryPoints: [path.join(root, 'src/index.js')],
    bundle: true,
    write: false,
    format: out.format,
    globalName: out.globalName,
    target: ['es2019'],
    banner: { js: banner },
    legalComments: 'none',
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const target = path.join(root, out.file);
  if (check) {
    const existing = await readFile(target, 'utf8').catch(() => null);
    if (existing !== code) stale.push(out.file);
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, code);
    console.log(`built ${out.file} (${(code.length / 1024).toFixed(1)} KiB)`);
  }
}

if (check) {
  if (stale.length) {
    console.error(`dist is out of date: ${stale.join(', ')}. Run "npm run build" and commit.`);
    process.exit(1);
  }
  console.log('dist is up to date');
}
