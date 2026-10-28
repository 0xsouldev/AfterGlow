# Afterglow

A browser music visualizer with **75 modes**, 11 palettes, beat-reactive effects, and synced lyric displays.

**[Open Afterglow](https://0xsouldev.github.io/AfterGlow/)**

## Getting started

- **Demo beat:** try the visuals immediately with the built-in 124 BPM synth.
- **File:** choose or drop a supported audio file. Use the transport to pause, resume, or seek.
- **Mic:** allow microphone access to react to sound around you.
- **Tab or system:** choose a music tab or screen in the browser picker and enable audio sharing. Availability depends on your browser and operating system; desktop Chrome or Edge is the recommended starting point.

Live capture requires HTTPS or localhost. If a browser cannot capture audio, files and the demo are alternatives. Copy-protected Apple Music downloads cannot be played as ordinary audio files.

## Finding your visual

Open **All** or press **L**. Search by name, or search `lyrics` for the six lyric modes. Star modes to save favourites, then use the Favourites filter. Choices are saved in this browser.

Settings includes render quality (High, Balanced, Low), reduced flashes, beat tracking, Auto playlists, custom text, and lyric timing. Lower render quality reduces the canvas resolution on high-density displays. The system reduced-motion preference also disables the full-screen drop flash and several animations.

Shortcuts: **← / →** previous/next mode, **A** Auto, **T** tap tempo, **P** palette, **D / V / M / G** effects, **H** controls, **F** fullscreen, **Space** play/pause. **Escape** closes a panel and returns keyboard focus to its opener. The Mirror Cam mode has an **Enable camera** button; leaving the mode turns the camera off.

## Lyrics and Apple Music

For local files, filenames in `Artist - Title.ext` format improve lyric matching. Enable **Look up lyrics**, then choose a lyric mode.

For Apple Music, open Settings and drag **Afterglow link** to your bookmarks bar. Run it on the Apple Music tab, then select **Tab or system** in Afterglow and share that music tab with audio enabled. The link supplies song information and, when available, timing. This integration depends on Apple Music's web interface and may need updating when it changes. Linked Apple Music lyrics are only used with the tab/system source, never with a local file, microphone, or demo.

## Privacy

Audio and camera frames are processed locally and are not uploaded or recorded by Afterglow. Optional LRCLIB lyric lookups send the song title and artist to `lrclib.net`. The Apple Music bookmark communicates song/lyric information between your tabs and can request lyrics from Apple's own service. Fonts are loaded from Google Fonts; system fonts work if those requests fail. Preferences and favourites are stored locally in your browser.

## Local development

No build step is required. Serve the whole repository, including `assets/`:

```sh
python -m http.server 4173
# Open http://localhost:4173
```

Alternatively, with Node.js installed, run `npm start`.

- `index.html`: page structure and controls
- `assets/styles.css`: responsive layout and presentation
- `assets/app.js`: audio, analysis, lyrics, renderers, and interaction logic
- `tests/`: local server and browser regression checks

## Browser checks

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

Use `npm run test:chromium` for a Chromium-only run. Screenshots and machine-readable results are saved in `test-results/` (ignored by Git). GitHub Actions runs the checks in Chromium (the engine behind Edge, Brave and Chrome) and retains the results as downloadable artifacts.

The suite selects all 75 modes through the UI at desktop and mobile sizes, waits for transitions to settle, checks continuing animation and nonblank canvas output, and saves screenshots. It also covers search/favourites persistence, keyboard focus, responsive panels, local file playback/seeking, stale capture requests, lyric source isolation, camera cleanup, refresh-rate-independent vinyl motion, and reduced-motion flashes.

Capture regression checks use synthetic MediaStreams, and lyric requests use fixtures. Real Apple Music sessions, physical microphones/cameras, OS sharing pickers, and performance on physical phones require manual device checks.
