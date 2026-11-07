// Bundles src/ into a single self-contained HTML file (dist/driftlands.html)
// so the game runs by double-clicking it - no server, no CDN.
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/style.css', 'utf8');
const html = fs.readFileSync('src/index.html', 'utf8')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/driftlands.html', html);
console.log(`dist/driftlands.html  ${(html.length / 1024).toFixed(0)} KB`);
