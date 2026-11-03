// Renders a thumbnail of every mode (with the demo beat playing) into assets/thumbs/<mode>.webp.
// Run after adding or changing a mode: node tools/make-thumbs.cjs [mode ...]
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright'), { createServer } = require('../dev-server.cjs');
const out = path.join(__dirname, '../assets/thumbs');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/*', r => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  await page.goto('http://127.0.0.1:' + server.address().port + '/#debug');
  await page.evaluate(() => { localStorage.clear(); });
  await page.click('#srcDemo'); await page.waitForTimeout(1500);
  const modes = process.argv.slice(2).length ? process.argv.slice(2) : await page.locator('[data-mode]').evaluateAll(b => b.map(x => x.dataset.mode));
  for (const m of modes){
    await page.evaluate(mode => { document.querySelector('[data-mode="' + mode + '"]').click(); document.body.classList.add('ui-off'); window.dispatchEvent(new Event('resize')); }, m);
    await page.waitForTimeout(2600);   // past the crossfade, and long enough for the mode to fill in
    const data = await page.evaluate(() => { const src = document.getElementById('stage'), c = document.createElement('canvas'); c.width = 384; c.height = 216; c.getContext('2d').drawImage(src, 0, 0, 384, 216); return c.toDataURL('image/webp', 0.72); });
    fs.writeFileSync(path.join(out, m + '.webp'), Buffer.from(data.split(',')[1], 'base64'));
    process.stdout.write(m + ' ');
  }
  console.log('\nwrote', modes.length, 'thumbnails');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
