/**
 * XV-ANTONELLA · Música de fondo (YouTube, pista provista por la familia).
 * ID por defecto de la URL compartida; editable desde el panel con la clave
 * de contenido `musica_video` (11 caracteres). Sin autoplay con sonido
 * (restricción de navegadores): suena tras el primer toque. Una sola
 * instancia por página; al cambiar de ruta se destruye y no se superpone.
 * Ante fallo de carga o video no disponible se muestra un mensaje útil
 * (nunca un estado falso de reproducción).
 */
import { useEffect, useRef, useState } from 'react';

export const VIDEO_POR_DEFECTO = 'i2dQiWLn4dE';
const VOL_KEY = 'xv-musica-vol';
const TIEMPO_MAX_CARGA_MS = 12000;

interface ReproductorYT {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  getVolume: () => number;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
            onError?: (e: { data: number }) => void;
          };
        },
      ) => ReproductorYT;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLista: Promise<void> | null = null;
function cargarApiYT(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!apiLista) {
    apiLista = new Promise<void>((resolver, rechazar) => {
      const anterior = window.onYouTubeIframeAPIReady;
      const tope = window.setTimeout(() => rechazar(new Error('timeout-api')), TIEMPO_MAX_CARGA_MS);
      window.onYouTubeIframeAPIReady = () => {
        window.clearTimeout(tope);
        anterior?.();
        resolver();
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => {
        window.clearTimeout(tope);
        rechazar(new Error('script-bloqueado'));
      };
      document.head.appendChild(s);
    });
  }
  return apiLista;
}

function idValido(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

export default function MusicaFondo({ videoId }: { videoId: string }) {
  const id = idValido(videoId) ? videoId : VIDEO_POR_DEFECTO;
  const contRef = useRef<HTMLDivElement>(null);
  const repRef = useRef<ReproductorYT | null>(null);
  const listoRef = useRef(false);
  const [sonando, setSonando] = useState(false);
  const [lista, setLista] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [vol, setVol] = useState(() => {
    try {
      const v = Number(localStorage.getItem(VOL_KEY));
      return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 70;
    } catch {
      return 70;
    }
  });

  useEffect(() => {
    let vivo = true;
    listoRef.current = false;
    setLista(false);
    setSonando(false);
    setFallo(null);
    cargarApiYT().then(
      () => {
        if (!vivo || !contRef.current || !window.YT) return;
        try {
          const rep = new window.YT!.Player(contRef.current, {
            videoId: id,
            playerVars: { autoplay: 0, controls: 0, disablekb: 1, loop: 1, playlist: id, playsinline: 1, rel: 0 },
            events: {
              onReady: () => {
                if (!vivo) return;
                listoRef.current = true;
                try {
                  rep.setVolume(vol);
                } catch { /* sin volumen inicial disponible */ }
                setLista(true);
              },
              onStateChange: (e) => {
                if (!vivo) return;
                setSonando(e.data === 1);
              },
              onError: () => {
                if (!vivo) return;
                setFallo('No se pudo cargar la música (video no disponible o sin conexión).');
              },
            },
          });
          repRef.current = rep;
        } catch {
          if (vivo) setFallo('No se pudo iniciar el reproductor. Revisá tu conexión.');
        }
      },
      () => {
        if (vivo) setFallo('No se pudo cargar la música. Revisá tu conexión a internet.');
      },
    );
    return () => {
      vivo = false;
      try {
        repRef.current?.destroy();
      } catch { /* ya destruido */ }
      repRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const alternar = () => {
    const rep = repRef.current;
    if (!rep || !listoRef.current) return;
    try {
      if (sonando) {
        rep.pauseVideo();
      } else {
        // Evita "reproducir" en silencio: si el volumen quedó en cero, se sube.
        if (vol === 0) cambiarVol(50);
        rep.playVideo();
      }
    } catch {
      setFallo('No se pudo controlar la reproducción. Probá de nuevo.');
    }
  };

  const cambiarVol = (v: number) => {
    const nv = Math.max(0, Math.min(100, Math.round(v)));
    setVol(nv);
    try {
      localStorage.setItem(VOL_KEY, String(nv));
    } catch { /* almacenamiento no disponible */ }
    try {
      repRef.current?.setVolume(nv);
    } catch { /* sin reproductor aún */ }
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-[#d6bd7a]/50 bg-[#0e241b]/85 py-2 pl-2 pr-3 shadow-lg backdrop-blur"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div ref={contRef} aria-hidden="true" className="h-px w-px overflow-hidden opacity-0" />
      <button
        onClick={alternar}
        aria-pressed={sonando}
        aria-label={sonando ? 'Pausar música' : 'Reproducir música'}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gradient-to-b from-[#ecdcb0] to-[#b89b52] text-lg text-[#183b2d]"
      >
        <span aria-hidden="true">{sonando ? '⏸' : '♪'}</span>
      </button>
      <div className="flex flex-col gap-0.5 pr-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[#ecdcb0]" aria-live="polite">
          {fallo ? 'Sin música' : sonando ? 'Sonando' : lista ? 'Música' : 'Cargando…'}
        </span>
        {fallo ? (
          <span className="max-w-40 text-[10px] leading-tight text-red-200" role="alert">
            {fallo}
          </span>
        ) : (
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => cambiarVol(Number(e.target.value))}
            aria-label="Volumen de la música"
            className="w-24 accent-[#d6bd7a]"
          />
        )}
      </div>
    </div>
  );
}
