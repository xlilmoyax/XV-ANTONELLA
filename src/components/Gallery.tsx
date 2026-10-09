import { useState } from 'react';
import { Camera, X } from 'lucide-react';
import type { GalleryImage } from '../xv/types';
import { Seccion } from './EventInfo';

/** Placeholders claramente identificados como demo hasta subir fotos reales. */
const DEMO = [1, 2, 3];

export default function Galeria({ imagenes }: { imagenes: GalleryImage[] }) {
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const reales = imagenes.filter((i) => !i.demo && (i.url_publica || i.storage_path));

  return (
    <Seccion id="galeria" kicker="Recuerdos" titulo="Galería">
      {reales.length === 0 ? (
        <>
          <p className="font-serifada italic text-lg text-[#f8f4e9]/80">
            Muy pronto, las fotos de {`Antonella`} van a florecer en este bosque.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            {DEMO.map((n) => (
              <div
                key={n}
                className="marco-dorado relative aspect-[3/4] rounded-xl bg-gradient-to-b from-[#143327] to-[#0e241b] flex flex-col items-center justify-center gap-2"
              >
                <Camera size={22} className="text-[#d6bd7a]/70" aria-hidden="true" />
                <span className="text-[10px] tracking-[0.2em] text-[#a8b39a] uppercase px-2 text-center">
                  Foto demo {n}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs tracking-wide text-[#a8b39a]">
            Contenido demostrativo · Se reemplaza desde el panel cuando estén las fotos reales.
          </p>
        </>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {reales.map((img) => (
            <button
              key={img.id}
              onClick={() => img.url_publica && setAmpliada(img.url_publica)}
              className="marco-dorado overflow-hidden rounded-xl aspect-[3/4] bg-[#0e241b]"
              aria-label={img.epigrafe || 'Ampliar fotografía'}
            >
              {img.url_publica && (
                <img
                  src={img.url_publica}
                  alt={img.epigrafe || 'Fotografía de Antonella'}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {ampliada && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setAmpliada(null)}
          role="dialog"
          aria-label="Fotografía ampliada"
        >
          <button
            className="absolute top-4 right-4 text-[#f8f4e9] border border-[#d6bd7a]/60 rounded-full p-2"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
          <img
            src={ampliada}
            alt="Fotografía ampliada"
            className="max-h-[85vh] max-w-full rounded-xl marco-dorado"
          />
        </div>
      )}
    </Seccion>
  );
}
