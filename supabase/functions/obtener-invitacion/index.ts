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
const invalid = () => json({ ok: false }, 404);

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return invalid();

  try {
    if (new TextEncoder().encode(SIGNING_SECRET).length < 32) {
      console.error('Invitation signing is not configured');
      return json({ ok: false }, 500);
    }
    const token = (await request.json())?.token;
    const claims = await verifyInvitation(token, SIGNING_SECRET);
    if (!claims) return invalid();

    const adminClient = createClient(SB_URL, SB_SERVICE);
    const { data: invitation, error: invitationError } = await adminClient
      .from('invitaciones')
      .select('id,modalidad_id,expires_at,used_at')
      .eq('id', claims.id)
      .maybeSingle();
    if (invitationError) {
      console.error('Invitation lookup failed');
      return json({ ok: false }, 500);
    }
    if (
      !invitation ||
      invitation.used_at ||
      Date.parse(invitation.expires_at) <= Date.now() ||
      Math.floor(Date.parse(invitation.expires_at) / 1000) !== claims.exp
    ) {
      return invalid();
    }

    const [modalityResult, settingsResult, sectionsResult, galleryResult] = await Promise.all([
      adminClient
        .from('modalidades')
        .select('codigo,nombre,precio_tarjeta,hora_inicio,hora_fin,fecha_fin,fecha_limite_confirmacion,fecha_limite_pago,vestimenta,permite_acompanantes,edad_minima_paga')
        .eq('id', invitation.modalidad_id)
        .eq('activa', true)
        .maybeSingle(),
      adminClient.from('event_settings').select('*').limit(1).maybeSingle(),
      adminClient.from('content_sections').select('clave,titulo,cuerpo,visible,orden,updated_at').eq('visible', true),
      adminClient.from('gallery_images').select('id,storage_path,url_publica,epigrafe,orden,demo,created_at').order('orden'),
    ]);
    if (modalityResult.error || settingsResult.error || sectionsResult.error || galleryResult.error) {
      console.error('Invitation data lookup failed');
      return json({ ok: false }, 500);
    }
    const modality = modalityResult.data;
    const settings = settingsResult.data;
    if (!modality || !settings) return invalid();

    const sections = (sectionsResult.data ?? []).filter((section) => {
      const key = String(section.clave);
      if (modality.codigo === 'companeros') {
        return key.startsWith('b_') || key.startsWith('diseno_b_') || key === 'diseno_figura';
      }
      return !key.startsWith('b_') && !key.startsWith('diseno_b_');
    });

    return json({
      ok: true,
      modalidad: {
        codigo: modality.codigo,
        nombre: modality.nombre,
        precio: modality.precio_tarjeta,
        hora_inicio: String(modality.hora_inicio).slice(0, 5),
        hora_fin: String(modality.hora_fin).slice(0, 5),
        fecha: settings.fecha,
        fecha_fin: modality.fecha_fin,
        limite_confirmacion: modality.fecha_limite_confirmacion,
        limite_pago: modality.fecha_limite_pago,
        vestimenta: modality.vestimenta,
        permite_acompanantes: modality.permite_acompanantes,
        edad_minima: modality.edad_minima_paga,
        remoto: true,
      },
      settings: {
        quinceanera: settings.quinceanera,
        evento: settings.evento,
        fecha: settings.fecha,
        hora_inicio: String(modality.hora_inicio).slice(0, 5),
        hora_fin: String(modality.hora_fin).slice(0, 5),
        fecha_fin: modality.fecha_fin,
        zona_horaria: settings.zona_horaria,
        salon: settings.salon,
        direccion: settings.direccion,
        vestimenta: modality.vestimenta,
        fecha_limite_confirmacion: modality.fecha_limite_confirmacion,
        fecha_limite_pago: modality.fecha_limite_pago,
        precio_tarjeta: modality.precio_tarjeta,
        edad_minima_paga: modality.edad_minima_paga ?? 0,
        whatsapp_comprobantes: settings.whatsapp_comprobantes,
        alias_transferencia: settings.alias_transferencia,
        titular_transferencia: settings.titular_transferencia,
        mensaje_final: settings.mensaje_final,
      },
      sections,
      gallery: galleryResult.data ?? [],
    });
  } catch (error) {
    console.error('Invitation data request failed', error);
    return json({ ok: false }, 500);
  }
});
