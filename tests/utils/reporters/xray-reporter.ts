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
 *   3. título:                 test('[MG-158] ...', ...)   → fallback, primera key del
 *      PREFIJO del proyecto Jira (`XRAY_PROJECT_PREFIX`, default 'MG').
 *   Se recogen TODAS las keys tms/test_key distinctas (estáticas del TestCase +
 *   runtime del TestResult) → una fila de resultado por cada Test cubierto.
 *
 * POR QUÉ el fallback por título está restringido al prefijo del proyecto (evidencia
 * live 2026-07-28): el regex genérico anterior (`\b([A-Z][A-Z0-9]+-\d+)\b`) matcheaba
 * CUALQUIER identificador con forma de key. Del título del smoke Authorize
 * `[TS-AUTHORIZE-SMOKE-01] ...` extraía la key BASURA `SMOKE-01` y la emitía como
 * testKey al execution MG-558 — pese a que el spec declara explícitamente NO tener key
 * Xray ("unmapped visible"). Lo mismo haría cualquier `[BL-0xx]`, `[TS-<GW>-TCxxxx]` o
 * `[COB-48]` presente en el título de un `test()`. Con el prefijo del proyecto, un
 * título sin key `MG-\d+` cae a `unmapped` (el gap queda visible en el summary) en vez
 * de contaminar el ATR con un run contra un issue inexistente.
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
 *   XRAY_PROJECT_PREFIX → prefijo del proyecto Jira aceptado por el fallback de título
 *                         (default 'MG'); cambiarlo al onboardear otro proyecto.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// Estados Xray Cloud válidos para import.
type XrayStatus = 'PASSED' | 'FAILED' | 'ABORTED' | 'TODO';

interface XrayTestResult {
	testKey: string;
	status: XrayStatus;
	start?: string;
	finish?: string;
	comment?: string;
}

interface ReporterOptions {
	outputFile?: string;
}

// Tipos de annotation que portan la key del Test de Xray (orden = prioridad).
// 'tms' es la convención existente del org (Allure links + carrier-v2).
const KEY_ANNOTATION_TYPES = ['tms', 'test_key'];
// Prefijos de PROYECTO Jira cuyas keys son Tests de Xray importables (CSV, allowlist).
// Default `MG,MX`: los dos proyectos reales que este repo acredita. Todo lo demás es un
// identificador que NO existe en Jira (backlog interno `BL-*`, IDs de matriz `TS-*`,
// numeraciones de área `COB-*`) y NO debe salir al import.
// `XRAY_PROJECT_PREFIX` (singular) se acepta por compatibilidad.
const KEY_PREFIXES = (process.env.XRAY_PROJECT_PREFIXES ?? process.env.XRAY_PROJECT_PREFIX ?? 'MG,MX')
	.split(',')
	.map(s => s.trim())
	.filter(Boolean);
const PREFIX_ALTERNATION = KEY_PREFIXES.join('|');
// SOLO keys de proyecto: un título sin `<PREFIX>-\d+` queda unmapped en vez de emitir
// una key basura (ver "POR QUÉ" en el docblock del módulo — caso live `SMOKE-01`).
const KEY_IN_TITLE = new RegExp('\\b((?:' + PREFIX_ALTERNATION + ')-\\d+)\\b');
// Misma allowlist para las keys de ANNOTATION (estáticas y runtime del decorador @atc):
// el `@atc('BL-036')` de AuthorizeSandboxApi es trazabilidad de backlog interno, NO un Test
// de Xray — sin este filtro el import metía `BL-036` como testKey en el ATR (caso live
// 2026-07-28, misma clase de bug que `SMOKE-01` pero por la vía del decorador).
const IS_PROJECT_KEY = new RegExp('^(?:' + PREFIX_ALTERNATION + ')-\\d+$');
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
// Fallback al título solo si no hay ninguna annotation. TODA key (annotation o título) pasa
// por la allowlist de prefijos de proyecto (IS_PROJECT_KEY) — nunca se exportan IDs que no
// existen en Jira (TS-*, BL-*, COB-*). Denylist filtra además keys de proyecto que no son Test
// (Executions/Plans/Stories) o que pertenecen al ATR de otra pasarela.
// Devuelve también las descartadas por no ser de proyecto, para reportar el drop (nunca silencioso).
function extractTestKeys(test: TestCase, result: TestResult): { keys: string[]; nonProject: string[] } {
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
	const nonProject: string[] = [];
	for (const k of [...keys]) {
		if (!IS_PROJECT_KEY.test(k)) {
			nonProject.push(k);
			keys.delete(k);
			continue;
		}
		if (KEY_DENYLIST.has(k)) keys.delete(k);
	}
	return { keys: [...keys], nonProject };
}

class XrayReporter implements Reporter {
	private readonly outputFile: string;
	private readonly results = new Map<string, XrayTestResult>();
	private unmapped = 0;
	/** Keys descartadas por no pertenecer a un proyecto Jira de la allowlist (p.ej. `BL-036`). */
	private readonly nonProjectKeys = new Set<string>();

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

		const { keys: testKeys, nonProject } = extractTestKeys(test, result);
		for (const k of nonProject) this.nonProjectKeys.add(k);
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

		// Una fila por cada Test cubierto (dedup por testKey, gana el peor estado).
		for (const testKey of testKeys) {
			const prev = this.results.get(testKey);
			if (!prev || SEVERITY[status] > SEVERITY[prev.status]) {
				this.results.set(testKey, { testKey, status, start, finish, comment });
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
				`⚠️  Xray: ${this.unmapped} spec(s) sin key → NO exportados. Añade annotation type:'tms' (o [${KEY_PREFIXES[0]}-NNN] en el título).`
			);
		}
		// El drop de keys que no son de proyecto NUNCA es silencioso: son ids de trazabilidad
		// interna (backlog `BL-*`, matriz `TS-*`) que no existen como issue en Jira.
		if (this.nonProjectKeys.size > 0) {
			console.log(
				'\x1b[33m%s\x1b[0m',
				`ℹ️  Xray: key(s) fuera de los proyectos [${KEY_PREFIXES.join(',')}] descartadas del import: ${[...this.nonProjectKeys].join(', ')} (trazabilidad interna, no son Test de Xray).`
			);
		}

		// Guarda F5 (post-review): un run POR PASARELA (GATEWAYS con UNA sola) sin
		// XRAY_EXECUTION_KEY emite un JSON sin testExecutionKey — el import posterior con
		// `--file` y sin `--execution` crearía una ejecución NUEVA en vez de alimentar el
		// ATR por pasarela (MG-558..561). Aviso, NO fail: crear ejecuciones nuevas es un
		// uso legítimo en otros contextos.
		const pinnedGateways = (process.env.GATEWAYS ?? '')
			.split(',')
			.map(s => s.trim())
			.filter(Boolean);
		if (process.env.XRAY && pinnedGateways.length === 1 && !process.env.XRAY_EXECUTION_KEY) {
			console.warn(
				'\x1b[33m\x1b[1m%s\x1b[0m',
				`⚠️⚠️  Xray: run por pasarela (GATEWAYS=${pinnedGateways[0]}) SIN XRAY_EXECUTION_KEY — importar ${this.outputFile} con --file y sin --execution creará una ejecución NUEVA en vez de alimentar el ATR de la pasarela. Exportá la key de su execution (env XRAY_EXECUTION_<GW> del RUNBOOK-executions-por-gateway.md §1.1, p. ej. XRAY_EXECUTION_KEY=$XRAY_EXECUTION_AUTHORIZE) o pasá --execution en el import.`
			);
		}
	}
}

export default XrayReporter;
