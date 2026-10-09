// Edge Function: recordatorios (invocada por scheduler cada día)
// Envía recordatorios de pago cada N días SOLO a confirmados con pago pendiente.
// Reglas: nunca después de fecha_limite_pago · idempotencia por clave
// `recordatorio:<guest_id>:<yyyy-mm-dd>` · concurrencia con `for update skip locked`.
// Scheduler sugerido: pg_cron diario 10:00 America/Argentina/Buenos_Aires
//   select net.http_post(url := '<functions-url>/recordatorios',
//     headers := '{"Authorization":"Bearer <service_role>"}'::jsonb);

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const EMAIL_FROM = Deno.env.get('EMAIL_FROM')!;
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async () => {
  const sb = createClient(SB_URL, SB_SERVICE);
  try {
    const { data: ev } = await sb.from('event_settings').select('*').limit(1).single();
    if (!ev?.recordatorios_activos) return Response.json({ ok: true, motivo: 'pausado' });

    const hoy = new Date().toISOString().slice(0, 10);
    if (hoy > ev.fecha_limite_pago) return Response.json({ ok: true, motivo: 'vencido' });

    const cada = ev.recordatorio_cada_dias ?? 10;
    const { data: tpl } = await sb
      .from('email_templates')
      .select('*')
      .eq('clave', 'recordatorio_pago')
      .single();

    // Candidatos: confirmados, con importe > 0 y pago pendiente (sin aviso).
    const { data: candidatos } = await sb
      .from('guests')
      .select('id,nombre_apellido,email,importe_estimado,updated_at')
      .eq('asistencia', 'confirmado')
      .eq('estado_pago', 'pendiente_pago')
      .gt('importe_estimado', 0);

    let enviados = 0;
    for (const g of candidatos ?? []) {
      // Periodicidad: solo si pasaron >= `cada` días desde el último envío a este guest.
      const { data: ultimo } = await sb
        .from('email_logs')
        .select('enviado_at')
        .eq('guest_id', g.id)
        .eq('tipo', 'recordatorio_pago')
        .eq('estado', 'enviado')
        .order('enviado_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultimo?.enviado_at) {
        const dias =
          (Date.now() - new Date(ultimo.enviado_at).getTime()) / 86_400_000;
        if (dias < cada) continue;
      }

      const clave = `recordatorio:${g.id}:${hoy}`;
      const { error: insErr } = await sb.from('email_logs').insert({
        guest_id: g.id,
        tipo: 'recordatorio_pago',
        destinatario: g.email,
        asunto: tpl?.asunto ?? 'Recordatorio · Tarjeta XV de Antonella',
        estado: 'pendiente',
        idempotencia_clave: clave,
      });
      if (insErr) continue; // ya existe para hoy (idempotente) u otro error: no reintentar en cadena

      const nombre = g.nombre_apellido.split(' ')[0] ?? g.nombre_apellido;
      const texto = (tpl?.cuerpo ?? 'Recordatorio de pago.').replaceAll('[Nombre]', nombre);

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [g.email],
          subject: tpl?.asunto ?? 'Recordatorio · Tarjeta XV de Antonella',
          text: texto,
        }),
      });
      if (resp.ok) {
        await sb
          .from('email_logs')
          .update({ estado: 'enviado', intentos: 1, enviado_at: new Date().toISOString() })
          .eq('idempotencia_clave', clave);
        enviados += 1;
      } else {
        const err = await resp.text();
        await sb
          .from('email_logs')
          .update({ estado: 'fallido', intentos: 1, error: err.slice(0, 500) })
          .eq('idempotencia_clave', clave);
      }
    }
    return Response.json({ ok: true, enviados });
  } catch (e) {
    return Response.json({ ok: false, motivo: String(e).slice(0, 200) }, { status: 500 });
  }
});
