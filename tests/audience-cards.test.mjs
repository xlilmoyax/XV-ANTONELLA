import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { after, before, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const settings = {
  quinceanera: 'Antonella',
  evento: 'Mis XV años',
  fecha: '2026-12-19',
  hora_inicio: '21:00',
  hora_fin: '05:00',
  fecha_fin: '2026-12-20',
  zona_horaria: 'America/Argentina/Buenos_Aires',
  salon: 'Salón Aldo',
  direccion: 'C. José Ramonda 6637',
  vestimenta: 'Formal',
  fecha_limite_confirmacion: '2026-11-25',
  fecha_limite_pago: '2026-12-10',
  precio_tarjeta: 70000,
  edad_minima_paga: 10,
  whatsapp_comprobantes: '000',
  alias_transferencia: 'alias',
  titular_transferencia: 'Titular',
  mensaje_final: '',
};

let vite;
let Pagos;
let FormularioA;
let TarjetaB;
let fuenteFormularioA;
let fuenteTarjetaB;

before(async () => {
  vite = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  ({ default: Pagos } = await vite.ssrLoadModule('/src/components/PaymentInfo.tsx'));
  ({ default: FormularioA } = await vite.ssrLoadModule('/src/components/RsvpForm.tsx'));
  ({ default: TarjetaB } = await vite.ssrLoadModule('/src/components/CompanerosView.tsx'));
  fuenteFormularioA = await readFile(resolve('src/components/RsvpForm.tsx'), 'utf8');
  fuenteTarjetaB = await readFile(resolve('src/components/CompanerosView.tsx'), 'utf8');
});

after(async () => {
  await vite?.close();
});

function render(element) {
  return renderToStaticMarkup(element);
}

const precioA = /(?:\$|ARS)\s?70[.,]000/u;
const precioB = /(?:\$|ARS)\s?40[.,]000/u;

test('Family payment card restores original wording and renders only its own price', () => {
  const html = render(React.createElement(Pagos, { settings, diseno: {} }));

  assert.match(html, /Tarjeta: \$[\s\u00a0]*70\.000 por persona que deba abonar/u);
  assert.match(html, /Los menores de 10 años no abonan/u);
  assert.doesNotMatch(html, precioB);
});

test('Family RSVP and payment summary render no companions price', () => {
  const html = render(React.createElement(FormularioA, { settings, diseno: {} }));

  assert.match(html, /Familia y amigos/u);
  assert.match(html, precioA);
  assert.doesNotMatch(html, precioB);
  assert.match(fuenteFormularioA, /Importe estimado: \{formatoARS\(exito\.importe\)\}/u);
  assert.match(fuenteFormularioA, /¡Te esperamos!/u);
  assert.doesNotMatch(fuenteFormularioA, /40[.,]000/u);
});

test('Companions card, payment, and RSVP render only the companions price and copy', () => {
  const html = render(
    React.createElement(TarjetaB, {
      settings,
      diseno: {},
      texto: (_clave, respaldo) => respaldo,
    }),
  );

  assert.match(html, /MIS XV AÑOS · COMPAÑEROS/u);
  assert.match(html, /Salón Aldo · C\. José Ramonda 6637/u);
  assert.match(html, /21:00 a 02:00 hs/u);
  assert.match(html, /25 de noviembre de 2026/u);
  assert.match(html, /10 de diciembre de 2026/u);
  assert.match(html, /Tarjeta individual: \$[\s\u00a0]*40\.000 por invitado/u);
  assert.match(html, /sin acompañantes ni exención por edad/u);
  assert.match(html, precioB);
  assert.doesNotMatch(html, precioA);
  assert.doesNotMatch(fuenteTarjetaB, /70[.,]000/u);
  assert.match(fuenteTarjetaB, /aplicarPlantilla\(t\('b_form_importe'\), \{ Importe: formatoARS\(exito\.importe\) \}\)/u);
});

test('original copy and pricing rules remain explicit and modality-specific', async () => {
  const paymentSource = await readFile(resolve('src/components/PaymentInfo.tsx'), 'utf8');
  const companionTextSource = await readFile(resolve('src/xv/textosB.ts'), 'utf8');
  const pricingSource = await readFile(resolve('src/xv/pricing.ts'), 'utf8');

  assert.match(paymentSource, /Tarjeta: \{formatoARS\(settings\.precio_tarjeta\)\} por persona que deba abonar\./u);
  assert.ok(paymentSource.includes('Los menores de'));
  assert.ok(paymentSource.includes('{settings.edad_minima_paga} años no abonan.'));
  assert.match(companionTextSource, /MIS XV AÑOS · COMPAÑEROS/u);
  assert.match(companionTextSource, /Tarjeta individual: \[Precio\] por invitado\./u);
  assert.doesNotMatch(companionTextSource, /70[.,]000/u);
  assert.match(pricingSource, /if \(modalidad === 'companeros'\)[\s\S]*?40000/u);
  assert.match(pricingSource, /personasQueAbonan[\s\S]*?70000/u);
});
