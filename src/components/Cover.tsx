import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { formatearFechaCorta } from '../xv/useEvent';
import type { EventVM } from '../xv/useEvent';

const PARTICULAS = [
  { left: '12%', top: '22%', size: 5, delay: '0s' },
  { left: '24%', top: '64%', size: 4, delay: '1.2s' },
  { left: '38%', top: '30%', size: 6, delay: '2s' },
  { left: '55%', top: '58%', size: 4, delay: '0.6s' },
  { left: '68%', top: '26%', size: 5, delay: '1.7s' },
  { left: '79%', top: '66%', size: 4, delay: '2.6s' },
  { left: '88%', top: '40%', size: 6, delay: '0.9s' },
  { left: '47%', top: '76%', size: 4, delay: '3.1s' },
];

export default function Cover({
  settings,
  frase,
  onDescubrir,
}: {
  settings: EventVM;
  frase: string;
  onDescubrir: () => void;
}) {
  return (
    <header className="bosque-fondo relative min-h-[100svh] flex items-center justify-center overflow-hidden">
      <div className="rayos absolute inset-0" aria-hidden="true" />
      <div className="neblina absolute inset-x-0 bottom-0 h-48" aria-hidden="true" />
      {PARTICULAS.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="particula absolute rounded-full bg-[#ecdcb0]"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            boxShadow: '0 0 12px 2px rgba(236,220,176,0.55)',
          }}
        />
      ))}

      <div className="relative z-10 px-6 py-16 text-center max-w-2xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="text-sm sm:text-base tracking-[0.35em] text-[#a8b39a]"
        >
          {formatearFechaCorta(settings.fecha)}
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25 }}
          className="mt-4 text-lg sm:text-xl tracking-[0.4em] text-[#f8f4e9]"
        >
          {settings.evento.toUpperCase()}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, delay: 0.5 }}
          className="font-caligrafica brillo-dorado text-7xl sm:text-8xl md:text-9xl mt-4 leading-none"
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
          <span className="h-px w-16 sm:w-24 bg-[#d6bd7a]/60" />
          <span className="text-[#d6bd7a]">✦</span>
          <span className="h-px w-16 sm:w-24 bg-[#d6bd7a]/60" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.1 }}
          className="font-serifada italic text-lg sm:text-2xl text-[#f8f4e9]/90 mt-6 leading-relaxed"
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
