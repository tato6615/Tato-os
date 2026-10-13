import React, { useEffect, useRef, useState } from 'react';

// Small canvas effects for the horizontal story on "/" (no dependencies, no three.js).
// Everything animates only while its scene is active (`run`) and is skipped for prefers-reduced-motion.
//   Fog          scene 1  mist drifting in over the ridges
//   Smoke        scene 5  smoke rising from the roaster / scene 7 steam rising from the cup
//   PowderGrind  scene 6  the three roast beans crumble into powder piles, then re-form
// The simulation code is plain functions/classes (no DOM) so it can be tested outside the browser.

type Mk = (w: number, h: number) => any;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// where a point of an `object-fit: cover` image lands inside its box
export function coverPoint(W: number, H: number, iw: number, ih: number, px: number, py: number, nx: number, ny: number) {
  const s = Math.max(W / iw, H / ih);
  const dw = iw * s, dh = ih * s;
  return { x: (W - dw) * px + nx * dw, y: (H - dh) * py + ny * dh };
}

// soft round sprite, optionally lumpy like a cloud
export function makePuff(mk: Mk, size: number, rgb: [number, number, number], lumps: number) {
  const c = mk(size, size);
  const g = c.getContext('2d');
  const half = size / 2;
  for (let i = 0; i < lumps; i++) {
    const a = Math.random() * 6.283, d = lumps > 1 ? Math.random() * size * 0.2 : 0;
    const x = half + Math.cos(a) * d, y = half + Math.sin(a) * d * 0.6, r = size * (lumps > 1 ? rnd(0.16, 0.3) : 0.5);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${lumps > 1 ? 0.22 : 1})`);
    gr.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

// ---------- fog ----------
export interface FogLayer { y: number; s: number; a: number; sc: number; p: { u: number; dy: number; ph: number; sx: number }[] }
export function makeFog(layers = 3): FogLayer[] {
  const base: Omit<FogLayer, 'p'>[] = [
    { y: 0.5, s: 9, a: 0.55, sc: 1.0 },
    { y: 0.64, s: 16, a: 0.7, sc: 1.25 },
    { y: 0.8, s: 26, a: 0.85, sc: 1.55 },
  ];
  return base.slice(0, layers).map((b) => ({ ...b, p: Array.from({ length: 4 }, () => ({ u: Math.random(), dy: rnd(-0.05, 0.05), ph: rnd(0, 6.28), sx: rnd(0.85, 1.4) })) }));
}
export function drawFog(ctx: any, sprite: any, layers: FogLayer[], W: number, H: number, t: number) {
  ctx.clearRect(0, 0, W, H);
  const fade = clamp(t / 3.5, 0, 1);
  const ease = 1 - Math.pow(1 - fade, 3);
  for (const L of layers) {
    const pw = W * 0.85 * L.sc, ph = pw * 0.4, span = W + pw * 2;
    for (const p of L.p) {
      const x = ((p.u * span + t * L.s) % span) - pw - (1 - ease) * W * 0.3; // floats in from the left
      const y = H * L.y + p.dy * H + Math.sin(t * 0.3 + p.ph) * H * 0.012 - ph / 2;
      ctx.globalAlpha = L.a * 0.62 * ease * (0.78 + 0.22 * Math.sin(t * 0.4 + p.ph));
      ctx.drawImage(sprite, x, y, pw * p.sx, ph);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- smoke / steam ----------
export interface SmokePreset { rate: number; life: [number, number]; r0: [number, number]; r1: [number, number]; vy: [number, number]; wind: number; wob: number; alpha: number; rgb: [number, number, number]; max: number }
export const PRESETS: Record<'roast' | 'steam', SmokePreset> = {
  roast: { rate: 9, life: [4.5, 7], r0: [20, 34], r1: [70, 120], vy: [24, 42], wind: -9, wob: 16, alpha: 0.15, rgb: [176, 182, 192], max: 160 },
  steam: { rate: 15, life: [3, 4.8], r0: [7, 12], r1: [26, 50], vy: [34, 62], wind: 5, wob: 10, alpha: 0.45, rgb: [244, 240, 236], max: 70 },
};
interface Part { x: number; y: number; age: number; life: number; r0: number; r1: number; vy: number; ph: number; fr: number; sp: number; rot: number; vr: number }
export class SmokeSim {
  parts: Part[] = [];
  private acc: number[] = [];
  constructor(public pr: SmokePreset, public sprites: any[]) {}
  step(dt: number, em: { x: number; y: number }[], k: number) {
    const pr = this.pr;
    em.forEach((e, i) => {
      this.acc[i] = (this.acc[i] || 0) + pr.rate * dt;
      while (this.acc[i] >= 1 && this.parts.length < pr.max) {
        this.acc[i] -= 1;
        this.parts.push({ x: e.x + rnd(-6, 6) * k, y: e.y, age: 0, life: rnd(pr.life[0], pr.life[1]), r0: rnd(pr.r0[0], pr.r0[1]) * k, r1: rnd(pr.r1[0], pr.r1[1]) * k, vy: rnd(pr.vy[0], pr.vy[1]) * k, ph: rnd(0, 6.28), fr: rnd(0.6, 1.4), sp: Math.floor(Math.random() * this.sprites.length), rot: rnd(0, 6.28), vr: rnd(-0.25, 0.25) });
      }
      this.acc[i] = Math.min(this.acc[i], 2);
    });
    for (const p of this.parts) {
      p.age += dt;
      p.rot += p.vr * dt;
      p.y -= p.vy * dt * (1 - 0.5 * (p.age / p.life));
      p.x += (pr.wind + Math.sin(p.age * p.fr * 1.6 + p.ph) * pr.wob) * k * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
  }
  draw(ctx: any, W: number, H: number) {
    ctx.clearRect(0, 0, W, H);
    for (const p of this.parts) {
      const u = p.age / p.life;
      const a = this.pr.alpha * Math.min(u / 0.12, 1) * Math.pow(1 - u, 1.4);
      const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(u);
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(this.sprites[p.sp], -r, -r, r * 2, r * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- beans -> powder ----------
export const POWDER_T = { intact: 0.5, hold: 8.5, end: 10.8, cycle: 11.6 };
export interface Powder { n: number; W: number; H: number; BS: number; hx: Float32Array; hy: Float32Array; rx: Float32Array; ry: Float32Array; td: Float32Array; dur: Float32Array; rd: Float32Array; col: Uint32Array }
export function buildPowder(data: Uint8ClampedArray, W: number, H: number, BS: number): Powder {
  const xs: number[] = [], ys: number[] = [], rgb: number[][] = [];
  const mean = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let y = 0; y + BS <= H; y += BS) {
    for (let x = 0; x + BS <= W; x += BS) {
      const i = ((y + (BS >> 1)) * W + x + (BS >> 1)) * 4;
      if (data[i + 3] < 140) continue;
      const k = Math.min(2, Math.floor((x / W) * 3));
      mean[k][0] += data[i]; mean[k][1] += data[i + 1]; mean[k][2] += data[i + 2]; mean[k][3]++;
      xs.push(x); ys.push(y); rgb.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const n = xs.length;
  const P: Powder = { n, W, H, BS, hx: new Float32Array(n), hy: new Float32Array(n), rx: new Float32Array(n), ry: new Float32Array(n), td: new Float32Array(n), dur: new Float32Array(n), rd: new Float32Array(n), col: new Uint32Array(n) };
  const sig = W * 0.13, hm = H * 0.34;
  for (let i = 0; i < n; i++) {
    const k = Math.min(2, Math.floor((xs[i] / W) * 3));
    const c = W * (k + 0.5) / 3;
    const m = mean[k][3] || 1;
    const mr = mean[k][0] / m, mg = mean[k][1] / m, mb = mean[k][2] / m;
    const j = rnd(-14, 14);
    const r = clamp(rgb[i][0] * 0.55 + mr * 0.45 + j, 0, 255), g = clamp(rgb[i][1] * 0.55 + mg * 0.45 + j, 0, 255), b = clamp(rgb[i][2] * 0.55 + mb * 0.45 + j, 0, 255);
    P.col[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    P.hx[i] = xs[i]; P.hy[i] = ys[i];
    // powder lands in a soft bell-shaped pile under each bean (gaussian spread, denser at the centre)
    const gauss = (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.577;
    const rx = clamp(c + gauss * sig * 0.8, c - sig * 2.2, c + sig * 2.2);
    const surface = hm * Math.exp(-Math.pow(Math.abs(rx - c) / sig, 1.6));
    P.rx[i] = rx;
    P.ry[i] = H - BS - surface * Math.random();
    P.td[i] = POWDER_T.intact + (ys[i] / H) * 1.2 + Math.random() * 0.3;
    P.dur[i] = 0.8 + Math.random() * 0.7;
    P.rd[i] = Math.random() * 0.8;
  }
  return P;
}
export function powderFrame(P: Powder, buf: Uint32Array, tt: number) {
  buf.fill(0);
  const { W, H, BS } = P;
  for (let i = 0; i < P.n; i++) {
    let x: number, y: number;
    const rt = POWDER_T.hold + P.rd[i];
    if (tt < P.td[i]) { x = P.hx[i]; y = P.hy[i]; }
    else if (tt < rt) {
      const f = clamp((tt - P.td[i]) / P.dur[i], 0, 1);
      const fx = 1 - (1 - f) * (1 - f), fy = f * f;
      x = P.hx[i] + (P.rx[i] - P.hx[i]) * fx + Math.sin(tt * 9 + i) * (1 - f) * 2;
      y = P.hy[i] + (P.ry[i] - P.hy[i]) * fy;
    } else {
      const u = clamp((tt - rt) / 1.4, 0, 1), e = u * u * (3 - 2 * u);
      x = P.rx[i] + (P.hx[i] - P.rx[i]) * e; y = P.ry[i] + (P.hy[i] - P.ry[i]) * e;
    }
    const ix = x | 0, iy = y | 0, c = P.col[i];
    for (let dy = 0; dy < BS; dy++) {
      const yy = iy + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = 0; dx < BS; dx++) { const xx = ix + dx; if (xx >= 0 && xx < W) buf[yy * W + xx] = c; }
    }
  }
}

// ---------- React components ----------
export const Fog: React.FC<{ run: boolean }> = ({ run }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !run || reduceMotion()) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const mk: Mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const sprite = makePuff(mk, 256, [236, 229, 221], 14);
    const layers = makeFog(window.innerWidth < 768 ? 2 : 3);
    const q = 0.5;
    let W = 1, H = 1;
    const size = () => { W = cv.clientWidth || 1; H = cv.clientHeight || 1; cv.width = Math.round(W * q); cv.height = Math.round(H * q); ctx.setTransform(q, 0, 0, q, 0, 0); };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => { raf = requestAnimationFrame(frame); drawFog(ctx, sprite, layers, W, H, (now - t0) / 1000); };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); };
  }, [run]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] h-full w-full" />;
};

interface SmokeProps { run: boolean; iw: number; ih: number; pos: [number, number]; emitters: { nx: number; ny: number }[]; preset: 'roast' | 'steam' }
export const Smoke: React.FC<SmokeProps> = ({ run, iw, ih, pos, emitters, preset }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !run || reduceMotion()) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const mk: Mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const pr = PRESETS[preset];
    const sim = new SmokeSim(pr, [0, 1, 2].map(() => makePuff(mk, 128, pr.rgb, 7)));
    const q = 0.75;
    let W = 1, H = 1, k = 1;
    const size = () => { W = cv.clientWidth || 1; H = cv.clientHeight || 1; k = clamp(H / 900, 0.6, 1.5); cv.width = Math.round(W * q); cv.height = Math.round(H * q); ctx.setTransform(q, 0, 0, q, 0, 0); };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    const em = () => emitters.map((e) => coverPoint(W, H, iw, ih, pos[0], pos[1], e.nx, e.ny));
    for (let i = 0; i < 40; i++) sim.step(0.1, em(), k); // start already smoking
    let last = performance.now(), raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.step(dt, em(), k);
      sim.draw(ctx, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); };
  }, [run, iw, ih, pos[0], pos[1], emitters, preset]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
};

interface PowderProps { run: boolean; src: string; alt: string; className?: string; style?: React.CSSProperties }
export const PowderGrind: React.FC<PowderProps> = ({ run, src, alt, className, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [plain, setPlain] = useState(false);
  const runRef = useRef(run);
  const t0 = useRef(0);
  useEffect(() => { runRef.current = run; t0.current = performance.now(); }, [run]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (reduceMotion()) { setPlain(true); return; }
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) { setPlain(true); return; }
    let raf = 0, dead = false, P: Powder | null = null, buf: Uint32Array | null = null, imgData: ImageData | null = null, builtW = 0;
    const img = new Image();
    const build = () => {
      const cssW = cv.clientWidth;
      if (!cssW || !img.naturalWidth || cssW === builtW) return;
      builtW = cssW;
      const K = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(cssW * K), H = Math.round((W * img.naturalHeight) / img.naturalWidth);
      cv.width = W; cv.height = H;
      ctx.drawImage(img, 0, 0, W, H);
      P = buildPowder(ctx.getImageData(0, 0, W, H).data, W, H, 3);
      imgData = ctx.createImageData(W, H);
      buf = new Uint32Array(imgData.data.buffer);
    };
    img.onload = () => { if (dead) return; build(); loop(); };
    img.onerror = () => setPlain(true);
    img.src = src;
    const ro = new ResizeObserver(build);
    ro.observe(cv);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!P || !buf || !imgData) return;
      const tt = runRef.current ? ((performance.now() - t0.current) / 1000) % POWDER_T.cycle : 0;
      if (tt < POWDER_T.intact || tt > POWDER_T.end) { ctx.drawImage(img, 0, 0, P.W, P.H); return; }
      powderFrame(P, buf, tt);
      ctx.putImageData(imgData, 0, 0);
    };
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [src]);
  if (plain) return <img src={src} alt={alt} decoding="async" loading="lazy" className={className} style={style} />;
  return <canvas ref={ref} role="img" aria-label={alt} width={643} height={299} className={className} style={style} />;
};
