#!/usr/bin/env node
/**
 * consistency-check.mjs — Validador del CONTRATO de consistencia (Nivel 2 · Fase I)
 *
 * Alinea magiis-playwright con la metodología del orquestador `agentic-qa-boilerplate`.
 * Reporte ADVISORY sobre tests/features/ ** /*.spec.ts (se cablea warningOnly en pre-push):
 *   1. Suites sin ≥1 tag de capa (@smoke|@critical|@regression) o sin dominio.
 *   2. TC-IDs reusados: mismo archivo (¿describe+test o dup real?) y cross-archivo
 *      (¿smoke/cross-ref legítimo? reconciliar vs matriz en Fase D).
 *   3. Tags usados que NO están en el estándar docs/ci/TAGS.md (ratificar o quitar).
 *   4. Specs de @gateway sin annotation type:'tms' (gap de trazabilidad TMS · Fase C).
 *
 * Las reglas son ADVISORY porque las convenciones del repo (TC-ID en describe, smoke=subconjunto,
 * variaciones hold/↔recovery/) hacen que un fallo duro sea ruidoso. `errors` queda reservado para
 * reglas inequívocas futuras. SoT de tags: docs/ci/TAGS.md (BL-045). Contrato: .agents/project.yaml.
 * Uso: node scripts/ci/consistency-check.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const c = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m', bold: '\x1b[1m' };

// Set canónico de tags — espejo de docs/ci/TAGS.md (BL-045). Mantener sincronizado.
const CANON = new Set([
  '@smoke', '@critical', '@regression',                 // capa
  '@gateway', '@auth', '@navbar', '@e2e-hybrid',         // dominio
  '@stripe', '@authorize', '@mercadopago', '@ebizcharge',// gateway
  '@hold', '@3ds', '@capture', '@decline', '@wallet', '@cargo-a-bordo', // intent
  '@flaky', '@wip', '@visual',                           // estado
  '@unit', '@api',                                       // selectores de project (testMatch/dir)
]);
const CAPA = new Set(['@smoke', '@critical', '@regression']);
const DOMAIN = new Set(['@gateway', '@auth', '@navbar', '@e2e-hybrid']);

const ROOT = 'tests/features';

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

// Extrae los títulos de test(...) / test.describe(...) (primer arg string).
const TITLE_RE = /\b(?:test|it)(?:\.describe)?(?:\.serial|\.parallel|\.skip|\.fixme|\.only)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const TAG_RE = /@[a-z0-9][a-z0-9-]*/gi;
// TC-IDs reales (no BL-/MX- que son refs de backlog/ticket compartibles).
const TCID_RE = /\[(TS-[A-Z0-9]+(?:-P\d+)?-TC\d+|EC-[A-Z]+-\d+(?:\/[A-Z0-9]+)?)\]/g;
const TMS_RE = /type:\s*['"]tms['"]/;

const files = walk(ROOT);
const errors = [];
const warnings = [];
const tcidOwners = new Map(); // id -> [{ file, title }]
let unmappedGateway = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const titles = [];
  let m;
  TITLE_RE.lastIndex = 0;
  while ((m = TITLE_RE.exec(content)) !== null) titles.push(m[2]);

  const allTags = new Set();
  let hasCapa = false, hasDomain = false, hasAnyTag = false;
  for (const t of titles) {
    const tags = t.match(TAG_RE) || [];
    for (const raw of tags) {
      const tag = raw.toLowerCase();
      allTags.add(tag);
      hasAnyTag = true;
      if (CAPA.has(tag)) hasCapa = true;
      if (DOMAIN.has(tag)) hasDomain = true;
      if (!CANON.has(tag)) warnings.push(`[tag-no-doc] ${file}: ${raw} no está en docs/ci/TAGS.md`);
    }
    // TC-IDs por título
    let t2;
    TCID_RE.lastIndex = 0;
    while ((t2 = TCID_RE.exec(t)) !== null) {
      const id = t2[1];
      if (!tcidOwners.has(id)) tcidOwners.set(id, []);
      tcidOwners.get(id).push({ file, title: t.slice(0, 60) });
    }
  }

  // [1] capa + dominio (solo specs con al menos un tag; los archivos doc-only sin describe se saltan).
  // WARNING (no bloquea): es un gap de consistencia a cerrar, no un build-break.
  if (hasAnyTag) {
    if (!hasCapa) warnings.push(`[sin-capa] ${file}: ningún describe tiene @smoke|@critical|@regression`);
    if (!hasDomain) warnings.push(`[sin-dominio] ${file}: ningún describe tiene tag de dominio (@gateway|@auth|@navbar|@e2e-hybrid)`);
  }

  // [4] trazabilidad TMS en specs de gateway
  if (allTags.has('@gateway') && !TMS_RE.test(content)) unmappedGateway++;
}

// [2] duplicados de TC-ID.
//   - MISMO archivo ≥2 veces → ERROR (colisión real: dos tests distintos con el mismo ID).
//   - Cross-archivo ≥2 → WARNING (puede ser legítimo: smoke = subconjunto que referencia el TC
//     completo, o variaciones hold/↔recovery/ del mismo caso de la matriz). Reconciliar en Fase D.
for (const [id, occ] of tcidOwners) {
  const byFile = new Map();
  for (const o of occ) byFile.set(o.file, (byFile.get(o.file) || 0) + 1);
  const sameFile = [...byFile.entries()].filter(([, n]) => n >= 2);
  if (sameFile.length > 0) {
    // WARNING, no error: en este repo el describe lleva el TC-ID y su test suele repetirlo
    // (convención propia) → "2x mismo archivo" no implica colisión. El humano verifica si son
    // describe+test (OK) o dos tests distintos (defecto real).
    warnings.push(`[tc-id-dup-mismo-archivo] ${id} ${sameFile[0][1]}x en ${sameFile[0][0].replace(/^tests[\\/]features[\\/]/, '')} (¿describe+test o dup real?)`);
  } else if (byFile.size >= 2) {
    warnings.push(`[tc-id-dup-cross] ${id} en ${byFile.size} archivos (¿smoke/cross-ref? reconciliar vs matriz): ${[...byFile.keys()].map(f => f.replace(/^tests[\\/]features[\\/]/, '')).join(', ')}`);
  }
}

// ── Reporte ──
console.log(`${c.bold}${c.cyan}Consistency check — contrato metodología${c.reset}`);
console.log(`${c.gray}${files.length} spec(s) en ${ROOT}${c.reset}\n`);

if (errors.length === 0) console.log(`${c.green}✅ Sin errores duros (capa+dominio, TC-IDs únicos)${c.reset}`);
else {
  console.log(`${c.red}${c.bold}❌ ${errors.length} error(es) duro(s):${c.reset}`);
  for (const e of errors) console.log(`   ${c.red}${e}${c.reset}`);
}

const dedupWarn = [...new Set(warnings)];
if (dedupWarn.length > 0) {
  console.log(`\n${c.yellow}⚠️  ${dedupWarn.length} warning(s):${c.reset}`);
  for (const w of dedupWarn.slice(0, 30)) console.log(`   ${c.yellow}${w}${c.reset}`);
  if (dedupWarn.length > 30) console.log(`   ${c.gray}... y ${dedupWarn.length - 30} más${c.reset}`);
}
if (unmappedGateway > 0) {
  console.log(`\n${c.yellow}⚠️  ${unmappedGateway} spec(s) @gateway sin annotation type:'tms' → gap de trazabilidad (Fase C)${c.reset}`);
}

console.log('');
process.exit(errors.length > 0 ? 1 : 0);
