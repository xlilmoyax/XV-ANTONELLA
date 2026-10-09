import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { DEFAULT_EVENT } from './config';
import type { EventForm } from './config';
import type { ContentSection, EventSettings, GalleryImage } from './types';

export type EventVM = EventForm;

export function useEventSettings() {
  const [settings, setSettings] = useState<EventVM>({ ...DEFAULT_EVENT });
  const [secciones, setSecciones] = useState<Record<string, ContentSection>>({});
  const [galeria, setGaleria] = useState<GalleryImage[]>([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setListo(true);
      return;
    }
    (async () => {
      try {
        const { data: ev } = await supabase.from('event_settings').select('*').limit(1).maybeSingle();
        if (ev) {
          const s = ev as EventSettings;
          setSettings({
            quinceanera: s.quinceanera,
            evento: s.evento,
            fecha: s.fecha,
            hora_inicio: s.hora_inicio.slice(0, 5),
            hora_fin: s.hora_fin.slice(0, 5),
            fecha_fin: s.fecha_fin,
            zona_horaria: s.zona_horaria,
            salon: s.salon,
            direccion: s.direccion,
            vestimenta: s.vestimenta,
            fecha_limite_confirmacion: s.fecha_limite_confirmacion,
            fecha_limite_pago: s.fecha_limite_pago,
            precio_tarjeta: s.precio_tarjeta,
            edad_minima_paga: s.edad_minima_paga,
            whatsapp_comprobantes: s.whatsapp_comprobantes,
            alias_transferencia: s.alias_transferencia,
            titular_transferencia: s.titular_transferencia,
            mensaje_final: s.mensaje_final,
          });
        }
        const { data: secs } = await supabase.from('content_sections').select('*').eq('visible', true);
        if (secs) {
          const map: Record<string, ContentSection> = {};
          for (const s of secs as ContentSection[]) map[s.clave] = s;
          setSecciones(map);
        }
        const { data: imgs } = await supabase
          .from('gallery_images')
          .select('*')
          .order('orden', { ascending: true });
        if (imgs) setGaleria(imgs as GalleryImage[]);
      } catch (e) {
        console.warn('[XV] No se pudo cargar configuración remota, uso valores locales.', e);
      } finally {
        setListo(true);
      }
    })();
  }, []);

  const texto = (clave: string, fallback: string) => secciones[clave]?.cuerpo || fallback;

  return { settings, secciones, galeria, listo, texto };
}

/** Fecha objetivo del countdown con offset de Buenos Aires (UTC-3, sin DST). */
export function fechaObjetivoISO(s: EventVM): Date {
  return new Date(`${s.fecha}T${s.hora_inicio}:00-03:00`);
}

export function formatearFechaLarga(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${d} de ${meses[m - 1]} de ${y}`;
}

export function formatearFechaCorta(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-');
  return `${d}.${m}.${y}`;
}
