import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { ASSETS, ROAST_PROFILES } from '../data/coffeeData';
import { RoastType } from '../types';

// Scroll-driven 3D "exploded bag" section (Three.js + GSAP ScrollTrigger).
// - three / gsap are imported dynamically, so they load only when the section nears the viewport.
// - Copy uses only facts already on the site: single-origin Arabica, Doi Wiang Pa 1,500 m,
//   roasted to order, 3 roast levels, 650 baht/kg (550 for a café's first order), min 0.5 kg.
// - Falls back to the static bag photo when WebGL is unavailable. Honors prefers-reduced-motion.

interface Bag3DProps {
  roast: RoastType;
  onRoast: (r: RoastType) => void;
  onOrder: (r: RoastType) => void;
}

const STEPS = 4;

const Bag3D: React.FC<Bag3DProps> = ({ roast, onRoast, onOrder }) => {
  const { language } = useLanguage();
  const tr = (en: string, th: string) => (language === 'th' ? th : en);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wrap = useRef<HTMLElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const roastRef = useRef<RoastType>(roast);
  roastRef.current = roast;
  const [step, setStep] = useState(0);
  const [ok, setOk] = useState(true);
  const profile = ROAST_PROFILES.find((p) => p.id === roast) ?? ROAST_PROFILES[0];

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          io.disconnect();
          void init();
        }
      },
      { rootMargin: '500px' }
    );
    io.observe(el);

    async function init() {
      try {
        const [THREE, gsapMod, stMod] = await Promise.all([
          import('three'),
          import('gsap'),
          import('gsap/ScrollTrigger'),
        ]);
        if (disposed || !cv.current || !wrap.current) return;
        const { gsap } = gsapMod;
        const { ScrollTrigger } = stMod;
        gsap.registerPlugin(ScrollTrigger);

        const mobile = window.innerWidth < 768;
        const canvas = cv.current;
        const R = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true });
        R.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
        cam.position.set(0, 0.4, 10);
        scene.add(new THREE.HemisphereLight(0xffe6d0, 0x1a0e08, 0.8));
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(3, 5, 6);
        scene.add(key);
        const rim = new THREE.PointLight(0xff5e1a, 2, 20);
        rim.position.set(-4, 1, -2);
        scene.add(rim);
        const root = new THREE.Group();
        const spin = new THREE.Group();
        root.add(spin);
        scene.add(root);

        // kraft bag texture + the real wolf logo, tinted dark
        const kc = document.createElement('canvas');
        kc.width = 512;
        kc.height = 820;
        const g = kc.getContext('2d')!;
        const paint = (wolf?: HTMLImageElement) => {
          const gr = g.createLinearGradient(0, 0, 512, 0);
          gr.addColorStop(0, '#b88a5c');
          gr.addColorStop(0.5, '#cfa573');
          gr.addColorStop(1, '#b88a5c');
          g.fillStyle = gr;
          g.fillRect(0, 0, 512, 820);
          for (let i = 0; i < 900; i++) {
            g.fillStyle = `rgba(90,55,25,${Math.random() * 0.08})`;
            g.fillRect(Math.random() * 512, Math.random() * 820, 2, Math.random() * 14);
          }
          if (wolf) {
            const t = document.createElement('canvas');
            t.width = wolf.naturalWidth;
            t.height = wolf.naturalHeight;
            const tg = t.getContext('2d')!;
            tg.drawImage(wolf, 0, 0);
            tg.globalCompositeOperation = 'source-in';
            tg.fillStyle = '#1c120c';
            tg.fillRect(0, 0, t.width, t.height);
            const w = 210, h = (210 * t.height) / t.width;
            g.drawImage(t, 256 - w / 2, 250 - h / 2, w, h);
          }
          g.fillStyle = '#1c120c';
          g.textAlign = 'center';
          g.font = '700 92px sans-serif';
          if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = '18px';
          g.fillText('TATO', 265, 520);
          g.font = '400 24px monospace';
          if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = '4px';
          g.fillText('DOI WIANG PA · 1,500 M', 258, 575);
        };
        paint();
        const kraft = new THREE.CanvasTexture(kc);
        kraft.anisotropy = 4;
        const wolfImg = new Image();
        wolfImg.onload = () => {
          paint(wolfImg);
          kraft.needsUpdate = true;
        };
        wolfImg.src = ASSETS.logo;

        const bag = new THREE.Group();
        spin.add(bag);
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.3, 0.75), new THREE.MeshStandardMaterial({ map: kraft, roughness: 0.92 }));
        bag.add(body);
        const fold = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 0.3), new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.95 }));
        bag.add(fold);
        const tie = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 }));
        tie.position.z = 0.18;
        fold.add(tie);
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshStandardMaterial({ color: 0xff5e1a, emissive: 0xff5e1a, emissiveIntensity: 0.35, roughness: 0.6 }));
        bag.add(lab);

        // beans: colour follows the selected roast
        const N = mobile ? 90 : 170;
        const beanMat = new THREE.MeshStandardMaterial({ color: 0x824424, roughness: 0.45, emissive: 0xff5e1a, emissiveIntensity: 0.1 });
        const beans = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 14, 10), beanMat, N);
        spin.add(beans);
        const B = Array.from({ length: N }, () => ({ a: Math.random() * 6.283, y: (Math.random() - 0.5) * 3.2, r: 1.5 + Math.random() * 1.5, s: 0.2 + Math.random() * 0.5, p: Math.random() * 6.283 }));
        const d = new THREE.Object3D();
        const target = new THREE.Color();

        // soft ground shadow
        const sc = document.createElement('canvas');
        sc.width = sc.height = 128;
        const sg = sc.getContext('2d')!;
        const rg = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
        rg.addColorStop(0, 'rgba(0,0,0,.65)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        sg.fillStyle = rg;
        sg.fillRect(0, 0, 128, 128);
        const shTex = new THREE.CanvasTexture(sc);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2;
        sh.position.y = -1.9;
        root.add(sh);

        // scroll state, driven by one scrubbed GSAP timeline
        const X = mobile ? 0 : 1.9;
        const S = { e: reduce ? 0.7 : 0, ry: reduce ? 0.8 : -0.45, x: X, px: 0, py: 0 };
        let visible = true;
        const st: ScrollTrigger[] = [];
        if (!reduce) {
          const tl = gsap.timeline({ scrollTrigger: { trigger: wrap.current, start: 'top top', end: 'bottom bottom', scrub: 1 } });
          tl.to(S, { e: 0.9, ry: 1.2, duration: 1, ease: 'power1.inOut' })
            .to(S, { e: 1, ry: 2.8, duration: 1, ease: 'power1.inOut' })
            .to(S, { e: 0, ry: 6.283 - 0.45, duration: 1, ease: 'power1.inOut' });
          const stp = ScrollTrigger.create({
            trigger: wrap.current,
            start: 'top top',
            end: 'bottom bottom',
            onUpdate: (s) => setStep(Math.min(STEPS - 1, Math.floor(s.progress * STEPS))),
          });
          const vis = ScrollTrigger.create({ trigger: wrap.current, start: 'top bottom', end: 'bottom top', onToggle: (s) => (visible = s.isActive) });
          st.push(stp, vis);
          if (tl.scrollTrigger) st.push(tl.scrollTrigger);
        }

        const onMove = (e: PointerEvent) => {
          S.px = e.clientX / window.innerWidth - 0.5;
          S.py = e.clientY / window.innerHeight - 0.5;
        };
        window.addEventListener('pointermove', onMove, { passive: true });

        const size = () => {
          const host = canvas.parentElement!;
          const w = host.clientWidth, h = host.clientHeight;
          R.setSize(w, h, false);
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
          root.scale.setScalar(w < 768 ? 0.7 : 1);
          root.position.y = w < 768 ? 1.1 : 0;
          S.x = w < 768 ? 0 : X;
        };
        const ro = new ResizeObserver(size);
        ro.observe(canvas.parentElement!);
        size();

        let mx = 0, my = 0;
        const frame = (t: number) => {
          if (!visible) return;
          if (!reduce) {
            mx += (S.px - mx) * 0.05;
            my += (S.py - my) * 0.05;
          }
          spin.rotation.y = S.ry + mx * 0.5 + (reduce ? 0 : Math.sin(t * 0.5) * 0.08);
          spin.rotation.x = my * 0.2;
          root.position.x = S.x;
          fold.position.y = 1.28 + S.e * 0.9;
          lab.position.set(0, S.e * 0.4, 0.4 + S.e * 1.1);
          lab.rotation.y = S.e * 0.3;
          target.set(ROAST_PROFILES.find((p) => p.id === roastRef.current)?.colorHex ?? '#824424');
          beanMat.color.lerp(target, 0.1);
          for (let i = 0; i < N; i++) {
            const b = B[i];
            const r = 0.3 + (b.r - 0.3) * S.e;
            const a = b.a + (reduce ? 0 : t * b.s * S.e);
            d.position.set(Math.cos(a) * r, b.y * S.e, Math.sin(a) * r);
            d.rotation.set(a, b.p + t * 0.5, 0);
            d.scale.setScalar(0.1 + S.e * 0.9);
            d.scale.y *= 0.68;
            d.updateMatrix();
            beans.setMatrixAt(i, d.matrix);
          }
          beans.instanceMatrix.needsUpdate = true;
          sh.scale.setScalar(1 + S.e * 0.4);
          R.render(scene, cam);
        };
        gsap.ticker.add(frame);

        cleanup = () => {
          gsap.ticker.remove(frame);
          window.removeEventListener('pointermove', onMove);
          ro.disconnect();
          st.forEach((s) => s.kill());
          scene.traverse((o) => {
            const m = o as import('three').Mesh;
            m.geometry?.dispose();
            const mat = m.material as import('three').Material | import('three').Material[] | undefined;
            (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
          });
          kraft.dispose();
          shTex.dispose();
          R.dispose();
        };
        if (disposed) cleanup();
      } catch {
        setOk(false);
      }
    }

    return () => {
      disposed = true;
      io.disconnect();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roastName = (r: (typeof ROAST_PROFILES)[number]) => (language === 'th' ? r.nameThai : r.name);
  const Cap: React.FC<{ i: number; eyebrow: string; title: string; children?: React.ReactNode }> = ({ i, eyebrow, title, children }) => {
    const on = reduce || step === i;
    return (
      <div
        className={`${reduce ? 'relative mb-10' : 'absolute inset-x-0 bottom-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2'} transition-all duration-700 ${on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'}`}
        aria-hidden={!on}
      >
        <span className="font-mono text-[12px] text-[#ffb59c] uppercase tracking-widest block mb-2">{eyebrow}</span>
        <h2 className="text-3xl md:text-5xl font-medium text-[#e6e1df] tracking-tight leading-tight mb-4">{title}</h2>
        {children}
      </div>
    );
  };
  const body = 'text-[#e3beb3] text-base md:text-lg leading-relaxed max-w-md';

  return (
    <section ref={wrap} id="bag-3d" aria-label={tr('3D exploded view of the TATO bag', 'ถุงกาแฟ TATO แบบ 3 มิติ')} className={`relative w-full bg-[#0f0e0d] ${reduce ? 'py-20' : 'h-[420vh]'}`}>
      <div className={`${reduce ? 'relative h-[60vh]' : 'sticky top-0 h-screen'} overflow-hidden`}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(255,94,26,.14),transparent_60%)]" />
        {ok ? (
          <canvas ref={cv} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
        ) : (
          <img src={ASSETS.storyBag} alt="" loading="lazy" className="absolute right-0 top-0 h-full w-full md:w-1/2 object-cover opacity-70" />
        )}
        {!reduce && (
          <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-10" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={`w-1.5 rounded-full transition-all duration-500 ${i === step ? 'h-8 bg-[#ff5e1a]' : 'h-1.5 bg-[#5b4138]'}`} />
            ))}
          </div>
        )}
        {!reduce && (
          <div className="absolute inset-0 max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20 pb-[9vh] md:pb-0 z-10 pointer-events-none">
            <div className="relative h-full md:w-[44%] [&_button]:pointer-events-auto">{renderCaps()}</div>
          </div>
        )}
      </div>
      {reduce && <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20 mt-10">{renderCaps()}</div>}
    </section>
  );

  function renderCaps() {
    return (
      <>
        <Cap i={0} eyebrow="TATO · DOI WIANG PA" title={tr('One bag.\nTaken apart.', 'ถุงเดียว\nแยกให้ดูทีละชั้น')}>
          <p className={`${body} whitespace-pre-line`}>{tr('100% Arabica, single-origin, roasted to order. Keep scrolling to open it up.', 'อาราบิก้า 100% ซิงเกิลออริจิน คั่วสดตามออเดอร์ เลื่อนต่อเพื่อเปิดดูข้างใน')}</p>
        </Cap>
        <Cap i={1} eyebrow={tr('01 · Origin', '01 · ต้นทาง')} title={tr('One mountain, 1,500 m', 'ภูเขาลูกเดียว 1,500 เมตร')}>
          <p className={body}>{tr('Single-origin Arabica from Doi Wiang Pa, Chiang Mai. Nothing blended in from elsewhere.', 'อาราบิก้าซิงเกิลออริจินจากดอยเวียงผา เชียงใหม่ ไม่ผสมแหล่งอื่น')}</p>
        </Cap>
        <Cap i={2} eyebrow={tr('02 · Roast', '02 · ระดับการคั่ว')} title={tr('Pick your roast', 'เลือกระดับการคั่ว')}>
          <div className="flex gap-2 mb-5 pointer-events-auto">
            {ROAST_PROFILES.map((r) => (
              <button key={r.id} type="button" onClick={() => onRoast(r.id)} aria-pressed={r.id === roast} className={`px-4 py-2 rounded-full border text-sm font-semibold transition-colors ${r.id === roast ? 'bg-[#ff5e1a] border-[#ff5e1a] text-[#390c00]' : 'border-[#5b4138] text-[#e6e1df] hover:border-[#ffb59c]'}`}>
                {roastName(r)}
              </button>
            ))}
          </div>
          <p className={body}>{profile.notes.join(' · ')}</p>
        </Cap>
        <Cap i={3} eyebrow={tr('03 · Order', '03 · สั่งซื้อ')} title={tr('From the mountain to your cup', 'ชิมจากดอยถึงถ้วยของคุณ')}>
          <p className={`${body} mb-6`}>{tr('650 baht/kg · from 0.5 kg. Cafés: 550 baht/kg on the first order.', '650 บาท/กก. · ขั้นต่ำ 0.5 กก. ร้านกาแฟออเดอร์แรก 550 บาท/กก.')}</p>
          <button type="button" onClick={() => onOrder(roast)} className="pointer-events-auto bg-[#ff5e1a] text-[#390c00] font-bold rounded-full px-8 py-4 hover:-translate-y-0.5 transition-transform">
            {tr(`Order ${profile.name.toLowerCase()} roast`, `สั่งกาแฟ${profile.nameThai}`)}
          </button>
        </Cap>
      </>
    );
  }
};

export default Bag3D;
