import { test, expect } from '@playwright/test';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { extractTestKeys, resolveOutcome } from '../../../../utils/reporters/xray-reporter';

type Ann = { type: string; description?: string };
const tc = (title: string, anns: Ann[]) => ({ title, annotations: anns }) as unknown as TestCase;
const res = (anns: Ann[] = []) => ({ annotations: anns }) as unknown as TestResult;

test.describe('xray-reporter: tms_only / xray_partial', () => {
	test('tms_only gana sobre keys heredadas del describe y runtime', () => {
		const keys = extractTestKeys(
			tc('[TS-X] t', [
				{ type: 'tms', description: 'MG-203' },
				{ type: 'tms_only', description: 'TM-375' }
			]),
			res([{ type: 'tms', description: 'MG-999' }])
		);
		expect(keys).toEqual(['TM-375']);
	});

	test('sin tms_only se acreditan todas las keys tms (comportamiento existente)', () => {
		const keys = extractTestKeys(
			tc('t', [{ type: 'tms', description: 'MG-1' }]),
			res([{ type: 'tms', description: 'MG-2' }])
		);
		expect(keys.sort()).toEqual(['MG-1', 'MG-2']);
	});

	test('xray_partial convierte PASSED/FAILED/skip en TODO con comentario del tramo web', () => {
		const t = tc('t', [{ type: 'xray_partial', description: 'cobro desde App Driver fuera de alcance' }]);
		expect(resolveOutcome(t, res(), 'PASSED', undefined)).toEqual({
			status: 'TODO',
			comment: 'tramo web PASSED; cobro desde App Driver fuera de alcance'
		});
		expect(resolveOutcome(t, res(), 'FAILED', 'boom').comment).toBe(
			'tramo web FAILED; cobro desde App Driver fuera de alcance — boom'
		);
		expect(resolveOutcome(t, res(), 'TODO', undefined).comment).toMatch(/^tramo web SKIPPED;/);
	});

	test('sin xray_partial el resultado no cambia', () => {
		expect(resolveOutcome(tc('t', []), res(), 'PASSED', undefined)).toEqual({
			status: 'PASSED',
			comment: undefined
		});
	});
});
