// Headless visual check: loads dist/index.html, runs a script of steps and
// saves screenshots. Usage: node tools/shot.cjs <outdir> [steps.json]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const out = process.argv[2] || 'shots';
  const steps = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : [{ wait: 4000 }, { shot: 'default' }];
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  const url = 'file://' + path.resolve(__dirname, '../dist/index.html') + (process.env.Q || '?manual');
  await page.goto(url);
  for (const s of steps) {
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.waitFor) await page.waitForFunction(s.waitFor, null, { timeout: s.timeout || 120000 });
    if (s.eval) {
      try {
        const r = await page.evaluate(s.eval);
        if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r));
      } catch (e) {
        logs.push('[evalerror] ' + e.message);
      }
    }
    if (s.key) await page.keyboard.press(s.key);
    if (s.down) await page.keyboard.down(s.down);
    if (s.up) await page.keyboard.up(s.up);
    if (s.click) await page.mouse.click(s.click[0], s.click[1]);
    if (s.shot) {
      try { await page.screenshot({ path: path.join(out, s.shot + '.png'), timeout: 60000 }); }
      catch (e) { logs.push('[shoterror] ' + s.shot + ' ' + e.message.split('\n')[0]); fs.writeFileSync(path.join(out, 'console.log'), logs.join('\n')); }
    }
    fs.writeFileSync(path.join(out, 'console.log'), logs.join('\n'));
  }
  fs.writeFileSync(path.join(out, 'console.log'), logs.join('\n'));
  console.log(logs.slice(-40).join('\n'));
  await browser.close();
})();
