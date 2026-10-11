import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TONOS, type Tono } from './util';

/**
 * Volver a la vista anterior (listado con sus filtros intactos).
 * Navegación por estado real, nunca history.back(): si no hay contexto
 * válido, el llamador dirige a la sección segura correspondiente.
 */
export function Volver({ onVolver, destino }: { onVolver: () => void; destino: string }) {
  return (
    <button
      onClick={onVolver}
      aria-label={`Volver a ${destino}`}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-medium text-stone-800 hover:bg-stone-100"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      Volver
    </button>
  );
}

/** Etiqueta de estado: texto + tono (nunca solo color). */
export function Etiqueta({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}

/** Tarjeta de indicador: nombre + valor + explicación + acceso al listado. */
export function Tarjeta({
  titulo,
  valor,
  explicacion,
  onVer,
  verTexto = 'Ver listado',
  actualizacion,
}: {
  titulo: string;
  valor: string;
  explicacion: string;
  onVer?: () => void;
  verTexto?: string;
  actualizacion?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[#d6bd7a]/40 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500">{titulo}</p>
      <p className="font-serifada mt-1 text-3xl text-[#183b2d]">{valor}</p>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-stone-600">{explicacion}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        {onVer ? (
          <button
            onClick={onVer}
            className="text-xs font-medium text-[#0e5c42] underline underline-offset-2 hover:text-[#183b2d]"
          >
            {verTexto} →
          </button>
        ) : (
          <span />
        )}
        {actualizacion && (
          <span className="text-[10px] text-stone-400">Act. {actualizacion}</span>
        )}
      </div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando datos reales…' }: { texto?: string }) {
  return <p className="px-2 py-10 text-center text-sm text-stone-500">{texto}</p>;
}

export function Vacio({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
      <p className="text-sm font-medium text-stone-700">Sin registros</p>
      <p className="mt-1 text-xs text-stone-500">{texto}</p>
    </div>
  );
}

export function CajaError({ titulo, detalle, onReintentar }: { titulo: string; detalle: string; onReintentar?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-900">{titulo}</p>
      <p className="mt-1 text-xs text-red-800">{detalle}</p>
      {onReintentar && (
        <button
          onClick={onReintentar}
          className="mt-2 rounded-full bg-red-800 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-900"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

export function AvisoEsquema({ texto }: { texto: string }) {
  return (
    <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Función pendiente de ampliación del esquema</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">{texto}</p>
    </div>
  );
}
