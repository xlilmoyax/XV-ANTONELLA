/**
 * XV-ANTONELLA · Diseño editable (FUENTE ÚNICA de claves y valores por defecto).
 *
 * Arquitectura (sin cambios de esquema ni de políticas):
 * - Los archivos viven en el bucket `galeria` (lectura pública, escritura
 *   admin — políticas ya verificadas) bajo el prefijo `diseno/`, separados
 *   de las fotos de la galería (tabla gallery_images, que no se toca).
 * - Las referencias viven en content_sections con claves `diseno_*` (+ `_pos`
 *   para encuadre). Si la fila no existe, la invitación usa el archivo
 *   empaquetado de respaldo: ningún cambio es destructivo.
 * - El historial usa configuration_versions (nombre `diseno-<clave>-…`).
 * - Regla de personas: solo la figura central puede mostrar una persona
 *   (de espaldas); se exige confirmación visual manual, sin filtros mágicos.
 */

export interface FondoDef {
  clave: string;
  seccion: string;
  fallback: string;
  w: number;
  h: number;
  permitePersona: boolean;
}

export const FONDOS: FondoDef[] = [
  {
    clave: 'diseno_figura',
    seccion: 'Presentación · fotografía central (única imagen con persona)',
    fallback: '/fondos/antonella-bosque.jpg',
    w: 1260,
    h: 1890,
    permitePersona: true,
  },
  {
    clave: 'diseno_fondo_portada',
    seccion: 'Portada · fondo principal',
    fallback: '/fondos/bosque-sendero.jpg',
    w: 1920,
    h: 1280,
    permitePersona: false,
  },
  {
    clave: 'diseno_fondo_jardin',
    seccion: 'Secciones jardín (presentación, evento, confirmación)',
    fallback: '/fondos/jardin-esmeralda.jpg',
    w: 1920,
    h: 2880,
    permitePersona: false,
  },
  {
    clave: 'diseno_fondo_pagos',
    seccion: 'Pagos · fondo (independiente de la portada)',
    fallback: '/fondos/bosque-sendero.jpg',
    w: 1920,
    h: 1280,
    permitePersona: false,
  },
  {
    clave: 'diseno_fondo_cierre',
    seccion: 'Cierre · fondo (independiente de la portada)',
    fallback: '/fondos/bosque-sendero.jpg',
    w: 1920,
    h: 1280,
    permitePersona: false,
  },
  // Fondos de Compañeros (TEMPORAL: reutilizan archivos A hasta recibir el
  // arte propio B; al llegar, solo cambia el fallback, sin tocar componentes).
  {
    clave: 'diseno_b_portada',
    seccion: 'Compañeros · fondo de portada (temporal: usa foto A)',
    fallback: '/fondos/bosque-sendero.jpg',
    w: 1920,
    h: 1280,
    permitePersona: false,
  },
  {
    clave: 'diseno_b_jardin',
    seccion: 'Compañeros · fondo jardín (temporal: usa foto A)',
    fallback: '/fondos/jardin-esmeralda.jpg',
    w: 1920,
    h: 2880,
    permitePersona: false,
  },
  {
    clave: 'diseno_b_pagos',
    seccion: 'Compañeros · fondo de pagos (temporal: usa foto A)',
    fallback: '/fondos/bosque-sendero.jpg',
    w: 1920,
    h: 1280,
    permitePersona: false,
  },
];

/** Encuadres permitidos (sin deformar: solo object-position). */
export const ENCUADRES: Array<{ id: string; etiqueta: string; css: string }> = [
  { id: 'centro', etiqueta: 'Centro', css: 'center' },
  { id: 'arriba', etiqueta: 'Arriba', css: 'center 20%' },
  { id: 'abajo', etiqueta: 'Abajo', css: 'center 80%' },
];

export interface FilaSeccion {
  clave: string;
  cuerpo?: string | null;
  updated_at?: string;
}

export type DisenoMap = Record<string, { url: string; pos: string; actualizada?: string }>;

/** Deriva el mapa de diseño desde las filas de content_sections ya cargadas. */
export function mapaDiseno(filas: FilaSeccion[]): DisenoMap {
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  const mapa: DisenoMap = {};
  for (const def of FONDOS) {
    const fila = porClave.get(def.clave);
    const filaPos = porClave.get(`${def.clave}_pos`);
    const posValida = ENCUADRES.some((e) => e.css === (filaPos?.cuerpo ?? ''));
    mapa[def.clave] = {
      url: fila?.cuerpo?.trim() ? fila.cuerpo.trim() : def.fallback,
      pos: posValida ? (filaPos!.cuerpo as string).trim() : 'center',
      actualizada: fila?.updated_at,
    };
  }
  return mapa;
}

export interface FondoResuelto {
  src: string;
  pos: string;
  personalizado: boolean;
  actualizada?: string;
}

/** Resuelve una clave de diseño a {src, pos}, con respaldo empaquetado. */
export function resolverFondo(map: DisenoMap, clave: string): FondoResuelto {
  const def = FONDOS.find((d) => d.clave === clave);
  const fb = def?.fallback ?? '';
  const v = map[clave];
  if (!v || !v.url) return { src: fb, pos: 'center', personalizado: false };
  return { src: v.url, pos: v.pos || 'center', personalizado: v.url !== fb, actualizada: v.actualizada };
}

/** Tamaño máximo de carga: 5 MB, solo imágenes. */
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

export function nombreSeguro(clave: string, original: string): string {
  const base = original
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-60);
  return `diseno/${clave.replace(/^diseno_/, '')}-${Date.now()}-${base || 'imagen'}`;
}

/** Extrae el path de Storage desde una URL pública del bucket galeria. */
export function pathDesdeUrl(url: string): string | null {
  const i = url.indexOf('/galeria/');
  if (i < 0) return null;
  const path = url.slice(i + '/galeria/'.length).split('?')[0];
  return path || null;
}
