#!/usr/bin/env node
/**
 * check-doc-terminology — verifica que la terminología canónica post-desambiguación
 * esté sincronizada en docs, specs y tests de Stripe.
 *
 * Reglas:
 *   1. "E2E " (prefijo descriptivo) NO debe aparecer en:
 *        - docs/gateway-pg/stripe/*.md
 *        - tests/features/gateway-pg/**
 *        - tests/coverage/**
 *      EXCEPTO cuando es ID técnico: [E2E-FLOW-*], [E2E], E2E_, @e2e, E2EFlow, tests/e2e/.
 *
 *   2. "Hold y Cobro" (redacción ambigua) NO debe aparecer en docs ni specs.
 *      Reemplazo canónico: "Hold desde Alta de Viaje y Cobro desde App Driver".
 *
 * Exit codes:
 *   0 — OK (0 violaciones)
 *   1 — violaciones detectadas
 *
 * Uso:
 *   node scripts/ai/check-doc-terminology.mjs
 *
 * Referencia: docs/gateway-pg/stripe/TRACEABILITY.md §5 (strings técnicos protegidos)
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOTS = [
  'docs/gateway-pg/stripe',
  'tests/features/gateway-pg',
  'tests/coverage',
];

// Patrones que, si matchean, fallan
const VIOLATIONS = [
  {
    name: 'E2E prefijo descriptivo (use "Validar")',
    regex: /(^|["|\s])E2E (?!-FLOW)(?!FLOW)(?!Flow)(?!_)/gm,
    // Líneas con estos tokens son IDs técnicos o etiquetas arquitectónicas y se permiten
    allowIfLineContains: [
      '[E2E-FLOW', '[E2E]', 'E2E_', '@e2e', 'E2EFlow', 'tests/e2e/', '*.e2e.spec',
      'E2E Mobile',    // clasificador de suite en describes Playwright
      'E2E híbridos',  // concepto arquitectónico (ARCHITECTURE.md)
      'E2E Flow',      // descripción de flow hybrid en comments
    ],
  },
  {
    name: 'Hold y Cobro sin desambiguar (use "Hold desde Alta de Viaje y Cobro desde App Driver")',
    regex: /Hold y Cobro/g,
    allowIfLineContains: [],
  },
];

// Archivos excluidos: el propio script, scripts de sync, docs históricos del proceso.
// Estos archivos referencian textualmente el antes/después como evidencia del cambio.
const EXCLUDED_FILES = [
  'scripts/ai/check-doc-terminology.mjs',
  'scripts/ai/phase6-sync-coverage.mjs',
  'scripts/ai/phase7-sync-hold-cobro.mjs',
  'docs/gateway-pg/stripe/TRACEABILITY.md',           // contiene los strings como ejemplos canónicos
  'docs/gateway-pg/stripe/duplicados-detectados.md',  // nota histórica del análisis pre-sync
  'docs/gateway-pg/stripe/pares-resueltos.md',        // reporte histórico Fase 2
];

function listFiles() {
  const pattern = ROOTS.map((r) => `"${r}"`).join(' ');
  let out = '';
  try {
    // git ls-files ignora gitignored; para tests/coverage (gitignored) usamos find
    out = execSync(`git ls-files ${pattern}`, { encoding: 'utf8' });
  } catch {}
  const tracked = out.split('\n').filter(Boolean);
  // Agregar también tests/coverage aunque esté gitignored (es local)
  const untracked = [];
  try {
    const covOut = execSync('git ls-files --others --exclude-standard tests/coverage', { encoding: 'utf8' });
    untracked.push(...covOut.split('\n').filter(Boolean));
  } catch {}
  // Fallback: si coverage no está untracked tampoco, listar con find
  try {
    const findOut = execSync('find tests/coverage -type f \\( -name "*.md" -o -name "*.json" \\) 2>/dev/null', {
      encoding: 'utf8',
    });
    untracked.push(...findOut.split('\n').filter(Boolean));
  } catch {}
  return [...new Set([...tracked, ...untracked])]
    .filter((f) => /\.(md|json|ts|tsx|mjs|cjs|js)$/.test(f))
    .filter((f) => !EXCLUDED_FILES.includes(f));
}

const violations = [];
const files = listFiles();
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  for (const rule of VIOLATIONS) {
    rule.regex.lastIndex = 0;
    let m;
    while ((m = rule.regex.exec(content)) !== null) {
      const before = content.slice(0, m.index);
      const lineNum = (before.match(/\n/g) || []).length + 1;
      const line = lines[lineNum - 1] ?? '';
      const allowed = rule.allowIfLineContains.some((token) => line.includes(token));
      if (allowed) continue;
      violations.push({
        rule: rule.name,
        file,
        line: lineNum,
        snippet: line.trim().slice(0, 140),
      });
    }
  }
}

if (violations.length === 0) {
  console.log('[check-doc-terminology] OK — 0 violaciones en', files.length, 'archivos');
  process.exit(0);
}

console.error(`[check-doc-terminology] FAIL — ${violations.length} violaciones:\n`);
for (const v of violations.slice(0, 50)) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.rule}`);
  console.error(`    ${v.snippet}`);
}
if (violations.length > 50) {
  console.error(`  ... y ${violations.length - 50} más`);
}
console.error('\nReferencia: docs/gateway-pg/stripe/TRACEABILITY.md §5');
process.exit(1);
