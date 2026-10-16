import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { DEFAULT_EVENT } from './config';
import type { EventForm } from './config';
import type { ContentSection, EventSettings, GalleryImage } from './types';
import type { ModalidadConfig } from './modalidad';

export type EventVM = EventForm;

interface InvitationResponse {
  modalidad: ModalidadConfig;
  settings: EventSettings;
  sections: ContentSection[];
  gallery: GalleryImage[];
}

export function useEventSettings(
  token: string | null,
  expectedCode: ModalidadConfig['codigo'] | null,
  skip = false,
) {
  const [settings, setSettings] = useState<EventVM>({ ...DEFAULT_EVENT });
  const [secciones, setSecciones] = useState<Record<string, ContentSection>>({});
  const [galeria, setGaleria] = useState<GalleryImage[]>([]);
  const [modalidad, setModalidad] = useState<ModalidadConfig | null>(null);
  const [autorizada, setAutorizada] = useState(false);
  const [listo, setListo] = useState(
    () => skip || !token || !expectedCode || !isSupabaseConfigured,
  );

  useEffect(() => {
    let vivo = true;
    if (skip || !token || !expectedCode || !isSupabaseConfigured) {
      return () => {
        vivo = false;
      };
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('obtener-invitacion', {
          body: { token },
        });
        if (error || !data?.ok) throw new Error('Invitation request failed');
        const response = data as InvitationResponse;
        if (response.modalidad.codigo !== expectedCode) throw new Error('Invitation route mismatch');
        const s = response.settings;
        if (!s || !response.modalidad || !Array.isArray(response.sections) || !Array.isArray(response.gallery)) {
          throw new Error('Invitation response is incomplete');
        }
        if (!vivo) return;
        setSettings({
          quinceanera: s.quinceanera,
          evento: s.evento,
          fecha: s.fecha,
          hora_inicio: String(s.hora_inicio).slice(0, 5),
          hora_fin: String(s.hora_fin).slice(0, 5),
          fecha_fin: s.fecha_fin,
          zona_horaria: s.zona_horaria,
          salon: s.salon,
          direccion: s.direccion,
          vestimenta: s.vestimenta,
          fecha_limite_confirmacion: s.fecha_limite_confirmacion,
          fecha_limite_pago: s.fecha_limite_pago,
          precio_tarjeta: Number(response.modalidad.precio),
          edad_minima_paga: response.modalidad.edad_minima ?? 0,
          whatsapp_comprobantes: s.whatsapp_comprobantes,
          alias_transferencia: s.alias_transferencia,
          titular_transferencia: s.titular_transferencia,
          mensaje_final: s.mensaje_final,
        });
        const map: Record<string, ContentSection> = {};
        for (const section of response.sections) map[section.clave] = section;
        setSecciones(map);
        setGaleria(response.gallery);
        setModalidad(response.modalidad);
        setAutorizada(true);
      } catch {
        if (vivo) {
          setModalidad(null);
          setAutorizada(false);
        }
      } finally {
        if (vivo) setListo(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token, expectedCode, skip]);

  const texto = (clave: string, fallback: string) => secciones[clave]?.cuerpo || fallback;

  return { settings, secciones, galeria, listo, texto, modalidad, autorizada };
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
