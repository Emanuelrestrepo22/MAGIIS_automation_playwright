import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Browser } from 'webdriverio';

export type WebViewNetworkCaptureRecord = {
	id: number;
	kind: 'fetch' | 'xhr';
	method: string;
	url: string;
	startedAt: string;
	endedAt?: string;
	durationMs?: number;
	status?: number;
	ok?: boolean;
	requestHeaders?: Record<string, string>;
	requestBody?: string;
	responseHeaders?: Record<string, string>;
	responseBody?: string;
	error?: string;
};

export type WebViewNetworkCaptureDump = {
	label: string;
	timestamp: string;
	webview: string | null;
	url: string;
	entries: WebViewNetworkCaptureRecord[];
};

const NETWORK_CAPTURE_KEY = '__magiisNetworkCapture__';

function safeLabel(label: string): string {
	return label
		.replace(/[^a-zA-Z0-9._-]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
}

function truncate(value: string, limit = 20_000): string {
	if (value.length <= limit) {
		return value;
	}

	return `${value.slice(0, limit)}... [truncated ${value.length - limit} chars]`;
}

function formatHeaders(headers: Record<string, string> | undefined): string {
	if (!headers || !Object.keys(headers).length) {
		return '<none>';
	}

	return JSON.stringify(headers, null, 2);
}

function formatBody(body: string | undefined): string {
	if (!body) {
		return '<empty>';
	}

	return body;
}

async function switchToWebView(driver: Browser, timeoutMs = 10_000): Promise<string | null> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const contexts = (await driver.getContexts().catch(() => [])) as string[];
		const webview = contexts.find(context => context.startsWith('WEBVIEW'));
		if (webview) {
			await driver.switchContext(webview);
			return webview;
		}

		await driver.pause(250);
	}

	return null;
}

