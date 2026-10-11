/**
 * XV-ANTONELLA · Tarjeta Compañeros (NO publicada: ruta local sin enlaces).
 * Registro individual, sin acompañantes. Precio/horarios desde configuración
 * validada (tabla modalidades o fallback estático aprobado).
 * Fondos: reutiliza transitoriamente fotos A (jardín/sendero) hasta recibir
 * el arte propio B; sustituir por claves diseno_b_* en la etapa visual.
 * Textos definitivos, música y mensaje final de B: PENDIENTES (no inventados).
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarPlus, ChevronDown, Clock, MapPin, MessageCircle, Send, Shirt } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { buildIcsEvent, mapsUrl, whatsappUrl } from '../xv/config';
import { formatoARS } from '../xv/pricing';
import { MODALIDAD_B_ESTATICA, cargarModalidad, type ModalidadConfig } from '../xv/modalidad';
import { importeB, payloadB, validarB } from '../xv/companeros';
import { formatearFechaCorta, formatearFechaLarga, type EventVM } from '../xv/useEvent';
import type { DisenoMap } from '../xv/diseno';
import { resolverFondo } from '../xv/diseno';
import { FondoFoto, Luciernagas, Transicion } from './Decor';
import { Seccion } from './EventInfo';
import Countdown from './Countdown';

const EMAIL_OK = '¡Gracias por confirmar tu asistencia a los XV de Antonella!';

function InfoRow({ icono, texto }: { icono: ReactNode; texto: string }) {
  return (
    <li className="panel-lectura flex items-center gap-3 rounded-xl px-4 py-3">
      <span className="shrink-0 text-[#d6bd7a]">{icono}</span>
      <span className="font-serifada text-lg text-[#f8f4e9]">{texto}</span>
    </li>
  );
}

function FormB({ settings, mod, diseno }: { settings: EventVM; mod: ModalidadConfig; diseno: DisenoMap }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [edad, setEdad] = useState('');
  const [asiste, setAsiste] = useState<'si' | 'no'>('si');
  /* Sin restricciones alimentarias en el formulario público (columna DB intacta). */
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState<{ importe: number } | null>(null);

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    const v = validarB({ nombre, email, telefono, asiste: asiste === 'si', edadTitular: edad });
    if (v) {
      setError(v);
      return;
    }
    setEnviando(true);
    try {
      // ÚNICA vía válida para B: RPC validada en servidor. Sin fallback
      // directo (no podría validar modalidad ni prohibir acompañantes).
      const { data, error } = await supabase.rpc('registrar_rsvp', {
        payload: payloadB({
          nombre, email, telefono, asiste: asiste === 'si', edadTitular: edad,
        }),
      });
      const resp = data as { ok?: boolean; motivo?: string; importe?: number } | null;
      if (!error && resp?.ok) {
        setExito({ importe: Number(resp.importe ?? importeB(asiste === 'si', mod.precio)) });
        return;
      }
      if (!error && resp && !resp.ok) {
        if (resp.motivo === 'duplicado') {
          throw new Error('Ese correo ya tiene una confirmación registrada. Escribinos por WhatsApp.');
        }
        if (resp.motivo === 'modalidad') {
          throw new Error('Esta tarjeta aún no admite registros en línea.');
        }
        throw new Error('Revisá los datos e intentá de nuevo.');
      }
      const code = (error as { code?: string } | null)?.code;
      if (code === 'PGRST202') {
        throw new Error('El registro en línea para compañeros aún no está habilitado.');
      }
      throw new Error('No pudimos guardar tu confirmación. Probá de nuevo en unos minutos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error inesperado.');
    } finally {
      setEnviando(false);
    }
  };

  if (exito) {
    const wa = whatsappUrl(
      settings.whatsapp_comprobantes,
      `Hola, soy ${nombre}. Confirmé mi asistencia (compañeros) a los XV de ${settings.quinceanera}. ¡Gracias!`,
    );
    return (
      <Seccion id="b-confirmar" kicker="Confirmación" titulo="¡Gracias por confirmar!" fondo="jardin" diseno={diseno}>
        <div className="panel-lectura rounded-2xl p-8">
          <p className="font-serifada text-2xl text-[#ecdcb0]">
            {asiste === 'si' ? '¡Te esperamos!' : 'Gracias por avisarnos.'}
          </p>
          {asiste === 'si' && (
            <p className="font-serifada mt-2 text-3xl text-[#ecdcb0]">
              Importe: {formatoARS(exito.importe)}
            </p>
          )}
          <p className="mt-2 text-sm text-[#f8f4e9]/80">{EMAIL_OK}</p>
          <a href={wa} target="_blank" rel="noreferrer" className="boton-dorado mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-medium">
            <MessageCircle size={15} /> AVISAR POR WHATSAPP
          </a>
        </div>
      </Seccion>
    );
  }

  return (
    <Seccion id="b-confirmar" kicker="RSVP · Individual" titulo="Confirmar asistencia" fondo="jardin" diseno={diseno}>
      <p className="texto-sobre-foto -mt-2 mb-6 text-sm text-[#ecdcb0]">
        Invitación personal · Límite: {formatearFechaLarga(mod.limite_confirmacion)}
      </p>
      <form onSubmit={enviar} className="panel-lectura rounded-2xl p-5 text-left sm:p-8" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Nombre y apellido *</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name"
              className="mt-1 w-full rounded-lg bg-[#fffdf7] px-3 py-2.5 text-[#183b2d] outline-none focus:ring-2 ring-[#d6bd7a]" />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Correo electrónico *</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email"
              className="mt-1 w-full rounded-lg bg-[#fffdf7] px-3 py-2.5 text-[#183b2d] outline-none focus:ring-2 ring-[#d6bd7a]" />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Teléfono (opcional)</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} type="tel" autoComplete="tel"
              className="mt-1 w-full rounded-lg bg-[#fffdf7] px-3 py-2.5 text-[#183b2d] outline-none focus:ring-2 ring-[#d6bd7a]" />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Tu edad al día de la fiesta (opcional)</span>
            <input value={edad} onChange={(e) => setEdad(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} inputMode="numeric"
              className="mt-1 w-full rounded-lg bg-[#fffdf7] px-3 py-2.5 text-[#183b2d] outline-none focus:ring-2 ring-[#d6bd7a]" />
          </label>
        </div>
        <fieldset className="mt-5">
          <legend className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">¿Asistís? *</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(['si', 'no'] as const).map((vv) => (
              <button key={vv} type="button" onClick={() => setAsiste(vv)} aria-pressed={asiste === vv}
                className={`rounded-full px-4 py-3 text-xs font-medium tracking-[0.15em] ${asiste === vv ? 'boton-dorado' : 'boton-fantasma'}`}>
                {vv === 'si' ? 'SÍ, VOY' : 'NO PUEDO IR'}
              </button>
            ))}
          </div>
        </fieldset>
        {asiste === 'si' && (
          <>
            <div className="mt-4 rounded-xl border border-[#d6bd7a]/30 bg-[#183b2d]/70 p-4 text-center">
              <p className="font-serifada text-3xl text-[#ecdcb0]">{formatoARS(importeB(true, mod.precio))}</p>
              <p className="text-xs text-[#a8b39a]">Tarjeta individual · Límite de pago: {formatearFechaLarga(mod.limite_pago)}</p>
            </div>
          </>
        )}
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-300/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">{error}</p>}
        <button type="submit" disabled={enviando}
          className="boton-dorado mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-medium disabled:opacity-60">
          <Send size={16} aria-hidden="true" />{enviando ? 'GUARDANDO…' : 'CONFIRMAR'}
        </button>
      </form>
    </Seccion>
  );
}

