#!/usr/bin/env node
/**
 * Fase 7b — insertar en xlsx los TCs presentes en normalized-test-cases.json
 * que aún no tienen fila física en STRIPE_Test_Suite_Matriz_Sincronizado.xlsx.
 *
 * Contexto: update-matriz-xlsx.ts actualiza filas existentes pero NO inserta.
 * Tras Fase 2 (resolución de duplicados) quedaron 30 TCs operativos (P2-TC060–089)
 * en el JSON sin correspondencia en el xlsx.
 *
 * Uso:
 *   node scripts/ai/phase7b-insert-missing-xlsx.mjs          # dry-run
 *   node scripts/ai/phase7b-insert-missing-xlsx.mjs --apply  # escribir
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';

const APPLY = process.argv.includes('--apply');
const JSON_PATH = 'docs/gateway-pg/stripe/normalized-test-cases.json';
const XLSX_PATHS = [
  'docs/gateway-pg/stripe/STRIPE_Test_Suite_Matriz_Sincronizado.xlsx',
  '.claude/skills/magiis-playwright-docs-to-drafts/references/STRIPE_Test_Suite_Matriz_Sincronizado.xlsx',
];
// Sheets que contienen TCs con formato "ID – título" en columna 1.
const ID_SHEETS = ['TEST_SUITE', 'TEST_SUITE 2.0'];
// Sheet destino por prefijo del ID.
const TARGET_SHEET_BY_PREFIX = {
  'TS-STRIPE-P2-': 'TEST_SUITE 2.0', // parte 2 (contractor, quote, recurrentes, ops)
  default: 'TEST_SUITE',              // parte 1 (P1 TCs)
};
const ID_REGEX = /^(TS-STRIPE-(?:P2-)?TC-?(?:RV)?\d+)\b/;

function targetSheetFor(id) {
  for (const [prefix, sheet] of Object.entries(TARGET_SHEET_BY_PREFIX)) {
    if (prefix !== 'default' && id.startsWith(prefix)) return sheet;
  }
  return TARGET_SHEET_BY_PREFIX.default;
}

function loadCases() {
  const doc = JSON.parse(readFileSync(resolve(JSON_PATH), 'utf8'));
  const byId = new Map();
  for (const c of doc.cases) byId.set(c.test_case_id, c);
  return byId;
}

async function processXlsx(filePath, byId) {
  const abs = resolve(filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(abs);

  // Escanear TODOS los sheets con TCs para detectar IDs ya presentes.
  // Los IDs viven en col 2 ("ID – descripción") — col 1 es Feature/Módulo.
  const presentIds = new Set();
  for (const sheetName of ID_SHEETS) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    ws.eachRow((row) => {
      for (const colIdx of [1, 2]) {
        const cellValue = String(row.getCell(colIdx).value ?? '').trim();
        const match = cellValue.match(ID_REGEX);
        if (match) {
          presentIds.add(match[1]);
          break;
        }
      }
    });
  }

  // Determinar missing y agruparlos por sheet destino.
  const missingBySheet = new Map();
  for (const [id, nc] of byId.entries()) {
    if (presentIds.has(id)) continue;
    if (!id.startsWith('TS-STRIPE')) continue;
    // Saltar alias CARD-EXISTING y RV que no tienen ID numerico propio — ver TRACEABILITY.
    if (nc.phase2_status === 'collapsed-alias') continue;
    const sheet = targetSheetFor(id);
    if (!missingBySheet.has(sheet)) missingBySheet.set(sheet, []);
    missingBySheet.get(sheet).push(nc);
  }

  const insertedPerSheet = {};
  for (const [sheetName, cases] of missingBySheet.entries()) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      insertedPerSheet[sheetName] = { error: 'sheet-not-found', would: cases.length };
      continue;
    }
    cases.sort((a, b) => a.test_case_id.localeCompare(b.test_case_id));
    const ids = [];
    for (const nc of cases) {
      // Estructura: col1 = Feature/Módulo (copiamos genérico), col2 = "ID – descripción"
      const feature = nc.module ?? nc.portal ?? 'Gateway Stripe';
      const idCell = `${nc.test_case_id} – ${nc.title ?? ''}`.trim();
      const priority = nc.priority ?? '';
      const row = ws.addRow([feature, idCell, priority]);
      row.commit?.();
      ids.push(nc.test_case_id);
    }
    insertedPerSheet[sheetName] = { count: ids.length, ids: ids.slice(0, 8), overflow: Math.max(0, ids.length - 8) };
  }

  if (APPLY && Object.values(insertedPerSheet).some((v) => v.count > 0)) {
    const bakPath = `${abs}.bak`;
    try {
      const { copyFileSync } = await import('node:fs');
      copyFileSync(abs, bakPath);
    } catch {}
    await wb.xlsx.writeFile(abs);
  }

  return {
    file: filePath,
    status: APPLY ? 'written' : 'dry-run',
    insertedPerSheet,
  };
}

const byId = loadCases();
const results = [];
for (const p of XLSX_PATHS) {
  try {
    results.push(await processXlsx(p, byId));
  } catch (e) {
    results.push({ file: p, status: 'error', error: e.message });
  }
}
console.log(JSON.stringify({ apply: APPLY, results }, null, 2));
