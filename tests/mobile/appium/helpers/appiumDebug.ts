import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Browser } from 'webdriverio';

function normalize(value: unknown): string {
	return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function safeLabel(label: string): string {
	return label.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function contextToLabel(context: unknown): string {
	if (typeof context === 'string') {
		return context;
	}

	if (context && typeof context === 'object') {
		const candidate = context as {
			name?: unknown;
			id?: unknown;
			context?: unknown;
			type?: unknown;
		};
		const value = candidate.name ?? candidate.id ?? candidate.context ?? candidate.type;
		return typeof value === 'string' ? value : String(value ?? '');
	}

	return String(context ?? '');
}

async function captureWebViewState(driver: Browser, context: string): Promise<string> {
	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	const source = await driver.getPageSource().catch(() => '');
	return [
		`[WEBVIEW] ${context}`,
		`URL: ${url || '<unavailable>'}`,
		'--- PAGE SOURCE ---',
		source || '<empty>',
	].join('\n');
}

/**
 * Captura estado actual del driver Android para depuración de flows Appium.
 * Guarda contexto nativo y, si existe, también la página web activa.
 */
export async function dumpAppiumState(driver: Browser, label: string): Promise<string> {
	const outDir = path.join(process.cwd(), 'evidence', 'dom-dump');
	await mkdir(outDir, { recursive: true });

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const filePath = path.join(outDir, `${safeLabel(label)}-${timestamp}.txt`);
	const originalContext = await driver.getContext().catch(() => '');
	const rawContexts = await driver.getContexts().catch(() => [] as unknown[]);
	const contexts = rawContexts.map(contextToLabel).filter(Boolean);
	const nativeSource = await driver.getPageSource().catch(() => '');

	const lines: string[] = [
		`Label: ${label}`,
		`Timestamp: ${new Date().toISOString()}`,
		`Original context: ${originalContext || '<unavailable>'}`,
		`Contexts: ${contexts.join(', ') || '<none>'}`,
		'=== NATIVE PAGE SOURCE ===',
		nativeSource || '<empty>',
	];

	const webviews = contexts.filter(context => context.startsWith('WEBVIEW'));
	for (const webview of webviews) {
		try {
			await driver.switchContext(webview);
			lines.push('=== WEBVIEW STATE ===');
			lines.push(await captureWebViewState(driver, webview));
		} catch (error) {
			lines.push('=== WEBVIEW STATE ===');
			lines.push(`[WEBVIEW] ${webview}`);
			lines.push(`Error capturing webview: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	if (originalContext) {
		try {
			await driver.switchContext(originalContext);
		} catch {
			// Ignorar: el dump ya quedó guardado y no queremos tapar el error original.
		}
	}

	await writeFile(filePath, lines.join('\n'), 'utf-8');
	return filePath;
}

export function formatSnapshotLines(entries: Array<[string, unknown]>): string[] {
	return entries.map(([key, value]) => `${key}: ${normalize(value)}`);
}