export default function CompanerosView({ settings, diseno }: { settings: EventVM; diseno: DisenoMap }) {
  const [mod, setMod] = useState<ModalidadConfig>({ ...MODALIDAD_B_ESTATICA });
  const reduceMotion = useReducedMotion();
  const fondoPortada = resolverFondo(diseno, 'diseno_fondo_portada');

  useEffect(() => {
    let vivo = true;
    cargarModalidad(supabase, 'companeros').then((m) => {
      if (vivo) setMod(m);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const adaptados: EventVM = {
    ...settings,
    hora_inicio: mod.hora_inicio,
    hora_fin: mod.hora_fin,
    fecha_fin: mod.fecha_fin,
    precio_tarjeta: mod.precio,
  };
  const ics = buildIcsEvent({
    titulo: `Mis XV años · ${settings.quinceanera} (Compañeros)`,
    descripcion: `${settings.evento} de ${settings.quinceanera} en ${settings.salon}. Vestimenta ${mod.vestimenta.toLowerCase()}.`,
    ubicacion: `${settings.salon}, ${settings.direccion}`,
    fecha: mod.fecha,
    hora_inicio: mod.hora_inicio,
    fecha_fin: mod.fecha_fin,
    hora_fin: mod.hora_fin,
  });
  const waComp = whatsappUrl(
    settings.whatsapp_comprobantes,
    `Hola. Te envío el comprobante de la tarjeta (compañeros) para los XV de ${settings.quinceanera}. ¡Gracias!`,
  );

  return (
    <div className="bosque-fondo min-h-screen">
      <header className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
        <motion.div
          initial={reduceMotion ? false : { scale: 1.08 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.8, ease: 'easeOut' }}
          className="absolute inset-0"
          aria-hidden="true"
        >
          <FondoFoto src={fondoPortada.src} width={1920} height={1280} pos={fondoPortada.pos} eager scrim="fuerte" />
        </motion.div>
        <div className="rayos absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-0" aria-hidden="true">
          <Luciernagas densidad={1.1} />
        </div>
        <div className="neblina absolute inset-x-0 bottom-0 h-48" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-16 text-center">
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }}
            className="texto-sobre-foto text-sm tracking-[0.35em] text-[#ecdcb0] sm:text-base">
            {formatearFechaCorta(mod.fecha)}
          </motion.p>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.25 }}
            className="texto-sobre-foto mt-4 text-lg tracking-[0.4em] text-[#f8f4e9] sm:text-xl">
            MIS XV AÑOS · COMPAÑEROS
          </motion.p>
          <motion.h1 initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, delay: 0.5 }}
            className="font-caligrafica brillo-dorado mt-4 text-7xl leading-none sm:text-8xl md:text-9xl">
            {settings.quinceanera}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1.1 }}
            className="texto-sobre-foto font-serifada mt-6 text-lg italic leading-relaxed text-[#f8f4e9] sm:text-2xl">
            Una invitación personal para compartir una noche mágica.
          </motion.p>
          <motion.a initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 1.4 }}
            href="#b-info"
            className="boton-dorado mt-10 inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-medium"
          >
            DESCUBRIR MI INVITACIÓN <ChevronDown size={16} aria-hidden="true" />
          </motion.a>
          {!mod.remoto && (
            <p className="texto-sobre-foto mt-4 text-[11px] tracking-wide text-[#a8b39a]">
              Datos provisorios aprobados; la configuración del servidor aún no está publicada.
            </p>
          )}
        </div>
      </header>

      <main>
        <Seccion id="b-info" kicker="Cuándo y dónde" titulo="Información del evento" fondo="jardin" diseno={diseno}>
          <Transicion>
            <ul className="space-y-3 text-left">
              <InfoRow icono={<CalendarPlus size={18} />} texto={formatearFechaLarga(mod.fecha)} />
              <InfoRow icono={<Clock size={18} />} texto={`${mod.hora_inicio} a ${mod.hora_fin} hs`} />
              <InfoRow icono={<MapPin size={18} />} texto={`${settings.salon} · ${settings.direccion}`} />
              <InfoRow icono={<Shirt size={18} />} texto={`Vestimenta ${mod.vestimenta.toLowerCase()}`} />
            </ul>
          </Transicion>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={mapsUrl(settings.direccion)} target="_blank" rel="noreferrer" className="boton-dorado rounded-full px-6 py-3 text-center text-xs font-medium">CÓMO LLEGAR</a>
            <a href={ics} download="xv-antonella-companeros.ics" className="boton-fantasma rounded-full px-6 py-3 text-center text-xs font-medium">AGREGAR A MI CALENDARIO</a>
            <a href="#b-confirmar" className="boton-fantasma rounded-full px-6 py-3 text-center text-xs font-medium">CONFIRMAR ASISTENCIA</a>
          </div>
        </Seccion>

        <Seccion id="cuenta-regresiva-b" kicker="Falta cada vez menos" titulo="Cuenta regresiva">
          <Countdown settings={adaptados} />
        </Seccion>

        <Seccion id="b-pagos" kicker="Confirmar y abonar" titulo="Datos para confirmar y abonar" fondo="pagos" diseno={diseno}>
          <div className="panel-lectura rounded-2xl p-6 text-left">
            <p className="font-serifada text-lg text-[#f8f4e9]">
              Tarjeta individual: {formatoARS(mod.precio)} por invitado.
            </p>
            <div className="mt-3 rounded-xl border border-[#d6bd7a]/30 bg-[#183b2d]/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-[#a8b39a]">Alias</p>
              <p className="font-serifada break-all text-2xl text-[#ecdcb0]">{settings.alias_transferencia}</p>
              <p className="mt-1 text-sm text-[#f8f4e9]/80">Titular: {settings.titular_transferencia}</p>
            </div>
            <p className="mt-3 text-sm text-[#f8f4e9]/85">
              Confirmar antes del {formatearFechaLarga(mod.limite_confirmacion)} ·
              Pagar antes del {formatearFechaLarga(mod.limite_pago)}.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <a href={waComp} target="_blank" rel="noreferrer" className="boton-dorado rounded-full px-6 py-3 text-center text-xs font-medium">ENVIAR COMPROBANTE POR WHATSAPP</a>
              <a href="#b-confirmar" className="boton-fantasma rounded-full px-6 py-3 text-center text-xs font-medium">CONFIRMAR ASISTENCIA</a>
            </div>
          </div>
        </Seccion>

        <FormB settings={settings} mod={mod} diseno={diseno} />
      </main>

      <footer className="border-t border-[#d6bd7a]/25 bg-[#0e241b] px-6 py-10 text-center">
        <p className="font-serifada text-2xl text-[#ecdcb0]">{settings.quinceanera} · 19.12.2026 · Compañeros</p>
        <p className="mt-2 text-xs tracking-[0.2em] text-[#a8b39a] uppercase">
          <a href={mapsUrl(settings.direccion)} target="_blank" rel="noreferrer" className="hover:text-[#ecdcb0]">Ubicación</a>
          {' · '}
          <a href="#b-confirmar" className="hover:text-[#ecdcb0]">Confirmación</a>
        </p>
      </footer>
    </div>
  );
}
