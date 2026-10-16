import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { DisenoMap } from '../xv/diseno';
import { CheckCircle2, Minus, Plus, Send } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { whatsappUrl } from '../xv/config';
import { calcularImporteModalidad, formatoARS } from '../xv/pricing';
import type { ModalidadConfig } from '../xv/modalidad';
import { formatearFechaLarga } from '../xv/useEvent';
import type { EventVM } from '../xv/useEvent';
import { Seccion } from './EventInfo';

interface Acompanante {
  nombre: string;
  edad: string; // texto libre numérico
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function RsvpForm({
  settings,
  modalidad,
  token,
  diseno,
}: {
  settings: EventVM;
  modalidad: ModalidadConfig;
  token: string;
  diseno: DisenoMap;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [edadTitular, setEdadTitular] = useState('');
  const [asiste, setAsiste] = useState<'si' | 'no'>('si');
  const [modalidadConfirmada, setModalidadConfirmada] = useState(false);
  const [familia, setFamilia] = useState('');
  const [adultos, setAdultos] = useState(1);
  const [menores, setMenores] = useState(0);
  const [acompanantes, setAcompanantes] = useState<Acompanante[]>([]);
  /* Restricciones alimentarias: eliminadas del formulario público.
     La columna se conserva en DB para valores históricos (visibles en el panel). */
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const envioEnCurso = useRef(false);
  const [exito, setExito] = useState<null | { importe: number; queAbonan: number; total: number }>(null);

  const vencida = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return hoy > settings.fecha_limite_confirmacion;
  }, [settings.fecha_limite_confirmacion]);

  const totalPersonas = adultos + menores;
  const detalleEsperado = Math.max(0, totalPersonas - 1);

  // Mantener la lista de acompañantes sincronizada con las cantidades
  const sincronizar = (a: number, m: number) => {
    const esperado = Math.max(0, a + m - 1);
    setAcompanantes((prev) => {
      if (prev.length === esperado) return prev;
      if (prev.length < esperado)
        return [...prev, ...Array.from({ length: esperado - prev.length }, () => ({ nombre: '', edad: '' }))];
      return prev.slice(0, esperado);
    });
  };

  const edades = (lista: Acompanante[]) =>
    lista.map((x) => {
      const n = Number.parseInt(x.edad, 10);
      return Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
    });

  const calculo = useMemo(() => {
    if (asiste === 'no') return { queAbonan: 0, importe: 0, total: 0, error: null as string | null };
    const ed = edades(acompanantes);
    const edadT = edadTitular.trim() === '' ? null : Number.parseInt(edadTitular, 10);
    const calculo = calcularImporteModalidad(
      modalidad.codigo,
      [edadT !== null && Number.isFinite(edadT) ? edadT : null, ...ed],
      adultos,
      menores,
      modalidad.precio,
      modalidad.edad_minima,
    );
    return {
      queAbonan: calculo.personasQueAbonan,
      importe: calculo.importe,
      total: adultos + menores,
      error: calculo.error,
    };
  }, [acompanantes, edadTitular, asiste, adultos, menores, modalidad]);

  const validar = (): string | null => {
    if (nombre.trim().length < 3) return 'Contanos tu nombre y apellido.';
    if (!EMAIL_RE.test(email.trim())) return 'Revisá el correo electrónico: no parece válido.';
    if (!modalidadConfirmada) return 'Confirmá que esta invitación corresponde a Familia y amigos.';
    if (asiste === 'no') return null;
    if (adultos < 0 || menores < 0 || adultos + menores < 1) return 'Indicá al menos 1 persona (incluyéndote).';
    if (acompanantes.length !== detalleEsperado)
      return 'Las cantidades no coinciden con el detalle de acompañantes.';
    for (let i = 0; i < acompanantes.length; i++) {
      if (acompanantes[i].nombre.trim().length < 2)
        return `Falta el nombre del acompañante ${i + 1}.`;
      const e = edades(acompanantes)[i];
      if (e === null) return `Falta la edad del acompañante ${i + 1} (en años, al día de la fiesta).`;
    }
    if (edadTitular.trim() === '') return 'Indicá tu edad al día de la fiesta para validar la exención.';
    if (edadTitular.trim() !== '') {
      const n = Number.parseInt(edadTitular, 10);
      if (!Number.isFinite(n) || n < 0 || n > 120) return 'Revisá tu edad (en años, al día de la fiesta).';
    }
    return null;
  };

