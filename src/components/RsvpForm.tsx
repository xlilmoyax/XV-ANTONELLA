import { useMemo, useState, type FormEvent } from 'react';
import type { DisenoMap } from '../xv/diseno';
import { CheckCircle2, Minus, Plus, Send } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { whatsappUrl } from '../xv/config';
import { debeAbonar, formatoARS, importeEstimado } from '../xv/pricing';
import { formatearFechaLarga } from '../xv/useEvent';
import type { EventVM } from '../xv/useEvent';
import { Seccion } from './EventInfo';

interface Acompanante {
  nombre: string;
  edad: string; // texto libre numérico
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type DestinoModalidad =
  | { accion: 'omitir' }
  | { accion: 'usar'; id: string }
  | { accion: 'detener'; motivo: string };

/**
 * Clasifica la respuesta de modalidades para el INSERT directo (puro, testeable):
 * - tabla ausente (42P01/PGRST205/sin caché) = esquema antiguo confirmado → omitir.
 * - cualquier otro error = detener (no confundir permisos/red/conexión con esquema viejo).
 * - tabla presente sin fila = configuración incompleta → detener.
 * La rama 'omitir' es TRANSITORIA: retirar cuando 0007 + frontend verificado
 * hagan el campo obligatorio en todas las rutas.
 */
export function decidirModalidad(
  error: { code?: string; message?: string } | null,
  data: { id?: string } | null,
): DestinoModalidad {
  if (error) {
    const msg = `${error.code ?? ''} ${error.message ?? ''}`;
    if (/42P01|PGRST205|does not exist|schema cache/i.test(msg)) return { accion: 'omitir' };
    return {
      accion: 'detener',
      motivo: `No se pudo verificar la modalidad (${error.code ?? 'sin código'}). Probá de nuevo en unos minutos.`,
    };
  }
  if (data?.id) return { accion: 'usar', id: data.id };
  return { accion: 'detener', motivo: 'Falta la configuración de modalidad en el servidor.' };
}

export default function RsvpForm({ settings, diseno }: { settings: EventVM; diseno: DisenoMap }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [edadTitular, setEdadTitular] = useState('');
  const [asiste, setAsiste] = useState<'si' | 'no'>('si');
  const [familia, setFamilia] = useState('');
  const [adultos, setAdultos] = useState(1);
  const [menores, setMenores] = useState(0);
  const [acompanantes, setAcompanantes] = useState<Acompanante[]>([]);
  /* Restricciones alimentarias: eliminadas del formulario público.
     La columna se conserva en DB para valores históricos (visibles en el panel). */
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
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
    if (asiste === 'no') return { queAbonan: 0, importe: 0, total: 0, sinEdad: 0 };
    const ed = edades(acompanantes);
    const edadT = edadTitular.trim() === '' ? null : Number.parseInt(edadTitular, 10);
    const titularAbonan = debeAbonar(Number.isFinite(edadT as number) ? (edadT as number) : null, settings.edad_minima_paga);
    let queAbonan = titularAbonan ? 1 : 0;
    let sinEdad = edadT === null || !Number.isFinite(edadT as number) ? 0 : 0;
    if (edadTitular.trim() === '') sinEdad += 1;
    ed.forEach((e) => {
      if (e === null) {
        queAbonan += 1;
        sinEdad += 1;
      } else if (debeAbonar(e, settings.edad_minima_paga)) queAbonan += 1;
    });
    return {
      queAbonan,
      importe: importeEstimado(queAbonan, settings.precio_tarjeta),
      total: 1 + acompanantes.length,
      sinEdad,
    };
  }, [acompanantes, edadTitular, asiste, settings]);

  const validar = (): string | null => {
    if (nombre.trim().length < 3) return 'Contanos tu nombre y apellido.';
    if (!EMAIL_RE.test(email.trim())) return 'Revisá el correo electrónico: no parece válido.';
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
    duplicado:
      'Ese correo ya tiene una confirmación registrada. Si necesitás modificarla, escribinos por WhatsApp.',
  };

  /**
   * Ausencia INEQUÍVOCA de la RPC (backend pre-0003): exige el código
   * PostgREST de función inexistente Y que el mensaje nombre a la función.
   * Un 404 genérico, un error de red/conexión, un 403 de permisos o un 500
   * de ejecución NO activan el fallback: esos casos muestran error en vez
   * de desviarse a otra vía (evita enmascarar outages y dobles registros).
   */
  const esFuncionAusente = (code?: string, message?: string) =>
    code === 'PGRST202' && /registrar_rsvp/i.test(message ?? '');

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

  const avisarCorreo = async (gid: string) => {
    try {
      await supabase.functions.invoke('enviar-correo', {
        body: { tipo: 'agradecimiento', guest_id: gid },
      });
    } catch {
      /* integración de correo pendiente de activar: se ignora */
    }
  };

  // Vía de compatibilidad: INSERT directo en guests + attendees (requiere
  // migración 0002). Se usa SOLO si la RPC aún no existe en el backend.
  // Falla cerrado (42501) si el backend tampoco tiene 0002.
  const enviarDirecto = async () => {
    const asistencia = asiste === 'si' ? 'confirmado' : 'no_asistira';
    const estadoPago =
      asiste === 'no' || calculo.queAbonan === 0 ? 'no_corresponde' : 'pendiente_pago';

    // ID generado en el cliente: el rol anónimo no tiene SELECT y RLS
    // filtra el RETURNING, por lo que no puede leer el id de vuelta.
    // Conocerlo de antemano permite insertar los acompañantes después
    // sin habilitar ninguna lectura pública.
    const guestId = crypto.randomUUID();

    // Compatibilidad de modalidad (Bloqueante-1): resuelve el UUID público;
    // ante esquema antiguo confirmado se omite; ante duda se detiene.
    let destino: DestinoModalidad;
    try {
      const { data, error } = await supabase
        .from('modalidades')
        .select('id')
        .eq('codigo', 'familiares')
        .maybeSingle();
      destino = decidirModalidad(
        error ? { code: error.code ?? undefined, message: error.message } : null,
        (data as { id?: string } | null) ?? null,
      );
    } catch {
      destino = { accion: 'detener', motivo: 'No se pudo verificar la modalidad. Probá de nuevo en unos minutos.' };
    }
    if (destino.accion === 'detener') throw new Error(destino.motivo);
    if (destino.accion === 'omitir') {
      console.warn('[RSVP] Esquema sin modalidades: registro en modo compatibilidad (transitorio).');
    }

    const { error: gErr } = await supabase.from('guests').insert({
      id: guestId,
      ...(destino.accion === 'usar' ? { modalidad_id: destino.id } : {}),
      nombre_apellido: nombre.trim(),
      email: email.trim().toLowerCase(),
      telefono: telefono.trim() || null,
      asistencia,
      apellido_familiar: familia.trim() || null,
      cantidad_adultos: asiste === 'si' ? adultos : 0,
      cantidad_menores: asiste === 'si' ? menores : 0,
      observaciones: observaciones.trim() || null,
      importe_estimado: calculo.importe,
      estado_pago: estadoPago,
    });

    if (gErr) {
      if ((gErr as { code?: string }).code === '23505') {
        throw new Error(MOTIVOS.duplicado);
      }
      throw new Error(MENSAJE_GENERICO);
    }

    if (asiste === 'si') {
      const edadT = edadTitular.trim() === '' ? null : Number.parseInt(edadTitular, 10);
      const filas = [
        {
          guest_id: guestId,
          nombre: nombre.trim(),
          edad_al_evento: edadT,
          es_titular: true,
          debe_abonar: debeAbonar(edadT, settings.edad_minima_paga),
        },
        ...acompanantes.map((a, i) => {
          const e = edades(acompanantes)[i] as number;
          return {
            guest_id: guestId,
            nombre: a.nombre.trim(),
            edad_al_evento: e,
            es_titular: false,
            debe_abonar: debeAbonar(e, settings.edad_minima_paga),
          };
        }),
      ];
      const { error: aErr } = await supabase.from('attendees').insert(filas);
      if (aErr) throw new Error('Guardamos tu confirmación pero falló el detalle. Avisanos por WhatsApp.');
    }

    await avisarCorreo(guestId);
    setExito({ importe: calculo.importe, queAbonan: calculo.queAbonan, total: asiste === 'si' ? calculo.total : 0 });
  };

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
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
    setEnviando(true);
    try {
      // Vía preferida: RPC atómica registrar_rsvp (migración 0003 aplicada).
      // Si la función aún no existe en el backend, se usa el INSERT directo
      // (enviarDirecto, requiere 0002). En ningún orden de despliegue el
      // formulario queda sin una vía válida de registro.
      const { data, error } = await supabase.rpc('registrar_rsvp', {
        payload: construirPayload(),
      });
      const resp = data as RpcResp | null;

      if (!error && resp?.ok) {
        // Éxito solo con forma válida: sin guest_id/importes numéricos no se
        // informa éxito aunque ok sea true (resultado ambiguo → error).
        if (
          typeof resp.guest_id !== 'string' ||
          typeof resp.importe !== 'number' ||
          typeof resp.que_abonan !== 'number' ||
          typeof resp.total !== 'number'
        ) {
          throw new Error(MENSAJE_GENERICO);
        }
        await avisarCorreo(resp.guest_id);
        setExito({ importe: resp.importe, queAbonan: resp.que_abonan, total: resp.total });
        return;
      }
      if (!error) {
        // La RPC respondió y rechazó los datos: NO se reintenta por otra vía.
        throw new Error(MOTIVOS[resp?.motivo ?? ''] ?? MENSAJE_GENERICO);
      }
      if (!esFuncionAusente(error.code, error.message)) {
        // Conexión, permisos, ejecución u otro 4xx/5xx: podría haberse
        // guardado o haber un outage; no se reintenta por otra vía.
        throw new Error(MENSAJE_GENERICO);
      }
      await enviarDirecto();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error inesperado.');
    } finally {
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
            {asiste === 'si' ? '¡Te esperamos para una noche mágica!' : 'Gracias por avisarnos.'}
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
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Tu edad al día de la fiesta (opcional)</span>
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
              <p className="text-sm text-[#f8f4e9]/85">
                {calculo.total} persona(s) · {calculo.queAbonan} abonan · Menores de {settings.edad_minima_paga} no abonan
              </p>
              <p className="font-serifada text-3xl text-[#ecdcb0] mt-1">
                {formatoARS(calculo.importe)}
              </p>
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
