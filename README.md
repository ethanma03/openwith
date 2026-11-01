# openwith.dev

The website for **[Glint](https://github.com/ethanma03/glint)**, **[Flick](https://github.com/ethanma03/flick)** and **[Leaf](https://github.com/ethanma03/leaf)**: three fast, quiet, open-source viewers for Windows.

The site is plain HTML, CSS and JavaScript with no build step. `index.html`, `styles.css` and `main.js` are the whole site, and everything else lives in `assets/`.

## What's on the page
- **Live demos that behave like the apps.** The Glint demo zooms in whole screen-pixel steps, shows a pixel grid from 600%, reads pixel colours, and compares two images in diff, side-by-side, onion-skin and swipe modes. Its metrics use the same formula as Glint's `analysis.rs`, so the numbers match the real app (96,023 differing pixels, PSNR 17.5 dB). The Flick demo marks clips, draws crop regions in video pixels and prints `flick state` and the ffmpeg command live. The Leaf demo searches across hyphenated line breaks, copies clean paragraphs and has night mode.
- **Real screenshots.** Every screenshot was captured by the app itself (`glint snap --ui`, `flick snap --ui`, `leaf snap`). The night-mode comparison uses `leaf render` and `leaf render --dark`.
- **App-style keyboard support.** `Ctrl+K` opens a command palette that looks like the apps' own `Ctrl+P` palette, and `F1` shows the shortcuts.

## Preview locally
```powershell
python -m http.server 8765    # then open http://127.0.0.1:8765
```

## Deploy
The site runs on Cloudflare as static assets. From this folder, run:
```powershell
npx wrangler deploy
```
`wrangler.jsonc` names the project, and `.assetsignore` keeps the repo files (README, git data, config) out of the upload. `_headers` sets caching and basic security headers.

## Downloads
The download buttons point at `https://github.com/ethanma03/<app>/releases/latest/download/<App>-win-x64.zip`, so a new GitHub release updates the site without any change here. Each app repo builds that zip with `pwsh scripts\package.ps1`.

## Credits
- Pixel art: Kenney, *Pixel Platformer* (CC0), restored to its native 1× size from Kenney's preview image.
- Video: *Big Buck Bunny* © Blender Foundation, CC BY 3.0.
- Article and photographs: Wikipedia, "Leaf", CC BY-SA 4.0.
