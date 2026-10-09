import { useEffect, useState } from 'react';
import { BadgeCheck, Loader2, MessageCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { whatsappUrl } from '../xv/config';
import type { EventVM } from '../xv/useEvent';
import { Seccion } from './EventInfo';

/**
 * Ruta #ya-abone/<token>.
 * El registro real lo hace la Edge Function `ya-abone` (service_role),
 * que valida el token, marca pago_informado y detiene recordatorios.
 * Sin backend activo, se guía al invitado por WhatsApp (no se finge el registro).
 */
export default function YaAbone({ settings, token }: { settings: EventVM; token: string | null }) {
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'pendiente' | 'error'>(
    token ? 'cargando' : 'pendiente',
  );

  useEffect(() => {
    if (!token || !isSupabaseConfigured) {
      setEstado('pendiente');
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ya-abone', {
          body: { token },
        });
        if (error) throw error;
        if ((data as { ok?: boolean })?.ok) setEstado('ok');
        else setEstado('error');
      } catch {
        // Edge Function aún no desplegada: no se marca nada, se guía por WhatsApp.
        setEstado('pendiente');
      }
    })();
  }, [token]);

  const wa = whatsappUrl(
    settings.whatsapp_comprobantes,
    `Hola, soy [Tu nombre]. Ya aboné la tarjeta para los XV de ${settings.quinceanera}. Te envío el comprobante. ¡Gracias!`,
  );

  return (
    <Seccion id="ya-abone" kicker="Aviso de pago" titulo="Ya aboné">
      <div className="marco-dorado rounded-2xl bg-[#0e241b]/70 p-8">
        {estado === 'cargando' && (
          <p className="inline-flex items-center gap-2 text-[#ecdcb0]">
            <Loader2 size={18} className="animate-spin" /> Registrando tu aviso…
          </p>
        )}
        {estado === 'ok' && (
          <>
            <BadgeCheck size={40} className="mx-auto text-[#d6bd7a]" aria-hidden="true" />
            <p className="font-serifada text-2xl text-[#ecdcb0] mt-4">
              ¡Aviso registrado! Ya no recibirás recordatorios de pago.
            </p>
            <p className="mt-2 text-sm text-[#f8f4e9]/80">
              Si aún no lo hiciste, envianos el comprobante por WhatsApp así lo verificamos.
            </p>
          </>
        )}
        {estado !== 'cargando' && estado !== 'ok' && (
          <>
            <p className="font-serifada text-xl text-[#f8f4e9] leading-relaxed">
              Para completar tu aviso de pago, envianos el comprobante por WhatsApp al número
              indicado. Ni bien lo verifiquemos, tu estado pasa a «pago verificado» y se detienen
              los recordatorios.
            </p>
            <p className="mt-2 text-sm text-[#a8b39a]">
              Alias: {settings.alias_transferencia} · Titular: {settings.titular_transferencia}
            </p>
          </>
        )}
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className="boton-dorado mt-6 inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-medium"
        >
          <MessageCircle size={16} />
          ENVIAR COMPROBANTE POR WHATSAPP
        </a>
        <div className="mt-4">
          <a href="#invitacion" className="text-xs tracking-[0.2em] text-[#a8b39a] uppercase hover:text-[#ecdcb0]">
            Volver a la invitación
          </a>
        </div>
      </div>
    </Seccion>
  );
}
