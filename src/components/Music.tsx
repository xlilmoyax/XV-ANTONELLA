import { Music2 } from 'lucide-react';
import { MUSIC_FORM_URL } from '../xv/config';
import { Seccion } from './EventInfo';

export default function Musica({ texto }: { texto: string }) {
  return (
    <Seccion id="musica" kicker="La fiesta la hacemos entre todos" titulo="¿Qué canciones no pueden faltar?">
      <p className="font-serifada italic text-lg sm:text-xl text-[#f8f4e9]/90 leading-relaxed">
        {texto}
      </p>
      <a
        href={MUSIC_FORM_URL}
        target="_blank"
        rel="noreferrer"
        className="boton-dorado mt-8 inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-medium"
      >
        <Music2 size={16} aria-hidden="true" />
        SUGERIR CANCIÓN
      </a>
    </Seccion>
  );
}
