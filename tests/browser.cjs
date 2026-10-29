const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const { createServer } = require('./server.cjs');
const output = path.resolve(__dirname, '../test-results');
fs.mkdirSync(output, { recursive: true });
const results = [];
const engines = process.argv.slice(2);
const groups = (process.env.TEST_GROUPS || 'renders,controls,regressions').split(',');
if (!engines.length) engines.push('chromium');

function wav() {
  const rate = 8000, n = rate * 20, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF'); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * 2000), 44 + i * 2);
  return { name: 'Local Artist - Local Song.wav', mimeType: 'audio/wav', buffer: b };
}
async function check(name, fn) {
  try { const details = await fn(); results.push({ name, passed: true, details }); console.log('PASS', name); }
  catch (e) { results.push({ name, passed: false, error: e.stack }); console.error('FAIL', name, e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=${name.replace(/[:,\n]/g, ' ')}::${String(e.stack || e.message).split('\n').slice(0, 4).join(' | ').replace(/%/g, '%25')}`); }
}
async function contextFor(browser, url, options = {}) {
  const context = await browser.newContext(options);
  // No external requests or real account data: use deterministic lyrics and font fallbacks.
  await context.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(url)) return route.continue();
    if (u.startsWith('https://lrclib.net/')) return route.fulfill({ json: [{ trackName: 'Local Song', artistName: 'Local Artist', duration: 20, plainLyrics: 'Local fixture lyrics', syncedLyrics: '[00:00.00] Local fixture lyrics\n[00:10.00] Second fixture line' }] });
    return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '/#debug');
  await page.waitForFunction(() => window.__ag && window.__ag.frames > 2);
  return { context, page, errors };
}

async function renderModes(browser, url, engine, viewport, label) {
  const { context, page, errors } = await contextFor(browser, url, { viewport });
  try {
    const modes = await page.locator('[data-mode]').evaluateAll(buttons => buttons.map(b => b.dataset.mode));
    assert.equal(modes.length, 65);
    const samples = [];
    for (const mode of modes) {
      await page.locator('#btnAllModes').click();
      await page.locator(`[data-pick="${mode}"]`).click();
      assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
      const before = await page.evaluate(() => window.__ag.frames);
      await page.waitForFunction(n => window.__ag.frames >= n + 8, before);
      await page.waitForTimeout(750); // Let the 700 ms crossfade finish before inspecting this mode.
      assert.deepEqual(errors, [], `${mode}: browser errors`);
      const size = await page.evaluate(() => ({ window: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(size.document <= size.window + 1, `${mode}: horizontal overflow`);
      const pixels = await page.locator('#stage').evaluate(canvas => {
        const ctx = canvas.getContext('2d'); const colors = new Set();
        for (let y = 0; y < canvas.height; y += 17) for (let x = 0; x < canvas.width; x += 17) {
          const d = ctx.getImageData(x, y, 1, 1).data; colors.add(`${d[0]},${d[1]},${d[2]}`);
        }
        return colors.size;
      });
      assert.ok(pixels > 2, `${mode}: canvas appears blank`);
      samples.push({ mode, colors: pixels });
      await page.screenshot({ path: path.join(output, `${engine}-${label}-${mode}.png`) });
    }
    return { modes: modes.length, viewport, samples };
  } finally { await context.close(); }
}

async function controls(browser, url, engine) {
  const { context, page, errors } = await contextFor(browser, url, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  try {
    await page.locator('#btnAllModes').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'modeSearch');
    await page.locator('#modeSearch').fill('lyrics');
    assert.equal(await page.locator('[data-mode-row]:visible').count(), 6);
    await page.locator('#modeSearch').fill('orbit');
    await page.locator('[data-favorite="orbit"]').click();
    await page.locator('#modeSearch').fill('');
    await page.locator('#favoritesOnly').click();
    assert.equal(await page.locator('[data-mode-row]:visible').count(), 1);
    await page.screenshot({ path: path.join(output, `${engine}-favourites.png`) });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnAllModes');
    await page.reload(); await page.waitForFunction(() => window.__ag && window.__ag.frames > 2);
    await page.locator('#btnAllModes').click();
    assert.equal(await page.locator('[data-favorite="orbit"]').getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    await page.locator('#btnSettings').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnSetClose');
    await page.locator('#quality').selectOption('low');
    assert.equal(await page.locator('#stage').evaluate(c => c.width), 390);
    await page.locator('#quality').selectOption('high');
    assert.equal(await page.locator('#stage').evaluate(c => c.width), 780);
    await page.locator('[data-tog="reduceFlashes"]').click();
    await page.screenshot({ path: path.join(output, `${engine}-settings-mobile.png`) });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnSettings');
    await page.locator('#srcDemo').click();
    await page.locator('#btnHelp').focus(); await page.mouse.move(200, 300);
    await page.waitForTimeout(3700); // Exercise the actual 3.5-second idle timer.
    assert.equal(await page.evaluate(() => document.body.classList.contains('idle')), false);
    await page.locator('#btnHide').click();
    assert.equal(await page.locator('#btnSettings').isVisible(), false);
    await page.keyboard.press('h');
    assert.equal(await page.locator('#btnSettings').isVisible(), true);
    await page.locator('#btnStop').click();
    await page.locator('#fileInput').setInputFiles(wav());
    await page.waitForFunction(() => document.querySelector('#tTime').textContent.includes('0:20'));
    await page.locator('#btnPlay').click();
    await page.waitForFunction(() => document.querySelector('#btnPlay').getAttribute('aria-label') === 'Play');
    await page.locator('#seek').evaluate(el => { el.value = '500'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('#tTime').textContent.includes('0:10'));
    await page.locator('#btnPlay').click();
    await page.waitForFunction(() => document.querySelector('#btnPlay').getAttribute('aria-label') === 'Pause');
    await page.locator('#btnStop').click();
    assert.equal(await page.locator('#transport').isVisible(), false);
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport); await page.locator('#btnAllModes').click();
      const rect = await page.locator('#modePanel').boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width + 1, 'panel width');
      assert.ok(rect.y >= 0 && rect.y + rect.height <= viewport.height + 1, 'panel height');
      await page.screenshot({ path: path.join(output, `${engine}-panel-${viewport.width}x${viewport.height}.png`) });
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function regressions(browser, url) {
  const { context, page, errors } = await contextFor(browser, url);
  try {
    // Real Web Audio/MediaStream objects with deferred permission results; no real devices.
    const race = await page.evaluate(async () => {
      let resolve;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, writable: true, value: () => new Promise(r => resolve = r) });
      const pending = testApp.startMic(); testApp.startDemo();
      const ac = new AudioContext(), destination = ac.createMediaStreamDestination(), track = destination.stream.getTracks()[0];
      resolve(destination.stream); await pending;
      const result = { source: testApp.source(), staleTrack: track.readyState };
      testApp.toPreview(); await ac.close(); return result;
    });
    assert.deepEqual(race, { source: 'demo', staleTrack: 'ended' });
    const stopped = await page.evaluate(async () => {
      let resolve;
      navigator.mediaDevices.getUserMedia = () => new Promise(r => resolve = r);
      testApp.startDemo(); const pending = testApp.startMic(); testApp.toPreview();
      const ac = new AudioContext(), d = ac.createMediaStreamDestination(); resolve(d.stream); await pending;
      const result = { source: testApp.source(), staleTrack: d.stream.getTracks()[0].readyState }; await ac.close(); return result;
    });
    assert.deepEqual(stopped, { source: null, staleTrack: 'ended' });
    const camera = await page.evaluate(async () => {
      let resolve; navigator.mediaDevices.getUserMedia = () => new Promise(r => resolve = r);
      testApp.setMode('cam'); testApp.camStart(); testApp.setMode('orbit');
      const canvas = document.createElement('canvas'), stream = canvas.captureStream(), track = stream.getTracks()[0];
      resolve(stream); await new Promise(r => setTimeout(r, 0));
      return { stream: !!testApp.CAM.stream, state: track.readyState };
    });
    assert.deepEqual(camera, { stream: false, state: 'ended' });
    await page.locator('#fileInput').setInputFiles(wav());
    await page.evaluate(() => {
      testApp.setMode('karaoke');
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://music.apple.com', data: {
        afterglow: 'song', v: 6, title: 'Different Apple song', artist: 'Other artist', playing: true, pos: 90, dur: 180,
        ttmlOk: true, ttml: { lines: [{ t: 0, s: 'Wrong Apple lyrics' }, { t: 10, s: 'Still wrong' }] }
      } }));
    });
    await page.waitForFunction(() => testApp.lyricLine()?.cur?.s === 'Local fixture lyrics');
    assert.equal(await page.evaluate(() => testApp.songNow().title), 'Local Song');
    await page.evaluate(() => testApp.toPreview());
    assert.equal(await page.evaluate(() => testApp.songNow()), null);
    const clock = await page.evaluate(() => ({ sixty: testApp.sampleClock(1, 60), fast: testApp.sampleClock(60 / 144, 144) }));
    assert.ok(Math.abs(clock.sixty - clock.fast) < 1e-9);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Firefox and WebKit deliver the media-query change event a little later than Chromium: wait for it, then a couple of frames.
    await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const flash = await page.evaluate(() => {
      testApp.F.drop = 1; testApp.settings.fx.drops = true; testApp.settings.fx.vhs = false;
      const ctx = document.querySelector('#stage').getContext('2d'); let fills = 0;
      const original = ctx.fillRect; ctx.fillRect = function (...args) { fills++; return original.apply(this, args); };
      testApp.present(); ctx.fillRect = original; return fills;
    });
    assert.equal(flash, 0, 'reduced motion must suppress the full-screen drop flash');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

(async () => {
  const server = createServer(), instrumented = createServer({ instrument: true });
  await Promise.all([server, instrumented].map(s => new Promise(r => s.listen(0, '127.0.0.1', r))));
  const url = 'http://127.0.0.1:' + server.address().port;
  const testUrl = 'http://127.0.0.1:' + instrumented.address().port;
  try {
    for (const engine of engines) {
      let browser;
      try { browser = await playwright[engine].launch({ headless: true, timeout: 20000 }); }
      catch (e) { results.push({ name: engine + ' launch', passed: false, error: e.message }); console.error('FAIL', engine, e.message); continue; }
      try {
        if (groups.includes('renders')) await check(`${engine}: 65 desktop renders`, () => renderModes(browser, url, engine, { width: 1440, height: 900 }, 'desktop'));
        if (groups.includes('renders')) await check(`${engine}: 65 mobile renders`, () => renderModes(browser, url, engine, { width: 390, height: 844 }, 'mobile'));
        if (groups.includes('controls')) await check(`${engine}: controls, keyboard, persistence, playback and responsive panels`, () => controls(browser, url, engine));
        if (groups.includes('regressions')) await check(`${engine}: source ownership, lyrics, camera cleanup, timing and reduced motion`, () => regressions(browser, testUrl));
      } finally { await browser.close(); }
    }
  } finally { for (const s of [server, instrumented]) { s.closeAllConnections?.(); s.close(); } }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length }));
  process.exit(results.some(r => !r.passed) ? 1 : 0);   // exit even if a browser or socket is still hanging around
})().catch(e => { console.error(e); process.exit(1); });
