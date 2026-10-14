import React, { useEffect, useRef } from 'react';

/**
 * ถุงกาแฟสีดำหมุน 3D (turntable): 9 เฟรมภาพถุงจริงคนละมุม + โลโก้ TATO
 * ลากซ้าย/ขวา (มือถือ) หรือเลื่อนเมาส์ (คอม) เพื่อหมุน, ปล่อยแล้วแกว่งช้าๆ เอง
 * เฟรมเรียงตามองศา: หน้าตรง → ข้าง → หลัง  แล้ว cross-fade ระหว่างเฟรมให้ลื่น
 */
const N = 9;
const FW = 793;
const FH = 1240;
const SRC = Array.from({ length: N }, (_, i) => `/images/bag3d/f${i}.webp`);
const REST = 1.1; // ท่าพัก: เห็นหน้าถุงเอียงเล็กน้อย
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

interface Props {
  active: boolean;
  height: string;
  label: string;
  hint: string;
}

export default function BagTurntable({ active, height, label, hint }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const imgs = useRef<HTMLImageElement[]>([]);
  const s = useRef({ pos: REST, target: REST, drag: false, hover: false, lastX: 0, last: 0 });

  const draw = () => {
    const c = cv.current; const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, FW, FH);
    const p = clamp(s.current.pos, 0, N - 1);
    const i = Math.floor(p); const f = p - i;
    const a = imgs.current[i];
    if (a?.complete && a.naturalWidth) ctx.drawImage(a, 0, 0, FW, FH);
    const b = imgs.current[i + 1];
    if (f > 0.002 && b?.complete && b.naturalWidth) { ctx.globalAlpha = f; ctx.drawImage(b, 0, 0, FW, FH); ctx.globalAlpha = 1; }
  };

  useEffect(() => {
    imgs.current = SRC.map((src) => { const im = new Image(); im.decoding = 'async'; im.src = src; im.onload = draw; return im; });
    draw();
    return () => { imgs.current = []; };
  }, []);

  useEffect(() => {
    if (!active) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => {
      const st = s.current;
      const idle = !st.drag && !st.hover && now - st.last > 2200;
      if (idle) st.target = reduce ? REST : REST + 0.9 * Math.sin((now - t0) / 1800);
      st.pos += (st.target - st.pos) * 0.12;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const touch = () => { s.current.last = performance.now(); if (hintRef.current) hintRef.current.style.opacity = '0'; };
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    s.current.drag = true; s.current.lastX = e.clientX; touch();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = s.current; const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (st.drag) {
      st.target = clamp(st.target - ((e.clientX - st.lastX) / r.width) * 3.6, 0, N - 1);
      st.lastX = e.clientX; touch();
    } else if (e.pointerType === 'mouse') {
      st.hover = true; st.target = 0.2 + clamp((e.clientX - r.left) / r.width, 0, 1) * 3.0; touch();
    }
  };
  const onUp = () => { s.current.drag = false; s.current.last = performance.now(); };
  const onLeave = () => { s.current.hover = false; s.current.last = performance.now(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { s.current.target = clamp(s.current.target + 0.6, 0, N - 1); touch(); }
    if (e.key === 'ArrowLeft') { s.current.target = clamp(s.current.target - 0.6, 0, N - 1); touch(); }
  };

  return (
    <span className="relative inline-block select-none">
      {/* แสงหลังถุง ให้ถุงดำแยกจากพื้นหลังมืด */}
      <span aria-hidden="true" className="pointer-events-none absolute -inset-[28%] z-0" style={{ background: 'radial-gradient(closest-side, rgba(255,160,90,.30), rgba(255,94,26,.10) 55%, transparent 76%)' }} />
      {/* เงาพื้น */}
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[-1.5%] z-0 w-[82%] h-[5%] rounded-[50%] bg-black/80 blur-xl" />
      <canvas ref={cv} width={FW} height={FH} role="img" aria-label={label} tabIndex={0}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onLeave} onKeyDown={onKey}
        className="relative z-[1] block max-w-none cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-[#ffb59c] focus-visible:outline-offset-4"
        style={{ height, width: 'auto', aspectRatio: `${FW} / ${FH}`, touchAction: 'pan-y', filter: 'drop-shadow(0 24px 34px rgba(0,0,0,.6))' }} />
      <span ref={hintRef} aria-hidden="true" className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[-9%] z-[2] whitespace-nowrap font-['Anuphan'] text-[12px] md:text-[13px] tracking-wide text-[#ffb59c]/85 transition-opacity duration-500">
        ↔ {hint}
      </span>
    </span>
  );
}
