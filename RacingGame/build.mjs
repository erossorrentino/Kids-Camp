// Bundles src/ into a single self-contained dist/index.html (no server needed:
// double-click it to play). Usage: node build.mjs [--watch] [--entry src/x.js --out path.html]
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const entry = opt('--entry', 'src/main.js');
const out = opt('--out', 'dist/index.html');
const dev = args.includes('--dev');

async function build() {
  const t0 = Date.now();
  const res = await esbuild.build({
    entryPoints: [entry], bundle: true, minify: !dev, format: 'iife', write: false,
    target: ['es2020'], legalComments: 'none', sourcemap: dev ? 'inline' : false,
  });
  let js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = fs.readFileSync('src/index.html', 'utf8');
  const css = fs.readFileSync('src/styles.css', 'utf8');
  let page = html.replace('/*__STYLE__*/', () => css).replace('/*__SCRIPT__*/', () => js);
  if (args.includes('--artifact')) {
    // claude.ai Artifact pages are wrapped in their own document skeleton:
    // keep the title, fonts, style, body markup and script only.
    const head = page.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
    const body = page.match(/<body>([\s\S]*?)<\/body>/)[1];
    page = head.trim() + '\n' + body.trim() + '\n';
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page);
  console.log(`built ${out} (${(page.length / 1024).toFixed(0)} KB) in ${Date.now() - t0} ms`);
}

if (args.includes('--watch')) {
  fs.watch('src', { recursive: true }, () => build().catch((e) => console.error(e.message)));
}
await build();
