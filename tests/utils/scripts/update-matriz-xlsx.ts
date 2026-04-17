/**
 * update-matriz-xlsx.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincroniza los archivos .xlsx de la matriz Stripe con la fuente de verdad
 * `docs/gateway-pg/stripe/normalized-test-cases.json` (219 casos post Fase 2).
 *
 * Pertenece a la **Fase 3** del plan de desambiguación de matrices Stripe
 * (`~/.claude/plans/en-tu-rol-como-prancy-yeti.md`). Los .md y el JSON ya son
 * finales — acá solo se alinean los xlsx a esos entregables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ DEPENDENCIA NO INSTALADA
 * ─────────────────────────────────────────────────────────────────────────────
 * Este script requiere `exceljs` (no está en package.json). Antes de ejecutar:
 *
 *     pnpm add -D exceljs
 *
 * Se eligió `exceljs` sobre `xlsx` (ya instalado) porque `exceljs` preserva
 * estilos de celda de forma nativa al mutar solo `cell.value` sin reasignar el
 * objeto, algo crítico para no romper el formato de las matrices QA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Uso
 * ─────────────────────────────────────────────────────────────────────────────
 *     # Dry-run (default) — no escribe nada, solo reporta
 *     pnpm exec ts-node --esm tests/utils/scripts/update-matriz-xlsx.ts
 *
 *     # Aplicar cambios (crea backup .bak primero)
 *     pnpm exec ts-node --esm tests/utils/scripts/update-matriz-xlsx.ts --apply
 *
 *     # Procesar un único xlsx
 *     pnpm exec ts-node --esm tests/utils/scripts/update-matriz-xlsx.ts \
 *         --file docs/gateway-pg/stripe/STRIPE_Test_Suite_Matriz_Sincronizado.xlsx
 *
 *     # Output detallado celda por celda
 *     pnpm exec ts-node --esm tests/utils/scripts/update-matriz-xlsx.ts --verbose
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica
 * ─────────────────────────────────────────────────────────────────────────────
 * Para cada fila del xlsx con un `test_case_id` conocido en el JSON:
 *
 *   phase2_status = "active-canonical"      → título = JSON.title (+ "— Vincular tarjeta nueva")
 *                                              prioridad = JSON.priority
 *   phase2_status = "active-card-existing"  → título = JSON.title (+ "— Usar tarjeta vinculada existente")
 *                                              prioridad = JSON.priority
 *                                              agrega columna "Alias CARD-EXISTING" con card_existing_alias_id
 *   phase2_status = "deprecated-redundant"  → título prefijado "[DEPR] "
 *                                              + columna "Canonical Ref" con canonical_ref
 *   phase2_status = "collapsed-alias"       → título prefijado "[ALIAS] "
 *                                              + columna "Canonical Ref" con canonical_ref
 *   sin phase2_status                        → reemplazo literal "E2E " → "Validar " en el título
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Reglas de seguridad (abort)
 * ─────────────────────────────────────────────────────────────────────────────
 * El script aborta sin escribir si detecta:
 *   - Strings protegidos en celdas: E2E-FLOW, E2EFlow, E2E_, @e2e
 *     (son identificadores técnicos de arquitectura — no deben confundirse
 *      con el prefijo descriptivo "E2E " que se migra a "Validar ").
 *   - IDs en el xlsx que NO existen en el JSON (drift / typo — requiere
 *     revisión manual antes de aplicar cambios).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Archivos objetivo (default)
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. docs/gateway-pg/stripe/STRIPE_Test_Suite_Matriz_Sincronizado.xlsx
 *   2. .claude/skills/magiis-playwright-docs-to-drafts/references/
 *      STRIPE_Test_Suite_Matriz_Sincronizado.xlsx
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Preservación de estilo
 * ─────────────────────────────────────────────────────────────────────────────
 * Solo se mutan `cell.value`. Nunca se reasigna el objeto `cell` ni se toca
 * `cell.style`, `cell.font`, `cell.fill`, etc. Las columnas nuevas
 * ("Alias CARD-EXISTING", "Canonical Ref") se agregan al final del header y
 * heredan el formato por defecto del worksheet.
 */