export async function installWebViewNetworkCapture(driver: Browser): Promise<void> {
	const webview = await switchToWebView(driver);
	if (!webview) {
		throw new Error('No WEBVIEW context available to install the network capture helper');
	}

	await driver.execute((storageKey: string) => {
		const win = window as any;
		const existing = win[storageKey] as
			| {
					installed?: boolean;
					clear?: () => void;
					snapshot?: () => unknown[];
			  }
			| undefined;

		if (existing?.installed) {
			return true;
		}

		const entries: Record<string, unknown>[] = [];
		let seq = 0;

		const truncateValue = (value: string, limit = 20_000): string => {
			if (value.length <= limit) {
				return value;
			}

			return `${value.slice(0, limit)}... [truncated ${value.length - limit} chars]`;
		};

		const parseHeaders = (headerBlock: string): Record<string, string> => {
			const output: Record<string, string> = {};
			headerBlock
				.split(/\r?\n/)
				.map(line => line.trim())
				.filter(Boolean)
				.forEach(line => {
					const separator = line.indexOf(':');
					if (separator > 0) {
						const key = line.slice(0, separator).trim();
						const value = line.slice(separator + 1).trim();
						output[key] = value;
					}
				});
			return output;
		};

		const toRecord = (headers: unknown): Record<string, string> => {
			const output: Record<string, string> = {};
			if (!headers) {
				return output;
			}

			if (typeof Headers !== 'undefined' && headers instanceof Headers) {
				headers.forEach((value, key) => {
					output[key] = value;
				});
				return output;
			}

			if (Array.isArray(headers)) {
				for (const item of headers) {
					if (Array.isArray(item) && item.length >= 2) {
						output[String(item[0])] = String(item[1]);
					}
				}
				return output;
			}

			if (typeof headers === 'object') {
				for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
					output[key] = String(value ?? '');
				}
			}

			return output;
		};

		const bodyToString = async (body: unknown): Promise<string> => {
			if (body === null || typeof body === 'undefined') {
				return '';
			}

			if (typeof body === 'string') {
				return body;
			}

			if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
				return body.toString();
			}

			if (typeof FormData !== 'undefined' && body instanceof FormData) {
				const entries = Array.from(body.entries()).map(([key, value]) => {
					if (typeof value === 'string') {
						return `${key}=${value}`;
					}

					const file = value as File;
					const fileName = typeof file?.name === 'string' ? file.name : 'blob';
					return `${key}=[File ${fileName}]`;
				});

				return entries.join('&');
			}

			if (typeof Blob !== 'undefined' && body instanceof Blob) {
				return `[Blob size=${body.size} type=${body.type}]`;
			}

			if (body instanceof ArrayBuffer) {
				return `[ArrayBuffer byteLength=${body.byteLength}]`;
			}

			if (ArrayBuffer.isView(body)) {
				return `[TypedArray byteLength=${body.byteLength}]`;
			}

			if (typeof Request !== 'undefined' && body instanceof Request) {
				try {
					return await body.clone().text();
				} catch {
					return `[Request ${body.method} ${body.url}]`;
				}
			}

			if (typeof body === 'object') {
				try {
					return JSON.stringify(body);
				} catch {
					return String(body);
				}
			}

			return String(body);
		};

		const pushEntry = (entry: Record<string, unknown>): void => {
			entries.push(entry);
		};

		const originalFetch = typeof win.fetch === 'function' ? win.fetch.bind(win) : null;
		if (originalFetch) {
			win.fetch = (async (...args: any[]) => {
				const startedAt = new Date().toISOString();
				const started = performance.now();
				const id = ++seq;
				let url = '';
				let method = 'GET';
				let requestHeaders: Record<string, string> = {};
				let requestBody = '';

				try {
					const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];

					if (typeof input === 'string' || input instanceof URL) {
						url = String(input);
					} else if (typeof Request !== 'undefined' && input instanceof Request) {
						url = input.url;
						method = input.method || method;
						requestHeaders = toRecord(input.headers);
						requestBody = await bodyToString(input.clone());
					}

					if (init?.method) {
						method = init.method;
					}

					if (init?.headers) {
						requestHeaders = { ...requestHeaders, ...toRecord(init.headers) };
					}

					if (typeof init?.body !== 'undefined') {
						requestBody = await bodyToString(init.body);
					}

					const response = await originalFetch.apply(undefined, args as any);
					const responseText = await response
						.clone()
						.text()
						.catch(() => '');

					pushEntry({
						id,
						kind: 'fetch',
						method,
						url,
						startedAt,
						endedAt: new Date().toISOString(),
						durationMs: Math.round(performance.now() - started),
						status: response.status,
						ok: response.ok,
						requestHeaders,
						requestBody: truncateValue(requestBody),
						responseHeaders: toRecord(response.headers),
						responseBody: truncateValue(responseText)
					});

					return response;
				} catch (error) {
					pushEntry({
						id,
						kind: 'fetch',
						method,
						url,
						startedAt,
						endedAt: new Date().toISOString(),
						durationMs: Math.round(performance.now() - started),
						requestHeaders,
						requestBody: truncateValue(requestBody),
						error: error instanceof Error ? error.message : String(error)
					});
					throw error;
				}
			}) as typeof win.fetch;
		}

		const xhrProto = XMLHttpRequest.prototype as typeof XMLHttpRequest.prototype & {
			__magiisNetworkCaptureInstalled?: boolean;
		};

		if (!xhrProto.__magiisNetworkCaptureInstalled) {
			const originalOpen = xhrProto.open;
			const originalSend = xhrProto.send;
			const originalSetRequestHeader = xhrProto.setRequestHeader;

			xhrProto.open = function (method: string, url: string, ...rest: unknown[]) {
				const context = {
					id: ++seq,
					kind: 'xhr' as const,
					method: method || 'GET',
					url: String(url ?? ''),
					startedAt: new Date().toISOString(),
					requestHeaders: {} as Record<string, string>,
					requestBody: '',
					finalized: false
				};

				(this as typeof this & { __magiisNetworkCapture?: typeof context }).__magiisNetworkCapture = context;
				return originalOpen.apply(this, [method, url, ...rest] as any);
			};

			xhrProto.setRequestHeader = function (name: string, value: string) {
				const context = (this as typeof this & { __magiisNetworkCapture?: { requestHeaders: Record<string, string> } }).__magiisNetworkCapture;
				if (context) {
					context.requestHeaders[name] = value;
				}

				return originalSetRequestHeader.call(this, name, value);
			};

			xhrProto.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
				const xhr = this as typeof this & {
					__magiisNetworkCapture?: {
						id: number;
						kind: 'xhr';
						method: string;
						url: string;
						startedAt: string;
						requestHeaders: Record<string, string>;
						requestBody: string;
						finalized: boolean;
					};
				};
				const context = xhr.__magiisNetworkCapture;
				if (context) {
					context.requestBody = typeof body === 'string' ? body : body ? truncateValue(String(body)) : '';
				}

				const started = performance.now();
				const finalize = (): void => {
					if (!context || context.finalized) {
						return;
					}

					context.finalized = true;
					pushEntry({
						id: context.id,
						kind: 'xhr',
						method: context.method,
						url: context.url,
						startedAt: context.startedAt,
						endedAt: new Date().toISOString(),
						durationMs: Math.round(performance.now() - started),
						status: xhr.status,
						ok: xhr.status >= 200 && xhr.status < 300,
						requestHeaders: context.requestHeaders,
						requestBody: truncateValue(context.requestBody),
						responseHeaders: parseHeaders(xhr.getAllResponseHeaders?.() ?? ''),
						responseBody: truncateValue(String(xhr.responseText ?? ''))
					});
				};

				this.addEventListener('loadend', finalize);
				this.addEventListener('error', finalize);
				this.addEventListener('abort', finalize);
				return originalSend.call(this, body);
			};

			xhrProto.__magiisNetworkCaptureInstalled = true;
		}

		win[storageKey] = {
			installed: true,
			clear: () => {
				entries.length = 0;
			},
			snapshot: () => entries.map(entry => JSON.parse(JSON.stringify(entry)))
		};

		return true;
	}, NETWORK_CAPTURE_KEY);
}

