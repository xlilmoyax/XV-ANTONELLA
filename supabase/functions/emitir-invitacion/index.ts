import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signInvitation } from '../_shared/invitation-token.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PUBLIC_URL = 'https://xv-antonella.vercel.app';
const SIGNING_SECRET = Deno.env.get('XV_INVITATION_SIGNING_SECRET') ?? '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ ok: false }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    const modalidad = (await request.json())?.modalidad;
    if (!authorization || typeof modalidad !== 'string') return json({ ok: false }, 404);

    const userClient = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ ok: false }, 404);

    const adminClient = createClient(SB_URL, SB_SERVICE);
    const { data: admin, error: adminError } = await adminClient
      .from('admin_profiles')
      .select('activo')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (adminError) {
      console.error('Invitation admin authorization lookup failed');
      return json({ ok: false }, 500);
    }
    if (!admin?.activo) return json({ ok: false }, 404);

    const { data: config, error: configError } = await adminClient
      .from('modalidades')
      .select('id,codigo,fecha_limite_confirmacion')
      .eq('codigo', modalidad)
      .eq('activa', true)
      .maybeSingle();
    if (configError) {
      console.error('Invitation modality lookup failed');
      return json({ ok: false }, 500);
    }
    if (!config) return json({ ok: false }, 404);

    const expiresAt = new Date(`${config.fecha_limite_confirmacion}T23:59:59-03:00`).toISOString();
    if (Date.parse(expiresAt) <= Date.now()) return json({ ok: false }, 404);

    const invitationId = crypto.randomUUID();
    const token = await signInvitation(invitationId, expiresAt, SIGNING_SECRET);
    const { error: insertError } = await adminClient
      .from('invitaciones')
      .insert({
        id: invitationId,
        modalidad_id: config.id,
        created_by: authData.user.id,
        expires_at: expiresAt,
      });
    if (insertError) {
      console.error('Invitation creation failed');
      return json({ ok: false }, 500);
    }

    const url = new URL('/', PUBLIC_URL);
    if (config.codigo === 'companeros') url.searchParams.set('view', 'companeros');
    url.hash = config.codigo === 'companeros' ? `#companeros/${token}` : `#invitacion/${token}`;
    return json({ ok: true, url: url.toString(), expires_at: expiresAt });
  } catch (error) {
    console.error('Invitation issuance failed', error);
    return json({ ok: false }, 500);
  }
});
