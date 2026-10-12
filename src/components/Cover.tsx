import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { formatearFechaCorta } from '../xv/useEvent';
import type { EventVM } from '../xv/useEvent';
import { FondoFoto, Luciernagas } from './Decor';
import { resolverFondo, type DisenoMap } from '../xv/diseno';

export default function Cover({
  settings,
  frase,
  onDescubrir,
  diseno,
}: {
  settings: EventVM;
  frase: string;
  onDescubrir: () => void;
  diseno: DisenoMap;
}) {
  const reduceMotion = useReducedMotion();
  // Fondo editable desde el panel (Edición de tarjetas); respaldo empaquetado si falta.
  const fondo = resolverFondo(diseno, 'diseno_fondo_portada');

  return (
    <header className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
      <motion.div
        initial={reduceMotion ? false : { scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 2.8, ease: 'easeOut' }}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <FondoFoto src={fondo.src} width={1920} height={1280} pos={fondo.pos} eager scrim="fuerte" />
      </motion.div>
      <div className="rayos absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-0" aria-hidden="true">
        <Luciernagas densidad={1.1} />
      </div>
      <div className="neblina absolute inset-x-0 bottom-0 h-48" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-16 text-center">
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="texto-sobre-foto text-sm tracking-[0.35em] text-[#ecdcb0] sm:text-base"
        >
          {formatearFechaCorta(settings.fecha)}
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25 }}
          className="texto-sobre-foto mt-4 text-lg tracking-[0.4em] text-[#f8f4e9] sm:text-xl"
        >
          {settings.evento.toUpperCase()}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, delay: 0.5 }}
          className="font-caligrafica brillo-dorado mt-4 text-7xl leading-none sm:text-8xl md:text-9xl"
        >
          {settings.quinceanera}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="mx-auto mt-6 flex items-center justify-center gap-3"
          aria-hidden="true"
        >
          <span className="h-px w-16 bg-[#d6bd7a]/70 sm:w-24" />
          <span className="text-[#ecdcb0]">✦ ❧ ✦</span>
          <span className="h-px w-16 bg-[#d6bd7a]/70 sm:w-24" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.1 }}
          className="texto-sobre-foto font-serifada mt-6 text-lg italic leading-relaxed text-[#f8f4e9] sm:text-2xl"
        >
          {frase}
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.4 }}
          onClick={onDescubrir}
          className="boton-dorado mt-10 inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-medium"
        >
          DESCUBRIR MI INVITACIÓN
          <ChevronDown size={16} aria-hidden="true" />
        </motion.button>
      </div>
    </header>
  );
}
