import { MapPin, Music2, Send } from 'lucide-react';
import { mapsUrl } from '../xv/config';
import type { EventVM } from '../xv/useEvent';

export function Cierre({ settings }: { settings: EventVM }) {
  return (
    <section className="bosque-fondo relative px-6 py-16 sm:py-24 text-center overflow-hidden">
      <div className="rayos absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 max-w-2xl mx-auto">
        <p className="text-xs tracking-[0.35em] text-[#a8b39a] uppercase">Con amor</p>
        <p className="font-caligrafica brillo-dorado text-6xl sm:text-7xl mt-3">
          {settings.quinceanera}
        </p>
        {settings.mensaje_final ? (
          <p className="font-serifada italic text-xl text-[#f8f4e9]/90 mt-6 leading-relaxed">
            {settings.mensaje_final}
          </p>
        ) : (
          <p className="mt-6 text-sm tracking-wide text-[#a8b39a]">
            El mensaje final de {settings.quinceanera} llegará muy pronto…
          </p>
        )}
        <div className="mx-auto mt-6 flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-16 bg-[#d6bd7a]/60" />
          <span className="text-[#d6bd7a]">✦ ❧ ✦</span>
          <span className="h-px w-16 bg-[#d6bd7a]/60" />
        </div>
      </div>
    </section>
  );
}

export function Pie({ settings }: { settings: EventVM }) {
  return (
    <footer className="border-t border-[#d6bd7a]/25 bg-[#0e241b] px-6 py-10 text-center">
      <p className="font-serifada text-2xl text-[#ecdcb0]">
        {settings.quinceanera} · 19.12.2026
      </p>
      <nav className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs tracking-[0.2em] text-[#a8b39a] uppercase">
        <a href={mapsUrl(settings.direccion)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[#ecdcb0]">
          <MapPin size={13} /> Ubicación
        </a>
        <a href="#confirmar" className="inline-flex items-center gap-1 hover:text-[#ecdcb0]">
          <Send size={13} /> Confirmación
        </a>
        <a href="#musica" className="inline-flex items-center gap-1 hover:text-[#ecdcb0]">
          <Music2 size={13} /> Sugerir canciones
        </a>
        <a href="#admin" className="inline-flex items-center gap-1 opacity-60 hover:text-[#ecdcb0]">
          Admin
        </a>
      </nav>
    </footer>
  );
}
