export type GeminiApiKeySource = 'GEMINI_API_KEY' | 'AI_STUDIO_GEMINI_MAGIIS' | 'GOOGLE_API_KEY';

export type GeminiRuntimeConfig = {
	apiKey: string;
	apiKeySource: GeminiApiKeySource;
	models: {
		flash: string;
		pro: string;
	};
};

const GEMINI_API_KEY_SOURCES: GeminiApiKeySource[] = [
	'GEMINI_API_KEY',
	'AI_STUDIO_GEMINI_MAGIIS',
	'GOOGLE_API_KEY'
];

function readApiKeyFromEnv(source: GeminiApiKeySource): string | undefined {
	const value = process.env[source];
	return value?.trim() ? value.trim() : undefined;
}

export function resolveGeminiApiKey(): GeminiRuntimeConfig {
	for (const source of GEMINI_API_KEY_SOURCES) {
		const apiKey = readApiKeyFromEnv(source);

		if (apiKey) {
			return { 
				apiKey, 
				apiKeySource: source,
				models: {
					flash: process.env.GEMINI_MODEL_FLASH || 'gemini-2.5-flash-preview-04-17',
					pro: process.env.GEMINI_MODEL_PRO || 'gemini-2.5-pro-preview-03-25'
				}
			};
		}
	}

	throw new Error('Missing Gemini API key. Define GEMINI_API_KEY or AI_STUDIO_GEMINI_MAGIIS in the active .env file.');
}

export function mirrorGeminiApiKeyToStandardEnv(): GeminiRuntimeConfig {
	const resolved = resolveGeminiApiKey();

	if (!process.env.GEMINI_API_KEY) {
		process.env.GEMINI_API_KEY = resolved.apiKey;
	}

	return resolved;
}
