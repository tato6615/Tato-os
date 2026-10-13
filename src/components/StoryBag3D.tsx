import React, { useEffect, useRef } from 'react';
import { ASSETS, ROAST_PROFILES } from '../data/coffeeData';
import { RoastType } from '../types';
import type { Material, Mesh } from 'three';

// 3D layer for the horizontal story on "/". It sits above the scene photos and under the copy.
// It reads the story's scroll position (posRef = scrollLeft / viewport width, 0..6) and:
//   scene 5 (roast):  a cloud of beans swirls on the empty right side
//   scene 6 (roasts): the cloud spreads behind the cards; its colour follows the hovered roast
//   scene 7 (order):  the beans pour into a TATO bag that assembles itself next to the call to action
// three.js is imported only when the story reaches scene 4, so the first screen stays light.
// If WebGL fails, onReady(false) is never called and the original bag photo stays.

interface Props {
  posRef: React.MutableRefObject<number>;
  roast: RoastType;
  onReady: (ok: boolean) => void;
}

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const StoryBag3D: React.FC<Props> = ({ posRef, roast, onReady }) => {
  const cv = useRef<HTMLCanvasElement>(null);
  const roastRef = useRef<RoastType>(roast);
  roastRef.current = roast;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        if (disposed || !cv.current) return;
        const canvas = cv.current;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const mobile = window.innerWidth < 768;
        const R = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true });
        R.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
        cam.position.set(0, 0.4, 10);
        scene.add(new THREE.HemisphereLight(0xffe6d0, 0x1a0e08, 0.85));
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

        // kraft bag texture with the real wolf logo, tinted dark
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
          const ls = g as unknown as { letterSpacing: string };
          if ('letterSpacing' in g) ls.letterSpacing = '18px';
          g.fillText('TATO', 265, 520);
          g.font = '400 24px monospace';
          if ('letterSpacing' in g) ls.letterSpacing = '4px';
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
        bag.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.3, 0.75), new THREE.MeshStandardMaterial({ map: kraft, roughness: 0.92 })));
        const fold = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 0.3), new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.95 }));
        bag.add(fold);
        const tie = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 }));
        tie.position.z = 0.18;
        fold.add(tie);
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshStandardMaterial({ color: 0xff5e1a, emissive: 0xff5e1a, emissiveIntensity: 0.35, roughness: 0.6 }));
        bag.add(lab);

        // beans: colour follows the roast the visitor is pointing at
        const N = mobile ? 90 : 160;
        const beanMat = new THREE.MeshStandardMaterial({ color: 0x824424, roughness: 0.45, emissive: 0xff5e1a, emissiveIntensity: 0.1 });
        const beans = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 14, 10), beanMat, N);
        spin.add(beans);
        const B = Array.from({ length: N }, () => ({ a: Math.random() * 6.283, y: (Math.random() - 0.5) * 3.4, r: 1.6 + Math.random() * 1.7, s: 0.2 + Math.random() * 0.5, p: Math.random() * 6.283 }));
        const d = new THREE.Object3D();
        const target = new THREE.Color();

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

        let W = 1, H = 1;
        const size = () => {
          W = canvas.clientWidth || window.innerWidth;
          H = canvas.clientHeight || window.innerHeight;
          R.setSize(W, H, false);
          cam.aspect = W / H;
          cam.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(size);
        ro.observe(canvas);
        size();

        let px = 0, py = 0, mx = 0, my = 0, cur = posRef.current;
        const onMove = (e: PointerEvent) => {
          px = e.clientX / window.innerWidth - 0.5;
          py = e.clientY / window.innerHeight - 0.5;
        };
        window.addEventListener('pointermove', onMove, { passive: true });

        let raf = 0;
        const halfTan = Math.tan((35 / 2) * (Math.PI / 180)) * 10;
        const frame = (now: number) => {
          raf = requestAnimationFrame(frame);
          const t = now / 1000;
          cur += (posRef.current - cur) * (reduce ? 1 : 0.12);
          const p = cur;
          // visible from scene 5; fainter behind the roast cards; full for the bag
          const vis = ss(3.7, 4.3, p) * (1 - 0.6 * ss(4.5, 5, p) * (1 - ss(5.2, 5.8, p)));
          canvas.style.opacity = String(vis);
          if (vis < 0.01) return;
          if (!reduce) {
            mx += (px - mx) * 0.05;
            my += (py - my) * 0.05;
          }
          const mob = W < 768;
          const xr = mob ? 0 : halfTan * (W / H) * 0.52;
          root.position.x = xr * (1 - ss(4.3, 5, p) * (1 - ss(5.2, 6, p)));
          root.position.y = mob ? -1.35 : 0;
          root.scale.setScalar(mob ? 0.72 : 1);
          const bagAmt = ss(5.4, 6, p);
          const e = 1 - ss(5.5, 6, p);
          const spread = 1 - ss(5.3, 6, p);
          bag.visible = bagAmt > 0.01;
          bag.scale.setScalar(Math.max(0.001, bagAmt));
          fold.position.y = 1.28 + e * 0.9;
          lab.position.set(0, e * 0.4, 0.4 + e * 1.1);
          lab.rotation.y = e * 0.3;
          spin.rotation.y = (6 - Math.min(p, 6)) * 1.4 - 0.25 + mx * 0.5 + (reduce ? 0 : Math.sin(t * 0.5) * 0.08);
          spin.rotation.x = my * 0.2;
          target.set(ROAST_PROFILES.find((r) => r.id === roastRef.current)?.colorHex ?? '#824424');
          beanMat.color.lerp(target, 0.1);
          for (let i = 0; i < N; i++) {
            const b = B[i];
            const r = 0.35 + (b.r - 0.35) * spread;
            const a = b.a + (reduce ? 0 : t * b.s * (0.3 + spread));
            d.position.set(Math.cos(a) * r, b.y * spread, Math.sin(a) * r);
            d.rotation.set(a, b.p + t * 0.5, 0);
            d.scale.setScalar(0.1 + 0.9 * spread);
            d.scale.y *= 0.68;
            d.updateMatrix();
            beans.setMatrixAt(i, d.matrix);
          }
          beans.instanceMatrix.needsUpdate = true;
          sh.scale.setScalar(0.6 + 0.8 * Math.max(bagAmt, spread * 0.5));
          R.render(scene, cam);
        };
        raf = requestAnimationFrame(frame);
        onReady(true);

        cleanup = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('pointermove', onMove);
          ro.disconnect();
          scene.traverse((o) => {
            const m = o as Mesh;
            m.geometry?.dispose();
            const mat = m.material as Material | Material[] | undefined;
            (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
          });
          kraft.dispose();
          shTex.dispose();
          R.dispose();
        };
        if (disposed) cleanup();
      } catch {
        onReady(false);
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={cv} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] h-full w-full opacity-0" />;
};

export default StoryBag3D;
