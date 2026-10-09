// Edge Function: ya-abone
// Valida el token individual, registra el aviso de pago y detiene recordatorios.
// El token viaja en el enlace del correo ("Ya Aboné") y nunca expone datos ajenos.
// Desplegar con: supabase functions deploy ya-abone --no-verify-jwt

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return Response.json({ ok: false, motivo: 'token' }, { status: 400 });
    }
    const sb = createClient(SB_URL, SB_SERVICE);

    const { data: pago } = await sb
      .from('payment_records')
      .select('id,guest_id,estado')
      .eq('token_accion', token)
      .maybeSingle();
    if (!pago) return Response.json({ ok: false, motivo: 'token-invalido' }, { status: 404 });
    if (pago.estado === 'pago_informado' || pago.estado === 'pago_verificado') {
      return Response.json({ ok: true, duplicado: true });
    }

    await sb
      .from('payment_records')
      .update({ estado: 'pago_informado', informado_at: new Date().toISOString() })
      .eq('id', pago.id);
    await sb
      .from('guests')
      .update({ estado_pago: 'pago_informado', pago_informado_at: new Date().toISOString() })
      .eq('id', pago.guest_id);

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, motivo: String(e).slice(0, 200) }, { status: 500 });
  }
});