  type RpcResp = {
    ok: boolean;
    motivo?: string;
    guest_id?: string;
    modalidad?: string;
    importe?: number;
    que_abonan?: number;
    total?: number;
  };

  const MENSAJE_GENERICO = 'No pudimos guardar tu confirmación. Probá de nuevo en unos minutos.';

  const MOTIVOS: Record<string, string> = {
    nombre: 'Contanos tu nombre y apellido.',
    email: 'Revisá el correo electrónico: no parece válido.',
    cantidades: 'Revisá las cantidades de adultos y menores.',
    detalle: 'Revisá el detalle de acompañantes (nombres y edades).',
    edad: 'Revisá las edades (en años, al día de la fiesta).',
  };

  /** Payload exacto de registrar_rsvp: solo datos declarados, nada de estados. */
  const construirPayload = () => ({
    nombre_apellido: nombre.trim(),
    email: email.trim().toLowerCase(),
    telefono: telefono.trim() || null,
    asiste: asiste === 'si',
    familia: familia.trim() || null,
    adultos,
    menores,
    edad_titular: edadTitular.trim() === '' ? null : edadTitular.trim(),
    acompanantes: acompanantes.map((a) => ({ nombre: a.nombre.trim(), edad: a.edad.trim() })),
    observaciones: observaciones.trim() || null,
  });

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (envioEnCurso.current) return;
    setError(null);
    const v = validar();
    if (v) {
      setError(v);
      return;
    }
    if (!isSupabaseConfigured) {
      setError(
        'La confirmación online aún no está conectada a la base de datos. Escribinos por WhatsApp para confirmar tu lugar.',
      );
      return;
    }
    envioEnCurso.current = true;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('registrar-rsvp', {
        body: { token, payload: construirPayload() },
      });
      const resp = data as RpcResp | null;

