/**
 * Parse-check every source module.
 *
 * `node --check` only validates the module record for ESM files and lets
 * real expression-level syntax errors through, so this compiles each file
 * with vm.SourceTextModule, which performs a full parse.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import vm from 'node:vm';

const files = execSync("find src tools -name '*.js' -o -name '*.mjs'", { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).sort();

let failed = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  try {
    new vm.SourceTextModule(src, { identifier: f });
  } catch (e) {
    failed++;
    // V8 does not put the offending line in the message, so recover it from
    // the stack frame it attaches to the SyntaxError.
    const at = /:(\d+):(\d+)/.exec((e.stack || '').split('\n').find(l => l.includes(f)) || '');
    const where = at ? ` (line ${at[1]}:${at[2]})` : '';
    const line = at ? '\n  > ' + src.split('\n')[+at[1] - 1]?.trim() : '';
    console.error(`FAIL ${f}${where}\n  ${e.message}${line}`);
  }
}
if (failed) {
  console.error(`\n${failed} file(s) failed to parse.`);
  process.exit(1);
}
console.log(`syntax OK: ${files.length} modules`);
