import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GatewayPgJourneyContext } from '../contracts/gateway-pg.types';

// Todos los handoffs entre fase web y fase mobile se persisten acá.
const CONTEXT_DIR = path.join(process.cwd(), 'evidence', 'journey-context');

export async function ensureJourneyContextDir(): Promise<string> {
	// Creamos la carpeta bajo demanda para que las specs no dependan
	// de una preparación manual previa.
	await mkdir(CONTEXT_DIR, { recursive: true });
	return CONTEXT_DIR;
}

export function getJourneyContextPath(journeyId: string): string {
	// Un archivo por journey facilita inspección manual y debugging post-mortem.
	return path.join(CONTEXT_DIR, `${journeyId}.json`);
}

export async function writeJourneyContext(context: GatewayPgJourneyContext): Promise<string> {
	// Serializamos el contexto completo con indentación para que QA pueda leerlo fácilmente.
	await ensureJourneyContextDir();
	const filePath = getJourneyContextPath(context.journeyId);
	await writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
	return filePath;
}

export async function readJourneyContext(journeyId: string): Promise<GatewayPgJourneyContext> {
	// La lectura es simple a propósito: el contrato tipado vive en el dominio,
	// no en una capa extra de mapeo.
	const filePath = getJourneyContextPath(journeyId);
	const raw = await readFile(filePath, 'utf-8');
	return JSON.parse(raw) as GatewayPgJourneyContext;
}

export async function findLatestJourneyContextId(): Promise<string | null> {
	await ensureJourneyContextDir();

	const entries = await readdir(CONTEXT_DIR, { withFileTypes: true });
	const contextFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json'));

	if (!contextFiles.length) {
		return null;
	}

	const filesWithMtime = await Promise.all(
		contextFiles.map(async entry => {
			const filePath = path.join(CONTEXT_DIR, entry.name);
			const info = await stat(filePath);
			return {
				journeyId: entry.name.replace(/\.json$/, ''),
				mtimeMs: info.mtimeMs,
			};
		})
	);

	filesWithMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return filesWithMtime[0]?.journeyId ?? null;
}
