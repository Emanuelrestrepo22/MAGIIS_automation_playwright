import { mirrorGeminiApiKeyToStandardEnv, type GeminiRuntimeConfig } from '../../config/aiRuntime';

export type GeminiResponseMimeType = 'text/plain' | 'application/json';

export interface GeminiGenerateContentOptions {
	model: string;
	prompt: string;
	systemInstruction?: string;
	temperature?: number;
	maxOutputTokens?: number;
	responseMimeType?: GeminiResponseMimeType;
}

export interface GeminiGenerateContentResult {
	text: string;
	raw: unknown;
	status: number;
	statusText: string;
	apiKeySource: GeminiRuntimeConfig['apiKeySource'];
}

type FetchLike = typeof fetch;

function collectTextFromParts(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	if (!value || typeof value !== 'object') {
		return '';
	}

	const parts = (value as { parts?: unknown }).parts;
	if (!Array.isArray(parts)) {
		return '';
	}

	return parts
		.map(part => {
			if (!part || typeof part !== 'object') {
				return '';
			}

			const text = (part as { text?: unknown }).text;
			return typeof text === 'string' ? text : '';
		})
		.filter(Boolean)
		.join('\n')
		.trim();
}

function extractGeminiText(raw: unknown): string {
	if (typeof raw === 'string') {
		return raw.trim();
	}

	if (!raw || typeof raw !== 'object') {
		return '';
	}

	const candidateList = (raw as { candidates?: unknown }).candidates;
	if (Array.isArray(candidateList)) {
		for (const candidate of candidateList) {
			const text = collectTextFromParts((candidate as { content?: unknown }).content);
			if (text) {
				return text;
			}
		}
	}

	const responseText = (raw as { text?: unknown }).text;
	if (typeof responseText === 'string' && responseText.trim()) {
		return responseText.trim();
	}

	return '';
}

export class GeminiClient {
	private readonly apiKey: string;
	private readonly apiKeySource: GeminiRuntimeConfig['apiKeySource'];
	private readonly baseUrl: string;
	private readonly fetchImpl: FetchLike;

	constructor(options?: { apiKey?: string; baseUrl?: string; fetchImpl?: FetchLike }) {
		const resolved = options?.apiKey ? { apiKey: options.apiKey, apiKeySource: 'GEMINI_API_KEY' as const } : mirrorGeminiApiKeyToStandardEnv();

		this.apiKey = resolved.apiKey;
		this.apiKeySource = resolved.apiKeySource;
		this.baseUrl = options?.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
		this.fetchImpl = options?.fetchImpl ?? fetch;
	}

	async generateContent(options: GeminiGenerateContentOptions): Promise<GeminiGenerateContentResult> {
		if (!options.model.trim()) {
			throw new Error('Gemini model is required.');
		}

		if (!options.prompt.trim()) {
			throw new Error('Gemini prompt is required.');
		}

		const generationConfig: Record<string, unknown> = {};

		if (typeof options.temperature === 'number') {
			generationConfig.temperature = options.temperature;
		}

		if (typeof options.maxOutputTokens === 'number') {
			generationConfig.maxOutputTokens = options.maxOutputTokens;
		}

		if (options.responseMimeType) {
			generationConfig.responseMimeType = options.responseMimeType;
		}

		const payload: Record<string, unknown> = {
			contents: [
				{
					role: 'user',
					parts: [{ text: options.prompt }]
				}
			]
		};

		if (options.systemInstruction?.trim()) {
			payload.system_instruction = {
				parts: [{ text: options.systemInstruction.trim() }]
			};
		}

		if (Object.keys(generationConfig).length > 0) {
			payload.generationConfig = generationConfig;
		}

		const endpoint = `${this.baseUrl}/models/${encodeURIComponent(options.model)}:generateContent`;

		const headers = new Headers();
		headers.set('Content-Type', 'application/json');
		headers.set('x-goog-api-key', this.apiKey);

		const response = await this.fetchImpl(endpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload)
		});

		const rawText = await response.text();
		let raw: unknown = {};

		if (rawText) {
			try {
				raw = JSON.parse(rawText) as unknown;
			} catch {
				raw = rawText;
			}
		}

		if (!response.ok) {
			throw new Error(`Gemini request failed (${response.status} ${response.statusText}) from ${this.apiKeySource}: ${rawText || '<empty body>'}`);
		}

		return {
			text: extractGeminiText(raw),
			raw,
			status: response.status,
			statusText: response.statusText,
			apiKeySource: this.apiKeySource
		};
	}
}
