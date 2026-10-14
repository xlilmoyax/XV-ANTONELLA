/**
 * XV-ANTONELLA · Configuración por modalidad (servidor primero, fallback local).
 *
 * La tabla `modalidades` (lectura pública tras 0006) es la fuente confiable.
 * Si no existe todavía, se usan los valores estáticos APROBADOS abajo y se
 * marca remoto:false para que la UI lo indique honestamente.
 * NO publicar ni habilitar la tarjeta B para registros reales hasta que la
 * configuración remota + RPC estén verificadas.
 */

export interface ModalidadConfig {
  codigo: 'familia_amigos' | 'companeros';
  nombre: string;
  precio: number;
  hora_inicio: string;
  hora_fin: string;
  fecha: string;
  fecha_fin: string;
  limite_confirmacion: string;
  limite_pago: string;
  vestimenta: string;
  permite_acompanantes: boolean;
  /** null = sin exención (todos abonan). */
  edad_minima: number | null;
  remoto: boolean;
}

type FilaModalidad = {
  codigo: string;
  nombre: string;
  precio_tarjeta: number;
  hora_inicio: string;
  hora_fin: string;
  fecha_fin: string;
  fecha_limite_confirmacion: string;
  fecha_limite_pago: string;
  vestimenta: string;
  permite_acompanantes: boolean;
  edad_minima_paga: number | null;
  activa: boolean;
};

const HORA = (t: string) => String(t).slice(0, 5);

/** Valores estáticos APROBADOS (fallback documentado, no inventados). */
export const MODALIDAD_B_ESTATICA: ModalidadConfig = {
  codigo: 'companeros',
  nombre: 'Compañeros',
  precio: 40000,
  hora_inicio: '21:00',
  hora_fin: '02:00',
  fecha: '2026-12-19',
  fecha_fin: '2026-12-20',
  limite_confirmacion: '2026-11-25',
  limite_pago: '2026-12-10',
  vestimenta: 'Formal',
  permite_acompanantes: false,
  edad_minima: null,
  remoto: false,
};

export const MODALIDAD_A_ESTATICA: ModalidadConfig = {
  codigo: 'familia_amigos',
  nombre: 'Familia y amigos',
  precio: 70000,
  hora_inicio: '21:00',
  hora_fin: '05:00',
  fecha: '2026-12-19',
  fecha_fin: '2026-12-20',
  limite_confirmacion: '2026-11-25',
  limite_pago: '2026-12-10',
  vestimenta: 'Formal',
  permite_acompanantes: true,
  edad_minima: 10,
  remoto: false,
};

export function aConfig(f: FilaModalidad): ModalidadConfig {
  return {
    codigo: f.codigo as ModalidadConfig['codigo'],
    nombre: f.nombre,
    precio: Number(f.precio_tarjeta),
    hora_inicio: HORA(f.hora_inicio),
    hora_fin: HORA(f.hora_fin),
    fecha: '2026-12-19',
    fecha_fin: String(f.fecha_fin),
    limite_confirmacion: String(f.fecha_limite_confirmacion),
    limite_pago: String(f.fecha_limite_pago),
    vestimenta: f.vestimenta,
    permite_acompanantes: Boolean(f.permite_acompanantes),
    edad_minima: f.edad_minima_paga === null ? null : Number(f.edad_minima_paga),
    remoto: true,
  };
}

/** Lee la modalidad del servidor; ante cualquier fallo usa el fallback estático. */
export async function cargarModalidad(
  // Cliente Supabase real (tipado laxo a propósito: solo usa from/select/eq/maybeSingle).
  supabase: {
    from: (t: string) => unknown;
  },
  codigo: 'familia_amigos' | 'companeros',
): Promise<ModalidadConfig> {
  try {
    const tabla = supabase.from('modalidades') as {
      select: (c: string) => {
        eq: (k: string, v: unknown) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
    const { data, error } = await tabla.select('*').eq('codigo', codigo).maybeSingle();
    if (!error && data && (data as FilaModalidad).activa !== false) {
      return aConfig(data as FilaModalidad);
    }
  } catch {
    /* sin servidor: fallback documentado */
  }
  if (codigo === 'companeros') return { ...MODALIDAD_B_ESTATICA };
  return { ...MODALIDAD_A_ESTATICA };
}

/**
 * Enlace directo a una tarjeta (uso administrativo: botón Copiar enlace).
 * El enlace NO autoriza nada; solo selecciona qué tarjeta mostrar.
 */
export function enlacePara(
  codigo: 'familia_amigos' | 'companeros',
  origen: string,
  ruta = '',
): string {
  const base = `${origen}${ruta}`.replace(/\/$/, '');
  return codigo === 'companeros' ? `${base}/#companeros` : `${base}/#invitacion`;
}

type ConModalidad = { modalidad_id?: string | null };

/**
 * Vista por modalidad para el panel: filtra invitados por UUID y arrastra
 * acompañantes/pagos por join. Sin UUID (todas) devuelve todo intacto.
 * Puro y testeable sin backend.
 */
export function vistaModalidad<
  G extends ConModalidad & { id: string },
  A extends { guest_id: string },
  P extends { guest_id: string },
>(
  guests: G[],
  attendees: A[],
  payments: P[],
  modalidadId: string | null,
): { guests: G[]; attendees: A[]; payments: P[] } {
  if (!modalidadId) return { guests, attendees, payments };
  const g =
    modalidadId === 'sin_clasificar'
      ? guests.filter((x) => !x.modalidad_id)
      : guests.filter((x) => x.modalidad_id === modalidadId);
  const ids = new Set(g.map((x) => x.id));
  return {
    guests: g,
    attendees: attendees.filter((a) => ids.has(a.guest_id)),
    payments: payments.filter((p) => ids.has(p.guest_id)),
  };
}
