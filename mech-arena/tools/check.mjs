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
    console.error(`FAIL ${f}\n  ${e.message}`);
  }
}
if (failed) {
  console.error(`\n${failed} file(s) failed to parse.`);
  process.exit(1);
}
console.log(`syntax OK: ${files.length} modules`);
