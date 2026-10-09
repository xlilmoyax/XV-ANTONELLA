import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  BarChart3,
  Download,
  History,
  Images,
  LogOut,
  Mail,
  PenLine,
  Settings2,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { formatoARS } from '../xv/pricing';
import type { Guest } from '../xv/types';

type Tab =
  | 'resumen'
  | 'invitados'
  | 'pagos'
  | 'familias'
  | 'contenidos'
  | 'galeria'
  | 'correos'
  | 'historial';

const TABS: Array<{ id: Tab; etiqueta: string; icono: ReactNode }> = [
  { id: 'resumen', etiqueta: 'Resumen', icono: <BarChart3 size={15} /> },
  { id: 'invitados', etiqueta: 'Invitados', icono: <Users size={15} /> },
  { id: 'pagos', etiqueta: 'Pagos', icono: <Wallet size={15} /> },
  { id: 'familias', etiqueta: 'Familias', icono: <UsersRound size={15} /> },
  { id: 'contenidos', etiqueta: 'Contenidos', icono: <PenLine size={15} /> },
  { id: 'galeria', etiqueta: 'Galería', icono: <Images size={15} /> },
  { id: 'correos', etiqueta: 'Correos', icono: <Mail size={15} /> },
  { id: 'historial', etiqueta: 'Historial', icono: <History size={15} /> },
];

async function auditar(actor: string | null, entidad: string, registro: string | null, accion: string, anteriores: unknown, nuevos: unknown) {
  try {
    await supabase.from('audit_logs').insert({
      actor_email: actor,
      entidad,
      registro_id: registro,
      accion,
      anteriores,
      nuevos,
    });
  } catch {
    /* auditoría best-effort */
  }
}

function csv(rows: Array<Record<string, unknown>>, nombre: string) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const texto = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + texto], { type: 'text/csv' }));
  a.download = nombre;
  a.click();
}

