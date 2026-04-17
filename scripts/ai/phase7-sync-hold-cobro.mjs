#!/usr/bin/env node
/**
 * Fase 7 — desambiguar "Hold y Cobro" → "Hold desde Alta de Viaje y Cobro desde App Driver"
 *
 * Motivacion: el hold se ejecuta en el alta de viaje (carrier web o app pax),
 * mientras que el cobro ocurre al finalizar el servicio desde App Driver.
 * Unir ambos eventos como "Hold y Cobro desde App Driver" oculta esa separacion.
 *
 * Reglas de reemplazo (orden sensible):
 *   1. "**sin Hold y Cobro** desde App Driver" → "**sin Hold desde Alta de Viaje, Cobro desde App Driver**"
 *   2. "**Hold y Cobro** desde App Driver"     → "**Hold desde Alta de Viaje y Cobro desde App Driver**"
 *   3. "sin Hold y Cobro desde App Driver"     → "sin Hold desde Alta de Viaje, Cobro desde App Driver"  (sin bold)
 *   4. "Hold y Cobro desde App Driver"         → "Hold desde Alta de Viaje y Cobro desde App Driver"     (sin bold)
 *
 * Uso:
 *   node scripts/ai/phase7-sync-hold-cobro.mjs          # dry-run
 *   node scripts/ai/phase7-sync-hold-cobro.mjs --apply  # aplica cambios
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');

const FILES = [
  // Matrices canonicas
  'docs/gateway-pg/stripe/matriz_cases.md',
  'docs/gateway-pg/stripe/matriz_cases2.md',
  // JSON normalizado
  'docs/gateway-pg/stripe/normalized-test-cases.json',
  // Drafts Fase 5
  'tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-hold-no3ds.e2e.spec.ts',
  'tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-hold-3ds.e2e.spec.ts',
  // Coverage (gitignored pero local)
  'tests/coverage/README.md',
  'tests/coverage/app-driver/README.md',
  'tests/coverage/app-passenger/README.md',
  'tests/coverage/carrier/README.md',
  'tests/coverage/contractor/README.md',
  'tests/coverage/coverage-manifest.json',
  // Documentos derivados de Fase 1-2
  'docs/gateway-pg/stripe/duplicados-detectados.md',
  'docs/gateway-pg/stripe/pares-resueltos.md',
];

// Orden critico: las variantes mas especificas primero (bold, "sin" prefix).
const REPLACERS = [
  // Con bold completo
  {
    from: /\*\*sin Hold y Cobro\*\* desde App Driver/g,
    to: '**sin Hold desde Alta de Viaje, Cobro desde App Driver**',
    label: 'bold-sin',
  },
  {
    from: /\*\*Hold y Cobro\*\* desde App Driver/g,
    to: '**Hold desde Alta de Viaje y Cobro desde App Driver**',
    label: 'bold',
  },
  // Sin bold (texto plano)
  {
    from: /sin Hold y Cobro desde App Driver/g,
    to: 'sin Hold desde Alta de Viaje, Cobro desde App Driver',
    label: 'plain-sin',
  },
  {
    from: /Hold y Cobro desde App Driver/g,
    to: 'Hold desde Alta de Viaje y Cobro desde App Driver',
    label: 'plain',
  },
];

const report = [];
let totalChanges = 0;

for (const rel of FILES) {
  const abs = resolve(rel);
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    report.push({ file: rel, status: 'not-found' });
    continue;
  }

  const before = content;
  const perRule = {};
  for (const { from, to, label } of REPLACERS) {
    const matches = content.match(from);
    if (matches) {
      perRule[label] = matches.length;
      content = content.replace(from, to);
    }
  }

  const remaining = (content.match(/Hold y Cobro/g) || []).length;
  const changes = Object.values(perRule).reduce((a, b) => a + b, 0);

  if (APPLY && content !== before) {
    writeFileSync(abs, content, 'utf8');
  }

  report.push({
    file: rel,
    changes,
    perRule,
    remaining,
    status: APPLY ? (content !== before ? 'written' : 'no-op') : 'dry-run',
  });
  totalChanges += changes;
}

console.log(JSON.stringify({ apply: APPLY, totalChanges, report }, null, 2));
if (report.some(r => r.remaining > 0)) {
  console.error('\n⚠️  "Hold y Cobro" aun aparece en algun archivo — revisar contextos no contemplados.');
  process.exit(2);
}
