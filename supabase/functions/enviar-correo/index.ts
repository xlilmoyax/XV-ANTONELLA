// El envío inmediato anterior por proveedor externo está deshabilitado.
// Los correos se procesan exclusivamente desde Google Apps Script/Gmail.
// Este handler evita aceptar invocaciones mientras se revisa la migración
// y la configuración de prueba. No despliega ni modifica el entorno remoto.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  return Response.json(
    { ok: false, motivo: 'deshabilitado; usar Google Apps Script/Gmail' },
    { status: 410, headers: CORS },
  );
});
