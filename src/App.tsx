import { useCallback, useEffect, useMemo, useState } from 'react';
import Admin from './components/Admin';
import Countdown from './components/Countdown';
import Cover from './components/Cover';
import Evento, { Seccion } from './components/EventInfo';
import Galeria from './components/Gallery';
import CompanerosView from './components/CompanerosView';
import Musica from './components/Music';
import Pagos from './components/PaymentInfo';
import RsvpForm from './components/RsvpForm';
import YaAbone from './components/YaAbone';
import { Cierre, Pie } from './components/Cierre';
import { MarcoBotanico, Transicion } from './components/Decor';
import MusicaFondo, { VIDEO_POR_DEFECTO } from './components/MusicaFondo';
import { useEventSettings } from './xv/useEvent';
import type { Screen } from './xv/types';
import { mapaDiseno, resolverFondo } from './xv/diseno';

/* ÚNICA imagen con persona en toda la web (F: de espaldas, verificada).
    Editable desde Edición de tarjetas; no reutilizar en otras secciones. */
const ALT_FIGURA =
  'Antonella de espaldas, con vestido verde de quince años, mirando hacia la luz del bosque encantado';

function rutaActual(): { screen: Screen; token: string | null } {
  const h = window.location.hash || '#invitacion';
  if (h.startsWith('#ya-abone')) {
    const token = h.split('/')[1]?.trim() || null;
    return { screen: 'ya-abone', token };
  }
  if (h.startsWith('#companeros')) return { screen: 'companeros', token: null };
  if (h.startsWith('#confirmar')) return { screen: 'confirmar', token: null };
  if (h.startsWith('#admin')) return { screen: 'admin', token: null };
  return { screen: 'invitacion', token: null };
}

export default function App() {
  const [{ screen, token }, setRuta] = useState(rutaActual);
  const { settings, galeria, listo, texto, secciones } = useEventSettings();
  // Mapa de diseño (una sola lectura de content_sections, sin fetches extra).
  const diseno = useMemo(
    () => mapaDiseno(Object.values(secciones).map((s) => ({ clave: s.clave, cuerpo: s.cuerpo, updated_at: s.updated_at }))),
    [secciones],
  );
  const figura = resolverFondo(diseno, 'diseno_figura');

  useEffect(() => {
    const onHash = () => {
      setRuta(rutaActual());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const descubrir = useCallback(() => {
    document.getElementById('presentacion')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  if (!listo) {
    return (
      <div className="bosque-fondo flex min-h-screen items-center justify-center">
        <p className="font-caligrafica brillo-dorado text-5xl">Antonella</p>
      </div>
    );
  }

  if (screen === 'admin') {
    return (
      <div className="bosque-fondo min-h-screen">
        <Admin onSalir={() => (window.location.hash = '#invitacion')} />
        <Pie settings={settings} />
      </div>
    );
  }

  if (screen === 'companeros') {
    return (
      <CompanerosView
        settings={settings}
        diseno={diseno}
        videoId={texto('musica_video', VIDEO_POR_DEFECTO)}
        presentacion={{
          titulo: texto('b_presentacion_titulo', 'Mis XV'),
          texto: texto('b_presentacion_texto', ''),
        }}
      />
    );
  }

  if (screen === 'confirmar') {
    return (
      <div className="bosque-fondo min-h-screen">
        <RsvpForm settings={settings} diseno={diseno} />
        <Pie settings={settings} />
      </div>
    );
  }

  if (screen === 'ya-abone') {
    return (
      <div className="bosque-fondo min-h-screen">
        <YaAbone settings={settings} token={token} />
        <Pie settings={settings} />
      </div>
    );
  }

  return (
    <div className="bosque-fondo min-h-screen">
      <Cover
        settings={settings}
        frase={texto(
          'portada_frase',
          '“Hay momentos que se sueñan toda la vida. El mío llegó, y quiero compartirlo con vos.”',
        )}
        onDescubrir={descubrir}
        diseno={diseno}
      />

      <main>
        <Seccion
          id="presentacion"
          kicker="Bienvenidos"
          titulo={texto('presentacion_titulo', 'Mis XV')}
          fondo="jardin"
          diseno={diseno}
        >
          <Transicion>
            <p className="texto-sobre-foto font-serifada text-lg italic leading-relaxed text-[#f8f4e9] sm:text-xl">
              {texto(
                'presentacion_texto',
                '“Hoy celebramos una historia contada en sonrisas, abrazos y recuerdos. Esta es la historia de una niña que crece, sueña y se transforma en una joven llena de luz.”',
              )}
            </p>
          </Transicion>
          <Transicion>
            <figure className="mx-auto mt-8 max-w-sm">
              <MarcoBotanico>
                <img
                  src={figura.src}
                  alt={ALT_FIGURA}
                  width={1260}
                  height={1890}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[2/3] w-full rounded-lg object-cover"
                  style={{ objectPosition: figura.pos }}
                />
              </MarcoBotanico>
            </figure>
          </Transicion>
          {(() => {
            // Textos editables desde el panel (claves fotos_titulo/fotos_texto).
            // Sin filas o vacíos: no se muestra nada (sin fallback fijo).
            const titulo = texto('fotos_titulo', '');
            const cuerpo = texto('fotos_texto', '');
            if (!titulo.trim() && !cuerpo.trim()) return null;
            return (
              <div className="panel-lectura mt-6 rounded-2xl p-6">
                {titulo.trim() && (
                  <p className="text-xs uppercase tracking-[0.25em] text-[#a8b39a]">{titulo}</p>
                )}
                {cuerpo.trim() && (
                  <p className="mt-1 text-sm text-[#f8f4e9]/70">{cuerpo}</p>
                )}
              </div>
            );
          })()}
        </Seccion>

        <Seccion id="cuenta-regresiva" kicker="Falta cada vez menos" titulo="Cuenta regresiva">
          <Countdown settings={settings} />
        </Seccion>

        <Evento settings={settings} diseno={diseno} />
        <Galeria imagenes={galeria} />
        <Pagos settings={settings} diseno={diseno} />
        <Musica
          texto={texto(
            'musica_texto',
            '“¡Ayudame sugiriendo las canciones que pensás que no pueden faltar en la fiesta!”',
          )}
        />
        <RsvpForm settings={settings} diseno={diseno} />
        <Cierre settings={settings} diseno={diseno} />
        <MusicaFondo videoId={texto('musica_video', VIDEO_POR_DEFECTO)} />
      </main>

      <Pie settings={settings} />
    </div>
  );
}