import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// `exceljs` se importa con require dinámico para no romper el parse del
// archivo si el paquete no está instalado — así el usuario ve un mensaje
// claro en vez de un stack trace críptico.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcelJsNs = any;

// Resuelve raíz del repo: este archivo vive en tests/utils/scripts/.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../..');

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Phase2Status =
  | 'active-canonical'
  | 'active-card-existing'
  | 'deprecated-redundant'
  | 'collapsed-alias';

interface NormalizedCase {
  test_case_id: string;
  title: string;
  priority: string;
  phase2_status?: Phase2Status;
  card_flow?: string;
  card_existing_alias_id?: string;
  canonical_ref?: string;
}

interface NormalizedDoc {
  generated_at: string;
  total: number;
  cases: NormalizedCase[];
}

interface RowPlan {
  sheet: string;
  rowNumber: number;
  testCaseId: string;
  currentTitle: string;
  newTitle: string;
  currentPriority?: string;
  newPriority?: string;
  action: 'update' | 'deprecate' | 'alias' | 'e2e→validar' | 'noop';
  canonicalRef?: string;
  aliasCardExisting?: string;
  phase2Status?: Phase2Status;
}

interface FileReport {
  path: string;
  relative: string;
  exists: boolean;
  sheetStats: Array<{ sheet: string; rows: number }>;
  plans: RowPlan[];
  orphans: Array<{ sheet: string; rowNumber: number; id: string; title: string }>;
  blocked: Array<{ sheet: string; rowNumber: number; reason: string; snippet: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

interface Cli {
  apply: boolean;
  verbose: boolean;
  onlyFile?: string;
}

function parseCli(argv: string[]): Cli {
  const cli: Cli = { apply: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') cli.apply = true;
    else if (a === '--verbose') cli.verbose = true;
    else if (a === '--file') cli.onlyFile = argv[++i];
  }
  return cli;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carga JSON canónico
// ─────────────────────────────────────────────────────────────────────────────

function loadNormalized(): { byId: Map<string, NormalizedCase>; doc: NormalizedDoc } {
  const p = resolve(REPO_ROOT, 'docs/gateway-pg/stripe/normalized-test-cases.json');
  if (!existsSync(p)) {
    throw new Error(`No existe la fuente de verdad: ${p}`);
  }
  const raw = readFileSync(p, 'utf-8');
  const doc = JSON.parse(raw) as NormalizedDoc;
  const byId = new Map<string, NormalizedCase>();
  for (const c of doc.cases) byId.set(c.test_case_id, c);
  return { byId, doc };
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching de columnas
// ─────────────────────────────────────────────────────────────────────────────

const COL_TITLE_ALIASES = [
  'titulo de prueba',
  'título de prueba',
  'descripcion',
  'descripción',
  'titulo',
  'título',
  'title',
  'test title',
  'test case title',
];
const COL_PRIORITY_ALIASES = ['prioridad', 'priority'];
const COL_ID_ALIASES = ['id', 'test case id', 'test_case_id', 'tc id', 'tc_id', 'tcid'];

function normalizeHeader(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function matchesAny(header: string, aliases: string[]): boolean {
  return aliases.some((a) => header === a || header.includes(a));
}

interface ColumnMap {
  idCol?: number;
  titleCol?: number;
  priorityCol?: number;
  aliasCardExistingCol?: number;
  canonicalRefCol?: number;
  headerRow: number;
  lastCol: number;
}

function locateColumns(worksheet: ExcelJsNs): ColumnMap | null {
  // La fila de header suele ser la 1, pero algunos xlsx la tienen en 2 o 3.
  // Escaneamos las primeras 5 filas buscando una que matchee "ID" + "Título".
  const max = Math.min(5, worksheet.rowCount || 5);
  for (let r = 1; r <= max; r++) {
    const row = worksheet.getRow(r);
    const map: ColumnMap = { headerRow: r, lastCol: row.cellCount };
    let found = 0;
    row.eachCell({ includeEmpty: false }, (cell: ExcelJsNs, colNumber: number) => {
      const h = normalizeHeader(cell.value);
      if (!h) return;
      if (!map.idCol && matchesAny(h, COL_ID_ALIASES)) {
        map.idCol = colNumber;
        found++;
      } else if (!map.titleCol && matchesAny(h, COL_TITLE_ALIASES)) {
        map.titleCol = colNumber;
        found++;
      } else if (!map.priorityCol && matchesAny(h, COL_PRIORITY_ALIASES)) {
        map.priorityCol = colNumber;
        found++;
      }
      if (h.includes('alias card-existing') || h.includes('alias card existing')) {
        map.aliasCardExistingCol = colNumber;
      }
      if (h.includes('canonical ref') || h === 'canonical_ref') {
        map.canonicalRefCol = colNumber;
      }
      if (colNumber > map.lastCol) map.lastCol = colNumber;
    });
    if (map.idCol && map.titleCol) return map;
    if (found >= 2) return map; // parcial aún usable
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reglas de seguridad: strings protegidos que nunca se tocan
// ─────────────────────────────────────────────────────────────────────────────

const PROTECTED_PATTERNS: RegExp[] = [
  /E2E-FLOW/,
  /E2EFlow/,
  /E2E_/,
  /@e2e\b/,
];

function detectProtected(value: string): string | null {
  for (const rx of PROTECTED_PATTERNS) {
    if (rx.test(value)) return rx.source;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción de planes por fila
// ─────────────────────────────────────────────────────────────────────────────

function buildPlanForRow(
  row: ExcelJsNs,
  rowNumber: number,
  sheetName: string,
  cols: ColumnMap,
  byId: Map<string, NormalizedCase>,
): { plan?: RowPlan; orphan?: FileReport['orphans'][number]; blocked?: FileReport['blocked'][number] } {
  const idRaw = cols.idCol ? row.getCell(cols.idCol).value : undefined;
  const titleRaw = cols.titleCol ? row.getCell(cols.titleCol).value : undefined;
  const priorityRaw = cols.priorityCol ? row.getCell(cols.priorityCol).value : undefined;

  const id = String(idRaw ?? '').trim();
  const title = String(titleRaw ?? '').trim();
  const priority = String(priorityRaw ?? '').trim();

  // Filas vacías o de separador
  if (!id && !title) return {};
  // Filas que solo tienen descripción (posibles secciones) — se ignoran
  if (!id) return {};

  // Guardrail: strings protegidos en el TÍTULO no deben ser alterados.
  const prot = detectProtected(title);
  if (prot) {
    return {
      blocked: {
        sheet: sheetName,
        rowNumber,
        reason: `string protegido "${prot}" en título`,
        snippet: title.slice(0, 120),
      },
    };
  }

  const nc = byId.get(id);
  if (!nc) {
    return {
      orphan: { sheet: sheetName, rowNumber, id, title },
    };
  }

  const plan: RowPlan = {
    sheet: sheetName,
    rowNumber,
    testCaseId: id,
    currentTitle: title,
    newTitle: title,
    currentPriority: priority,
    action: 'noop',
    phase2Status: nc.phase2_status,
  };

  switch (nc.phase2_status) {
    case 'active-canonical':
    case 'active-card-existing': {
      plan.newTitle = nc.title;
      plan.newPriority = nc.priority;
      plan.action = 'update';
      if (nc.phase2_status === 'active-card-existing' && nc.card_existing_alias_id) {
        plan.aliasCardExisting = nc.card_existing_alias_id;
      }
      if (nc.canonical_ref) plan.canonicalRef = nc.canonical_ref;
      break;
    }
    case 'deprecated-redundant': {
      const stripped = title.replace(/^\[DEPR\]\s*/, '');
      plan.newTitle = `[DEPR] ${stripped}`;
      plan.newPriority = nc.priority;
      plan.action = 'deprecate';
      if (nc.canonical_ref) plan.canonicalRef = nc.canonical_ref;
      break;
    }
    case 'collapsed-alias': {
      const stripped = title.replace(/^\[ALIAS\]\s*/, '');
      plan.newTitle = `[ALIAS] ${stripped}`;
      plan.newPriority = nc.priority;
      plan.action = 'alias';
      if (nc.canonical_ref) plan.canonicalRef = nc.canonical_ref;
      break;
    }
    default: {
      // Sin phase2_status: reemplazo literal "E2E " → "Validar " al inicio
      // (ver Fase 1 del plan). Solo aplica si el título NO coincide ya con el JSON.
      if (title !== nc.title) {
        const replaced = title.replace(/^E2E\s+/, 'Validar ').replace(/\|\s*E2E\s+/g, '| Validar ');
        plan.newTitle = replaced !== title ? replaced : nc.title;
        plan.action = 'e2e→validar';
      }
      plan.newPriority = nc.priority;
    }
  }

  return { plan };
}

// ─────────────────────────────────────────────────────────────────────────────
// Procesamiento de un xlsx
// ─────────────────────────────────────────────────────────────────────────────

async function processWorkbook(
  absPath: string,
  ExcelJS: ExcelJsNs,
  byId: Map<string, NormalizedCase>,
): Promise<FileReport> {
  const relative = absPath.replace(REPO_ROOT, '').replace(/\\/g, '/').replace(/^\//, '');
  const report: FileReport = {
    path: absPath,
    relative,
    exists: existsSync(absPath),
    sheetStats: [],
    plans: [],
    orphans: [],
    blocked: [],
  };
  if (!report.exists) return report;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(absPath);

  wb.eachSheet((ws: ExcelJsNs) => {
    const cols = locateColumns(ws);
    if (!cols || !cols.idCol || !cols.titleCol) {
      report.sheetStats.push({ sheet: ws.name, rows: 0 });
      return;
    }
    const rowCount = ws.rowCount;
    report.sheetStats.push({ sheet: ws.name, rows: rowCount - cols.headerRow });

    for (let r = cols.headerRow + 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const { plan, orphan, blocked } = buildPlanForRow(row, r, ws.name, cols, byId);
      if (plan) report.plans.push(plan);
      if (orphan) report.orphans.push(orphan);
      if (blocked) report.blocked.push(blocked);
    }
  });

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicación de cambios (escritura)
// ─────────────────────────────────────────────────────────────────────────────

async function applyChanges(
  absPath: string,
  ExcelJS: ExcelJsNs,
  byId: Map<string, NormalizedCase>,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(absPath);

  wb.eachSheet((ws: ExcelJsNs) => {
    const cols = locateColumns(ws);
    if (!cols || !cols.idCol || !cols.titleCol) return;

    // Agregar headers para columnas auxiliares si faltan
    let aliasCol = cols.aliasCardExistingCol;
    let canonCol = cols.canonicalRefCol;

    const headerRow = ws.getRow(cols.headerRow);

    if (!aliasCol) {
      aliasCol = cols.lastCol + 1;
      headerRow.getCell(aliasCol).value = 'Alias CARD-EXISTING';
      cols.lastCol = aliasCol;
    }
    if (!canonCol) {
      canonCol = cols.lastCol + 1;
      headerRow.getCell(canonCol).value = 'Canonical Ref';
      cols.lastCol = canonCol;
    }

    const rowCount = ws.rowCount;
    for (let r = cols.headerRow + 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const idRaw = row.getCell(cols.idCol).value;
      const id = String(idRaw ?? '').trim();
      if (!id) continue;
      const nc = byId.get(id);
      if (!nc) continue;

      const titleCell = row.getCell(cols.titleCol);
      const currentTitle = String(titleCell.value ?? '').trim();

      // Protected check — nunca mutar
      if (detectProtected(currentTitle)) continue;

      switch (nc.phase2_status) {
        case 'active-canonical':
        case 'active-card-existing':
          titleCell.value = nc.title;
          if (cols.priorityCol) row.getCell(cols.priorityCol).value = nc.priority;
          if (nc.phase2_status === 'active-card-existing' && nc.card_existing_alias_id) {
            row.getCell(aliasCol).value = nc.card_existing_alias_id;
          }
          if (nc.canonical_ref) row.getCell(canonCol).value = nc.canonical_ref;
          break;
        case 'deprecated-redundant': {
          const stripped = currentTitle.replace(/^\[DEPR\]\s*/, '');
          titleCell.value = `[DEPR] ${stripped}`;
          if (cols.priorityCol) row.getCell(cols.priorityCol).value = nc.priority;
          if (nc.canonical_ref) row.getCell(canonCol).value = nc.canonical_ref;
          break;
        }
        case 'collapsed-alias': {
          const stripped = currentTitle.replace(/^\[ALIAS\]\s*/, '');
          titleCell.value = `[ALIAS] ${stripped}`;
          if (cols.priorityCol) row.getCell(cols.priorityCol).value = nc.priority;
          if (nc.canonical_ref) row.getCell(canonCol).value = nc.canonical_ref;
          break;
        }
        default: {
          if (currentTitle !== nc.title) {
            const replaced = currentTitle
              .replace(/^E2E\s+/, 'Validar ')
              .replace(/\|\s*E2E\s+/g, '| Validar ');
            titleCell.value = replaced !== currentTitle ? replaced : nc.title;
          }
          if (cols.priorityCol) row.getCell(cols.priorityCol).value = nc.priority;
        }
      }
    }
  });

  const backup = `${absPath}.bak`;
  copyFileSync(absPath, backup);
  await wb.xlsx.writeFile(absPath);
}

// ─────────────────────────────────────────────────────────────────────────────
// Printing
// ─────────────────────────────────────────────────────────────────────────────

function printReport(report: FileReport, cli: Cli, byId: Map<string, NormalizedCase>): void {
  const tag = cli.apply ? '[apply]' : '[dry-run]';
  console.log(`\n${tag} ${report.relative}`);
  if (!report.exists) {
    console.log('  (archivo no encontrado — se omite)');
    return;
  }
  for (const s of report.sheetStats) {
    console.log(`  Sheet "${s.sheet}": ${s.rows} rows`);
    const plansForSheet = report.plans.filter((p) => p.sheet === s.sheet);
    if (cli.verbose) {
      for (const p of plansForSheet) {
        const prefix = {
          update: '+',
          deprecate: '!',
          alias: '~',
          'e2e→validar': '>',
          noop: '=',
        }[p.action];
        const extra = p.aliasCardExisting
          ? ` | alias: ${p.aliasCardExisting}`
          : p.canonicalRef
            ? ` | canonical: ${p.canonicalRef}`
            : '';
        console.log(
          `    ${prefix} ${p.testCaseId}: [${p.action}] "${truncate(p.newTitle, 80)}"${extra}`,
        );
      }
    } else {
      // Resumen por acción
      const counts = plansForSheet.reduce<Record<string, number>>((acc, p) => {
        acc[p.action] = (acc[p.action] ?? 0) + 1;
        return acc;
      }, {});
      const parts = Object.entries(counts)
        .map(([a, n]) => `${a}=${n}`)
        .join(', ');
      if (parts) console.log(`    plans: ${parts}`);
    }
  }
  const matched = report.plans.length;
  const orphans = report.orphans.length;
  const blocked = report.blocked.length;
  console.log(`  Summary: ${matched} matched, ${orphans} orphans, ${blocked} blocked`);

  if (orphans > 0) {
    console.log('  Orphans (ID en xlsx no presente en JSON):');
    for (const o of report.orphans.slice(0, 20)) {
      console.log(`    - sheet="${o.sheet}" row=${o.rowNumber} id="${o.id}" "${truncate(o.title, 70)}"`);
    }
    if (orphans > 20) console.log(`    ... y ${orphans - 20} más`);
  }
  if (blocked > 0) {
    console.log('  Blocked (strings protegidos — no se tocan):');
    for (const b of report.blocked.slice(0, 20)) {
      console.log(`    - sheet="${b.sheet}" row=${b.rowNumber} reason=${b.reason} "${truncate(b.snippet, 70)}"`);
    }
  }

  // Missing: ids en JSON que NO aparecen en este xlsx
  const xlsxIds = new Set(report.plans.map((p) => p.testCaseId).concat(report.orphans.map((o) => o.id)));
  const missing: string[] = [];
  for (const id of byId.keys()) {
    if (!xlsxIds.has(id)) missing.push(id);
  }
  if (missing.length > 0) {
    console.log(`  Missing (en JSON pero no en xlsx): ${missing.length}`);
    if (cli.verbose) {
      for (const id of missing.slice(0, 20)) console.log(`    - ${id}`);
      if (missing.length > 20) console.log(`    ... y ${missing.length - 20} más`);
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TARGETS = [
  'docs/gateway-pg/stripe/STRIPE_Test_Suite_Matriz_Sincronizado.xlsx',
  '.claude/skills/magiis-playwright-docs-to-drafts/references/STRIPE_Test_Suite_Matriz_Sincronizado.xlsx',
];

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));

  // Carga perezosa de exceljs con mensaje claro si falta.
  let ExcelJS: ExcelJsNs;
  try {
    // Import dinámico indirecto para ESM + ts-node. Se construye el especificador
    // a runtime para que tsc --noEmit no falle si el paquete aún no está instalado
    // (el script se distribuye antes que la dependencia — ver JSDoc del header).
    const pkg = 'exceljs';
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const mod = await (new Function('p', 'return import(p)'))(pkg);
    ExcelJS = (mod as ExcelJsNs).default ?? mod;
  } catch (err) {
    console.error('[error] No se pudo cargar `exceljs`. Instalalo con:');
    console.error('        pnpm add -D exceljs');
    console.error('        (error original)', (err as Error).message);
    process.exit(2);
  }

  const { byId, doc } = loadNormalized();
  console.log(`Fuente JSON: ${doc.total} casos cargados (generated_at=${doc.generated_at})`);

  const targets = cli.onlyFile
    ? [cli.onlyFile]
    : DEFAULT_TARGETS;

  const reports: FileReport[] = [];
  let anyBlocked = false;

  for (const rel of targets) {
    const abs = resolve(REPO_ROOT, rel);
    const rep = await processWorkbook(abs, ExcelJS, byId);
    reports.push(rep);
    printReport(rep, cli, byId);
    if (rep.blocked.length > 0) anyBlocked = true;
  }

  if (anyBlocked) {
    console.error('\n[abort] Se detectaron celdas con strings protegidos. Revisá manualmente antes de re-ejecutar.');
    process.exit(3);
  }

  // Validación post-run: comparativa totals
  console.log('\n─── Validación post-run ───');
  console.log(`Total TCs JSON:   ${doc.total}`);
  for (const rep of reports) {
    if (!rep.exists) continue;
    const matched = rep.plans.length;
    const orphans = rep.orphans.length;
    const xlsxIds = new Set(rep.plans.map((p) => p.testCaseId).concat(rep.orphans.map((o) => o.id)));
    let missing = 0;
    for (const id of byId.keys()) if (!xlsxIds.has(id)) missing++;
    console.log(
      `  ${basename(rep.relative)}: matched=${matched}, orphans=${orphans}, missing=${missing}`,
    );
  }

  if (!cli.apply) {
    console.log('\nWould write: pass --apply to persist. (Dry-run, no se modificó nada.)');
    return;
  }

  // Aplicar
  console.log('\n─── Aplicando cambios ───');
  for (const rep of reports) {
    if (!rep.exists) {
      console.log(`[apply] skip ${rep.relative} (no existe)`);
      continue;
    }
    if (rep.plans.length === 0) {
      console.log(`[apply] skip ${rep.relative} (sin planes)`);
      continue;
    }
    console.log(`[apply] Writing ${rep.relative}...`);
    await applyChanges(rep.path, ExcelJS, byId);
    console.log(`        ok (backup at ${rep.relative}.bak)`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
