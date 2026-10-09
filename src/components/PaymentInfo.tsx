import { useState } from 'react';
import { BadgeDollarSign, CalendarClock, Check, Copy, MessageCircle } from 'lucide-react';
import { whatsappUrl } from '../xv/config';
import { formatoARS } from '../xv/pricing';
import { formatearFechaLarga } from '../xv/useEvent';
import type { EventVM } from '../xv/useEvent';
import { Seccion } from './EventInfo';

export default function Pagos({ settings }: { settings: EventVM }) {
  const [copiado, setCopiado] = useState(false);

  const copiarAlias = async () => {
    try {
      await navigator.clipboard.writeText(settings.alias_transferencia);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  };

  const wa = whatsappUrl(
    settings.whatsapp_comprobantes,
    `Hola, soy [Tu nombre]. Te envío el comprobante de la tarjeta para los XV de ${settings.quinceanera}. ¡Gracias!`,
  );

  return (
    <Seccion id="pagos" kicker="Confirmar y abonar" titulo="Datos para confirmar y abonar">
      <div className="marco-dorado rounded-2xl bg-[#0e241b]/60 p-6 text-left space-y-4">
        <p className="flex items-start gap-3 font-serifada text-lg text-[#f8f4e9]">
          <BadgeDollarSign size={20} className="text-[#d6bd7a] mt-1 shrink-0" aria-hidden="true" />
          Tarjeta: {formatoARS(settings.precio_tarjeta)} por persona que deba abonar.
          Los menores de {settings.edad_minima_paga} años no abonan.
        </p>
        <div className="rounded-xl border border-[#d6bd7a]/30 bg-[#183b2d]/60 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-[#a8b39a]">Alias</p>
          <p className="font-serifada text-2xl text-[#ecdcb0] break-all">
            {settings.alias_transferencia}
          </p>
          <p className="mt-1 text-sm text-[#f8f4e9]/80">Titular: {settings.titular_transferencia}</p>
        </div>
        <p className="flex items-start gap-3 text-sm text-[#f8f4e9]/85">
          <CalendarClock size={18} className="text-[#d6bd7a] mt-0.5 shrink-0" aria-hidden="true" />
          Confirmar antes del {formatearFechaLarga(settings.fecha_limite_confirmacion)} ·
          Pagar antes del {formatearFechaLarga(settings.fecha_limite_pago)}.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            onClick={copiarAlias}
            className="boton-dorado rounded-full px-6 py-3 text-xs font-medium inline-flex items-center justify-center gap-2"
          >
            {copiado ? <Check size={15} /> : <Copy size={15} />}
            {copiado ? '¡ALIAS COPIADO!' : 'COPIAR ALIAS'}
          </button>
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="boton-fantasma rounded-full px-6 py-3 text-xs font-medium inline-flex items-center justify-center gap-2"
          >
            <MessageCircle size={15} />
            ENVIAR COMPROBANTE POR WHATSAPP
          </a>
          <a
            href="#confirmar"
            className="boton-fantasma rounded-full px-6 py-3 text-xs font-medium text-center"
          >
            CONFIRMAR ASISTENCIA
          </a>
          <a
            href="#ya-abone"
            className="boton-fantasma rounded-full px-6 py-3 text-xs font-medium text-center"
          >
            YA ABONÉ
          </a>
        </div>
      </div>
    </Seccion>
  );
}
