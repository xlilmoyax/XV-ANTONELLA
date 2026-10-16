import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyInvitation } from '../_shared/invitation-token.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SIGNING_SECRET = Deno.env.get('XV_INVITATION_SIGNING_SECRET') ?? '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
const GENERIC = { ok: false, motivo: 'No pudimos guardar la confirmación. Revisá el enlace e intentá nuevamente.' };

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json(GENERIC, 404);

  try {
    if (new TextEncoder().encode(SIGNING_SECRET).length < 32) {
      console.error('Invitation signing is not configured');
      return json(GENERIC, 500);
    }
    const body = await request.json();
    const claims = await verifyInvitation(body?.token, SIGNING_SECRET);
    if (!claims || !body?.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return json(GENERIC, 404);
    }

    const adminClient = createClient(SB_URL, SB_SERVICE);
    const { data: invitation, error: invitationError } = await adminClient
      .from('invitaciones')
      .select('id,expires_at,used_at')
      .eq('id', claims.id)
      .maybeSingle();
    if (invitationError) {
      console.error('RSVP invitation lookup failed');
      return json(GENERIC, 500);
    }
    if (
      !invitation ||
      invitation.used_at ||
      Date.parse(invitation.expires_at) <= Date.now() ||
      Math.floor(Date.parse(invitation.expires_at) / 1000) !== claims.exp
    ) {
      return json(GENERIC, 404);
    }

    const { data, error } = await adminClient.rpc('registrar_rsvp', {
      p_invitation_id: claims.id,
      payload: body.payload,
    });
    if (error) {
      console.error('RSVP database operation failed', error);
      return json(GENERIC, 500);
    }
    if (!data || typeof data !== 'object') return json(GENERIC, 500);
    const result = data as Record<string, unknown>;
    if (result.ok === true) {
      if (
        typeof result.guest_id !== 'string' ||
        (result.modalidad !== 'familia_amigos' && result.modalidad !== 'companeros') ||
        !Number.isSafeInteger(result.importe) ||
        !Number.isSafeInteger(result.que_abonan) ||
        !Number.isSafeInteger(result.total)
      ) {
        console.error('RSVP database operation returned an invalid result');
        return json(GENERIC, 500);
      }
      return json({
        ok: true,
        guest_id: result.guest_id,
        modalidad: result.modalidad,
        importe: result.importe,
        que_abonan: result.que_abonan,
        total: result.total,
      });
    }
    if (typeof result.motivo === 'string' && ['nombre', 'email', 'cantidades', 'detalle', 'edad'].includes(result.motivo)) {
      return json({ ok: false, motivo: result.motivo });
    }
    return json(GENERIC, 404);
  } catch (error) {
    console.error('RSVP request failed', error);
    return json(GENERIC, 500);
  }
});
