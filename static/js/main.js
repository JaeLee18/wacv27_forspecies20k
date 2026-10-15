/* Project page: point-cloud viewer, animated charts, and small interactions. No dependencies. */
(() => {
  "use strict";
  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PLATFORM = {
    TLS: { name: "Terrestrial", color: "#30d159" },
    MLS: { name: "Mobile", color: "#59d1ff" },
    ULS: { name: "Drone", color: "#ffb84d" },
  };
  const pretty = (s) => s.replace(/_/g, " ");
  const short = (s) => { const [g, e] = s.split("_"); return `${g[0]}. ${e}`; };

  /* ------------------------------------------------------------ point clouds */
  // Height colour ramp of the film: green at the base, teal, pale blue, white at the top.
  const STOPS = [0, 0.35, 0.75, 1];
  const COLS = [[0.16, 0.66, 0.5], [0.5, 0.86, 0.8], [0.86, 0.96, 1.0], [1, 1, 1]];
  function ramp(t, out, o) {
    let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1]) k++;
    const u = Math.min(1, Math.max(0, (t - STOPS[k]) / (STOPS[k + 1] - STOPS[k])));
    for (let c = 0; c < 3; c++) out[o + c] = COLS[k][c] + (COLS[k + 1][c] - COLS[k][c]) * u;
  }

  const cache = new Map();
  async function loadTree(meta) {
    if (cache.has(meta.id)) return cache.get(meta.id);
    const buf = await (await fetch(`static/trees/${meta.id}.bin`)).arrayBuffer();
    const q = new Int16Array(buf);
    const n = q.length / 3;
    const xyz = new Float32Array(q.length);
    let h = 0;
    for (let i = 0; i < q.length; i++) xyz[i] = q[i] * meta.scale;
    for (let i = 0; i < n; i++) h = Math.max(h, xyz[3 * i + 2]);
    const col = new Float32Array(q.length);
    for (let i = 0; i < n; i++) ramp(xyz[3 * i + 2] / h, col, 3 * i);
    const cloud = { xyz, col, n, height: h };
    cache.set(meta.id, cloud);
    return cloud;
  }

  class CloudView {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.buf = document.createElement("canvas");
      this.bctx = this.buf.getContext("2d");
      this.o = Object.assign({ dpr: 1.5, fill: 0.78, elev: 0.08, speed: 0.32, exposure: 1.0, gain: 1.6,
        glow: 0.55, interactive: false, cy: 0.5 }, opts);
      this.az = 0.6;
      this.cloud = null;
      this.visible = true;
      this.idle = 0;
      this.last = performance.now();
      this.box = null;
      this.lut = new Uint8ClampedArray(2048);
      for (let i = 0; i < 2048; i++) this.lut[i] = 255 * (1 - Math.exp(-(i / 2048) * 6));
      new ResizeObserver(() => this.resize()).observe(canvas);
      new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.kick(); })
        .observe(canvas);
      if (this.o.interactive) this.bindDrag();
      this.resize();
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, this.o.dpr);
      const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
      if (w === this.w && h === this.h) return;
      this.w = this.canvas.width = this.buf.width = w;
      this.h = this.canvas.height = this.buf.height = h;
      this.acc = new Float32Array(w * h * 3);
      this.img = this.bctx.createImageData(w, h);
      this.box = null;
      this.draw();
    }
    set(cloud) { this.cloud = cloud; this.box = null; this.acc && this.acc.fill(0); this.img && this.img.data.fill(0); this.draw(); this.kick(); }
    bindDrag() {
      let x0 = null;
      this.canvas.addEventListener("pointerdown", (e) => { x0 = e.clientX; this.canvas.setPointerCapture(e.pointerId); this.idle = -1; });
      this.canvas.addEventListener("pointermove", (e) => {
        if (x0 === null) return;
        this.az -= (e.clientX - x0) * 0.008;
        x0 = e.clientX;
        this.draw();
      });
      const up = () => { x0 = null; this.idle = 0; this.kick(); };
      this.canvas.addEventListener("pointerup", up);
      this.canvas.addEventListener("pointercancel", up);
    }
    kick() {
      if (this.running || REDUCE) return;
      this.running = true;
      this.last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        if (this.idle >= 0) {
          this.idle += dt;
          const s = Math.min(1, Math.max(0, (this.idle - 1.2) / 1.0));   // ease back into auto-rotation
          this.az += this.o.speed * dt * (this.o.interactive ? s : 1);
        }
        this.draw();
        if (this.visible) requestAnimationFrame(step); else this.running = false;
      };
      requestAnimationFrame(step);
    }
    draw() {
      const c = this.cloud;
      if (!c || !this.acc) return;
      const { w, h, acc } = this;
      const data = this.img.data;
      if (this.box) {   // clear only what the last frame touched
        const [x0, y0, x1, y1] = this.box;
        for (let y = y0; y <= y1; y++) {
          acc.fill(0, (y * w + x0) * 3, (y * w + x1 + 1) * 3);
          data.fill(0, (y * w + x0) * 4, (y * w + x1 + 1) * 4);
        }
      }
      const f = (h / 2) / Math.tan((32 * Math.PI) / 360);
      const H = c.height;
      const dist = (H / this.o.fill) / (2 * Math.tan((32 * Math.PI) / 360));
      const ca = Math.cos(this.az), sa = Math.sin(this.az);
      const ce = Math.cos(this.o.elev), se = Math.sin(this.o.elev);
      const cx = w / 2, cy = h * this.o.cy, zt = H * 0.5;
      const px = f * H / dist;
      const ratio = (px * px) / c.n;
      const size = ratio > 6 ? 2 : 1;   // splat 2x2 when the cloud is sparse on screen
      const wt = this.o.exposure * Math.min(1, Math.max(0.02, 0.25 * ratio)) / (size * size);
      const { xyz, col, n } = c;
      let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
      for (let i = 0; i < n; i++) {
        const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2] - zt;
        const xr = x * ca - y * sa, yr = x * sa + y * ca;
        const depth = dist + yr * ce + z * se;
        if (depth < 0.1) continue;
        const up = z * ce - yr * se;
        const u = (cx + (f * xr) / depth) | 0, v = (cy - (f * up) / depth) | 0;
        if (u < 0 || v < 0 || u >= w - 1 || v >= h - 1) continue;
        const k = wt * Math.min(3, (dist / depth) * (dist / depth));
        const r = col[3 * i] * k, g = col[3 * i + 1] * k, b = col[3 * i + 2] * k;
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const p = ((v + dy) * w + u + dx) * 3;
            acc[p] += r; acc[p + 1] += g; acc[p + 2] += b;
          }
        }
        if (u < bx0) bx0 = u; if (u + 1 > bx1) bx1 = u + 1;
        if (v < by0) by0 = v; if (v + 1 > by1) by1 = v + 1;
      }
      const lut = this.lut, gain = this.o.gain * 2048 / 6;
      if (bx1 >= 0) {
        for (let y = by0; y <= by1; y++) {
          for (let x = bx0; x <= bx1; x++) {
            const p = (y * w + x) * 3;
            const a0 = acc[p], a1 = acc[p + 1], a2 = acc[p + 2];
            if (a0 + a1 + a2 === 0) continue;
            const r = lut[Math.min(2047, (a0 * gain) | 0)], g = lut[Math.min(2047, (a1 * gain) | 0)],
              b = lut[Math.min(2047, (a2 * gain) | 0)];
            const a = Math.max(r, g, b), q = (y * w + x) * 4;
            if (a === 0) continue;
            data[q] = (r * 255) / a; data[q + 1] = (g * 255) / a; data[q + 2] = (b * 255) / a; data[q + 3] = a;
          }
        }
        this.box = [bx0, by0, bx1, by1];
      } else this.box = null;
      this.bctx.putImageData(this.img, 0, 0);
      const ctx = this.ctx;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.drawImage(this.buf, 0, 0);
      if (this.o.glow > 0 && "filter" in ctx) {   // bloom
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.o.glow;
        ctx.filter = `blur(${Math.round(Math.max(3, w / 160))}px)`;
        ctx.drawImage(this.buf, 0, 0);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
  }

  /* ------------------------------------------------------------ viewer + hero */
  async function initTrees() {
    let trees;
    try { trees = await (await fetch("static/trees/trees.json")).json(); } catch { return; }

    const hero = document.getElementById("hero-canvas");
    if (hero) {
      const hv = new CloudView(hero, { dpr: 1, fill: 0.92, elev: -0.06, speed: 0.12, exposure: 0.6, gain: 1.3, glow: 0.7, cy: 0.52 });
      loadTree(trees[0]).then((c) => hv.set(c));
    }

    const canvas = document.getElementById("viewer-canvas");
    if (!canvas) return;
    const view = new CloudView(canvas, { interactive: true, fill: 0.8, exposure: 0.5, gain: 1.2, glow: 0.45, cy: 0.5 });
    const chips = document.getElementById("chips");
    const nameEl = document.getElementById("pred-name");
    const verdict = document.getElementById("verdict");
    const bars = document.getElementById("bars");
    const facts = document.getElementById("facts");
    const scale = document.getElementById("viewer-scale");
    const loading = document.getElementById("viewer-loading");

    async function select(i) {
      const t = trees[i];
      [...chips.children].forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
      const [pred, p] = t.top5[0];
      const ok = pred === t.species;
      nameEl.textContent = pretty(pred);
      verdict.className = `verdict ${ok ? "ok" : "bad"}`;
      verdict.innerHTML = ok ? `✓ Correct, ${(100 * p).toFixed(1)}% confident`
        : `✗ Wrong: this is <em>${pretty(t.species)}</em>`;
      bars.innerHTML = t.top5.map(([s, q], k) => `
        <div class="bar${k === 0 ? " top" : ""}${k === 0 && !ok ? " wrong" : ""}">
          <span class="name">${pretty(s)}</span><span class="pct">${q < 0.001 ? "<0.1" : (100 * q).toFixed(1)}%</span>
          <span class="track"><span class="fill" data-w="${Math.max(0.4, 100 * q)}"></span></span>
        </div>`).join("");
      requestAnimationFrame(() => requestAnimationFrame(() =>
        bars.querySelectorAll(".fill").forEach((el) => { el.style.width = `${el.dataset.w}%`; })));
      facts.innerHTML = `
        <div><dt>LiDAR</dt><dd>${PLATFORM[t.platform].name} (${t.platform})</dd></div>
        <div><dt>Source dataset</dt><dd>${t.dataset.replace(/_/g, " ")}</dd></div>
        <div><dt>Height</dt><dd>${t.height.toFixed(1)} m</dd></div>
        <div><dt>Points in the scan</dt><dd>${t.points.toLocaleString("en-US")}</dd></div>`;
      scale.textContent = `${t.height.toFixed(1)} m tall`;
      loading.style.display = cache.has(t.id) ? "none" : "grid";
      const cloud = await loadTree(t);
      loading.style.display = "none";
      view.set(cloud);
    }

    trees.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.style.setProperty("--c", PLATFORM[t.platform].color);
      b.innerHTML = `<i></i>${short(t.species)}`;
      b.title = `${pretty(t.species)} · ${PLATFORM[t.platform].name} scan`;
      b.addEventListener("click", () => select(i));
      chips.appendChild(b);
    });
    select(0);
  }

  /* ------------------------------------------------------------ charts */
  const LEADERBOARD = [
    ["Ours, 256 + 512 px", "images", 85.0, true], ["Ours, 256 px", "images", 84.0, true],
    ["DetailView", "images", 79.5], ["YOLOv5", "images", 77.9], ["SimpleView", "images", 76.2],
    ["Ensemble PointNet++", "points", 75.6], ["MinkNet", "points", 73.7], ["PointMixer", "points", 71.1],
    ["PointAugment + DGCNN", "points", 68.3],
  ];
  const GAP = [["ConvNeXtV2-Base×3 (ours)", 94.8, 60.2, 34.5], ["DINOv2-Base×3", 91.5, 48.6, 43.0],
    ["DenseNet-201×3", 85.7, 46.0, 39.7]];

  function buildCharts() {
    const hb = document.getElementById("hbars");
    if (hb) hb.innerHTML = LEADERBOARD.map(([who, inp, v, ours]) => `
      <div class="hbar${ours ? " ours" : ""}">
        <span class="who">${who}<small>${inp}</small></span>
        <span class="track"><span class="fill" data-w="${((v - 50) / 40) * 100}"></span></span>
        <span class="val">${v.toFixed(1)}</span>
      </div>`).join("");
    const pr = document.getElementById("pairs");
    if (pr) pr.innerHTML = GAP.map(([who, a, b, d]) => `
      <div class="pair">
        <div class="head"><b>${who}</b><span class="drop">−${d.toFixed(1)} pts</span></div>
        <div class="row rand"><span>Random split</span><span class="track"><span class="fill" data-w="${a}"></span></span><span class="v">${a.toFixed(1)}%</span></div>
        <div class="row lso"><span>Unseen source</span><span class="track"><span class="fill" data-w="${b}"></span></span><span class="v">${b.toFixed(1)}%</span></div>
      </div>`).join("");
  }
  const grow = (root) => root.querySelectorAll(".fill[data-w]").forEach((el) => { el.style.width = `${el.dataset.w}%`; });

  function countUp(el) {
    const target = parseFloat(el.dataset.count), dec = +el.dataset.decimals || 0, suffix = el.dataset.suffix || "";
    const fmt = (x) => x.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;
    if (REDUCE) { el.textContent = fmt(target); return; }
    const t0 = performance.now(), dur = 1400;
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 3);
      el.textContent = fmt(target * e);
      if (u < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------ page wiring */
  function init() {
    buildCharts();
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      grow(e.target);
      e.target.querySelectorAll("[data-count]").forEach(countUp);
      io.unobserve(e.target);
    }), { threshold: 0.18 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

    const bar = document.getElementById("topbar");
    const onScroll = () => bar.classList.toggle("show", window.scrollY > window.innerHeight * 0.7);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const video = document.getElementById("film-video");
    if (video && !REDUCE) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) video.play().catch(() => {}); else video.pause();
      }, { threshold: 0.45 }).observe(video);
    }

    document.querySelectorAll("[data-copy]").forEach((btn) => btn.addEventListener("click", async () => {
      const text = document.getElementById(btn.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; } catch { btn.textContent = "Select and copy"; }
      setTimeout(() => { btn.textContent = "Copy"; }, 1800);
    }));

    initTrees();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
