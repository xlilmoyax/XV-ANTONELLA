// Edge Function: enviar-correo
// Envía el agradecimiento inmediato tras una confirmación positiva.
// Idempotente: clave `agradecimiento:<guest_id>` en email_logs.
// Secretos (nunca en el repo): RESEND_API_KEY, EMAIL_FROM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Desplegar con: supabase functions deploy enviar-correo --no-verify-jwt (invocación con anon key + guest_id propio)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const EMAIL_FROM = Deno.env.get('EMAIL_FROM')!;
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const { tipo, guest_id } = await req.json();
    if (tipo !== 'agradecimiento' || !guest_id) {
      return Response.json({ ok: false, motivo: 'parametros' }, { status: 400 });
    }
    const sb = createClient(SB_URL, SB_SERVICE);

    const { data: guest } = await sb.from('guests').select('*').eq('id', guest_id).single();
    if (!guest || guest.asistencia !== 'confirmado') {
      return Response.json({ ok: false, motivo: 'no-elegible' });
    }

    const clave = `agradecimiento:${guest_id}`;
    const { data: existente } = await sb
      .from('email_logs')
      .select('id,estado')
      .eq('idempotencia_clave', clave)
      .maybeSingle();
    if (existente?.estado === 'enviado') return Response.json({ ok: true, duplicado: true });

    const { data: tpl } = await sb
      .from('email_templates')
      .select('*')
      .eq('clave', 'agradecimiento')
      .single();

    const nombre = guest.nombre_apellido.split(' ')[0] ?? guest.nombre_apellido;
    const asunto = tpl?.asunto ?? '¡Gracias por confirmar tu asistencia a los XV de Antonella!';
    const texto = (tpl?.cuerpo ?? '¡Gracias por confirmar!').replaceAll('[Nombre]', nombre);

    const logId =
      existente?.id ??
      (
        await sb
          .from('email_logs')
          .insert({
            guest_id,
            tipo: 'agradecimiento',
            destinatario: guest.email,
            asunto,
            estado: 'pendiente',
            idempotencia_clave: clave,
          })
          .select('id')
          .single()
      ).data?.id;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [guest.email], subject: asunto, text: texto }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      await sb
        .from('email_logs')
        .update({ estado: 'fallido', intentos: 1, error: err.slice(0, 500) })
        .eq('id', logId);
      return Response.json({ ok: false, motivo: 'proveedor' }, { status: 502 });
    }

    await sb
      .from('email_logs')
      .update({ estado: 'enviado', intentos: 1, enviado_at: new Date().toISOString() })
      .eq('id', logId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, motivo: String(e).slice(0, 200) }, { status: 500 });
  }
});
