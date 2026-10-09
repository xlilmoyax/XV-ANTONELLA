import { useEffect, useState } from 'react';
import { fechaObjetivoISO } from '../xv/useEvent';
import type { EventVM } from '../xv/useEvent';

function partes(objetivo: Date) {
  const diff = objetivo.getTime() - Date.now();
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  return {
    dias: Math.floor(s / 86400),
    horas: Math.floor((s % 86400) / 3600),
    minutos: Math.floor((s % 3600) / 60),
    segundos: s % 60,
  };
}

export default function Countdown({ settings }: { settings: EventVM }) {
  const [t, setT] = useState(() => partes(fechaObjetivoISO(settings)));

  useEffect(() => {
    const id = setInterval(() => setT(partes(fechaObjetivoISO(settings))), 1000);
    return () => clearInterval(id);
  }, [settings]);

  if (!t) {
    return (
      <p className="font-serifada text-2xl text-center text-[#ecdcb0] px-6">
        ¡El gran día llegó! Gracias por acompañar a {settings.quinceanera} en esta noche mágica.
      </p>
    );
  }

  const celdas: Array<[string, number]> = [
    ['Días', t.dias],
    ['Horas', t.horas],
    ['Minutos', t.minutos],
    ['Segundos', t.segundos],
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-xl mx-auto" role="timer" aria-live="off">
      {celdas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="marco-dorado rounded-xl bg-[#0e241b]/60 px-1 py-3 sm:py-5 text-center">
          <div className="font-serifada text-3xl sm:text-5xl text-[#ecdcb0] tabular-nums">
            {String(valor).padStart(2, '0')}
          </div>
          <div className="mt-1 text-[10px] sm:text-xs uppercase tracking-[0.2em] text-[#a8b39a]">
            {etiqueta}
          </div>
        </div>
      ))}
    </div>
  );
}
