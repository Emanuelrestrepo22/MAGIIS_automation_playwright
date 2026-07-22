/**
 * Xray Reporter (fase B — cableado Test ↔ automatización)
 *
 * Emite un archivo en formato **Xray JSON** con el resultado de cada spec que
 * declare su key de Test de Xray. El import posterior (fase C, en CI) matchea por
 * `testKey` de forma determinística — sin duplicar Tests Generic en cada corrida:
 *
 *   bun xray import xray --file evidence/<env>/xray-results.json
 *
 * Binding spec ↔ Test (en este orden de prioridad):
 *   1. annotation `tms`:       test.info().annotations.push({ type: 'tms', description: 'MX-6133' })
 *      (convención existente del org — misma que usan Allure links y carrier-v2)
 *   2. annotation `test_key`:  alias aceptado
 *   3. título:                 test('[MX-6133] ...', ...)   → se parsea la primera key AAA-123
 *
 * Specs SIN key NO se exportan (no están mapeados a un Test de Xray); se reporta
 * el conteo al final para que el gap sea visible y no un drop silencioso.
 *
 * Config (playwright.config.ts):
 *   ['./tests/utils/reporters/xray-reporter.ts', { outputFile: `evidence/${env}/xray-results.json` }]
 *
 * Env opcionales (los setea el step de CI):
 *   XRAY_EXECUTION_KEY  → se escribe como testExecutionKey (importa contra un ATR existente)
 *   XRAY_TEST_PLAN_KEY  → info.testPlanKey (crea/asocia la ejecución al ATP)
 *   XRAY_SUMMARY        → info.summary (si se crea una ejecución nueva)
 *   XRAY_VERSION        → info.version = fixVersion (si se crea una ejecución nueva)
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

function extractTestKey(test: TestCase): string | undefined {
	for (const type of KEY_ANNOTATION_TYPES) {
		const ann = test.annotations.find(a => a.type === type);
		if (ann?.description) return ann.description.trim();
	}
	const m = KEY_IN_TITLE.exec(test.title);
	return m?.[1];
}

class XrayReporter implements Reporter {
	private readonly outputFile: string;
	private readonly results = new Map<string, XrayTestResult>();
	private unmapped = 0;

	constructor(options: ReporterOptions = {}) {
		this.outputFile = options.outputFile ?? process.env.XRAY_RESULTS_FILE ?? 'evidence/xray-results.json';
	}

	onTestEnd(test: TestCase, result: TestResult): void {
		// Ignorar corridas intermedias de retry: solo el resultado final cuenta.
		if (result.status !== 'passed' && result.retry < test.retries) return;

		const testKey = extractTestKey(test);
		if (!testKey) {
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

		const prev = this.results.get(testKey);
		if (!prev || SEVERITY[status] > SEVERITY[prev.status]) {
			this.results.set(testKey, { testKey, status, start, finish, comment });
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
