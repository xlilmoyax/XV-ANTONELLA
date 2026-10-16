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
  remoto: true;
}

/**
 * Builds an authorized invitation URL; the signed token is the actual grant.
 */
export function enlacePara(
  codigo: 'familia_amigos' | 'companeros',
  origen: string,
  token: string,
  ruta = '',
): string {
  const url = new URL(`${ruta.replace(/\/$/, '')}/`, origen);
  url.searchParams.set('invite', token);
  url.hash = codigo === 'companeros' ? '#companeros' : '#invitacion';
  return url.toString();
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
