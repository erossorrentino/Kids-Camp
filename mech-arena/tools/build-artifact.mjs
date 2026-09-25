/**
 * Build the publishable Artifact page.
 *
 * The Artifact host wraps the published file in its own document skeleton,
 * so the page cannot ship its own <!doctype>/<html>/<head>/<body>. This
 * rewrites index.html into a body fragment: title, inlined stylesheet,
 * the import map, the markup and the module entry point. The ES modules
 * and the vendored Three.js stay as separate published files, which is
 * what `files` on the publish call is for.
 *
 *   node tools/build-artifact.mjs      ->  dist-artifact/
 */
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'dist-artifact');

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const css = await readFile(join(ROOT, 'styles.css'), 'utf8');

// Everything between <body> and </body> is the page content.
const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
if (!bodyMatch) throw new Error('index.html has no <body>');
let body = bodyMatch[1];

// The stylesheet ships inline: one less file, one less way to fail.
body = body.replace(/<link rel="stylesheet"[^>]*>\s*/i, '');

const importMap = /<script type="importmap">([\s\S]*?)<\/script>/i.exec(html);
if (!importMap) throw new Error('index.html has no import map');

const title = (/<title>([^<]*)<\/title>/i.exec(html) || [, 'Titan Clash'])[1]
  // The gallery wants a name, not a name plus a category.
  .replace(/^.*—\s*/, '')
  .trim();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(join(ROOT, 'src'), join(OUT, 'src'), { recursive: true });
await cp(join(ROOT, 'vendor'), join(OUT, 'vendor'), { recursive: true });

// The build number on the title screen: the commit count, so it only goes up.
let build = 'dev';
try {
  build = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch { /* not a checkout: leave it 'dev' */ }
await writeFile(join(OUT, 'src', 'build.js'),
  `/** Stamped by tools/build-artifact.mjs. */\nexport const BUILD = ${JSON.stringify(build)};\n`);

/* Every module is published at the same path in every version, so a
 * browser holding an old copy can go on running it after an update --
 * the fix is live and the player never sees it. The import map sends each
 * module to its own path plus a hash of its contents: a changed file is a
 * new URL, an unchanged one stays cached. Import maps match relative
 * imports by their resolved URL, so './game/player.js' inside main.js is
 * caught by the './src/game/player.js' entry. */
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const modules = await walk(join(OUT, 'src'));
const map = JSON.parse(importMap[1]);
const versioned = {};
for (const file of modules.sort()) {
  const hash = createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 10);
  const path = './' + relative(OUT, file).split('\\').join('/');
  versioned[path] = `${path}?v=${hash}`;
}
map.imports = { ...map.imports, ...versioned };
body = body.replace(/(<script type="module" src=")(\.\/src\/main\.js)(")/,
  (_, a, src, b) => a + versioned[src] + b);
if (!/src="\.\/src\/main\.js\?v=/.test(body)) throw new Error('entry script not versioned');

const page = `<title>${title}</title>

<style>
/* The host's skeleton pads :root for phone safe areas and sets a light
   ground. This is a full-viewport dark game, so it claims the whole frame
   and paints its own background. */
:root { padding: 0 !important; color-scheme: dark; }
html, body { height: 100%; margin: 0; background: #05070a; }

${css}
</style>

<script type="importmap">
${JSON.stringify(map, null, 2)}
</script>
${body.trim()}
`;

await writeFile(join(OUT, 'index.html'), page);

console.log(`built dist-artifact/ — build ${build}, ${modules.length} modules, page ${(page.length / 1024).toFixed(0)}KB, title "${title}"`);
