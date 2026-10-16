// Edge Function: ya-abone
// Valida el token individual, registra el aviso de pago y detiene recordatorios.
// El token viaja en el enlace del correo ("Ya Aboné") y nunca expone datos ajenos.
// Desplegar con: supabase functions deploy ya-abone --no-verify-jwt

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
    if (req.method !== 'POST') return J({ ok: false }, 405);
    const body = await req.json();
    const token = body?.token;
    if (typeof token !== 'string' || token.length < 32 || token.length > 256) return J({ ok: false }, 404);
    if (!SB_URL || !SB_SERVICE) {
      console.error('Payment notification service is not configured');
      return J({ ok: false }, 500);
    }
    const sb = createClient(SB_URL, SB_SERVICE);

    const { data, error } = await sb.rpc('registrar_aviso_pago', { p_token: token });
    if (error) {
      console.error('Payment notification database operation failed', error);
      return J({ ok: false }, 500);
    }
    const result = data as { ok?: boolean; duplicado?: boolean; whatsapp?: unknown } | null;
    if (result?.ok) {
      return J({
        ok: true,
        ...(result.duplicado ? { duplicado: true } : {}),
        ...(typeof result.whatsapp === 'string' ? { whatsapp: result.whatsapp } : {}),
      });
    }
    return J({ ok: false }, 404);
  } catch (e) {
    console.error('Payment notification request failed', e);
    return J({ ok: false }, 500);
  }
});
