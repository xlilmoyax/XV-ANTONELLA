import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BarChart3,
  BookOpenText,
  History,
  Images,
  LogOut,
  Mail,
  Menu,
  Layers,
  PenLine,
  RefreshCw,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import type { Attendee, Guest } from '../xv/types';
import { calcularMetricas, type AjustesEvento, type AuditRow, type EmailLogRow, type GrupoRow, type MiembroRow, type PagoRow } from '../xv/metricas';
import { enlacePara, vistaModalidad } from '../xv/modalidad';
import {
  Asistente,
  Contenidos,
  Correos,
  GaleriaAdmin,
  Historial,
  Invitados,
  Pagos,
  Pendientes,
  Resumen,
  Tarjetas,
  Verificados,
  type Ctx,
  type SeccionId,
} from './admin/Secciones';
import { CajaError } from './admin/atomos';

type R = Record<string, unknown>;

const NAV_PRINCIPAL: Array<{ id: SeccionId; etiqueta: string }> = [
  { id: 'resumen', etiqueta: 'Resumen' },
  { id: 'invitados', etiqueta: 'Invitados y familias' },
  { id: 'pagos', etiqueta: 'Control de pagos' },
  { id: 'verificados', etiqueta: 'Verificados' },
  { id: 'pendientes', etiqueta: 'Pendientes' },
  { id: 'asistente', etiqueta: 'Asistente' },
  { id: 'historial', etiqueta: 'Historial' },
];

const NAV_INVITACION: Array<{ id: SeccionId; etiqueta: string }> = [
  { id: 'contenidos', etiqueta: 'Contenidos' },
  { id: 'tarjetas', etiqueta: 'Edición de tarjetas' },
  { id: 'galeria', etiqueta: 'Galería' },
  { id: 'correos', etiqueta: 'Correos' },
];

const ICONOS: Record<SeccionId, React.ReactNode> = {
  resumen: <BarChart3 size={16} />,
  invitados: <Users size={16} />,
  pagos: <Wallet size={16} />,
  verificados: <BookOpenText size={16} />,
  pendientes: <History size={16} />,
  asistente: <BookOpenText size={16} />,
  historial: <History size={16} />,
  contenidos: <PenLine size={16} />,
  tarjetas: <Layers size={16} />,
  galeria: <Images size={16} />,
  correos: <Mail size={16} />,
};

const TITULOS: Record<SeccionId, { titulo: string; bajada: string }> = {
  resumen: { titulo: 'Resumen general', bajada: 'Estado del evento a simple vista, con datos reales.' },
  invitados: { titulo: 'Invitados y familias', bajada: 'Personas registradas, acompañantes y grupos.' },
  pagos: { titulo: 'Control de pagos y saldos', bajada: 'Obligaciones, avisos y dinero verificado. No es facturación fiscal.' },
  verificados: { titulo: 'Verificados y autorizados', bajada: 'Pagos verificados, exentos y estado de autorización.' },
  pendientes: { titulo: 'Pendientes de gestión', bajada: 'Qué falta resolver, con el motivo concreto.' },
  asistente: { titulo: 'Asistente de gestión', bajada: 'Consultas de solo lectura sobre datos reales.' },
  historial: { titulo: 'Historial y auditoría', bajada: 'Acciones administrativas registradas.' },
  contenidos: { titulo: 'Contenidos del sitio', bajada: 'Textos, datos del evento y versiones.' },
  tarjetas: { titulo: 'Edición de tarjetas', bajada: 'Familiares y Compañeros por separado, en el mismo panel.' },
  galeria: { titulo: 'Galería', bajada: 'Fotografías de la invitación.' },
  correos: { titulo: 'Correos y recordatorios', bajada: 'Plantillas, envíos y próximos recordatorios calculados.' },
};

