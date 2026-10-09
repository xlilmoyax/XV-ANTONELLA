import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true cuando hay credenciales públicas configuradas. */
export const isSupabaseConfigured = Boolean(url && anon);

if (!isSupabaseConfigured) {
  console.warn(
    '[XV-ANTONELLA] Supabase no configurado: la invitación usa datos locales de demostración. ' +
      'Completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local.',
  );
}

export const supabase = createClient(
  url || 'https://local-placeholder.supabase.co',
  anon || 'local-placeholder-anon-key',
);
