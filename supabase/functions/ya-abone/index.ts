// Edge Function: ya-abone
// Valida el token individual, registra el aviso de pago y detiene recordatorios.
// El token viaja en el enlace del correo ("Ya Aboné") y nunca expone datos ajenos.
// Desplegar con: supabase functions deploy ya-abone --no-verify-jwt

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// CORS: el navegador invoca esta función (vista Ya Aboné).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const J = (cuerpo: unknown, estado = 200) => Response.json(cuerpo, { status: estado, headers: CORS });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return J({ ok: false, motivo: 'token' }, 400);
    }
    const sb = createClient(SB_URL, SB_SERVICE);

    const { data: pago } = await sb
      .from('payment_records')
      .select('id,guest_id,estado')
      .eq('token_accion', token)
      .maybeSingle();
    if (!pago) return J({ ok: false, motivo: 'token-invalido' }, 404);
    if (pago.estado === 'pago_informado' || pago.estado === 'pago_verificado') {
      return J({ ok: true, duplicado: true });
    }

    await sb
      .from('payment_records')
      .update({ estado: 'pago_informado', informado_at: new Date().toISOString() })
      .eq('id', pago.id);
    await sb
      .from('guests')
      .update({ estado_pago: 'pago_informado', pago_informado_at: new Date().toISOString() })
      .eq('id', pago.guest_id);
    // Rastro auditable del aviso (quién/cuándo visible en Historial del panel).
    await sb.from('audit_logs').insert({
      actor_email: 'sistema:ya-abone',
      entidad: 'payment_records',
      registro_id: pago.id,
      accion: 'pago_informado',
      nuevos: { guest_id: pago.guest_id, informado_at: new Date().toISOString() },
    });

    return J({ ok: true });
  } catch (e) {
    return J({ ok: false, motivo: String(e).slice(0, 200) }, 500);
  }
});
