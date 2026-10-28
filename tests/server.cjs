const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function createServer({ instrument = false } = {}) {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    // Explicit allowlist: never expose node_modules, tests, or repository metadata.
    const files = { '/': 'index.html', '/index.html': 'index.html', '/assets/app.js': 'assets/app.js', '/assets/styles.css': 'assets/styles.css' };
    const file = files[pathname];
    if (!file) { res.writeHead(404); res.end(); return; }
    let content = fs.readFileSync(path.join(root, file), 'utf8');
    if (instrument && file === 'assets/app.js') {
      // Test-only closure access. This server is never used by GitHub Pages.
      content = content.replace(/\}\)\(\);\s*$/, `window.testApp = {
        settings, F, LYR, ATT, APL, LINK, CAM, DRAW, MODES,
        lyricLine, songNow, songPos, startMic, startDisplay, startDemo, toPreview,
        setMode, camStart, camStop, present, wakeOn,
        source: () => current && current.kind,
        sampleClock: (scale, count) => { vinylRot = 0; frameScale = scale; for (let i=0;i<count;i++) drawVinyl(); return vinylRot; }
      }; })();`);
    }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(content);
  });
}

module.exports = { createServer };
if (require.main === module) createServer().listen(4173, '127.0.0.1', () => console.log('Afterglow: http://127.0.0.1:4173'));
