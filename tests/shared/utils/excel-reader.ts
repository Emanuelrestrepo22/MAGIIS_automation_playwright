/**
 * MAGIIS — Utility: Excel Reader
 * Lee un .xlsx de test cases y devuelve TestCase[] tipado.
 * Respeta la estructura de columnas estándar del proyecto.
 *
 * Uso:
 *   const cases = await readTestCases('./suites/GATEWAY_3DS.xlsx', 'GATEWAY_3DS');
 *   // → TestCase[]
 *
 * Ver estructura esperada de columnas en:
 *   .claude/skills/magiis-playwright-docs-to-drafts/references/excel-schema.md
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface TestCase {
  id: string;              // "TC01"
  feature: string;         // "GATEWAY"
  title: string;           // "TC01 — Descripción completa"
  userStory: string;       // "Como… quiero… para…"
  useCase: string;         // nombre del UC
  type: 'Positivo' | 'Negativo' | 'Borde' | string;
  preconditions: string[];
  steps: string[];
  testData: Record<string, string>;
  expectedResult: string;  // siempre empieza con "Debería…"
  observations: string;    // traceability: Jira/Network/DB
}

// Mapa de columnas del xlsx → campos del objeto
const COL_MAP: Record<string, keyof TestCase> = {
  'Feature':              'feature',
  'Título de prueba':     'title',
  'User story':           'userStory',
  'Caso de uso':          'useCase',
  'Tipo de caso':         'type',
  'Precondiciones':       'preconditions',
  'Pasos a seguir':       'steps',
  'Datos de prueba':      'testData',
  'Resultado esperado':   'expectedResult',
  'Observaciones':        'observations',
};

// ─── Parsers internos ────────────────────────────────────────────────────────

function parseList(raw: unknown): string[] {
  if (!raw) return [];
  const str = String(raw).trim();
  return str
    .split(/\n|;/)
    .map(s => s.replace(/^\s*[\d\-*\.]+\s*/, '').trim())
    .filter(Boolean);
}

function parseTestData(raw: unknown): Record<string, string> {
  if (!raw) return {};
  const str = String(raw).trim();
  const result: Record<string, string> = {};
  str.split(/\n/).forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      result[key.trim()] = rest.join(':').trim();
    }
  });
  return result;
}

function extractId(title: string): string {
  const match = title.match(/TC\d+/i);
  return match ? match[0].toUpperCase() : 'TC??';
}

// ─── Función principal ───────────────────────────────────────────────────────

export async function readTestCases(
  filePath: string,
  sheetName?: string
): Promise<TestCase[]> {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Excel no encontrado: ${resolvedPath}`);
  }

  const workbook = XLSX.readFile(resolvedPath, { cellDates: true });

  const targetSheet = sheetName
    ? workbook.SheetNames.find(n => n.toLowerCase() === sheetName.toLowerCase())
    : workbook.SheetNames[0];

  if (!targetSheet) {
    const available = workbook.SheetNames.join(', ');
    throw new Error(
      `Hoja "${sheetName}" no encontrada. Hojas disponibles: ${available}`
    );
  }

  const sheet = workbook.Sheets[targetSheet];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  });

  if (rows.length === 0) {
    console.warn(`⚠  La hoja "${targetSheet}" está vacía o no tiene headers.`);
    return [];
  }

  const testCases: TestCase[] = rows
    .filter(row => {
      const title = String(row['Título de prueba'] ?? '').trim();
      return title.length > 0 && /TC\d+/i.test(title);
    })
    .map(row => {
      const title = String(row['Título de prueba'] ?? '').trim();
      return {
        id:             extractId(title),
        feature:        String(row['Feature'] ?? '').trim(),
        title,
        userStory:      String(row['User story'] ?? '').trim(),
        useCase:        String(row['Caso de uso'] ?? '').trim(),
        type:           String(row['Tipo de caso'] ?? 'Positivo').trim() as TestCase['type'],
        preconditions:  parseList(row['Precondiciones']),
        steps:          parseList(row['Pasos a seguir']),
        testData:       parseTestData(row['Datos de prueba']),
        expectedResult: String(row['Resultado esperado'] ?? '').trim(),
        observations:   String(row['Observaciones'] ?? '').trim(),
      };
    });

  console.log(
    `✓ Leídos ${testCases.length} test cases desde "${targetSheet}" en ${path.basename(filePath)}`
  );

  return testCases;
}

// ─── Utilidades para generación de specs ─────────────────────────────────────

/**
 * Convierte un TestCase en el bloque TypeScript de un test Playwright.
 * Usado por el pipeline magiis-playwright-docs-to-drafts para generar spec drafts.
 */
export function testCaseToPlaywrightBlock(tc: TestCase): string {
  const stepsComments = tc.steps
    .map((step, i) => `    // ${i + 1}. ${step}`)
    .join('\n');

  const preconditionsComments = tc.preconditions
    .map(p => `  //   - ${p}`)
    .join('\n');

  const testDataComment = Object.entries(tc.testData).length > 0
    ? '  // Datos de prueba:\n' +
      Object.entries(tc.testData)
        .map(([k, v]) => `  //   ${k}: ${v}`)
        .join('\n')
    : '';

  return `
  // ${tc.userStory}
  // UC: ${tc.useCase}
  // Tipo: ${tc.type}
${preconditionsComments ? `  // Precondiciones:\n${preconditionsComments}` : ''}
${testDataComment}
  test('${tc.title}', async ({ page }) => {
${stepsComments}

    // ${tc.expectedResult}
    // TODO: implementar assertions
    test.fixme(true, 'Test pendiente de implementación — ${tc.id}');
  });
`;
}

/**
 * Agrupa TestCase[] por feature para generar un spec por módulo.
 */
export function groupByFeature(cases: TestCase[]): Map<string, TestCase[]> {
  const map = new Map<string, TestCase[]>();
  for (const tc of cases) {
    const group = map.get(tc.feature) ?? [];
    group.push(tc);
    map.set(tc.feature, group);
  }
  return map;
}

/**
 * Lista todas las hojas disponibles en un .xlsx.
 */
export function listSheets(filePath: string): string[] {
  const wb = XLSX.readFile(path.resolve(filePath));
  return wb.SheetNames;
}
