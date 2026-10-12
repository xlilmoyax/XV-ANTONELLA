/**
 * XV-ANTONELLA · Música de fondo (MP3 local, sin YouTube ni permisos externos).
 * Canción elegida: BTOB «For You» (OST de Goblin, Warner Music Korea,
 * https://youtu.be/A1aRHQ6EnXE) — obra comercial con derechos de autor.
 * Solo puede usarse con un archivo autorizado (compra/descarga con licencia).
 * Archivo autorizado esperado: `public/audio/musica-xv.mp3` (servido en
 * `<base>/audio/musica-xv.mp3`). Sin ese archivo NO hay música: el componente
 * lo informa en vez de simularla. Componente compartido por ambas tarjetas:
 * una sola instancia por página; al cambiar de ruta se libera y no se superpone.
 * Se intenta autoplay al abrir; los navegadores lo bloquean sin interacción
 * previa: ante el bloqueo queda el control manual visible (nunca un estado
 * falso de reproducción).
 */
import { useEffect, useRef, useState } from 'react';

const RUTA_AUDIO = `${import.meta.env.BASE_URL}audio/musica-xv.mp3`;
const VOL_KEY = 'xv-musica-vol';

function leerVol(): number {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 70;
  } catch {
    return 70;
  }
}

export default function MusicaFondo() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState(false);
  const [lista, setLista] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [vol, setVol] = useState(leerVol);

  useEffect(() => {
    let vivo = true;
    const audio = new Audio();
    audio.preload = 'none';
    audio.loop = true;
    audio.volume = leerVol() / 100;
    audioRef.current = audio;

    const alPlay = () => vivo && setSonando(true);
    const alPause = () => vivo && setSonando(false);
    const alError = () => {
      if (vivo) setFallo('No se pudo reproducir la música. Revisá tu conexión.');
    };
    audio.addEventListener('play', alPlay);
    audio.addEventListener('pause', alPause);
    audio.addEventListener('error', alError);

    // Detección honesta del archivo (sin inventar éxito): HEAD barato al montar.
    // 404/archivo ausente → mensaje con la ruta esperada, no promesa falsa.
    fetch(RUTA_AUDIO, { method: 'HEAD', cache: 'no-store' }).then(
      (r) => {
        if (!vivo) return;
        if (r.ok) {
          audio.src = RUTA_AUDIO;
          setLista(true);
          // Intento de autoplay: si el navegador lo bloquea (sin interacción
          // previa), se ignora el rechazo y queda el control manual visible.
          try {
            const intento = audio.play();
            if (intento && typeof intento.catch === 'function') {
              intento.catch(() => { /* bloqueo de autoplay: control manual */ });
            }
          } catch { /* sin autoplay: control manual */ }
        } else {
          setFallo('Falta el archivo de música (audio/musica-xv.mp3). Avisá al administrador.');
        }
      },
      () => {
        if (vivo) setFallo('No se pudo verificar la música. Revisá tu conexión.');
      },
    );

    return () => {
      vivo = false;
      audio.removeEventListener('play', alPlay);
      audio.removeEventListener('pause', alPause);
      audio.removeEventListener('error', alError);
      try {
        audio.pause();
      } catch { /* ya pausado */ }
      audio.removeAttribute('src');
      audioRef.current = null;
    };
  }, []);

  const alternar = () => {
    const audio = audioRef.current;
    // Sin archivo verificado no hay nada que reproducir (no finge sonido).
    if (!audio || !lista || fallo) return;
    try {
      if (sonando) {
        audio.pause();
      } else {
        // Evita "reproducir" en silencio: si el volumen quedó en cero, se sube.
        if (vol === 0) cambiarVol(50);
        else audio.volume = vol / 100;
        const promesa = audio.play();
        if (promesa && typeof promesa.catch === 'function') {
          promesa.catch(() => setFallo('El navegador bloqueó la reproducción. Tocá de nuevo para escuchar.'));
        }
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
      if (audioRef.current) audioRef.current.volume = nv / 100;
    } catch { /* sin reproductor aún */ }
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-[#d6bd7a]/50 bg-[#0e241b]/85 py-2 pl-2 pr-3 shadow-lg backdrop-blur"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
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
