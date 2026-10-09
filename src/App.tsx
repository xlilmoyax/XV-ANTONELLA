import { useCallback, useEffect, useState } from 'react';
import Admin from './components/Admin';
import Countdown from './components/Countdown';
import Cover from './components/Cover';
import Evento, { Seccion } from './components/EventInfo';
import Galeria from './components/Gallery';
import Musica from './components/Music';
import Pagos from './components/PaymentInfo';
import RsvpForm from './components/RsvpForm';
import YaAbone from './components/YaAbone';
import { Cierre, Pie } from './components/Cierre';
import { useEventSettings } from './xv/useEvent';
import type { Screen } from './xv/types';

function rutaActual(): { screen: Screen; token: string | null } {
  const h = window.location.hash || '#invitacion';
  if (h.startsWith('#ya-abone')) {
    const token = h.split('/')[1]?.trim() || null;
    return { screen: 'ya-abone', token };
  }
  if (h.startsWith('#confirmar')) return { screen: 'confirmar', token: null };
  if (h.startsWith('#admin')) return { screen: 'admin', token: null };
  return { screen: 'invitacion', token: null };
}

export default function App() {
  const [{ screen, token }, setRuta] = useState(rutaActual);
  const { settings, galeria, listo, texto } = useEventSettings();

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
      <div className="bosque-fondo min-h-screen flex items-center justify-center">
        <p className="font-caligrafica text-5xl brillo-dorado">Antonella</p>
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

  if (screen === 'confirmar') {
    return (
      <div className="bosque-fondo min-h-screen">
        <RsvpForm settings={settings} />
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
      />

      <main>
        <Seccion
          id="presentacion"
          kicker="Bienvenidos"
          titulo={texto('presentacion_titulo', 'Mis XV')}
        >
          <p className="font-serifada italic text-lg sm:text-xl text-[#f8f4e9]/90 leading-relaxed">
            {texto(
              'presentacion_texto',
              '“Hoy celebramos una historia contada en sonrisas, abrazos y recuerdos. Esta es la historia de una niña que crece, sueña y se transforma en una joven llena de luz.”',
            )}
          </p>
          <div className="marco-dorado mt-6 rounded-2xl bg-[#0e241b]/60 p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-[#a8b39a]">
              Espacio reservado para las fotografías
            </p>
            <p className="mt-1 text-sm text-[#f8f4e9]/70">
              Las fotos reales se suman desde el panel ni bien estén listas.
            </p>
          </div>
        </Seccion>

        <Seccion id="cuenta-regresiva" kicker="Falta cada vez menos" titulo="Cuenta regresiva">
          <Countdown settings={settings} />
        </Seccion>

        <Evento settings={settings} />
        <Galeria imagenes={galeria} />
        <Pagos settings={settings} />
        <Musica
          texto={texto(
            'musica_texto',
            '“¡Ayudame sugiriendo las canciones que pensás que no pueden faltar en la fiesta!”',
          )}
        />
        <RsvpForm settings={settings} />
        <Cierre settings={settings} />
      </main>

      <Pie settings={settings} />
    </div>
  );
}
