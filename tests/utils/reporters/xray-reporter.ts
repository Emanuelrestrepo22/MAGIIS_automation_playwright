/**
 * Xray Reporter (fase B — cableado Test ↔ automatización)
 *
 * Emite un archivo en formato **Xray JSON** con el resultado de cada spec que
 * declare su key de Test de Xray. El import posterior (fase C, en CI) matchea por
 * `testKey` de forma determinística — sin duplicar Tests Generic en cada corrida:
 *
 *   bun xray import xray --file evidence/<env>/xray-results.json
 *
 * Binding spec ↔ Test (EMIT-ALL — un test puede acreditar VARIOS Test de Xray):
 *   1. annotation `tms`:       test.info().annotations.push({ type: 'tms', description: 'MG-158' })
 *      (convención del org — misma que usan Allure links y carrier-v2; la empuja @atc)
 *   2. annotation `test_key`:  alias aceptado
 *   3. título:                 test('[MG-158] ...', ...)   → fallback, primera key AAA-123
 *   Se recogen TODAS las keys tms/test_key distinctas (estáticas del TestCase +
 *   runtime del TestResult) → una fila de resultado por cada Test cubierto.
 *
 * Specs SIN key NO se exportan (no están mapeados a un Test de Xray); se reporta
 * el conteo al final para que el gap sea visible y no un drop silencioso.
 * XRAY_KEY_DENYLIST (CSV) excluye keys que no son Test (Executions/Plans/Stories).
 *
 * Config (playwright.config.ts):
 *   ['./tests/utils/reporters/xray-reporter.ts', { outputFile: `evidence/${env}/xray-results.json` }]
 *
 * Env opcionales (los setea el step de CI):
 *   XRAY_EXECUTION_KEY  → se escribe como testExecutionKey (importa contra un ATR existente)
 *   XRAY_TEST_PLAN_KEY  → info.testPlanKey (crea/asocia la ejecución al ATP)
 *   XRAY_SUMMARY        → info.summary (si se crea una ejecución nueva)
 *   XRAY_VERSION        → info.version = fixVersion (si se crea una ejecución nueva)
 *   XRAY_OUTPUT_FILE    → override del path de salida (gana sobre el outputFile de la
 *                         config — habilita un JSON por pasarela: xray-results.<gw>.json)
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// Estados Xray Cloud válidos para import.
type XrayStatus = 'PASSED' | 'FAILED' | 'ABORTED' | 'TODO';

// Evidencia embebida en el import de Xray Cloud (`evidence[]` por test): screenshot base64.
interface XrayEvidence {
	data: string;
	filename: string;
	contentType: string;
}

interface XrayTestResult {
	testKey: string;
	status: XrayStatus;
	start?: string;
	finish?: string;
	comment?: string;
	evidence?: XrayEvidence[];
}

interface ReporterOptions {
	outputFile?: string;
}

// Tipos de annotation que portan la key del Test de Xray (orden = prioridad).
// 'tms' es la convención existente del org (Allure links + carrier-v2).
const KEY_ANNOTATION_TYPES = ['tms', 'test_key'];
const KEY_IN_TITLE = /\b([A-Z][A-Z0-9]+-\d+)\b/;
// Secuencias ANSI de color (ESC[..m). ESC via fromCharCode para evitar escapes de control.
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function clean(text: string): string {
	return text.replace(ANSI, '').trim();
}

function mapStatus(status: TestResult['status']): XrayStatus {
	switch (status) {
		case 'passed':
			return 'PASSED';
		case 'failed':
		case 'timedOut':
			return 'FAILED';
		case 'interrupted':
			return 'ABORTED';
		case 'skipped':
			return 'TODO';
		default:
			return 'FAILED';
	}
}

// Prioridad PASSED < TODO < ABORTED < FAILED: al deduplicar por testKey nos
// quedamos con el peor estado observado (un fallo en cualquier corrida manda).
const SEVERITY: Record<XrayStatus, number> = { PASSED: 0, TODO: 1, ABORTED: 2, FAILED: 3 };

// Denylist de keys que NO son Test de Xray (Test Executions, Test Plans, Epics,
// Stories) — se excluyen para no emitir un run contra un issue que no es Test.
// Configurable por CI vía XRAY_KEY_DENYLIST (CSV). Default vacío (reporter genérico).
const KEY_DENYLIST = new Set(
	(process.env.XRAY_KEY_DENYLIST ?? '')
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)
);

// Emit-all: UNA automatización (un test) puede cubrir VARIOS Test de Xray — un spec
// KATA orquesta varios @atc de componente, y cada @atc empuja su key. Devolvemos
// TODAS las keys tms/test_key distinctas, uniendo las annotations ESTÁTICAS del
// TestCase (declaradas en describe/test) con las de RUNTIME del TestResult (donde el
// decorador @atc las agrega). Así la corrida acredita evidencia a cada Test cubierto.
// Fallback al título solo si no hay ninguna annotation. Denylist filtra no-Tests.
function extractTestKeys(test: TestCase, result: TestResult): string[] {
	const keys = new Set<string>();
	const all = [...test.annotations, ...(result.annotations ?? [])];
	for (const type of KEY_ANNOTATION_TYPES) {
		for (const ann of all) {
			if (ann.type === type && ann.description) keys.add(ann.description.trim());
		}
	}
	if (keys.size === 0) {
		const m = KEY_IN_TITLE.exec(test.title);
		if (m) keys.add(m[1]);
	}
	for (const k of [...keys]) if (KEY_DENYLIST.has(k)) keys.delete(k);
	return [...keys];
}

class XrayReporter implements Reporter {
	private readonly outputFile: string;
	private readonly results = new Map<string, XrayTestResult>();
	private unmapped = 0;

	constructor(options: ReporterOptions = {}) {
		// XRAY_OUTPUT_FILE gana sobre el outputFile fijado en playwright.config.ts:
		// los scripts :xray por pasarela lo usan para emitir un JSON aislado por run
		// (evidence/test/xray-results.<gw>.json) sin pisar el output default del env.
		this.outputFile =
			process.env.XRAY_OUTPUT_FILE ??
			options.outputFile ??
			process.env.XRAY_RESULTS_FILE ??
			'evidence/xray-results.json';
	}

	onTestEnd(test: TestCase, result: TestResult): void {
		// Ignorar corridas intermedias de retry: solo el resultado final cuenta.
		if (result.status !== 'passed' && result.retry < test.retries) return;

		const testKeys = extractTestKeys(test, result);
		if (testKeys.length === 0) {
			this.unmapped++;
			return;
		}

		const status = mapStatus(result.status);
		const start = result.startTime.toISOString();
		const finish = new Date(result.startTime.getTime() + result.duration).toISOString();
		const comment =
			result.status === 'passed'
				? undefined
				: clean(result.error?.message ?? `status=${result.status}`).slice(0, 2000);

		// Evidencia: screenshots (image/png) que Playwright adjunta al test. Con `--screenshot=on`
		// los PASSED capturan un screenshot final → se embebe base64 en el import y queda anclado
		// al run en Xray como evidencia del test-case. Cap defensivo para no inflar el JSON.
		const evidence: XrayEvidence[] = [];
		for (const att of result.attachments) {
			if (att.contentType !== 'image/png' || !att.path) continue;
			try {
				evidence.push({
					data: readFileSync(att.path).toString('base64'),
					filename: basename(att.path),
					contentType: att.contentType
				});
			} catch {
				/* artefacto ausente (ENOENT en OneDrive) → seguir sin él */
			}
			if (evidence.length >= 3) break;
		}

		// Una fila por cada Test cubierto (dedup por testKey, gana el peor estado).
		for (const testKey of testKeys) {
			const prev = this.results.get(testKey);
			if (!prev || SEVERITY[status] > SEVERITY[prev.status]) {
				this.results.set(testKey, {
					testKey,
					status,
					start,
					finish,
					comment,
					...(evidence.length > 0 ? { evidence } : {})
				});
			}
		}
	}

	onEnd(_result: FullResult): void {
		const tests = [...this.results.values()];

		const payload: Record<string, unknown> = { tests };
		if (process.env.XRAY_EXECUTION_KEY) {
			payload.testExecutionKey = process.env.XRAY_EXECUTION_KEY;
		} else {
			// Sin ejecución existente: describir una para que el import cree el ATR.
			const info: Record<string, unknown> = {};
			if (process.env.XRAY_SUMMARY) info.summary = process.env.XRAY_SUMMARY;
			if (process.env.XRAY_VERSION) info.version = process.env.XRAY_VERSION;
			if (process.env.XRAY_TEST_PLAN_KEY) info.testPlanKey = process.env.XRAY_TEST_PLAN_KEY;
			if (Object.keys(info).length > 0) payload.info = info;
		}

		mkdirSync(dirname(this.outputFile), { recursive: true });
		writeFileSync(this.outputFile, JSON.stringify(payload, null, 2), 'utf-8');

		const target = process.env.XRAY_EXECUTION_KEY
			? `execution ${process.env.XRAY_EXECUTION_KEY}`
			: 'nueva ejecución (info)';
		console.log(
			'\n\x1b[36m%s\x1b[0m',
			`🧾 Xray: ${tests.length} test(s) mapeados → ${this.outputFile} (${target})`
		);
		if (this.unmapped > 0) {
			console.log(
				'\x1b[33m%s\x1b[0m',
				`⚠️  Xray: ${this.unmapped} spec(s) sin key → NO exportados. Añade annotation type:'tms' (o [KEY] en el título).`
			);
		}
	}
}

export default XrayReporter;