export default function Admin({ onSalir }: { onSalir: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [actor, setActor] = useState<string | null>(null);
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('resumen');
  const [cargando, setCargando] = useState(true);

  const [guests, setGuests] = useState<Guest[]>([]);
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [groups, setGroups] = useState<Array<Record<string, unknown>>>([]);
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [sections, setSections] = useState<Array<Record<string, unknown>>>([]);
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [audits, setAudits] = useState<Array<Record<string, unknown>>>([]);
  const [versions, setVersions] = useState<Array<Record<string, unknown>>>([]);
  const [images, setImages] = useState<Array<Record<string, unknown>>>([]);

  const [q, setQ] = useState('');
  const [fAsist, setFAsist] = useState('');
  const [fPago, setFPago] = useState('');
  const [pagina, setPagina] = useState(0);
  const POR_PAGINA = 20;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const em = data.session?.user?.email ?? null;
      if (em) verificarAdmin(em);
      else setCargando(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verificarAdmin = async (em: string) => {
    const { data } = await supabase
      .from('admin_profiles')
      .select('activo')
      .eq('email', em)
      .maybeSingle();
    if ((data as { activo?: boolean } | null)?.activo) {
      setActor(em);
      await recargar(em);
    } else {
      await supabase.auth.signOut();
      setErrorLogin('Ese usuario no es administrador.');
    }
    setCargando(false);
  };

  const recargar = async (_actorEmail?: string) => {
    const [g, p, gr, m, s, sec, tpl, lg, au, vs, img] = await Promise.all([
      supabase.from('guests').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('payment_records').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('guest_groups').select('*').order('nombre'),
      supabase.from('group_members').select('*'),
      supabase.from('event_settings').select('*').limit(1).maybeSingle(),
      supabase.from('content_sections').select('*').order('orden'),
      supabase.from('email_templates').select('*'),
      supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('configuration_versions').select('id,nombre,descripcion,creado_por,created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('gallery_images').select('*').order('orden'),
    ]);
    if (g.data) setGuests(g.data as Guest[]);
    if (p.data) setPayments(p.data as Array<Record<string, unknown>>);
    if (gr.data) setGroups(gr.data as Array<Record<string, unknown>>);
    if (m.data) setMembers(m.data as Array<Record<string, unknown>>);
    if (s.data) setSettings(s.data as Record<string, unknown>);
    if (sec.data) setSections(sec.data as Array<Record<string, unknown>>);
    if (tpl.data) setTemplates(tpl.data as Array<Record<string, unknown>>);
    if (lg.data) setLogs(lg.data as Array<Record<string, unknown>>);
    if (au.data) setAudits(au.data as Array<Record<string, unknown>>);
    if (vs.data) setVersions(vs.data as Array<Record<string, unknown>>);
    if (img.data) setImages(img.data as Array<Record<string, unknown>>);
  };

  const login = async (ev: FormEvent) => {
    ev.preventDefault();
    setErrorLogin(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setErrorLogin('Credenciales incorrectas.');
      return;
    }
    await verificarAdmin(data.session.user.email ?? email);
  };

  const salir = async () => {
    await supabase.auth.signOut();
    setActor(null);
    onSalir();
  };

  const resumen = useMemo(() => {
    const conf = guests.filter((g) => g.asistencia === 'confirmado');
    const no = guests.filter((g) => g.asistencia === 'no_asistira');
    const pend = guests.filter((g) => g.asistencia === 'pendiente' || g.asistencia === 'modificado');
    const personas = conf.reduce((a, g) => a + g.cantidad_adultos + g.cantidad_menores, 0);
    const adultos = conf.reduce((a, g) => a + g.cantidad_adultos, 0);
    const menores = conf.reduce((a, g) => a + g.cantidad_menores, 0);
    const porPago = (e: string) => guests.filter((g) => g.estado_pago === e).length;
    const importePend = guests
      .filter((g) => g.asistencia === 'confirmado' && g.estado_pago === 'pendiente_pago')
      .reduce((a, g) => a + g.importe_estimado, 0);
    const mailsOk = logs.filter((l) => l.estado === 'enviado').length;
    const mailsErr = logs.filter((l) => l.estado === 'fallido').length;
    return { conf, no, pend, personas, adultos, menores, porPago, importePend, mailsOk, mailsErr };
  }, [guests, logs]);

  const invitadosFiltrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return guests.filter(
      (g) =>
        (!t || g.nombre_apellido.toLowerCase().includes(t) || g.email.toLowerCase().includes(t) || (g.apellido_familiar ?? '').toLowerCase().includes(t)) &&
        (!fAsist || g.asistencia === fAsist) &&
        (!fPago || g.estado_pago === fPago),
    );
  }, [guests, q, fAsist, fPago]);

  const marcarPago = async (id: string, estado: string) => {
    const antes = payments.find((p) => p.id === id);
    const patch: Record<string, unknown> =
      estado === 'pago_verificado'
        ? { estado, verificado_at: new Date().toISOString() }
        : { estado };
    const { error } = await supabase.from('payment_records').update(patch).eq('id', id);
    if (!error) {
      if (antes?.guest_id) {
        await supabase
          .from('guests')
          .update(
            estado === 'pago_verificado'
              ? { estado_pago: estado, pago_verificado_at: new Date().toISOString() }
              : { estado_pago: estado },
          )
          .eq('id', antes.guest_id as string);
      }
      await auditar(actor, 'payment_records', id, estado, antes, patch);
      await recargar();
    }
  };

  if (cargando) {
    return <p className="px-6 py-20 text-center text-[#a8b39a]">Verificando acceso…</p>;
  }

  if (!actor) {
    return (
      <section className="px-6 py-16">
        <form onSubmit={login} className="marco-dorado max-w-sm mx-auto rounded-2xl bg-[#0e241b]/70 p-8">
          <h2 className="font-serifada text-3xl text-[#ecdcb0] text-center">Acceso privado</h2>
          <p className="mt-1 text-center text-xs tracking-[0.2em] text-[#a8b39a] uppercase">
            Solo administradoras
          </p>
          <label className="mt-6 block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5"
              autoComplete="username"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.2em] text-[#a8b39a]">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2.5"
              autoComplete="current-password"
            />
          </label>
          {errorLogin && (
            <p role="alert" className="mt-3 text-sm text-red-200">{errorLogin}</p>
          )}
          <button type="submit" className="boton-dorado mt-6 w-full rounded-full px-6 py-3 text-xs font-medium">
            INGRESAR
          </button>
        </form>
      </section>
    );
  }

  const paginados = invitadosFiltrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA);

  return (
    <div className="px-4 sm:px-6 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-serifada text-3xl text-[#ecdcb0]">Panel · {actor}</h2>
        <button onClick={salir} className="boton-fantasma rounded-full px-4 py-2 text-xs inline-flex items-center gap-2">
          <LogOut size={14} /> SALIR
        </button>
      </div>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Secciones del panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs whitespace-nowrap ${
              tab === t.id ? 'boton-dorado' : 'boton-fantasma'
            }`}
          >
            {t.icono} {t.etiqueta.toUpperCase()}
          </button>
        ))}
      </nav>

      {tab === 'resumen' && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Registros', guests.length],
            ['Confirmados', resumen.conf.length],
            ['No asisten', resumen.no.length],
            ['Pendientes', resumen.pend.length],
            ['Personas', resumen.personas],
            [`Adultos / Menores`, `${resumen.adultos} / ${resumen.menores}`],
            ['Pago pendiente', resumen.porPago('pendiente_pago')],
            ['Avisados', resumen.porPago('pago_informado')],
            ['Verificados', resumen.porPago('pago_verificado')],
            ['Revisión', resumen.porPago('requiere_revision')],
            ['Importe pendiente', formatoARS(resumen.importePend)],
            [`Correos ok / error`, `${resumen.mailsOk} / ${resumen.mailsErr}`],
          ].map(([k, v]) => (
            <div key={k as string} className="marco-dorado rounded-xl bg-[#0e241b]/60 p-4 text-center">
              <p className="font-serifada text-2xl text-[#ecdcb0]">{v as string | number}</p>
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#a8b39a] mt-1">{k as string}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'invitados' && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPagina(0); }}
              placeholder="Buscar nombre, email o familia…"
              className="flex-1 min-w-52 rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2"
            />
            <select value={fAsist} onChange={(e) => setFAsist(e.target.value)} className="rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2">
              <option value="">Asistencia: todas</option>
              <option value="pendiente">Pendiente</option>
              <option value="confirmado">Confirmado</option>
              <option value="no_asistira">No asistirá</option>
              <option value="modificado">Modificado</option>
            </select>
            <select value={fPago} onChange={(e) => setFPago(e.target.value)} className="rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2">
              <option value="">Pago: todos</option>
              <option value="no_corresponde">No corresponde</option>
              <option value="pendiente_pago">Pendiente</option>
              <option value="pago_informado">Informado</option>
              <option value="pago_verificado">Verificado</option>
              <option value="requiere_revision">Revisión</option>
            </select>
            <button
              onClick={() => csv(invitadosFiltrados as unknown as Array<Record<string, unknown>>, 'invitados.csv')}
              className="boton-fantasma rounded-full px-4 py-2 text-xs inline-flex items-center gap-2"
            >
              <Download size={14} /> CSV
            </button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#d6bd7a]/25">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-[#183b2d] text-left text-[#a8b39a] text-xs uppercase tracking-wider">
                  <th className="p-3">Nombre</th><th className="p-3">Email</th><th className="p-3">Familia</th>
                  <th className="p-3">Asist.</th><th className="p-3">Pers.</th>
                  <th className="p-3">Importe</th><th className="p-3">Pago</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map((g) => (
                  <tr key={g.id} className="border-t border-[#d6bd7a]/15 text-[#f8f4e9]">
                    <td className="p-3">{g.nombre_apellido}</td>
                    <td className="p-3 text-[#a8b39a]">{g.email}</td>
                    <td className="p-3">{g.apellido_familiar ?? '—'}</td>
                    <td className="p-3">
                      <select
                        value={g.asistencia}
                        onChange={async (e) => {
                          const antes = { ...g };
                          await supabase.from('guests').update({ asistencia: e.target.value }).eq('id', g.id);
                          await auditar(actor, 'guests', g.id, 'cambio-asistencia', antes, { asistencia: e.target.value });
                          await recargar();
                        }}
                        className="rounded bg-[#183b2d] border border-[#d6bd7a]/40 px-1 py-0.5 text-xs"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="no_asistira">No asistirá</option>
                        <option value="modificado">Modificado</option>
                      </select>
                    </td>
                    <td className="p-3 tabular-nums">{g.cantidad_adultos + g.cantidad_menores}</td>
                    <td className="p-3 tabular-nums">{formatoARS(g.importe_estimado)}</td>
                    <td className="p-3">
                      <select
                        value={g.estado_pago}
                        onChange={async (e) => {
                          const antes = { ...g };
                          await supabase.from('guests').update({ estado_pago: e.target.value }).eq('id', g.id);
                          await auditar(actor, 'guests', g.id, 'cambio-pago', antes, { estado_pago: e.target.value });
                          await recargar();
                        }}
                        className="rounded bg-[#183b2d] border border-[#d6bd7a]/40 px-1 py-0.5 text-xs"
                      >
                        <option value="no_corresponde">No corresponde</option>
                        <option value="pendiente_pago">Pendiente</option>
                        <option value="pago_informado">Informado</option>
                        <option value="pago_verificado">Verificado</option>
                        <option value="requiere_revision">Revisión</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm text-[#a8b39a]">
            <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="boton-fantasma rounded-full px-4 py-1.5 text-xs disabled:opacity-40">← Anterior</button>
            <span>Página {pagina + 1} de {Math.max(1, Math.ceil(invitadosFiltrados.length / POR_PAGINA))} · {invitadosFiltrados.length} registros</span>
            <button
              disabled={(pagina + 1) * POR_PAGINA >= invitadosFiltrados.length}
              onClick={() => setPagina((p) => p + 1)}
              className="boton-fantasma rounded-full px-4 py-1.5 text-xs disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {tab === 'pagos' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-[#a8b39a]">
            Los avisos «Ya Aboné» llegan aquí como <em>pago_informado</em>. Verificar manualmente cada uno: nunca se da por verificado solo por el aviso.
          </p>
          {payments.length === 0 && <p className="text-[#f8f4e9]/70">Sin avisos de pago todavía.</p>}
          {payments.map((p) => (
            <div key={p.id as string} className="marco-dorado rounded-xl bg-[#0e241b]/60 p-4 flex flex-wrap items-center gap-3 justify-between">
              <div className="text-sm">
                <p className="text-[#f8f4e9]">Invitado: <span className="text-[#a8b39a]">{p.guest_id as string}</span></p>
                <p className="text-[#ecdcb0] font-serifada text-xl">{formatoARS(Number(p.monto ?? 0))} · {p.estado as string}</p>
                <p className="text-xs text-[#a8b39a]">
                  Enlace individual: {`${location.origin}${location.pathname}#ya-abone/${p.token_accion as string}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => marcarPago(p.id as string, 'pago_verificado')} className="boton-dorado rounded-full px-4 py-2 text-xs">VERIFICAR</button>
                <button onClick={() => marcarPago(p.id as string, 'requiere_revision')} className="boton-fantasma rounded-full px-4 py-2 text-xs">REVISAR</button>
              </div>
            </div>
          ))}
          <div className="mt-4">
            <h3 className="font-serifada text-xl text-[#ecdcb0]">Invitados con pago informado</h3>
            {guests.filter((g) => g.estado_pago === 'pago_informado').map((g) => (
              <p key={g.id} className="text-sm text-[#f8f4e9]/85 mt-1">
                {g.nombre_apellido} · {g.email} · {formatoARS(g.importe_estimado)}
              </p>
            ))}
          </div>
        </div>
      )}

      {tab === 'familias' && (
        <Familias
          guests={guests}
          groups={groups}
          members={members}
          actor={actor}
          recargar={recargar}
        />
      )}

      {tab === 'contenidos' && (
        <Contenidos
          settings={settings}
          sections={sections}
          templates={templates}
          versions={versions}
          actor={actor}
          recargar={recargar}
        />
      )}

      {tab === 'galeria' && (
        <GaleriaAdmin images={images} actor={actor} recargar={recargar} />
      )}

      {tab === 'correos' && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-amber-300/40 bg-amber-950/30 p-4 text-sm text-amber-100">
            Automatización <strong>preparada pero NO activada</strong>: falta definir proveedor y credenciales (ver README → Correo). No se envía nada hasta entonces.
          </div>
          <h3 className="font-serifada text-xl text-[#ecdcb0]">Plantillas</h3>
          {templates.map((t) => (
            <details key={t.id as string} className="marco-dorado rounded-xl bg-[#0e241b]/60 p-4">
              <summary className="cursor-pointer text-[#f8f4e9]">{t.clave as string} · {t.asunto as string}</summary>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-[#f8f4e9]/85">{t.cuerpo as string}</pre>
            </details>
          ))}
          <h3 className="font-serifada text-xl text-[#ecdcb0]">Últimos envíos</h3>
          {logs.slice(0, 30).map((l) => (
            <p key={l.id as string} className="text-sm text-[#f8f4e9]/80">
              [{l.tipo as string}] {l.destinatario as string} → <strong>{l.estado as string}</strong>
              {l.error ? ` · ${l.error as string}` : ''}
            </p>
          ))}
        </div>
      )}

      {tab === 'historial' && (
        <div className="mt-6 space-y-2">
          {audits.length === 0 && <p className="text-[#f8f4e9]/70">Sin cambios registrados.</p>}
          {audits.map((a) => (
            <div key={a.id as string} className="rounded-lg border border-[#d6bd7a]/20 p-3 text-sm">
              <p className="text-[#ecdcb0]">{a.accion as string} · {a.entidad as string} · {a.registro_id as string}</p>
              <p className="text-xs text-[#a8b39a]">{a.actor_email as string} · {new Date(a.created_at as string).toLocaleString('es-AR')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Familias ---------- */
function Familias({ guests, groups, members, actor, recargar }: {
  guests: Guest[];
  groups: Array<Record<string, unknown>>;
  members: Array<Record<string, unknown>>;
  actor: string | null;
  recargar: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [sugerencias, setSugerencias] = useState<Array<{ apellido: string; ids: string[] }>>([]);

  const generarSugerencias = () => {
    const mapa = new Map<string, string[]>();
    for (const g of guests) {
      const key = (g.apellido_familiar || g.nombre_apellido.split(' ').slice(-1)[0] || '').trim().toLowerCase();
      if (key.length < 2) continue;
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key)!.push(g.id);
    }
    setSugerencias(
      [...mapa.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([apellido, ids]) => ({ apellido, ids }))
        .slice(0, 50),
    );
  };

  const crearGrupo = async (nombreGrupo: string, ids: string[], manual = true) => {
    const { data, error } = await supabase.from('guest_groups').insert({ nombre: nombreGrupo, manual }).select('id').single();
    if (error || !data) return;
    const gid = (data as { id: string }).id;
    await supabase.from('group_members').insert(ids.map((guest_id, i) => ({ group_id: gid, guest_id, orden: i })));
    await auditar(actor, 'guest_groups', gid, 'crear', null, { nombre: nombreGrupo, miembros: ids.length });
    await recargar();
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del grupo…" className="rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2 flex-1 min-w-52" />
        <button onClick={() => nombre.trim() && crearGrupo(nombre.trim(), [])} className="boton-dorado rounded-full px-5 py-2 text-xs">CREAR GRUPO</button>
        <button onClick={generarSugerencias} className="boton-fantasma rounded-full px-5 py-2 text-xs">GENERAR SUGERENCIAS</button>
      </div>
      <p className="text-xs text-[#a8b39a]">
        Las sugerencias agrupan por apellido declarado (no asume que todo coincidente es familia: el admin acepta o corrige). Lo manual nunca se sobrescribe.
      </p>
      {sugerencias.map((s) => (
        <div key={s.apellido} className="marco-dorado rounded-xl bg-[#0e241b]/60 p-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[#f8f4e9]">«{s.apellido}» · {s.ids.length} invitado(s)</p>
          <button onClick={() => crearGrupo(`Familia ${s.apellido}`, s.ids, false)} className="boton-fantasma rounded-full px-4 py-1.5 text-xs">ACEPTAR SUGERENCIA</button>
        </div>
      ))}
      {groups.map((gr) => {
        const mids = members.filter((m) => m.group_id === gr.id);
        return (
          <details key={gr.id as string} className="marco-dorado rounded-xl bg-[#0e241b]/60 p-4">
            <summary className="cursor-pointer text-[#f8f4e9]">
              {gr.nombre as string} · {mids.length} miembro(s) {gr.manual ? '' : '(auto)'}
            </summary>
            <div className="mt-2 space-y-1">
              {mids.map((m) => {
                const g = guests.find((x) => x.id === m.guest_id);
                return (
                  <p key={m.id as string} className="text-sm text-[#f8f4e9]/85 flex justify-between gap-2">
                    <span>{g?.nombre_apellido ?? m.guest_id as string}</span>
                    <button
                      onClick={async () => {
                        await supabase.from('group_members').delete().eq('id', m.id as string);
                        await auditar(actor, 'group_members', m.id as string, 'quitar', m, null);
                        await recargar();
                      }}
                      className="text-xs text-red-200 underline"
                    >
                      quitar
                    </button>
                  </p>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/* ---------- Contenidos / editor ---------- */
function Contenidos({ settings, sections, templates, versions, actor, recargar }: {
  settings: Record<string, unknown> | null;
  sections: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
  actor: string | null;
  recargar: () => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      const f: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) f[k] = String(v ?? '');
      setForm(f);
    }
  }, [settings]);

  const guardarEvento = async () => {
    if (!settings) return;
    // snapshot recuperable antes de publicar
    await supabase.from('configuration_versions').insert({
      nombre: `respaldo-${new Date().toISOString().slice(0, 19)}`,
      descripcion: 'Respaldo automático antes de publicar cambios',
      datos: settings,
      creado_por: actor,
    });
    const patch: Record<string, unknown> = { ...form };
    delete patch.id;
    delete patch.created_at;
    delete patch.updated_at;
    for (const k of ['precio_tarjeta', 'edad_minima_paga', 'recordatorio_cada_dias']) {
      if (patch[k] !== undefined) patch[k] = Number(patch[k]);
    }
    if (typeof patch.recordatorios_activos === 'string') {
      patch.recordatorios_activos = patch.recordatorios_activos === 'true';
    }
    const { error } = await supabase.from('event_settings').update(patch).eq('id', settings.id as string);
    if (!error) {
      await auditar(actor, 'event_settings', settings.id as string, 'publicar', settings, patch);
      setMsg('Publicado. Se guardó un respaldo recuperable.');
      await recargar();
    } else {
      setMsg('No se pudo guardar.');
    }
    setTimeout(() => setMsg(null), 4000);
  };

  const restaurar = async (id: string) => {
    const { data } = await supabase.from('configuration_versions').select('datos').eq('id', id).single();
    const datos = (data as { datos?: Record<string, unknown> } | null)?.datos;
    if (!datos || !settings) return;
    const patch = { ...datos };
    delete patch.id;
    delete patch.created_at;
    delete patch.updated_at;
    await supabase.from('event_settings').update(patch).eq('id', settings.id as string);
    await auditar(actor, 'event_settings', settings.id as string, 'restaurar-version', settings, patch);
    await recargar();
  };

  const CAMPOS: Array<[string, string]> = [
    ['quinceanera', 'Quinceañera'], ['evento', 'Evento'], ['fecha', 'Fecha'],
    ['hora_inicio', 'Hora inicio'], ['hora_fin', 'Hora fin'], ['fecha_fin', 'Fecha fin'],
    ['zona_horaria', 'Zona horaria'], ['salon', 'Salón'], ['direccion', 'Dirección'],
    ['vestimenta', 'Vestimenta'], ['fecha_limite_confirmacion', 'Límite confirmación'],
    ['fecha_limite_pago', 'Límite pago'], ['precio_tarjeta', 'Precio tarjeta'],
    ['edad_minima_paga', 'Edad mínima que paga'], ['whatsapp_comprobantes', 'WhatsApp comprobantes'],
    ['alias_transferencia', 'Alias'], ['titular_transferencia', 'Titular'],
    ['mensaje_final', 'Mensaje final'], ['recordatorio_cada_dias', 'Recordatorio cada (días)'],
  ];

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h3 className="font-serifada text-xl text-[#ecdcb0] flex items-center gap-2">
          <Settings2 size={16} /> Evento
        </h3>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {CAMPOS.map(([k, etiqueta]) => (
            <label key={k} className="block">
              <span className="text-xs uppercase tracking-[0.15em] text-[#a8b39a]">{etiqueta}</span>
              <input
                value={form[k] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2"
              />
            </label>
          ))}
          <label className="block">
            <span className="text-xs uppercase tracking-[0.15em] text-[#a8b39a]">Recordatorios activos</span>
            <select
              value={form.recordatorios_activos ?? 'true'}
              onChange={(e) => setForm((f) => ({ ...f, recordatorios_activos: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2"
            >
              <option value="true">Activados</option>
              <option value="false">Pausados</option>
            </select>
          </label>
        </div>
        <button onClick={guardarEvento} className="boton-dorado mt-4 rounded-full px-6 py-3 text-xs font-medium">
          GUARDAR Y PUBLICAR
        </button>
        {msg && <p className="mt-2 text-sm text-[#ecdcb0]">{msg}</p>}
      </div>

      <div>
        <h3 className="font-serifada text-xl text-[#ecdcb0]">Textos de la invitación</h3>
        {sections.map((s) => (
          <details key={s.id as string} className="marco-dorado mt-2 rounded-xl bg-[#0e241b]/60 p-4">
            <summary className="cursor-pointer text-[#f8f4e9]">{s.clave as string}</summary>
            <textarea
              defaultValue={(s.cuerpo as string) ?? ''}
              rows={3}
              id={`sec-${s.id as string}`}
              className="mt-2 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2"
            />
            <button
              onClick={async () => {
                const el = document.getElementById(`sec-${s.id as string}`) as HTMLTextAreaElement;
                await supabase.from('content_sections').update({ cuerpo: el.value }).eq('id', s.id as string);
                await auditar(actor, 'content_sections', s.id as string, 'editar-texto', s, { cuerpo: el.value });
                await recargar();
              }}
              className="boton-fantasma mt-2 rounded-full px-4 py-1.5 text-xs"
            >
              GUARDAR TEXTO
            </button>
          </details>
        ))}
      </div>

      <div>
        <h3 className="font-serifada text-xl text-[#ecdcb0]">Plantillas de correo</h3>
        {templates.map((t) => (
          <details key={t.id as string} className="marco-dorado mt-2 rounded-xl bg-[#0e241b]/60 p-4">
            <summary className="cursor-pointer text-[#f8f4e9]">{t.clave as string}</summary>
            <input
              defaultValue={t.asunto as string}
              id={`ta-${t.id as string}`}
              className="mt-2 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2"
              aria-label="Asunto"
            />
            <textarea
              defaultValue={t.cuerpo as string}
              rows={5}
              id={`tc-${t.id as string}`}
              className="mt-2 w-full rounded-lg bg-[#fffdf7] text-[#183b2d] px-3 py-2"
              aria-label="Cuerpo"
            />
            <button
              onClick={async () => {
                const a = (document.getElementById(`ta-${t.id as string}`) as HTMLInputElement).value;
                const c = (document.getElementById(`tc-${t.id as string}`) as HTMLTextAreaElement).value;
                await supabase.from('email_templates').update({ asunto: a, cuerpo: c }).eq('id', t.id as string);
                await auditar(actor, 'email_templates', t.id as string, 'editar-plantilla', t, { asunto: a });
                await recargar();
              }}
              className="boton-fantasma mt-2 rounded-full px-4 py-1.5 text-xs"
            >
              GUARDAR PLANTILLA
            </button>
          </details>
        ))}
      </div>

      <div>
        <h3 className="font-serifada text-xl text-[#ecdcb0]">Versiones recuperables</h3>
        {versions.map((v) => (
          <p key={v.id as string} className="mt-1 text-sm text-[#f8f4e9]/85 flex flex-wrap gap-2 items-center">
            <span>{v.nombre as string} · {new Date(v.created_at as string).toLocaleString('es-AR')}</span>
            <button onClick={() => restaurar(v.id as string)} className="text-xs underline text-[#ecdcb0]">
              Recuperar esta versión
            </button>
          </p>
        ))}
      </div>
    </div>
  );
}

/* ---------- Galería admin ---------- */
function GaleriaAdmin({ images, actor, recargar }: {
  images: Array<Record<string, unknown>>;
  actor: string | null;
  recargar: () => Promise<void>;
}) {
  const [subiendo, setSubiendo] = useState(false);

  const subir = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSubiendo(true);
    try {
      for (const f of Array.from(files)) {
        const path = `${Date.now()}-${f.name.replaceAll(' ', '-')}`;
        const { error } = await supabase.storage.from('galeria').upload(path, f, { upsert: false });
        if (error) continue;
        const { data } = supabase.storage.from('galeria').getPublicUrl(path);
        const maxOrden = images.reduce((a, i) => Math.max(a, Number(i.orden ?? 0)), 0);
        await supabase.from('gallery_images').insert({
          storage_path: path,
          url_publica: data.publicUrl,
          orden: maxOrden + 1,
        });
      }
      await auditar(actor, 'gallery_images', null, 'subir', null, { cantidad: files.length });
      await recargar();
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="mt-6">
      <label className="boton-dorado inline-block cursor-pointer rounded-full px-6 py-3 text-xs font-medium">
        {subiendo ? 'SUBIENDO…' : 'SUBIR FOTOS'}
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
      </label>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((img) => (
          <div key={img.id as string} className="marco-dorado rounded-xl overflow-hidden bg-[#0e241b]">
            {img.url_publica ? (
              <img src={img.url_publica as string} alt={(img.epigrafe as string) || 'Foto'} className="aspect-[3/4] w-full object-cover" loading="lazy" />
            ) : (
              <div className="aspect-[3/4]" />
            )}
            <div className="p-2 flex gap-2">
              <button
                onClick={async () => {
                  await supabase.storage.from('galeria').remove([img.storage_path as string]);
                  await supabase.from('gallery_images').delete().eq('id', img.id as string);
                  await auditar(actor, 'gallery_images', img.id as string, 'eliminar', img, null);
                  await recargar();
                }}
                className="text-xs text-red-200 underline"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