async function segura(p: unknown): Promise<{ data: unknown; error: string | null }> {
  try {
    const r = (await (p as Promise<{ data: unknown; error: { message: string } | null }>)) as {
      data: unknown;
      error: { message: string } | null;
    };
    return { data: r.data, error: r.error ? r.error.message : null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Error de consulta' };
  }
}

export default function Admin({ onSalir }: { onSalir: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [actor, setActor] = useState<string | null>(null);
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const [foco, setFoco] = useState<{ tab: SeccionId; q?: string; fAsist?: string; fPago?: string; n: number }>({
    tab: 'resumen',
    n: 0,
  });

  const [guests, setGuests] = useState<Guest[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [payments, setPayments] = useState<PagoRow[]>([]);
  const [groups, setGroups] = useState<GrupoRow[]>([]);
  const [members, setMembers] = useState<MiembroRow[]>([]);
  const [settings, setSettings] = useState<R | null>(null);
  const [sections, setSections] = useState<R[]>([]);
  const [templates, setTemplates] = useState<R[]>([]);
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [versions, setVersions] = useState<R[]>([]);
  const [images, setImages] = useState<R[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [actualizacion, setActualizacion] = useState('');
  const [filtroMod, setFiltroMod] = useState<string>('todas');
  const [copiado, setCopiado] = useState<string | null>(null);
  const [modalidades, setModalidades] = useState<Array<{ id: string; codigo: string; nombre: string }>>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const em = data.session?.user?.email ?? null;
      if (em) verificarAdmin(em);
      else setCargando(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verificarAdmin = async (em: string) => {
    const { data, error: perfilError } = await supabase
      .from('admin_profiles')
      .select('activo')
      .eq('email', em)
      .maybeSingle();
    if (perfilError) {
      // Fallo de consulta (red/RLS): no confundir con falta de permiso.
      await supabase.auth.signOut();
      setErrorLogin('No se pudo verificar el permiso (fallo de conexión). Probá de nuevo.');
    } else if ((data as { activo?: boolean } | null)?.activo) {
      setActor(em);
      await recargar();
    } else {
      await supabase.auth.signOut();
      setErrorLogin('Ese usuario no es administrador.');
    }
    setCargando(false);
  };

  const recargar = async () => {
    setActualizando(true);
    const [g, a, p, gr, m, s, sec, tpl, lg, au, vs, img, mo] = await Promise.all([
      segura(supabase.from('guests').select('*').order('created_at', { ascending: false }).limit(2000)),
      segura(supabase.from('attendees').select('*').limit(5000)),
      segura(supabase.from('payment_records').select('*').order('created_at', { ascending: false }).limit(500)),
      segura(supabase.from('guest_groups').select('*').order('nombre')),
      segura(supabase.from('group_members').select('*')),
      segura(supabase.from('event_settings').select('*').limit(1).maybeSingle()),
      segura(supabase.from('content_sections').select('*').order('orden')),
      segura(supabase.from('email_templates').select('*')),
      segura(supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(200)),
      segura(supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)),
      segura(supabase.from('configuration_versions').select('id,nombre,descripcion,creado_por,created_at').order('created_at', { ascending: false }).limit(50)),
      segura(supabase.from('gallery_images').select('*').order('orden')),
      segura(supabase.from('modalidades').select('id,codigo,nombre')),
    ]);
    const err: Record<string, string> = {};
    if (g.error) err.guests = g.error; else setGuests((g.data as Guest[]) ?? []);
    if (a.error) err.attendees = a.error; else setAttendees((a.data as Attendee[]) ?? []);
    if (p.error) err.payments = p.error; else setPayments((p.data as PagoRow[]) ?? []);
    if (gr.error) err.groups = gr.error; else setGroups((gr.data as GrupoRow[]) ?? []);
    if (m.error) err.members = m.error; else setMembers((m.data as MiembroRow[]) ?? []);
    if (s.error) err.settings = s.error; else setSettings((s.data as R) ?? null);
    if (sec.error) err.sections = sec.error; else setSections((sec.data as R[]) ?? []);
    if (tpl.error) err.templates = tpl.error; else setTemplates((tpl.data as R[]) ?? []);
    if (lg.error) err.logs = lg.error; else setLogs((lg.data as EmailLogRow[]) ?? []);
    if (au.error) err.audits = au.error; else setAudits((au.data as AuditRow[]) ?? []);
    if (vs.error) err.versions = vs.error; else setVersions((vs.data as R[]) ?? []);
    if (img.error) err.images = img.error; else setImages((img.data as R[]) ?? []);
    if (mo.error) err.modalities = mo.error;
    else {
      setModalidades(
        ((mo.data as Array<{ id: string; codigo: string; nombre: string }>) ?? [])
          .filter((x) => x?.id && x?.codigo),
      );
    }
    setErrores(err);
    setActualizacion(new Date().toLocaleString('es-AR'));
    setActualizando(false);
  };

  const login = async (ev: FormEvent) => {
    ev.preventDefault();
    setErrorLogin(null);
    if (!isSupabaseConfigured) {
      setErrorLogin('Falta la configuración del servidor. Avisá al administrador del sitio.');
      return;
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        await verificarAdmin(data.session.user.email ?? email);
        return;
      }
      const codigo = (error as { status?: number; code?: string } | null)?.status ?? (error as { code?: string } | null)?.code;
      const texto = `${codigo ?? ''} ${(error as Error | null)?.message ?? ''}`;
      if (/fetch|network|offline|ECONN|timed out|Load failed|failed/i.test(texto)) {
        setErrorLogin('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
      } else if (/invalid login|invalid_grant|bad request|400/i.test(texto)) {
        setErrorLogin('Credenciales incorrectas.');
      } else {
        setErrorLogin('No se pudo iniciar sesión. Probá de nuevo en unos minutos.');
      }
    } catch {
      setErrorLogin('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
    }
  };

  const salir = async () => {
    await supabase.auth.signOut();
    setActor(null);
    onSalir();
  };

  const ir = (tab: SeccionId, preset?: { q?: string; fAsist?: string; fPago?: string }) => {
    setFoco((f) => ({ tab, q: preset?.q, fAsist: preset?.fAsist, fPago: preset?.fPago, n: f.n + 1 }));
    setDrawer(false);
    window.scrollTo({ top: 0 });
  };

  const copiarEnlace = async (codigo: 'familia_amigos' | 'companeros') => {
    try {
      await navigator.clipboard.writeText(
        enlacePara(codigo, window.location.origin, window.location.pathname),
      );
      setCopiado(`Enlace copiado: ${codigo === 'companeros' ? 'Compañeros' : 'Familiares y amigos'}.`);
    } catch {
      setCopiado('No se pudo copiar (portapapeles no disponible).');
    }
    setTimeout(() => setCopiado(null), 4000);
  };

  const ajustes: AjustesEvento | null = settings
    ? {
        fecha_limite_pago: String(settings.fecha_limite_pago ?? ''),
        recordatorio_cada_dias: Number(settings.recordatorio_cada_dias ?? 10),
        recordatorios_activos: Boolean(settings.recordatorios_activos ?? true),
      }
    : null;

  // Vista por modalidad: un solo filtro global; dashboard, listados,
  // asistente e informes usan el mismo recorte (consistencia garantizada).
  const modId =
    filtroMod === 'todas'
      ? null
      : filtroMod === 'sin_clasificar'
        ? 'sin_clasificar'
        : (modalidades.find((x) => x.codigo === filtroMod)?.id ?? 'inexistente');
  const fuente = useMemo(
    () => vistaModalidad(guests, attendees, payments, modId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guests, attendees, payments, modId],
  );

  const metrica = useMemo(
    () =>
      ajustes
        ? calcularMetricas(fuente.guests, fuente.attendees, fuente.payments, groups, members, logs, ajustes, modalidades)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fuente, groups, members, logs, settings, modalidades],
  );

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f1e8]">
        <p className="text-sm text-stone-500">Verificando acceso…</p>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0e241b] px-6 py-16">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-[#d6bd7a]/40 bg-[#fffdf7] p-8">
          <h2 className="text-center font-serifada text-3xl text-[#183b2d]">Acceso privado</h2>
          <p className="mt-1 text-center text-xs uppercase tracking-[0.2em] text-stone-500">Solo administradoras</p>
          <label className="mt-6 block">
            <span className="text-xs uppercase tracking-[0.2em] text-stone-500">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-stone-900" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.2em] text-stone-500">Contraseña</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-stone-900" />
          </label>
          {errorLogin && <p role="alert" className="mt-3 text-sm text-red-700">{errorLogin}</p>}
          <button type="submit" className="mt-6 w-full rounded-full bg-[#183b2d] px-6 py-3 text-xs font-medium text-white">INGRESAR</button>
        </form>
      </div>
    );
  }

  const sinConfig = !settings;
  const sinInvitados = Boolean(errores.guests);

  const ctx: Ctx | null =
    metrica && ajustes
      ? {
          m: metrica,
          guests: fuente.guests,
          attendees: fuente.attendees,
          payments: fuente.payments,
          groups,
          members,
          logs,
          audits,
          templates,
          sections,
          images,
          versions,
          settings,
          ajustes,
          actor,
          recargar,
          ir,
          actualizacion,
          erroresCarga: errores,
          modalidades,
          vistaModalidad: filtroMod,
        }
      : null;

  const navBtn = (id: SeccionId, etiqueta: string) => (
    <button
      key={id}
      onClick={() => ir(id)}
      aria-current={foco.tab === id ? 'page' : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
        foco.tab === id ? 'bg-[#d6bd7a] font-semibold text-[#183b2d]' : 'text-[#f8f4e9]/85 hover:bg-white/10'
      }`}
    >
      <span aria-hidden="true">{ICONOS[id]}</span> {etiqueta}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f4f1e8] text-stone-900 md:flex">
      {/* Lateral escritorio */}
      <aside className="hidden w-60 shrink-0 flex-col bg-[#0e241b] p-4 md:flex" aria-label="Navegación del panel">
        <p className="px-1 font-serifada text-xl text-[#ecdcb0]">XV · Admin</p>
        <p className="px-1 text-[11px] text-[#a8b39a]">{actor}</p>
        <nav className="mt-4 space-y-1">
          {NAV_PRINCIPAL.map((n) => navBtn(n.id, n.etiqueta))}
        </nav>
        <p className="mt-5 px-3 text-[10px] uppercase tracking-[0.2em] text-[#a8b39a]">Invitación</p>
        <nav className="mt-1 space-y-1">
          {NAV_INVITACION.map((n) => navBtn(n.id, n.etiqueta))}
        </nav>
        <button onClick={salir} className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#f8f4e9]/85 hover:bg-white/10">
          <LogOut size={16} /> Salir
        </button>
      </aside>

      {/* Barra móvil + drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-[#0e241b] px-4 py-3 md:hidden">
        <p className="font-serifada text-lg text-[#ecdcb0]">XV · Admin</p>
        <button onClick={() => setDrawer(true)} aria-label="Abrir menú" className="rounded-lg p-2 text-[#f8f4e9] hover:bg-white/10">
          <Menu size={20} />
        </button>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Menú del panel">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-[#0e241b] p-4">
            <div className="flex items-center justify-between">
              <p className="font-serifada text-lg text-[#ecdcb0]">Secciones</p>
              <button onClick={() => setDrawer(false)} aria-label="Cerrar menú" className="rounded-lg p-2 text-[#f8f4e9] hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <nav className="mt-3 space-y-1">
              {NAV_PRINCIPAL.map((n) => navBtn(n.id, n.etiqueta))}
            </nav>
            <p className="mt-4 px-3 text-[10px] uppercase tracking-[0.2em] text-[#a8b39a]">Invitación</p>
            <nav className="mt-1 space-y-1">
              {NAV_INVITACION.map((n) => navBtn(n.id, n.etiqueta))}
            </nav>
            <button onClick={salir} className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#f8f4e9]/85 hover:bg-white/10">
              <LogOut size={16} /> Salir ({actor})
            </button>
          </div>
        </div>
      )}

      {/* Contenido */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serifada text-3xl text-[#183b2d]">{TITULOS[foco.tab].titulo}</h2>
              <p className="text-sm text-stone-500">{TITULOS[foco.tab].bajada}</p>
              {filtroMod !== 'todas' && (
                <p className="mt-1 inline-block rounded-full bg-[#d6bd7a]/40 px-2 py-0.5 text-[11px] font-medium text-[#183b2d]">
                  Vista: {filtroMod === 'sin_clasificar' ? 'Sin clasificar' : modalidades.find((x) => x.codigo === filtroMod)?.nombre ?? filtroMod}
                  {modId === 'inexistente' ? ' (tabla de modalidades aún no disponible: sin registros)' : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-stone-500">
                Modalidad
                <select
                  value={filtroMod}
                  onChange={(e) => setFiltroMod(e.target.value)}
                  aria-label="Filtrar por modalidad"
                  className="rounded-full border border-stone-300 bg-white px-2 py-1.5 text-xs font-medium text-stone-700"
                >
                  <option value="todas">Todas</option>
                  <option value="sin_clasificar">Sin clasificar</option>
                  <option value="familia_amigos">Familia y amigos</option>
                  <option value="companeros">Compañeros</option>
                </select>
              </label>
              {actualizacion && <span className="text-[11px] text-stone-400">Datos: {actualizacion}</span>}
              <button
                onClick={recargar}
                disabled={actualizando}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 disabled:opacity-50"
              >
                <RefreshCw size={13} className={actualizando ? 'animate-spin' : ''} />
                {actualizando ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs" aria-label="Enlaces para invitados">
            <span className="font-medium text-stone-700">Enlaces:</span>
            <button
              onClick={() => copiarEnlace('familia_amigos')}
              className="rounded-full border border-stone-300 px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-100"
            >
              Copiar Familiares y amigos
            </button>
            <button
              onClick={() => copiarEnlace('companeros')}
              className="rounded-full border border-stone-300 px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-100"
            >
              Copiar Compañeros
            </button>
            {copiado && <span role="status" className="text-emerald-800">{copiado}</span>}
            <span className="text-stone-500">Los enlaces solo abren la tarjeta; no autorizan. B aún no admite registros reales.</span>
          </div>

          {Object.keys(errores).length > 0 && (
            <div className="mt-4">
              <CajaError
                titulo="Algunas consultas fallaron: los datos pueden estar incompletos (no se muestran como cero confirmados)."
                detalle={Object.entries(errores).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                onReintentar={recargar}
              />
            </div>
          )}

          <div className="mt-5">
            {sinConfig || !ctx ? (
              <CajaError
                titulo="Sin configuración del evento"
                detalle={errores.settings ?? 'No se pudo cargar event_settings: sin reglas no se calculan importes ni exentos.'}
                onReintentar={recargar}
              />
            ) : sinInvitados ? (
              <CajaError
                titulo="No se pudieron cargar los invitados"
                detalle={errores.guests ?? 'Error desconocido.'}
                onReintentar={recargar}
              />
            ) : (
              <>
                {foco.tab === 'resumen' && <Resumen ctx={ctx} />}
                {foco.tab === 'invitados' && (
                  <Invitados key={foco.n} ctx={ctx} presetQ={foco.q} presetAsist={foco.fAsist} presetPago={foco.fPago} />
                )}
                {foco.tab === 'pagos' && <Pagos ctx={ctx} />}
                {foco.tab === 'verificados' && <Verificados ctx={ctx} />}
                {foco.tab === 'pendientes' && <Pendientes ctx={ctx} />}
                {foco.tab === 'asistente' && <Asistente ctx={ctx} />}
                {foco.tab === 'historial' && <Historial ctx={ctx} />}
                {foco.tab === 'contenidos' && <Contenidos settings={settings} sections={sections} templates={templates} versions={versions} actor={actor} recargar={recargar} />}
                {foco.tab === 'tarjetas' && <Tarjetas ctx={ctx} />}
                {foco.tab === 'galeria' && <GaleriaAdmin images={images} actor={actor} recargar={recargar} />}
                {foco.tab === 'correos' && <Correos ctx={ctx} />}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
