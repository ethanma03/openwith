// openwith.dev — the live demos and small enhancements. The page reads fine without this file.
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  const copyText = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };

  // The demo that receives keyboard shortcuts: the one under the pointer, or the last one clicked.
  let activeDemo = null;
  const demoKeys = new Map();
  $$(".demo").forEach((d) => {
    d.addEventListener("pointerenter", () => (activeDemo = d));
    d.addEventListener("focusin", () => (activeDemo = d));
    d.addEventListener("pointerdown", () => (activeDemo = d));
  });

  /* ─────────────── Nav ─────────────── */
  const nav = $(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ─────────────── Hero: tabbed window cycling through the apps ─────────────── */
  {
    const rot = $("[data-rotator]");
    const tabs = $$(".tab", rot), imgs = $$(".viewport img", rot), bar = $(".tab-progress", rot);
    const DUR = 6000;
    let i = 0, timer = null, paused = false;
    const show = (n) => {
      i = (n + imgs.length) % imgs.length;
      tabs.forEach((t, k) => { t.classList.toggle("is-active", k === i); t.setAttribute("aria-selected", k === i); });
      imgs.forEach((im, k) => im.classList.toggle("is-active", k === i));
      bar.style.setProperty("--dur", DUR + "ms");
      bar.classList.remove("run"); void bar.offsetWidth;
      if (!reduce && !paused) bar.classList.add("run");
    };
    const schedule = () => { clearTimeout(timer); if (!reduce && !paused) timer = setTimeout(() => { show(i + 1); schedule(); }, DUR); };
    tabs.forEach((t, k) => t.addEventListener("click", () => { paused = true; clearTimeout(timer); show(k); }));
    new IntersectionObserver(([e]) => {
      if (paused) return;
      if (e.isIntersecting) { show(i); schedule(); } else { clearTimeout(timer); bar.classList.remove("run"); }
    }, { threshold: 0.3 }).observe(rot);
  }

  /* ─────────────── Glint demo ─────────────── */
  {
    const root = $("[data-glint]");
    const canvas = $("canvas", root), ctx = canvas.getContext("2d");
    const stage = $(".g-stage", root);
    const zoomEl = $("[data-g-zoom]", root), pxEl = $("[data-g-px]", root), infoEl = $("[data-g-info]", root), titleEl = $("[data-g-title]", root);
    const metricsEl = $("[data-g-metrics]", root), splitWrap = $("[data-g-split]", root), split = $("input", splitWrap);
    const modes = ["view", "diff", "side", "onion", "swipe"];
    const S = { mode: "view", k: 1, cx: 0, cy: 0, grid: true, split: 0.5, hover: null, fitted: true };
    let A, B, D, W = 0, H = 0, dpr = 1, imgW = 0, imgH = 0, metrics = null;

    const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const pixels = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height); };

    // Same maths as Glint's analysis.rs: differing pixels, max channel delta, RMSE and PSNR over RGBA.
    const analyse = (a, b) => {
      const out = new ImageData(a.width, a.height);
      let n = 0, maxd = 0, sq = 0;
      for (let p = 0; p < a.data.length; p += 4) {
        let d = 0;
        for (let c = 0; c < 4; c++) { const v = Math.abs(a.data[p + c] - b.data[p + c]); if (v > d) d = v; sq += v * v; }
        if (d > maxd) maxd = d;
        if (d === 0) {
          const l = (0.299 * a.data[p] + 0.587 * a.data[p + 1] + 0.114 * a.data[p + 2]) * (a.data[p + 3] / 255);
          const g = l * 0.3 + 18;
          out.data[p] = out.data[p + 1] = out.data[p + 2] = g;
        } else {
          n++;
          const t = 0.45 + 0.55 * (d / 255);
          out.data[p] = 255 * t; out.data[p + 1] = 40 * t; out.data[p + 2] = 110 * t;
        }
        out.data[p + 3] = 255;
      }
      const total = a.width * a.height, mse = sq / (total * 4);
      return { out, n, total, maxd, rmse: Math.sqrt(mse), psnr: mse > 0 ? 10 * Math.log10((255 * 255) / mse) : null };
    };

    const contentW = () => (S.mode === "side" ? imgW * 2 + Math.ceil(16 / Math.max(1, S.k)) : imgW);
    const fitK = () => {
      const pad = 40 * dpr;
      const k = Math.floor(Math.min((W - pad) / contentW(), (H - pad - 50 * dpr) / imgH));
      return Math.max(1, k);
    };
    const fit = () => { S.k = fitK(); S.cx = contentW() / 2; S.cy = imgH / 2; S.fitted = true; draw(); };
    const setK = (k, ax, ay) => {
      k = clamp(Math.round(k), 1, 40);
      if (ax == null) { ax = W / 2; ay = H / 2; }
      // keep the image point under (ax, ay) fixed
      const ix = S.cx + (ax - W / 2) / S.k, iy = S.cy + (ay - H / 2) / S.k;
      S.k = k;
      S.cx = ix - (ax - W / 2) / k; S.cy = iy - (ay - H / 2) / k;
      S.fitted = false;
      draw();
    };

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      W = Math.round(stage.clientWidth * dpr); H = Math.round(stage.clientHeight * dpr);
      canvas.width = W; canvas.height = H;
      if (imgW) { if (S.fitted) fit(); else draw(); }
    };

    function draw() {
      if (!A) return;
      const k = S.k;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#131315"; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      const ox = Math.round(W / 2 - S.cx * k), oy = Math.round(H / 2 - S.cy * k);
      const w = imgW * k, h = imgH * k;
      const gap = Math.ceil(16 / k) * k;
      const blit = (img, x) => ctx.drawImage(img, x, oy, w, h);
      if (S.mode === "view") blit(A, ox);
      else if (S.mode === "diff") blit(D, ox);
      else if (S.mode === "onion") { blit(A, ox); ctx.globalAlpha = S.split; blit(B, ox); ctx.globalAlpha = 1; }
      else if (S.mode === "swipe") {
        blit(A, ox);
        const sx = ox + Math.round(S.split * w);
        ctx.save(); ctx.beginPath(); ctx.rect(sx, oy, w - (sx - ox), h); ctx.clip(); blit(B, ox); ctx.restore();
        ctx.fillStyle = "#f5b84a"; ctx.fillRect(sx - dpr, oy, 2 * dpr, h);
      } else if (S.mode === "side") { blit(A, ox); blit(B, ox + w + gap); }

      // Pixel grid from 600%, like Glint.
      if (S.grid && k >= 6) {
        const spans = S.mode === "side" ? [ox, ox + w + gap] : [ox];
        ctx.strokeStyle = "rgba(10,10,12,0.32)"; ctx.lineWidth = 1;
        ctx.beginPath();
        for (const sx0 of spans) {
          const x0 = Math.max(0, Math.floor((0 - sx0) / k)), x1 = Math.min(imgW, Math.ceil((W - sx0) / k));
          const y0 = Math.max(0, Math.floor((0 - oy) / k)), y1 = Math.min(imgH, Math.ceil((H - oy) / k));
          for (let x = x0; x <= x1; x++) { const X = sx0 + x * k + 0.5; ctx.moveTo(X, oy + y0 * k); ctx.lineTo(X, oy + y1 * k); }
          for (let y = y0; y <= y1; y++) { const Y = oy + y * k + 0.5; ctx.moveTo(sx0 + x0 * k, Y); ctx.lineTo(sx0 + x1 * k, Y); }
        }
        ctx.stroke();
      }
      // Hovered pixel outline.
      if (S.hover && k >= 4) {
        const hx = S.hover.side ? ox + w + gap : ox;
        ctx.strokeStyle = "#f5b84a"; ctx.lineWidth = Math.max(1, Math.round(1.5 * dpr));
        ctx.strokeRect(hx + S.hover.x * k + 0.5, oy + S.hover.y * k + 0.5, k - 1, k - 1);
      }
      zoomEl.textContent = k * 100 + "%";
    }

    const toImage = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      const X = (clientX - r.left) * dpr, Y = (clientY - r.top) * dpr;
      const k = S.k, ox = Math.round(W / 2 - S.cx * k), oy = Math.round(H / 2 - S.cy * k), w = imgW * k, gap = Math.ceil(16 / k) * k;
      let side = false, lx = X - ox;
      if (S.mode === "side" && lx >= w + gap) { side = true; lx -= w + gap; }
      const x = Math.floor(lx / k), y = Math.floor((Y - oy) / k);
      return { X, Y, x, y, side, inside: x >= 0 && y >= 0 && x < imgW && y < imgH && !(S.mode === "side" && lx >= w && !side) };
    };
    const showPixel = (p) => {
      if (!p || !p.inside) { S.hover = null; pxEl.innerHTML = '<i class="swatch"></i><span>Point at a pixel</span>'; return; }
      S.hover = p;
      const src = S.mode === "diff" ? D_px : (p.side || (S.mode === "swipe" && p.x >= S.split * imgW) ? B_px : A_px);
      const i = (p.y * imgW + p.x) * 4, d = src.data;
      const hex = "#" + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
      pxEl.innerHTML = `<i class="swatch" style="background:${hex}"></i><span>${p.x}, ${p.y}</span><b>${hex}</b>`;
    };
    let A_px, B_px, D_px;

    // Interaction
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: S.cx, cy: S.cy }; canvas.setPointerCapture(e.pointerId); canvas.classList.add("dragging"); });
    canvas.addEventListener("pointermove", (e) => {
      if (drag) {
        S.cx = drag.cx - ((e.clientX - drag.x) * dpr) / S.k; S.cy = drag.cy - ((e.clientY - drag.y) * dpr) / S.k; S.fitted = false;
      }
      showPixel(toImage(e.clientX, e.clientY)); draw();
    });
    const endDrag = () => { drag = null; canvas.classList.remove("dragging"); };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", () => { if (!drag) { showPixel(null); draw(); } });
    canvas.addEventListener("dblclick", fit);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = toImage(e.clientX, e.clientY);
      setK(S.k + (e.deltaY < 0 ? 1 : -1), p.X, p.Y);
      showPixel(toImage(e.clientX, e.clientY)); draw();
    }, { passive: false });

    const setMode = (m) => {
      S.mode = m;
      $$("[data-mode]", root).forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle("is-active", on); b.setAttribute("aria-checked", on); });
      splitWrap.hidden = !(m === "onion" || m === "swipe");
      metricsEl.hidden = m === "view";
      titleEl.textContent = m === "view" ? "meadow.png" : "meadow.png ⟷ meadow-swap.png";
      infoEl.textContent = m === "view" ? "meadow.png · 459 × 220 · PNG" : "Comparing A and B";
      fit();
    };
    $$("[data-mode]", root).forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    split.addEventListener("input", () => { S.split = split.value / 100; draw(); });
    const grid = $('[data-g-act="grid"]', root);
    const toggleGrid = () => { S.grid = !S.grid; grid.setAttribute("aria-pressed", S.grid); draw(); };
    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-g-act]")?.dataset.gAct;
      if (a === "in") setK(S.k + 1); else if (a === "out") setK(S.k - 1); else if (a === "fit") fit(); else if (a === "grid") toggleGrid();
    });
    demoKeys.set(root, (e) => {
      const key = e.key.toLowerCase();
      if (key === "g") toggleGrid();
      else if (key === "0") fit();
      else if (/^[1-9]$/.test(key)) setK(Number(key)); // 1 = 100% = one screen pixel per image pixel
      else if (key === "+" || key === "=") setK(S.k + 1);
      else if (key === "-") setK(S.k - 1);
      else if (key === "m") setMode(modes[(modes.indexOf(S.mode) + 1) % modes.length]);
      else return false;
      return true;
    });

    Promise.all([load("assets/demo/meadow.png"), load("assets/demo/meadow-shifted.png")]).then(async ([a, b]) => {
      A = a; B = b; imgW = a.width; imgH = a.height;
      A_px = pixels(a); B_px = pixels(b);
      metrics = analyse(A_px, B_px);
      D_px = metrics.out;
      D = await createImageBitmap(D_px);
      const pct = ((metrics.n * 100) / metrics.total).toFixed(3);
      metricsEl.innerHTML = `A meadow.png ⟷ B meadow-swap.png · <span class="bad">${metrics.n.toLocaleString("en-US")} px differ (${pct}%)</span> · max Δ ${metrics.maxd} · RMSE ${metrics.rmse.toFixed(2)} · PSNR ${metrics.psnr.toFixed(1)} dB`;
      new ResizeObserver(resize).observe(stage);
      resize(); fit();
    });
  }

  /* ─────────────── Flick demo ─────────────── */
  {
    const root = $("[data-flick]");
    const stageEl = $(".f-stage", root), video = $("video", root);
    const track = $(".f-track", root), played = $(".f-played", root), clipEl = $(".f-clip", root), knob = $(".f-knob", root);
    const markA = $(".f-mark.a", root), markB = $(".f-mark.b", root);
    const timeEl = $("[data-f-time]", root), clipLabel = $("[data-f-cliplabel]", root);
    const stateEl = $("[data-f-state]", root), cmdEl = $("[data-f-cmd]", root);
    const cropWrap = $(".f-crop", root), cropBox = $(".f-crop-box", root), cropLabel = $("[data-f-croplabel]", root);
    const toastEl = $(".f-toast", root);
    const loopBtn = $('[data-f-act="loop"]', root), cropBtn = $('[data-f-act="cropmode"]', root);
    const FPS = 30;
    const F = { a: null, b: null, loop: true, region: null, cropMode: false };
    let dur = 20, vw = 960, vh = 540, idleTimer = null, toastTimer = null;

    const clock = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; };
    const ts = (t) => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`; };
    const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600); };

    const j = (v) => v == null ? '<span class="nul">null</span>' : typeof v === "number" ? `<span class="n">${v}</span>` : `<span class="s">"${esc(v)}"</span>`;
    let lastState = "";
    const renderState = () => {
      const t = video.currentTime;
      const clip = F.a != null && F.b != null ? `{ <span class="k">"ffmpeg"</span>: ${j(`-ss ${ts(F.a)} -to ${ts(F.b)}`)} }` : F.a != null ? `{ <span class="k">"start"</span>: ${j(+F.a.toFixed(3))} }` : j(null);
      const r = F.region;
      const region = r ? `{ <span class="k">"ffmpeg"</span>: ${j(`crop=${r.w}:${r.h}:${r.x}:${r.y}`)} }` : j(null);
      const html = `{\n  <span class="k">"file"</span>:     ${j("bunny.mp4")},\n  <span class="k">"position"</span>: ${j(+t.toFixed(3))},\n  <span class="k">"paused"</span>:   <span class="n">${video.paused}</span>,\n  <span class="k">"clip"</span>:     ${clip},\n  <span class="k">"region"</span>:   ${region}\n}`;
      stateEl.innerHTML = html;
      const key = `${F.a}|${F.b}|${r && r.w + r.h + r.x + r.y}`;
      const parts = ["ffmpeg"];
      if (F.a != null && F.b != null) parts.push(`-ss ${ts(F.a)} -to ${ts(F.b)}`);
      parts.push("-i bunny.mp4");
      if (r) parts.push(`-vf crop=${r.w}:${r.h}:${r.x}:${r.y}`);
      parts.push(r || (F.a != null && F.b != null) ? "clip.mp4" : "out.mp4");
      const cmd = parts.join(" ");
      cmdEl.textContent = F.a == null && !r ? "Mark a clip or draw a crop, and the command appears here.\n\n" + cmd : cmd;
      if (key !== lastState) { lastState = key; cmdEl.classList.remove("flash"); void cmdEl.offsetWidth; cmdEl.classList.add("flash"); }
    };

    const pct = (t) => (dur ? (t / dur) * 100 : 0) + "%";
    const renderBar = () => {
      const t = video.currentTime;
      played.style.width = pct(t); knob.style.left = pct(t);
      timeEl.textContent = `${clock(t)} / ${clock(dur)}`;
      track.setAttribute("aria-valuenow", t.toFixed(1));
      markA.style.display = F.a != null ? "block" : "none"; markA.style.left = pct(F.a || 0);
      markB.style.display = F.b != null ? "block" : "none"; markB.style.left = pct(F.b || 0);
      if (F.a != null && F.b != null) { clipEl.style.left = pct(F.a); clipEl.style.width = pct(F.b - F.a); clipLabel.textContent = `Clip ${clock(F.a)} – ${clock(F.b)}`; }
      else { clipEl.style.width = 0; clipLabel.textContent = F.a != null ? `Clip from ${clock(F.a)}` : ""; }
    };
    const tick = () => {
      if (F.loop && F.a != null && F.b != null && !video.paused && video.currentTime >= F.b) video.currentTime = F.a;
      renderBar(); renderState();
      if (!video.paused) requestAnimationFrame(tick);
    };

    const wake = () => {
      stageEl.classList.remove("idle"); clearTimeout(idleTimer);
      if (!video.paused) idleTimer = setTimeout(() => stageEl.classList.add("idle"), 2200);
    };
    const play = () => { if (video.paused) { if (F.a != null && F.b != null && (video.currentTime < F.a || video.currentTime >= F.b)) video.currentTime = F.a; video.play(); } else video.pause(); };
    video.addEventListener("play", () => { stageEl.classList.add("playing"); wake(); requestAnimationFrame(tick); });
    video.addEventListener("pause", () => { stageEl.classList.remove("playing"); wake(); renderBar(); renderState(); });
    video.addEventListener("seeked", () => { renderBar(); renderState(); });
    // requestAnimationFrame pauses in background tabs; timeupdate keeps the clip looping anyway.
    video.addEventListener("timeupdate", () => {
      if (F.loop && F.a != null && F.b != null && !video.paused && video.currentTime >= F.b) video.currentTime = F.a;
    });
    video.addEventListener("loadedmetadata", () => { dur = video.duration || 20; vw = video.videoWidth || 960; vh = video.videoHeight || 540; track.setAttribute("aria-valuemax", dur.toFixed(1)); renderBar(); renderState(); });
    video.addEventListener("ended", () => { if (F.loop) { video.currentTime = F.a ?? 0; video.play(); } });
    stageEl.addEventListener("pointermove", wake);

    const seekTo = (t) => { video.currentTime = clamp(t, 0, dur - 0.01); renderBar(); renderState(); };
    const step = (n) => { video.pause(); seekTo(Math.round(video.currentTime * FPS + n) / FPS); };
    const markIn = () => { F.a = +video.currentTime.toFixed(3); if (F.b != null && F.b <= F.a) F.b = null; toast(`Clip start marked at ${clock(F.a)}.`); renderBar(); renderState(); };
    const markOut = () => {
      const t = +video.currentTime.toFixed(3);
      if (F.a == null) F.a = 0;
      if (t <= F.a) { toast("The end has to come after the start."); return; }
      F.b = t; toast(`Clip ${clock(F.a)} – ${clock(F.b)} marked. It loops while you check it.`); renderBar(); renderState();
    };
    const clearMarks = () => { F.a = F.b = null; toast("The clip marks were cleared."); renderBar(); renderState(); };
    const setCropMode = (on) => { F.cropMode = on; stageEl.classList.toggle("cropping", on); cropBtn.classList.toggle("is-on", on); if (on) { video.pause(); toast("Drag over the video to draw a crop region."); } };

    // Seek bar
    let seeking = false;
    const trackT = (e) => { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * dur; };
    track.addEventListener("pointerdown", (e) => { seeking = true; track.setPointerCapture(e.pointerId); seekTo(trackT(e)); e.stopPropagation(); });
    track.addEventListener("pointermove", (e) => { if (seeking) seekTo(trackT(e)); });
    track.addEventListener("pointerup", () => (seeking = false));
    track.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") { seekTo(video.currentTime - 1); e.preventDefault(); } if (e.key === "ArrowRight") { seekTo(video.currentTime + 1); e.preventDefault(); } });

    // Crop drawing in video pixels
    const videoRect = () => {
      const r = stageEl.getBoundingClientRect(), s = Math.min(r.width / vw, r.height / vh);
      const w = vw * s, h = vh * s;
      return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, w, h, s, offX: (r.width - w) / 2, offY: (r.height - h) / 2 };
    };
    const showRegion = () => {
      const r = F.region;
      cropWrap.hidden = !r;
      if (!r) return;
      const v = videoRect();
      Object.assign(cropBox.style, { left: v.offX + r.x * v.s + "px", top: v.offY + r.y * v.s + "px", width: r.w * v.s + "px", height: r.h * v.s + "px" });
      cropBox.classList.toggle("below", r.y * v.s < 44);
      cropLabel.textContent = `${r.w} × ${r.h} at ${r.x}, ${r.y}`;
    };
    let cropStart = null;
    stageEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".f-controls, .f-bigplay, .f-crop-tag")) return;
      if (!F.cropMode) { play(); return; }
      const v = videoRect();
      cropStart = { x: clamp((e.clientX - v.left) / v.s, 0, vw), y: clamp((e.clientY - v.top) / v.s, 0, vh) };
      stageEl.setPointerCapture(e.pointerId);
    });
    stageEl.addEventListener("pointermove", (e) => {
      if (!cropStart) return;
      const v = videoRect();
      const x2 = clamp((e.clientX - v.left) / v.s, 0, vw), y2 = clamp((e.clientY - v.top) / v.s, 0, vh);
      // even sizes, as ffmpeg's encoders prefer
      const x = Math.round(Math.min(cropStart.x, x2)), y = Math.round(Math.min(cropStart.y, y2));
      const w = Math.round(Math.abs(x2 - cropStart.x) / 2) * 2, h = Math.round(Math.abs(y2 - cropStart.y) / 2) * 2;
      if (w >= 8 && h >= 8) { F.region = { x, y, w: Math.min(w, vw - x), h: Math.min(h, vh - y) }; showRegion(); renderState(); }
    });
    stageEl.addEventListener("pointerup", () => { if (cropStart && F.region) { setCropMode(false); toast(`Crop region set to ${F.region.w} × ${F.region.h}.`); } cropStart = null; });
    new ResizeObserver(showRegion).observe(stageEl);

    root.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-f-act]")?.dataset.fAct;
      if (!a) return;
      if (a === "play") play();
      else if (a === "back") step(-1);
      else if (a === "fwd") step(1);
      else if (a === "markin") markIn();
      else if (a === "markout") markOut();
      else if (a === "clear") clearMarks();
      else if (a === "cropmode") setCropMode(!F.cropMode);
      else if (a === "loop") { F.loop = !F.loop; loopBtn.classList.toggle("is-on", F.loop); loopBtn.setAttribute("aria-pressed", F.loop); toast(F.loop ? "Looping is on." : "Looping is off."); }
      else if (a === "clearcrop") { F.region = null; showRegion(); renderState(); toast("The crop region was cleared."); }
      else if (a === "copycrop" && F.region) { const r = F.region; toast((await copyText(`crop=${r.w}:${r.h}:${r.x}:${r.y}`)) ? "Copied the crop filter." : "Copying isn't allowed here."); }
      else if (a === "copycmd") { const ok = await copyText(cmdEl.textContent.split("\n").pop()); e.target.textContent = ok ? "Copied" : "Blocked"; setTimeout(() => (e.target.textContent = "Copy"), 1400); }
    });
    demoKeys.set(root, (e) => {
      const k = e.key;
      if (k === " " || k === "k") play();
      else if (k === "[") markIn();
      else if (k === "]") markOut();
      else if (k === "\\") clearMarks();
      else if (k === "c" || k === "C") setCropMode(!F.cropMode);
      else if (k === ",") step(-1);
      else if (k === ".") step(1);
      else if (k === "ArrowLeft") seekTo(video.currentTime - (e.shiftKey ? 0.2 : 1));
      else if (k === "ArrowRight") seekTo(video.currentTime + (e.shiftKey ? 0.2 : 1));
      else if (k === "l" || k === "L") loopBtn.click();
      else if (k === "Escape" && F.cropMode) setCropMode(false);
      else return false;
      return true;
    });
    // Load the clip as a blob before it scrolls into view. A blob seeks frame-accurately
    // even when the host ignores HTTP range requests, which plain <video src> needs for seeking.
    const loadVideo = () => {
      const url = video.dataset.src;
      fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then((b) => { video.src = URL.createObjectURL(b); })
        .catch(() => { video.src = url; });
    };
    const vio = new IntersectionObserver(([e]) => { if (e.isIntersecting) { vio.disconnect(); loadVideo(); } }, { rootMargin: "800px 0px" });
    vio.observe(stageEl);
    // Pause when scrolled away.
    new IntersectionObserver(([e]) => { if (!e.isIntersecting && !video.paused) video.pause(); }, { threshold: 0.1 }).observe(stageEl);
    renderBar(); renderState();
  }

  /* ─────────────── Leaf demo ─────────────── */
  {
    const root = $("[data-leaf]");
    const page = $("[data-l-page]", root), scroller = $("[data-l-scroll]", root), main = $(".l-main", root);
    const input = $("[data-l-query]", root), countEl = $("[data-l-count]", root), resultsEl = $("[data-l-results]", root), tocEl = $("[data-l-toc]", root);
    const ticksEl = $("[data-l-ticks]", root), toastEl = $(".l-toast", root), nightBtn = $('[data-l-act="night"]', root);
    let blocks = [], paras = [], matches = [], cur = -1, toastTimer = null;
    const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600); };

    // Join a paragraph's lines the way Leaf does: a trailing hyphen before a lowercase letter is a broken word.
    const buildPara = (lines) => {
      let text = "";
      const map = []; // joined index -> [line, col]
      const hy = lines.map((l, i) => i < lines.length - 1 && /[a-z]-$/.test(l) && /^[a-z]/.test(lines[i + 1]));
      lines.forEach((l, i) => {
        const body = hy[i] ? l.slice(0, -1) : l;
        for (let c = 0; c < body.length; c++) { map.push([i, c]); text += body[c]; }
        if (i < lines.length - 1 && !hy[i]) { map.push([i, -1]); text += " "; }
      });
      return { lines, hy, text, map };
    };

    const render = () => {
      let html = "", pi = 0;
      blocks.forEach((b, bi) => {
        if (b.t === "h1") html += `<h1 id="l-h${bi}">${esc(b.text)}</h1>`;
        else if (b.t === "h2") html += `<h2 id="l-h${bi}">${esc(b.text)}</h2>`;
        else if (b.t === "fig") html += `<figure><img src="assets/demo/linden.jpg" alt="A silver linden leaf, in its real colours." width="274" height="332"><figcaption>Leaf of <i>Tilia tomentosa</i> (silver linden tree). Night mode leaves this photograph in its true colours.</figcaption></figure>`;
        else {
          const p = paras[pi];
          html += `<p class="para" data-p="${pi}">` + p.lines.map((l, li) => {
            const marks = [];
            matches.forEach((m, mi) => { if (m.p === pi) m.spans.forEach((s) => { if (s.line === li) marks.push({ ...s, cur: mi === cur, mi }); }); });
            const body = p.hy[li] ? l.slice(0, -1) : l;
            const full = p.hy[li] ? body + "\u0000" : body; // \0 stands for the hyphen span
            let out = "", pos = 0;
            marks.sort((a, b) => a.from - b.from).forEach((m) => {
              out += seg(full.slice(pos, m.from));
              out += `<mark class="${m.cur ? "cur" : ""}" data-m="${m.mi}">${seg(full.slice(m.from, m.to))}</mark>`;
              pos = m.to;
            });
            out += seg(full.slice(pos));
            return `<span class="line">${out}</span>`;
          }).join("") + "</p>";
          pi++;
        }
      });
      page.innerHTML = html;
    };
    const seg = (s) => esc(s).replace("\u0000", '<span class="hy">-</span>');

    const search = (q, keepCur) => {
      matches = [];
      if (q) {
        const sensitive = /[A-Z]/.test(q); // smart case, like Leaf
        const needle = sensitive ? q : q.toLowerCase();
        paras.forEach((p, pi) => {
          const hay = sensitive ? p.text : p.text.toLowerCase();
          let from = 0, at;
          while ((at = hay.indexOf(needle, from)) !== -1) {
            const byLine = new Map();
            for (let j = at; j < at + needle.length; j++) {
              const [line, col] = p.map[j];
              if (col < 0) continue;
              const s = byLine.get(line) || { line, from: col, to: col + 1 };
              s.from = Math.min(s.from, col); s.to = Math.max(s.to, col + 1); byLine.set(line, s);
            }
            const spans = [...byLine.values()];
            spans.forEach((s) => { if (p.hy[s.line] && byLine.has(s.line + 1)) s.to = p.lines[s.line].length; }); // include the hyphen
            const ctxFrom = Math.max(0, at - 34), ctxTo = Math.min(p.text.length, at + needle.length + 34);
            matches.push({ p: pi, spans, broken: spans.length > 1, ctx: [p.text.slice(ctxFrom, at), p.text.slice(at, at + needle.length), p.text.slice(at + needle.length, ctxTo), ctxFrom > 0, ctxTo < p.text.length] });
            from = at + needle.length;
          }
        });
      }
      cur = matches.length ? (keepCur ? clamp(cur, 0, matches.length - 1) : 0) : -1;
      render(); renderResults(); renderTicks(); scrollToCur(false);
    };

    const renderResults = () => {
      countEl.textContent = matches.length ? `${cur + 1} / ${matches.length}` : input.value ? "0 / 0" : "";
      if (!input.value) { resultsEl.innerHTML = '<li class="l-empty">Type in the search box to find text.</li>'; return; }
      if (!matches.length) { resultsEl.innerHTML = `<li class="l-empty">No matches for “${esc(input.value)}”.</li>`; return; }
      resultsEl.innerHTML = matches.map((m, i) => `<li><button class="${i === cur ? "is-cur" : ""}" data-go="${i}"><span class="pg">p. 1</span>${m.ctx[3] ? "…" : ""}${esc(m.ctx[0])}<mark>${esc(m.ctx[1])}</mark>${esc(m.ctx[2])}${m.ctx[4] ? "…" : ""}${m.broken ? ' <span class="pg">· split across lines</span>' : ""}</button></li>`).join("");
    };
    const renderTicks = () => {
      const total = scroller.scrollHeight || 1;
      ticksEl.innerHTML = matches.map((m, i) => {
        const el = $(`mark[data-m="${i}"]`, page);
        if (!el) return "";
        const top = el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.offsetTop;
        return `<i class="${i === cur ? "cur" : ""}" style="top:${(top / total) * 100}%"></i>`;
      }).join("");
    };
    const scrollToCur = (smooth = true) => {
      const el = $("mark.cur", page);
      if (!el) return;
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 2), behavior: smooth && !reduce ? "smooth" : "auto" });
    };
    const go = (i) => { if (!matches.length) return; cur = (i + matches.length) % matches.length; render(); renderResults(); renderTicks(); scrollToCur(); };

    input.addEventListener("input", () => search(input.value.trim()));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(cur + (e.shiftKey ? -1 : 1)); } if (e.key === "Escape") { input.value = ""; search(""); } });
    resultsEl.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) go(+b.dataset.go); });
    tocEl.addEventListener("click", (e) => { const b = e.target.closest("[data-h]"); if (!b) return; const h = $("#" + b.dataset.h, page); scroller.scrollTo({ top: h.offsetTop - 10, behavior: reduce ? "auto" : "smooth" }); });
    const toggleNight = () => { const on = !main.classList.contains("night"); main.classList.toggle("night", on); nightBtn.setAttribute("aria-pressed", on); toast(on ? "Night mode is on. The photograph keeps its real colours." : "Night mode is off."); };
    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-l-act]")?.dataset.lAct;
      if (a === "next") go(cur + 1); else if (a === "prev") go(cur - 1); else if (a === "night") toggleNight();
    });

    // Clean copy: join line breaks into paragraphs and rejoin hyphenated words.
    page.addEventListener("copy", (e) => {
      const sel = getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      const frag = sel.getRangeAt(0).cloneContents();
      const lineText = (line) => { const c = line.cloneNode(true); const hy = c.querySelector(".hy"); if (hy) hy.remove(); return { t: c.textContent, hy: !!hy }; };
      const joinLines = (lines) => lines.map(lineText).reduce((s, l) => s + l.t + (l.hy ? "" : " "), "").replace(/\s+/g, " ").trim();
      let parts = [], rejoined = 0;
      const blocksIn = $$(".para, h1, h2, figcaption", frag);
      if (blocksIn.length) blocksIn.forEach((b) => { const lines = $$(".line", b); if (lines.length) { rejoined += lines.filter((l) => l.querySelector(".hy")).length; parts.push(joinLines(lines)); } else parts.push(b.textContent.trim()); });
      else { const lines = $$(".line", frag); if (lines.length) { rejoined += lines.filter((l) => l.querySelector(".hy")).length; parts.push(joinLines(lines)); } else parts.push(frag.textContent.replace(/\s+/g, " ").trim()); }
      parts = parts.filter(Boolean);
      if (!parts.length) return;
      e.clipboardData.setData("text/plain", parts.join("\n\n"));
      e.preventDefault();
      const n = parts.length;
      toast(`Copied ${n} paragraph${n === 1 ? "" : "s"}. Line breaks were joined${rejoined ? ` and ${rejoined} hyphenated word${rejoined === 1 ? " was" : "s were"} rejoined` : ""}.`);
    });

    demoKeys.set(root, (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { input.focus(); input.select(); return true; }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.key === "d" || e.key === "D") { toggleNight(); return true; }
      if (e.key === "Enter") { go(cur + (e.shiftKey ? -1 : 1)); return true; }
      return false;
    });

    fetch("assets/demo/leaf-doc.json").then((r) => r.json()).then((data) => {
      blocks = data;
      paras = blocks.filter((b) => b.t === "p").map((b) => buildPara(b.lines));
      tocEl.innerHTML = blocks.map((b, i) => (b.t === "h1" || b.t === "h2") ? `<li><button data-h="l-h${i}">${b.t === "h2" ? "&nbsp;&nbsp;" : ""}${esc(b.text)}</button></li>` : "").join("");
      search(input.value.trim());
      new ResizeObserver(renderTicks).observe(page);
    });
  }

  /* ─────────────── Leaf night-render swipe ─────────────── */
  $$("[data-swipe]").forEach((el) => {
    const input = $("input", el);
    const set = () => el.style.setProperty("--pos", input.value + "%");
    input.addEventListener("input", set); set();
  });

  /* ─────────────── Instant demo ─────────────── */
  {
    const apps = [
      { name: "Glint", icon: "assets/icons/glint.svg", file: "meadow.png", src: "assets/shots/glint-fit.webp" },
      { name: "Flick", icon: "assets/icons/flick.svg", file: "bunny.mp4", src: "assets/shots/flick-clip.webp" },
      { name: "Leaf", icon: "assets/icons/leaf.svg", file: "leaf.pdf", src: "assets/shots/leaf-light.webp" },
    ];
    const files = $$(".file"), mini = $(".mini-window");
    let warmed = false;
    const warm = () => { if (warmed) return; warmed = true; apps.forEach((a) => { const im = new Image(); im.src = a.src; }); };
    const open = (k) => {
      const a = apps[k];
      files.forEach((f, j) => f.classList.toggle("is-selected", j === k));
      $(".mini-title", mini).textContent = a.file;
      $(".mini-app", mini).innerHTML = `<img src="${a.icon}" alt="">${a.name}`;
      const view = $(".mini-view", mini); view.innerHTML = "";
      const im = new Image(); im.src = a.src; im.alt = `${a.file} open in ${a.name}`; view.appendChild(im);
    };
    const coarse = matchMedia("(pointer: coarse)").matches;
    files.forEach((f, k) => {
      f.addEventListener(coarse ? "click" : "dblclick", () => open(k));
      f.addEventListener("click", () => files.forEach((g, j) => g.classList.toggle("is-selected", j === k)));
      f.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(k); } });
    });
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      warm();
      if (e.intersectionRatio > 0.55) { io.disconnect(); if (!files.some((f) => f.classList.contains("is-selected"))) setTimeout(() => open(0), reduce ? 0 : 500); }
    }, { threshold: [0, 0.6] });
    io.observe(mini);
  }

  /* ─────────────── Claude transcript ─────────────── */
  {
    const typer = $("[data-typer]");
    if (typer && !reduce) {
      typer.classList.add("armed");
      const lines = $$(".claude-body > p", typer);
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const gaps = [0, 700, 500, 900, 600, 700, 900];
        let t = 0;
        lines.forEach((p, k) => { t += gaps[k] ?? 600; setTimeout(() => p.classList.add("shown"), t); });
      }, { threshold: 0.5 });
      io.observe(typer);
    }
  }

  /* ─────────────── Command palette (Ctrl+K) and help (F1) ─────────────── */
  const palette = $(".palette"), pInput = $("input", palette), pList = $(".palette-list", palette);
  const help = $(".help");
  const goTo = (id) => () => document.getElementById(id).scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  const dl = (a, N) => () => (location.href = `https://github.com/ethanma03/${a}/releases/latest/download/${N}-win-x64.zip`);
  const src = (a) => () => window.open(`https://github.com/ethanma03/${a}`, "_blank", "noopener");
  const commands = [
    { label: "Try the Glint demo", icon: "assets/icons/glint.svg", hint: "Images", run: goTo("glint") },
    { label: "Try the Flick demo", icon: "assets/icons/flick.svg", hint: "Video", run: goTo("flick") },
    { label: "Try the Leaf demo", icon: "assets/icons/leaf.svg", hint: "Documents", run: goTo("leaf") },
    { label: "See how they work with Claude Code", glyph: "›", run: goTo("agents") },
    { label: "Download Glint", icon: "assets/icons/glint.svg", hint: "12.5 MB", run: dl("glint", "Glint") },
    { label: "Download Flick", icon: "assets/icons/flick.svg", hint: "49 MB", run: dl("flick", "Flick") },
    { label: "Download Leaf", icon: "assets/icons/leaf.svg", hint: "10.6 MB", run: dl("leaf", "Leaf") },
    { label: "Go to the download section", glyph: "↓", run: goTo("download") },
    { label: "View Glint's source on GitHub", glyph: "↗", run: src("glint") },
    { label: "View Flick's source on GitHub", glyph: "↗", run: src("flick") },
    { label: "View Leaf's source on GitHub", glyph: "↗", run: src("leaf") },
    { label: "Show the keyboard shortcuts", glyph: "?", hint: "F1", run: () => openHelp() },
    { label: "Back to the top", glyph: "↑", run: goTo("top") },
  ];
  let pSel = 0, pItems = commands, lastFocus = null;
  const fuzzy = (q, s) => { q = q.toLowerCase(); s = s.toLowerCase(); let i = 0; for (const ch of s) if (ch === q[i]) i++; return i === q.length; };
  const renderPalette = () => {
    const q = pInput.value.trim();
    pItems = q ? commands.filter((c) => fuzzy(q, c.label)) : commands;
    pSel = clamp(pSel, 0, Math.max(0, pItems.length - 1));
    pList.innerHTML = pItems.length ? pItems.map((c, i) => `<li role="option" aria-selected="${i === pSel}" class="${i === pSel ? "is-active" : ""}" data-i="${i}">${c.icon ? `<img src="${c.icon}" alt="">` : `<span class="pi">${c.glyph}</span>`}${esc(c.label)}${c.hint ? `<small>${c.hint}</small>` : ""}</li>`).join("") : '<li class="none">No command matches that.</li>';
    $(".is-active", pList)?.scrollIntoView({ block: "nearest" });
  };
  const openPalette = () => { lastFocus = document.activeElement; help.hidden = true; palette.hidden = false; pInput.value = ""; pSel = 0; renderPalette(); pInput.focus(); };
  const closePalette = () => { palette.hidden = true; lastFocus?.focus?.(); };
  const runSel = () => { const c = pItems[pSel]; if (!c) return; closePalette(); c.run(); };
  pInput.addEventListener("input", () => { pSel = 0; renderPalette(); });
  pInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { pSel = Math.min(pItems.length - 1, pSel + 1); renderPalette(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { pSel = Math.max(0, pSel - 1); renderPalette(); e.preventDefault(); }
    else if (e.key === "Enter") { runSel(); e.preventDefault(); }
  });
  pList.addEventListener("pointermove", (e) => { const li = e.target.closest("[data-i]"); if (li && +li.dataset.i !== pSel) { pSel = +li.dataset.i; renderPalette(); } });
  pList.addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) { pSel = +li.dataset.i; runSel(); } });
  palette.addEventListener("click", (e) => { if (e.target === palette) closePalette(); });
  $("[data-palette]").addEventListener("click", openPalette);
  const openHelp = () => { lastFocus = document.activeElement; palette.hidden = true; help.hidden = false; $("[data-help-close]", help).focus(); };
  const closeHelp = () => { help.hidden = true; lastFocus?.focus?.(); };
  help.addEventListener("click", (e) => { if (e.target === help || e.target.closest("[data-help-close]")) closeHelp(); });

  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.hidden ? openPalette() : closePalette(); return; }
    if (e.key === "Escape") { if (!palette.hidden) return closePalette(); if (!help.hidden) return closeHelp(); }
    if (!palette.hidden || !help.hidden) return;
    if (e.key === "F1" || (e.key === "?" && !typing(e))) { e.preventDefault(); openHelp(); return; }
    if (typing(e) && !(e.ctrlKey && e.key.toLowerCase() === "f")) return;
    const handler = activeDemo && demoKeys.get(activeDemo);
    if (handler && !(e.altKey) && (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() === "f")) {
      if (handler(e)) e.preventDefault();
    }
  });

  /* ─────────────── Reveal on scroll ─────────────── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.08, rootMargin: "0px 0px -60px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));
})();
