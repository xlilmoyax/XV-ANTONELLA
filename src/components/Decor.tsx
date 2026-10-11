import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/* Créditos: fondos Pexels (licencia libre) — bosque-sendero: Tom Christensen;
   jardin-esmeralda: Freek Wolsink. Figura: Pexels 19230138. */

/* ---------- Fondo fotográfico con velos de legibilidad ---------- */
export function FondoFoto({
  src,
  alt = '',
  width,
  height,
  eager = false,
  scrim = 'suave',
  pos = 'center',
}: {
  src: string;
  alt?: string;
  width: number;
  height: number;
  eager?: boolean;
  scrim?: 'suave' | 'fuerte';
  pos?: string;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={eager ? 'high' : undefined}
        className="h-full w-full object-cover"
        style={{ objectPosition: pos }}
      />
      {/* Velos oscuros: la luz dirige sin competir con los textos */}
      <div
        className={
          scrim === 'fuerte'
            ? 'absolute inset-0 bg-gradient-to-b from-[#0e241b]/85 via-[#0e241b]/45 to-[#0e241b]/90'
            : 'absolute inset-0 bg-gradient-to-b from-[#0e241b]/70 via-[#0e241b]/30 to-[#0e241b]/80'
        }
      />
      <div className="vineta absolute inset-0" />
    </div>
  );
}

/* ---------- Esquina botánica dorada (D) ---------- */
function Esquina({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`pointer-events-none absolute h-12 w-12 sm:h-14 sm:w-14 text-[#d6bd7a] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M60 4 H22 Q8 8 6 22 V60" opacity="0.9" />
      <path d="M20 20 Q34 22 40 36 Q28 34 20 20 Z" fill="currentColor" opacity="0.28" stroke="none" />
      <path d="M22 44 Q30 32 44 30 Q38 42 22 44 Z" fill="currentColor" opacity="0.22" stroke="none" />
      <circle cx="52" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="52" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ---------- Marco botánico dorado (D) ---------- */
export function MarcoBotanico({ children }: { children: ReactNode }) {
  return (
    <div className="marco-botanico rounded-2xl bg-[#0e241b]/55 px-5 py-6 sm:px-8 sm:py-8">
      <Esquina className="left-2 top-2" />
      <Esquina className="right-2 top-2 rotate-90" />
      <Esquina className="bottom-2 right-2 rotate-180" />
      <Esquina className="bottom-2 left-2 -rotate-90" />
      {children}
    </div>
  );
}

/* ---------- Luciérnagas / polvo dorado (E): canvas liviano ---------- */
export function Luciernagas({ densidad = 1 }: { densidad?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const canvas = ref.current;
    if (!canvas || !canvas.parentElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

    type P = { x: number; y: number; r: number; vx: number; vy: number; f: number; p: number };
    let puntos: P[] = [];

    const sembrar = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.max(10, Math.min(36, Math.floor(((w * h) / 26000) * densidad)));
      puntos = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.8 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.22,
        vy: -0.08 - Math.random() * 0.22,
        f: 0.6 + Math.random() * 1.4,
        p: Math.random() * Math.PI * 2,
      }));
    };

    let t = 0;
    const dibujar = () => {
      raf = requestAnimationFrame(dibujar);
      if (!visible) return;
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      for (const q of puntos) {
        q.x += q.vx + Math.sin(t * q.f + q.p) * 0.12;
        q.y += q.vy;
        if (q.y < -6) {
          q.y = h + 6;
          q.x = Math.random() * w;
        }
        if (q.x < -6) q.x = w + 6;
        if (q.x > w + 6) q.x = -6;
        const brillo = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * q.f * 1.7 + q.p));
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(236, 220, 176, ${(0.75 * brillo).toFixed(3)})`;
        ctx.shadowColor = 'rgba(214, 189, 122, 0.9)';
        ctx.shadowBlur = 8 * brillo;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    const ro = new ResizeObserver(sembrar);
    ro.observe(canvas.parentElement);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);
    sembrar();
    dibujar();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [densidad, reduceMotion]);

  if (reduceMotion) return null;
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/* ---------- Aparición suave al entrar en pantalla ---------- */
export function Transicion({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
