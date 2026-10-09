import type { ReactNode } from 'react';
import { CalendarPlus, Clock, MapPin, Shirt } from 'lucide-react';
import { buildIcsEvent, mapsUrl } from '../xv/config';
import { formatearFechaLarga } from '../xv/useEvent';
import type { EventVM } from '../xv/useEvent';

export function Seccion({
  id,
  kicker,
  titulo,
  children,
}: {
  id: string;
  kicker?: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="relative px-6 py-14 sm:py-20 scroll-mt-6">
      <div className="max-w-2xl mx-auto text-center">
        {kicker && (
          <p className="text-xs tracking-[0.35em] text-[#a8b39a] uppercase">{kicker}</p>
        )}
        <h2 className="font-serifada text-4xl sm:text-5xl text-[#ecdcb0] mt-2">{titulo}</h2>
        <div className="mx-auto mt-4 flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-14 bg-[#d6bd7a]/60" />
          <span className="text-[#d6bd7a] text-sm">✦</span>
          <span className="h-px w-14 bg-[#d6bd7a]/60" />
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

export default function Evento({ settings }: { settings: EventVM }) {
  const ics = buildIcsEvent({
    titulo: `Mis XV años · ${settings.quinceanera}`,
    descripcion: `${settings.evento} de ${settings.quinceanera} en ${settings.salon}. Vestimenta ${settings.vestimenta.toLowerCase()}.`,
    ubicacion: `${settings.salon}, ${settings.direccion}`,
    fecha: settings.fecha,
    hora_inicio: settings.hora_inicio,
    fecha_fin: settings.fecha_fin,
    hora_fin: settings.hora_fin,
  });

  const datos = [
    { icono: <CalendarPlus size={18} />, texto: formatearFechaLarga(settings.fecha) },
    { icono: <Clock size={18} />, texto: `${settings.hora_inicio} a ${settings.hora_fin} hs` },
    { icono: <MapPin size={18} />, texto: `${settings.salon} · ${settings.direccion}` },
    { icono: <Shirt size={18} />, texto: `Vestimenta ${settings.vestimenta.toLowerCase()}` },
  ];

  return (
    <Seccion id="evento" kicker="Cuándo y dónde" titulo="Información del evento">
      <ul className="space-y-3 text-left">
        {datos.map((d, i) => (
          <li
            key={i}
            className="marco-dorado flex items-center gap-3 rounded-xl bg-[#0e241b]/60 px-4 py-3"
          >
            <span className="text-[#d6bd7a]">{d.icono}</span>
            <span className="font-serifada text-lg text-[#f8f4e9]">{d.texto}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={mapsUrl(settings.direccion)}
          target="_blank"
          rel="noreferrer"
          className="boton-dorado rounded-full px-6 py-3 text-xs font-medium text-center"
        >
          CÓMO LLEGAR
        </a>
        <a
          href={ics}
          download="xv-antonella.ics"
          className="boton-fantasma rounded-full px-6 py-3 text-xs font-medium text-center"
        >
          AGREGAR A MI CALENDARIO
        </a>
        <a
          href="#confirmar"
          className="boton-fantasma rounded-full px-6 py-3 text-xs font-medium text-center"
        >
          CONFIRMAR ASISTENCIA
        </a>
      </div>
    </Seccion>
  );
}