      if (!error && resp?.ok) {
        // Éxito solo con forma válida: sin guest_id/importes numéricos no se
        // informa éxito aunque ok sea true (resultado ambiguo → error).
        if (
          typeof resp.guest_id !== 'string' ||
          resp.modalidad !== modalidad.codigo ||
          typeof resp.importe !== 'number' ||
          typeof resp.que_abonan !== 'number' ||
          typeof resp.total !== 'number' ||
          resp.importe !== calculo.importe ||
          resp.que_abonan !== calculo.queAbonan ||
          resp.total !== calculo.total
        ) {
          throw new Error('El servidor guardó el registro pero devolvió un cálculo distinto. Contactanos antes de pagar.');
        }
        setExito({ importe: resp.importe, queAbonan: resp.que_abonan, total: resp.total });
        return;
      }
      if (!error) {
        // La RPC respondió y rechazó los datos: NO se reintenta por otra vía.
        throw new Error(MOTIVOS[resp?.motivo ?? ''] ?? MENSAJE_GENERICO);
      }
      throw new Error(MENSAJE_GENERICO);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error inesperado.');
    } finally {
      envioEnCurso.current = false;
      setEnviando(false);
    }
  };

  if (exito) {
    const wa = whatsappUrl(
      settings.whatsapp_comprobantes,
      `Hola, soy ${nombre}. Confirmé mi asistencia a los XV de ${settings.quinceanera} (${exito.total} persona(s)). ¡Gracias!`,
    );
    return (
      <Seccion id="confirmar" kicker="Confirmación" titulo="¡Gracias por confirmar!" fondo="jardin" diseno={diseno}>
        <div className="panel-lectura rounded-2xl p-8">
          <CheckCircle2 size={40} className="mx-auto text-[#d6bd7a]" aria-hidden="true" />
          <p className="font-serifada text-2xl text-[#ecdcb0] mt-4">
            {asiste === 'si' ? '¡Te esperamos!' : 'Gracias por avisarnos.'}
          </p>
          {asiste === 'si' && (
            <div className="mt-4 space-y-1 text-[#f8f4e9]/90">
              <p>Total de personas: <strong>{exito.total}</strong></p>
              <p>Personas que abonan: <strong>{exito.queAbonan}</strong></p>
              <p className="font-serifada text-2xl text-[#ecdcb0]">
                Importe estimado: {formatoARS(exito.importe)}
              </p>
              <p className="text-sm text-[#a8b39a]">
                Alias: {settings.alias_transferencia} · Titular: {settings.titular_transferencia} ·
                Límite de pago: {formatearFechaLarga(settings.fecha_limite_pago)}
              </p>
            </div>
          )}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <a href={wa} target="_blank" rel="noreferrer" className="boton-dorado rounded-full px-6 py-3 text-xs font-medium text-center">
              AVISAR POR WHATSAPP
            </a>
            <a href="#invitacion" className="boton-fantasma rounded-full px-6 py-3 text-xs font-medium text-center">
              VOLVER A LA INVITACIÓN
            </a>
          </div>
        </div>
      </Seccion>
    );
  }

  return (
    <Seccion id="confirmar" kicker="RSVP" titulo="Confirmar asistencia" fondo="jardin" diseno={diseno}>
      <p className="texto-sobre-foto -mt-2 mb-6 text-sm text-[#ecdcb0]">
        Fecha límite: {formatearFechaLarga(settings.fecha_limite_confirmacion)}
        {vencida && ' · El plazo venció, pero igual podés escribirnos.'}
      </p>
      <form onSubmit={enviar} className="panel-lectura rounded-2xl p-5 text-left space-y-5 sm:p-8" noValidate>
        <label className="flex items-start gap-3 rounded-xl border border-[#d6bd7a]/40 p-4 text-sm text-[#f8f4e9]">
          <input
            type="checkbox"
            checked={modalidadConfirmada}
            onChange={(e) => setModalidadConfirmada(e.target.checked)}
            className="mt-1 accent-[#d6bd7a]"
          />
          <span>
            Confirmo que esta invitación corresponde a <strong>{modalidad.nombre}</strong>: de {modalidad.hora_inicio} a {modalidad.hora_fin},
            {formatoARS(modalidad.precio)} por persona que deba abonar.
            {modalidad.edad_minima !== null && ` Menores de ${modalidad.edad_minima} años exentos.`}
            {modalidad.permite_acompanantes ? ' Se permiten acompañantes.' : ' No se permiten acompañantes.'}
          </span>
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Nombre y apellido *</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5 outline-none focus:ring-2 ring-[#d6bd7a]"
              placeholder="Ej.: María González"
              autoComplete="name"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Correo electrónico *</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5 outline-none focus:ring-2 ring-[#d6bd7a]"
              placeholder="tu@correo.com"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Teléfono (opcional)</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              type="tel"
              className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5 outline-none focus:ring-2 ring-[#d6bd7a]"
              placeholder="Ej.: 351 123 4567"
              autoComplete="tel"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Tu edad al día de la fiesta *</span>
            <input
              value={edadTitular}
              onChange={(e) => setEdadTitular(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5 outline-none focus:ring-2 ring-[#d6bd7a]"
              placeholder="Ej.: 34"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">¿Asistís? *</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(['si', 'no'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAsiste(v)}
                aria-pressed={asiste === v}
                className={`rounded-full px-4 py-3 text-xs font-medium tracking-[0.15em] ${
                  asiste === v ? 'boton-dorado' : 'boton-fantasma'
                }`}
              >
                {v === 'si' ? 'SÍ, VOY' : 'NO PUEDO IR'}
              </button>
            ))}
          </div>
        </fieldset>

        {asiste === 'si' && (
          <>
            <label className="block">
              <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Apellido familiar o grupo</span>
              <input
                value={familia}
                onChange={(e) => setFamilia(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5 outline-none focus:ring-2 ring-[#d6bd7a]"
                placeholder="Ej.: Familia González"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['Adultos (incluyéndote)', adultos, 'a'],
                  ['Menores (incluyendo los tuyos)', menores, 'm'],
                ] as const
              ).map(([etiqueta, valor, cual]) => (
                <div key={cual} className="rounded-xl border border-[#d6bd7a]/30 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-[0.15em] text-[#a8b39a]">{etiqueta}</p>
                  <div className="mt-2 flex items-center justify-center gap-4">
                    <button
                      type="button"
                      aria-label={`Quitar ${etiqueta}`}
                      onClick={() => {
                        const n = Math.max(0, valor - 1);
                        if (cual === 'a') {
                          setAdultos(n);
                          sincronizar(n, menores);
                        } else {
                          setMenores(n);
                          sincronizar(adultos, n);
                        }
                      }}
                      className="rounded-full border border-[#d6bd7a]/60 p-1.5 text-[#ecdcb0]"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="font-serifada text-3xl text-[#ecdcb0] tabular-nums">{valor}</span>
                    <button
                      type="button"
                      aria-label={`Agregar ${etiqueta}`}
                      onClick={() => {
                        const n = Math.min(20, valor + 1);
                        if (cual === 'a') {
                          setAdultos(n);
                          sincronizar(n, menores);
                        } else {
                          setMenores(n);
                          sincronizar(adultos, n);
                        }
                      }}
                      className="rounded-full border border-[#d6bd7a]/60 p-1.5 text-[#ecdcb0]"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {detalleEsperado > 0 && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">
                  Detalle de acompañantes (nombre y edad al día de la fiesta)
                </p>
                {acompanantes.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px] gap-2">
                    <input
                      value={a.nombre}
                      onChange={(e) =>
                        setAcompanantes((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)),
                        )
                      }
                      placeholder={`Acompañante ${i + 1} · Nombre y apellido`}
                      className="rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5 outline-none focus:ring-2 ring-[#d6bd7a]"
                    />
                    <input
                      value={a.edad}
                      onChange={(e) =>
                        setAcompanantes((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, edad: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) } : x,
                          ),
                        )
                      }
                      placeholder="Edad"
                      inputMode="numeric"
                      aria-label={`Edad del acompañante ${i + 1}`}
                      className="rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5 outline-none focus:ring-2 ring-[#d6bd7a]"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl bg-[#183b2d]/70 border border-[#d6bd7a]/30 p-4 text-center">
              {calculo.error ? (
                <p className="text-sm text-[#f8f4e9]/85">{calculo.error}</p>
              ) : (
                <>
                  <p className="text-sm text-[#f8f4e9]/85">
                    {calculo.total} persona(s) · {calculo.queAbonan} abonan · Menores de {settings.edad_minima_paga} no abonan
                  </p>
                  <p className="font-serifada text-3xl text-[#ecdcb0] mt-1">
                    {formatoARS(calculo.importe)}
                  </p>
                </>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Observaciones (opcional)</span>
                <input
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5 outline-none focus:ring-2 ring-[#d6bd7a]"
                  placeholder="Lo que quieras contarnos…"
                />
              </label>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-red-300/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        )}
        {!isSupabaseConfigured && (
          <p className="rounded-lg border border-[#d6bd7a]/40 bg-[#d6bd7a]/10 px-4 py-3 text-sm text-[#ecdcb0]">
            Modo demostración: la base de datos aún no está conectada. Nada de lo que cargues se guarda.
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="boton-dorado w-full rounded-full px-6 py-4 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Send size={16} aria-hidden="true" />
          {enviando ? 'GUARDANDO…' : 'CONFIRMAR'}
        </button>
      </form>
    </Seccion>
  );
}
