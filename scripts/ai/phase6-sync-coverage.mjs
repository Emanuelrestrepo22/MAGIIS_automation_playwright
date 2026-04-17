#!/usr/bin/env node
/**
 * Fase 6 — sincroniza coverage docs + manifest con matrices post-desambiguación.
 *
 * Reemplaza "E2E " → "Validar " en los archivos de cobertura y en el manifest JSON,
 * respetando los identificadores técnicos (E2E-FLOW, [E2E], E2E_, @e2e) que no
 * aparecen en estos archivos pero se validan como safeguard.
 *
 * Uso:
 *   node scripts/ai/phase6-sync-coverage.mjs          # dry-run
 *   node scripts/ai/phase6-sync-coverage.mjs --apply  # aplica cambios
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');

const FILES = [
  'tests/coverage/README.md',
  'tests/coverage/app-driver/README.md',
  'tests/coverage/app-passenger/README.md',
  'tests/coverage/carrier/README.md',
  'tests/coverage/contractor/README.md',
  'tests/coverage/coverage-manifest.json',
];

const FORBIDDEN = [/E2E-FLOW/, /\[E2E\]/, /E2E_/, /@e2e/, /E2EFlow/];

// Regla unica: E2E seguido de espacio que NO sea identificador tecnico.
// Los FORBIDDEN ya se validan antes; aqui asumimos que si aparece "E2E " es descriptivo.
const REPLACERS = [
  // E2E inicial de string (tras " o | o inicio de linea)
  { from: /(^|["|\s])E2E /gm, to: '$1Validar ' },
  // Capitalizacion de proxima palabra: "Validar alta" queda igual (no recapitalizamos)
];

let totalChanges = 0;
const report = [];

for (const rel of FILES) {
  const abs = resolve(rel);
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    report.push({ file: rel, status: 'not-found' });
    continue;
  }

  let blocked = false;
  for (const pattern of FORBIDDEN) {
    if (pattern.test(content)) {
      report.push({ file: rel, status: 'BLOCKED', pattern: pattern.source });
      blocked = true;
    }
  }
  if (blocked) continue;

  const before = content;
  let changes = 0;
  for (const { from, to } of REPLACERS) {
    const matches = content.match(from);
    if (matches) {
      changes += matches.length;
      content = content.replace(from, to);
    }
  }

  const remaining = (content.match(/E2E /g) || []).length;

  if (APPLY && content !== before) {
    writeFileSync(abs, content, 'utf8');
  }

  report.push({
    file: rel,
    changes,
    remaining,
    status: APPLY ? (content !== before ? 'written' : 'no-op') : 'dry-run',
  });
  totalChanges += changes;
}

console.log(JSON.stringify({ apply: APPLY, totalChanges, report }, null, 2));
