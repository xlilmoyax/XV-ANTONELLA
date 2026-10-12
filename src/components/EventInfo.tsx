import type { ReactNode } from 'react';
import { CalendarPlus, Clock, MapPin, Shirt } from 'lucide-react';
import { buildIcsEvent, mapsUrl } from '../xv/config';
import { formatearFechaLarga } from '../xv/useEvent';
import type { EventVM } from '../xv/useEvent';
import { FondoFoto, Luciernagas, Transicion } from './Decor';
import { FONDOS, resolverFondo, type DisenoMap } from '../xv/diseno';

export type FondoSeccion = 'plano' | 'jardin' | 'portada' | 'pagos' | 'cierre' | 'b_portada' | 'b_jardin' | 'b_pagos';

const CLAVE_FONDO: Record<Exclude<FondoSeccion, 'plano'>, string> = {
  jardin: 'diseno_fondo_jardin',
  portada: 'diseno_fondo_portada',
  pagos: 'diseno_fondo_pagos',
  cierre: 'diseno_fondo_cierre',
  b_portada: 'diseno_b_portada',
  b_jardin: 'diseno_b_jardin',
  b_pagos: 'diseno_b_pagos',
};

export function Seccion({
  id,
  kicker,
  titulo,
  children,
  fondo = 'plano',
  diseno,
}: {
  id: string;
  kicker?: string;
  titulo: string;
  children: ReactNode;
  fondo?: FondoSeccion;
  diseno?: DisenoMap;
}) {
  const resuelto =
    fondo === 'plano' || !diseno
      ? null
      : (() => {
          const def = FONDOS.find((d) => d.clave === CLAVE_FONDO[fondo]);
          const r = resolverFondo(diseno, CLAVE_FONDO[fondo]);
          return { ...r, w: def?.w ?? 1920, h: def?.h ?? 1280 };
        })();
  return (
    <section id={id} className="relative scroll-mt-6 overflow-hidden px-6 py-14 sm:py-20">
      {resuelto && (
        <FondoFoto src={resuelto.src} width={resuelto.w} height={resuelto.h} pos={resuelto.pos} scrim="suave" />
      )}
      {fondo !== 'plano' && (
        <div className="absolute inset-0" aria-hidden="true">
          <Luciernagas densidad={0.7} />
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <Transicion>
          {kicker && (
            <p className="texto-sobre-foto text-xs uppercase tracking-[0.35em] text-[#ecdcb0]">
              {kicker}
            </p>
          )}
          <h2 className="texto-sobre-foto font-serifada mt-2 text-4xl text-[#ecdcb0] sm:text-5xl">
            {titulo}
          </h2>
          <div className="mx-auto mt-4 flex items-center justify-center gap-3" aria-hidden="true">
            <span className="h-px w-14 bg-[#d6bd7a]/70" />
            <span className="text-sm text-[#ecdcb0]">✦</span>
            <span className="h-px w-14 bg-[#d6bd7a]/70" />
          </div>
        </Transicion>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

export default function Evento({ settings, diseno }: { settings: EventVM; diseno: DisenoMap }) {
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
    <Seccion id="evento" kicker="Cuándo y dónde" titulo="Información del evento" fondo="jardin" diseno={diseno}>
      <Transicion>
        <ul className="space-y-3 text-left">
          {datos.map((d, i) => (
            <li
              key={i}
              className="panel-lectura flex items-center gap-3 rounded-xl px-4 py-3"
            >
              <span className="shrink-0 text-[#d6bd7a]">{d.icono}</span>
              <span className="font-serifada text-lg text-[#f8f4e9]">{d.texto}</span>
            </li>
          ))}
        </ul>
      </Transicion>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <a
          href={mapsUrl(settings.direccion)}
          target="_blank"
          rel="noreferrer"
          className="boton-dorado rounded-full px-6 py-3 text-center text-xs font-medium"
        >
          CÓMO LLEGAR
        </a>
        <a
          href={ics}
          download="xv-antonella.ics"
          className="boton-fantasma rounded-full px-6 py-3 text-center text-xs font-medium"
        >
          AGREGAR A MI CALENDARIO
        </a>
        <a
          href="#confirmar"
          className="boton-fantasma rounded-full px-6 py-3 text-center text-xs font-medium"
        >
          CONFIRMAR ASISTENCIA
        </a>
      </div>
    </Seccion>
  );
}
