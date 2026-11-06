// Bundles the game into a single self-contained HTML file.
//   node build.mjs          -> dist/index.html (minified)
//   node build.mjs --dev    -> unminified, with sourcemap-free readable output
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const dev = process.argv.includes('--dev');
const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: !dev,
  format: 'iife',
  write: false,
  target: 'es2020',
  legalComments: 'none',
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync('src/index.html', 'utf8');
const css = fs.readFileSync('src/ui/style.css', 'utf8');
const full = tpl.replace('/*__STYLE__*/', () => css).replace('/*__BUNDLE__*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', full);

// Artifact variant: the host supplies doctype/html/head/body and the
// charset/viewport metas, so strip ours.
const frag = full
  .replace(/<!doctype html>/i, '')
  .replace(/<html[^>]*>/i, '')
  .replace(/<\/html>/i, '')
  .replace(/<head>/i, '')
  .replace(/<\/head>/i, '')
  .replace(/<body[^>]*>/i, '')
  .replace(/<\/body>/i, '')
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
const outArt = process.env.ARTIFACT_OUT;
if (outArt) {
  fs.mkdirSync(path.dirname(outArt), { recursive: true });
  fs.writeFileSync(outArt, frag.trim() + '\n');
}
console.log(`built dist/index.html (${(full.length / 1024).toFixed(0)} KB)`);
