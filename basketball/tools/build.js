#!/usr/bin/env node
/* Concatenate src/js/*.js into the page template.
   dist/index.html            page body only (for hosts that add their own <html>/<head>)
   dist/hardwood-kings.html   complete standalone document: open it in any browser */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'src', 'js');
const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
const js = files.map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(jsDir, f), 'utf8').replace(/^'use strict';\n/, '')).join('\n');
const tpl = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const body = tpl.replace('/*__GAME__*/', () => "'use strict';\n" + js);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), body);
const title = (body.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
const headEnd = body.indexOf('</style>') + '</style>'.length;
const head = body.slice(0, headEnd), rest = body.slice(headEnd);
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${rest}\n</body>\n</html>\n`;
fs.writeFileSync(path.join(root, 'dist', 'hardwood-kings.html'), full);
console.log(`built ${files.length} modules, ${(body.length / 1024).toFixed(0)} KB -> dist/index.html, dist/hardwood-kings.html`, title ? '' : '(no title!)');
