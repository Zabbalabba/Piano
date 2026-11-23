const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + __dirname + '/styles.html');
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.fonts.ready);
  const out = process.argv[2];
  for (const s of ['phase', 'glow', 'plate', 'paper', 'riso', 'thermal', 'gel']) {
    for (const k of ['scene', 'lineup']) {
      const data = await page.evaluate(([s, k]) => window.render(s, k), [s, k]);
      fs.writeFileSync(`${out}/${s}-${k}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
    }
  }
  console.log(errors.join('\n') || 'ok');
  await browser.close();
})();
