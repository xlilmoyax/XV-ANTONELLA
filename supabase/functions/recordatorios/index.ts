// El envío previo por proveedor externo está deshabilitado.
// Recordatorios: exclusivamente Google Apps Script/Gmail.
// No despliega ni modifica el entorno remoto.

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
