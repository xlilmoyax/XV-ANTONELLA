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

// CORS: el navegador invoca esta función (RsvpForm); sin estos headers el
// preflight falla y el agradecimiento nunca se envía.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const J = (cuerpo: unknown, estado = 200) => Response.json(cuerpo, { status: estado, headers: CORS });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { tipo, guest_id } = await req.json();
    if (tipo !== 'agradecimiento' || !guest_id) {
      return J({ ok: false, motivo: 'parametros' }, 400);
    }
    const sb = createClient(SB_URL, SB_SERVICE);

    const { data: guest } = await sb.from('guests').select('*').eq('id', guest_id).single();
    if (!guest || guest.asistencia !== 'confirmado') {
      return J({ ok: false, motivo: 'no-elegible' });
    }

    const clave = `agradecimiento:${guest_id}`;
    const { data: existente } = await sb
      .from('email_logs')
      .select('id,estado')
      .eq('idempotencia_clave', clave)
      .maybeSingle();
    if (existente?.estado === 'enviado') return J({ ok: true, duplicado: true });

    // NOTA modalidades: plantilla fija 'agradecimiento' (válida hoy: una sola
    // tarjeta operativa). Con 0006, elegir por guests.modalidad_id.
    const { data: tpl } = await sb
      .from('email_templates')
      .select('*')
      .eq('clave', 'agradecimiento')
      .single();

    const nombre = guest.nombre_apellido.split(' ')[0] ?? guest.nombre_apellido;
    const asunto = tpl?.asunto ?? '¡Gracias por confirmar tu asistencia a los XV de Antonella!';
    const texto = (tpl?.cuerpo ?? '¡Gracias por confirmar!').replaceAll('[Nombre]', nombre);

    // Carrera doble-clic: si otro intento insertó primero, UNIQUE revienta;
    // se trata como duplicado en vez de error 500.
    let logId = existente?.id ?? null;
    if (!logId) {
      const ins = await sb
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
        .single();
      if (ins.error && (ins.error as { code?: string }).code === '23505') {
        return J({ ok: true, duplicado: true });
      }
      if (ins.error || !ins.data) return J({ ok: false, motivo: 'registro' }, 500);
      logId = (ins.data as { id: string }).id;
    }

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
      return J({ ok: false, motivo: 'proveedor' }, 502);
    }

    await sb
      .from('email_logs')
      .update({ estado: 'enviado', intentos: 1, enviado_at: new Date().toISOString() })
      .eq('id', logId);
    return J({ ok: true });
  } catch (e) {
    return J({ ok: false, motivo: String(e).slice(0, 200) }, 500);
  }
});