export async function clearWebViewNetworkCapture(driver: Browser): Promise<void> {
	const webview = await switchToWebView(driver);
	if (!webview) {
		return;
	}

	await driver.execute((storageKey: string) => {
		const win = window as any;
		const capture = win[storageKey] as { clear?: () => void } | undefined;
		capture?.clear?.();
	}, NETWORK_CAPTURE_KEY);
}

export async function readWebViewNetworkCapture(driver: Browser): Promise<WebViewNetworkCaptureDump> {
	const originalContext = await driver.getContext().catch(() => null);
	const webview = await switchToWebView(driver);
	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	const entries = (await driver.execute((storageKey: string) => {
		const win = window as any;
		const capture = win[storageKey] as { snapshot?: () => unknown[] } | undefined;
		return capture?.snapshot?.() ?? [];
	}, NETWORK_CAPTURE_KEY)) as WebViewNetworkCaptureRecord[];

	if (originalContext) {
		try {
			await driver.switchContext(originalContext);
		} catch {
			// Ignore. The capture is already collected.
		}
	}

	return {
		label: 'network-capture',
		timestamp: new Date().toISOString(),
		webview,
		url,
		entries
	};
}

export async function dumpWebViewNetworkCapture(driver: Browser, label: string): Promise<string> {
	const outDir = path.join(process.cwd(), 'evidence', 'network-capture');
	await mkdir(outDir, { recursive: true });

	const capture = await readWebViewNetworkCapture(driver);
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const safe = safeLabel(label);
	const jsonPath = path.join(outDir, `${safe}-${timestamp}.json`);
	const textPath = path.join(outDir, `${safe}-${timestamp}.txt`);

	const summary = [
		`Label: ${label}`,
		`Timestamp: ${capture.timestamp}`,
		`WebView: ${capture.webview ?? '<unavailable>'}`,
		`URL: ${capture.url || '<unavailable>'}`,
		`Entries: ${capture.entries.length}`,
		'',
		...capture.entries.flatMap((entry, index) => {
			const lines = [`#${index + 1} [${entry.kind}] ${entry.method} ${entry.url}`, `  status: ${typeof entry.status === 'number' ? entry.status : '<n/a>'}`, `  ok: ${typeof entry.ok === 'boolean' ? String(entry.ok) : '<n/a>'}`, `  startedAt: ${entry.startedAt}`, `  endedAt: ${entry.endedAt ?? '<n/a>'}`, `  durationMs: ${typeof entry.durationMs === 'number' ? entry.durationMs : '<n/a>'}`, `  requestHeaders: ${formatHeaders(entry.requestHeaders)}`, `  requestBody: ${formatBody(entry.requestBody)}`, `  responseHeaders: ${formatHeaders(entry.responseHeaders)}`, `  responseBody: ${formatBody(entry.responseBody)}`];

			if (entry.error) {
				lines.push(`  error: ${entry.error}`);
			}

			return [...lines, ''];
		})
	].join('\n');

	await writeFile(jsonPath, JSON.stringify({ ...capture, label }, null, 2), 'utf-8');
	await writeFile(textPath, summary, 'utf-8');

	return jsonPath;
}
