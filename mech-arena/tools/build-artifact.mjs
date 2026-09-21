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
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';

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

const importMap = /<script type="importmap">[\s\S]*?<\/script>/i.exec(html);
if (!importMap) throw new Error('index.html has no import map');

const title = (/<title>([^<]*)<\/title>/i.exec(html) || [, 'Iron Vanguard'])[1]
  // The gallery wants a name, not a name plus a category.
  .replace(/^.*—\s*/, '')
  .trim();

const page = `<title>${title}</title>

<style>
/* The host's skeleton pads :root for phone safe areas and sets a light
   ground. This is a full-viewport dark game, so it claims the whole frame
   and paints its own background. */
:root { padding: 0 !important; color-scheme: dark; }
html, body { height: 100%; margin: 0; background: #05070a; }

${css}
</style>

${importMap[0]}
${body.trim()}
`;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'index.html'), page);
await cp(join(ROOT, 'src'), join(OUT, 'src'), { recursive: true });
await cp(join(ROOT, 'vendor'), join(OUT, 'vendor'), { recursive: true });

console.log(`built dist-artifact/ — page ${(page.length / 1024).toFixed(0)}KB, title "${title}"`);
