/**
 * scripts/trello/sync-backlog-to-trello.ts
 *
 * Sincroniza docs/ops/BACKLOG.md → board Trello (one-way: repo es source of truth).
 *
 * Mapeo:
 *   🟢 Hecho            → ✅ Hecho
 *   🟡 En progreso      → 🟡 En progreso (o 🛑 Bloqueados / 🐞 Bugs según heurística)
 *   🔴 Pendiente        → 🗒 Backlog
 *   🔵 Resuelto externo → 🔵 Resuelto externo
 *   ⚫ Cancelado        → archivada (closed=true)
 *
 * Uso:
 *   pnpm sync:trello              # ejecuta cambios
 *   pnpm sync:trello:dry          # dry-run, solo muestra el diff
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID ?? 'cdQTUUMX';
const DRY_RUN = process.argv.includes('--dry');

if (!TRELLO_KEY || !TRELLO_TOKEN) {
	console.error('TRELLO_KEY y TRELLO_TOKEN deben estar definidos en .env');
	process.exit(1);
}

const API = 'https://api.trello.com/1';
const auth = `key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;

// ─── Tipos ───────────────────────────────────────────────────────

type EstadoIcon = '🟢' | '🟡' | '🔴' | '⚫' | '🔵';
type ListBucket =
	| 'backlog'
	| 'en-progreso'
	| 'bloqueados'
	| 'bugs'
	| 'hecho'
	| 'resuelto-externo';

interface BacklogItem {
	id: string;
	title: string;
	estado: EstadoIcon;
	estadoTexto: string;
	prioridad: 'P1' | 'P2' | 'P3' | null;
	tipo: string;
	reportado: string;
	contexto: string;
	proximaAccion: string;
	avance: string;
	referencias: string;
	cancelado: boolean;
}

interface TrelloList {
	id: string;
	name: string;
	pos: number;
}
interface TrelloLabel {
	id: string;
	name: string;
	color: string;
}
interface TrelloCard {
	id: string;
	name: string;
	desc: string;
	idList: string;
	idLabels: string[];
	closed: boolean;
}

interface TrelloState {
	listsByBucket: Record<ListBucket, string>;
	labelsByName: Record<string, string>;
	cardsByBlId: Record<string, TrelloCard>;
	allCards: TrelloCard[];
	defaultListId: string; // fallback para cards canceladas (van archivadas)
}

// ─── Parser BACKLOG.md ──────────────────────────────────────────

function parseBacklog(md: string): BacklogItem[] {
	const pendientesStart = md.indexOf('## Pendientes activos');
	const resueltoStart = md.indexOf('## Resuelto');
	if (pendientesStart === -1) {
		throw new Error('No encuentro "## Pendientes activos" en BACKLOG.md');
	}
	const section = md.slice(
		pendientesStart,
		resueltoStart === -1 ? undefined : resueltoStart,
	);

	const blocks = section.split(/^### (?=BL-)/m).slice(1);
	const items: BacklogItem[] = [];
	for (const block of blocks) {
		const item = parseBlock(block);
		if (item) items.push(item);
	}
	return items;
}

function extractFields(block: string): Record<string, string> {
	const fields: Record<string, string> = {};
	const fieldRe = /^-\s+\*\*([^:*]+?):?\*\*\s*(.*)$/;
	const lines = block.split(/\r?\n/);
	let currentField: string | null = null;
	let currentValue: string[] = [];
	for (const line of lines) {
		const m = line.match(fieldRe);
		if (m) {
			if (currentField !== null) {
				fields[currentField] = currentValue.join('\n').trim();
			}
			currentField = m[1].trim();
			currentValue = [m[2]];
		} else if (currentField !== null) {
			currentValue.push(line);
		}
	}
	if (currentField !== null) {
		fields[currentField] = currentValue.join('\n').trim();
	}
	return fields;
}

function parseBlock(block: string): BacklogItem | null {
	const firstLine = block.split('\n')[0]?.trim() ?? '';
	const titleMatch = firstLine.match(/^(BL-[\w-]+)\s*—\s*(.+)$/);
	if (!titleMatch) return null;

	const id = titleMatch[1];
	const title = titleMatch[2].trim();

	const fields = extractFields(block);

	const estadoTexto = fields['Estado'] ?? '';
	const estadoMatch = estadoTexto.match(/[🟢🟡🔴⚫🔵]/u);
	const estado: EstadoIcon = (estadoMatch?.[0] as EstadoIcon) ?? '🔴';

	const prioridadRaw = fields['Prioridad'] ?? '';
	const prioMatch = prioridadRaw.match(/P[123]/);
	const prioridad = prioMatch ? (prioMatch[0] as 'P1' | 'P2' | 'P3') : null;

	const tipo = fields['Tipo'] ?? '';
	const reportado = fields['Reportado'] ?? '';
	const contexto = fields['Contexto'] ?? '';
	const proximaAccion = fields['Próxima acción'] ?? '';

	const avanceKeys = Object.keys(fields).filter((k) =>
		/^(Resolución|Hallazgo|Plan de ejecución|Avance(\s+\d{4}-\d{2}-\d{2})?|Auditoría|Bloqueantes|Impacto|Decisión tomada|Estimación|Triggers de reactivación|Infrastructure ya lista|Distribución|Métrica|Clasificación|No activado)/.test(
			k,
		),
	);
	const avance = avanceKeys
		.map((k) => `**${k}:** ${fields[k]}`)
		.join('\n\n');

	const referencias = fields['Referencias'] ?? '';

	const cancelado = estado === '⚫';

	return {
		id,
		title,
		estado,
		estadoTexto,
		prioridad,
		tipo,
		reportado,
		contexto,
		proximaAccion,
		avance,
		referencias,
		cancelado,
	};
}

// ─── Mapeo a buckets / labels ───────────────────────────────────

function determineList(item: BacklogItem): ListBucket {
	if (item.estado === '🔵') return 'resuelto-externo';
	if (item.estado === '🟢') return 'hecho';
	if (item.estado === '🔴') return 'backlog';

	const tipoLow = item.tipo.toLowerCase();
	if (tipoLow.includes('bug-automation') || tipoLow === 'bug') return 'bugs';

	const haystack = `${item.estadoTexto} ${item.proximaAccion} ${item.tipo}`.toLowerCase();
	const blockedKeywords = [
		'esperar reset',
		'discusión con jefe',
		'pendiente acción humana',
		'cupo ci agotado',
		'pausado hasta',
		'diferido',
		'sin cupo',
		'trigger dual',
		'mitigado temporalmente',
		'en discusión',
		'bloqueado por',
		'pendiente trigger',
	];
	if (blockedKeywords.some((k) => haystack.includes(k))) return 'bloqueados';

	if (item.estado === '🟡') return 'en-progreso';
	return 'backlog';
}

function determineTipoLabel(tipo: string): string | null {
	const t = tipo.toLowerCase();
	if (t.includes('bug-automation') || t === 'bug') return '🐞 Bug-automation';
	if (t.includes('investigación')) return '🔍 Investigación';
	if (t.includes('decisión')) return '🧠 Decisión';
	if (t.includes('configuración de ambiente')) return '🌍 Ambiente';
	if (t.includes('validación')) return '✅ Validación';
	if (t.includes('operacional')) return '🛠 Operacional';
	if (t.includes('infraestructura') || t.includes('mejora ci') || t.includes('configuración'))
		return '🔧 Infra';
	return null;
}

function determinePriorityLabel(p: BacklogItem['prioridad']): string | null {
	if (p === 'P1') return '🚨 P1';
	if (p === 'P2') return '⚠️ P2';
	if (p === 'P3') return '📝 P3';
	return null;
}

// ─── Build card data ────────────────────────────────────────────

function buildCardData(
	item: BacklogItem,
	state: TrelloState,
): { name: string; desc: string; idList: string; idLabels: string[]; closed: boolean } {
	const closed = item.cancelado;
	const bucket = closed ? null : determineList(item);
	const idList = bucket ? state.listsByBucket[bucket] : state.defaultListId;

	const labelNames: string[] = [];
	const prioL = determinePriorityLabel(item.prioridad);
	if (prioL) labelNames.push(prioL);
	const tipoL = determineTipoLabel(item.tipo);
	if (tipoL) labelNames.push(tipoL);
	const idLabels = labelNames.map((n) => state.labelsByName[n]).filter(Boolean) as string[];

	const desc = formatDescription(item);
	const name = `${item.id} — ${item.title}`;
	return { name, desc, idList, idLabels, closed };
}

function formatDescription(item: BacklogItem): string {
	const parts: string[] = [];
	parts.push(`**Estado:** ${item.estado} ${item.estadoTexto.replace(/^[🟢🟡🔴⚫🔵]\s*/u, '')}`);
	if (item.contexto) parts.push(`\n## Contexto\n${item.contexto}`);
	if (item.avance) parts.push(`\n## Avance / Resolución\n${item.avance}`);
	if (item.proximaAccion) parts.push(`\n## Próxima acción\n${item.proximaAccion}`);
	if (item.referencias) parts.push(`\n## Referencias\n${item.referencias}`);

	const meta: string[] = [`🔗 ${item.id}`];
	if (item.prioridad) meta.push(item.prioridad);
	if (item.tipo) meta.push(item.tipo);
	if (item.reportado) meta.push(`Reportado ${item.reportado}`);

	parts.push(`\n---\n${meta.join(' · ')}\n📁 Source: docs/ops/BACKLOG.md`);
	return parts.join('\n');
}

// ─── Trello API ─────────────────────────────────────────────────

async function trelloFetch(
	method: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	body?: unknown,
): Promise<unknown> {
	const sep = endpoint.includes('?') ? '&' : '?';
	const url = `${API}${endpoint}${sep}${auth}`;
	const init: RequestInit = { method };
	if (body !== undefined) {
		init.body = JSON.stringify(body);
		init.headers = { 'Content-Type': 'application/json; charset=utf-8' };
	}
	const res = await fetch(url, init);
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`${method} ${endpoint} → HTTP ${res.status}: ${text}`);
	}
	return res.json();
}

async function loadTrelloState(): Promise<TrelloState> {
	const lists = (await trelloFetch(
		'GET',
		`/boards/${TRELLO_BOARD_ID}/lists?fields=name,pos&filter=open`,
	)) as TrelloList[];
	const labels = (await trelloFetch(
		'GET',
		`/boards/${TRELLO_BOARD_ID}/labels?fields=name,color`,
	)) as TrelloLabel[];
	const cards = (await trelloFetch(
		'GET',
		`/boards/${TRELLO_BOARD_ID}/cards?fields=name,desc,idList,idLabels,closed&filter=open`,
	)) as TrelloCard[];

	const listsByBucket: Record<ListBucket, string> = {
		backlog: '',
		'en-progreso': '',
		bloqueados: '',
		bugs: '',
		hecho: '',
		'resuelto-externo': '',
	};
	for (const l of lists) {
		if (l.name === '🗒 Backlog') listsByBucket.backlog = l.id;
		else if (l.name === '🟡 En progreso') listsByBucket['en-progreso'] = l.id;
		else if (l.name === '🛑 Bloqueados') listsByBucket.bloqueados = l.id;
		else if (l.name === '🐞 Bugs') listsByBucket.bugs = l.id;
		else if (l.name === '✅ Hecho') listsByBucket.hecho = l.id;
		else if (l.name === '🔵 Resuelto externo') listsByBucket['resuelto-externo'] = l.id;
	}

	const labelsByName: Record<string, string> = {};
	for (const l of labels) labelsByName[l.name] = l.id;

	const cardsByBlId: Record<string, TrelloCard> = {};
	for (const c of cards) {
		const m = c.name.match(/^(BL-[\w-]+)/);
		if (m) cardsByBlId[m[1]] = c;
	}

	return {
		listsByBucket,
		labelsByName,
		cardsByBlId,
		allCards: cards,
		defaultListId: listsByBucket.backlog || lists[0]?.id || '',
	};
}

// ─── Diff y aplicación ──────────────────────────────────────────

interface DiffEntry {
	action: 'create' | 'update' | 'archive' | 'orphan-archive' | 'noop';
	item?: BacklogItem;
	card?: TrelloCard;
	reason: string;
}

function diff(items: BacklogItem[], state: TrelloState): DiffEntry[] {
	const entries: DiffEntry[] = [];
	const seenIds = new Set<string>();

	for (const item of items) {
		seenIds.add(item.id);
		const existing = state.cardsByBlId[item.id];
		const target = buildCardData(item, state);

		if (target.closed) {
			if (existing && !existing.closed) {
				entries.push({ action: 'archive', item, card: existing, reason: 'estado ⚫ Cancelado' });
			} else if (!existing) {
				entries.push({ action: 'noop', item, reason: 'cancelado, no existe en Trello' });
			} else {
				entries.push({ action: 'noop', item, reason: 'ya archivado' });
			}
			continue;
		}

		if (!existing) {
			entries.push({
				action: 'create',
				item,
				reason: `crear en bucket="${determineList(item)}"`,
			});
			continue;
		}

		const sameList = existing.idList === target.idList;
		const sameDesc = existing.desc.trim() === target.desc.trim();
		const existingLabels = JSON.stringify([...existing.idLabels].sort());
		const targetLabels = JSON.stringify([...target.idLabels].sort());
		const sameLabels = existingLabels === targetLabels;
		const sameName = existing.name === target.name;

		if (sameList && sameDesc && sameLabels && sameName) {
			entries.push({ action: 'noop', item, card: existing, reason: 'sin cambios' });
		} else {
			const changes: string[] = [];
			if (!sameName) changes.push('name');
			if (!sameList) changes.push('list');
			if (!sameLabels) changes.push('labels');
			if (!sameDesc) changes.push('desc');
			entries.push({
				action: 'update',
				item,
				card: existing,
				reason: changes.join('+'),
			});
		}
	}

	for (const [id, card] of Object.entries(state.cardsByBlId)) {
		if (!seenIds.has(id)) {
			entries.push({
				action: 'orphan-archive',
				card,
				reason: `${id} ya no está en BACKLOG.md`,
			});
		}
	}

	return entries;
}

async function applyChanges(
	diffs: DiffEntry[],
	state: TrelloState,
	dryRun: boolean,
): Promise<{ created: number; updated: number; archived: number; noop: number }> {
	let created = 0;
	let updated = 0;
	let archived = 0;
	let noop = 0;

	for (const d of diffs) {
		const tag = dryRun ? '[DRY] ' : '';

		if (d.action === 'noop') {
			noop++;
			continue;
		}

		if (d.action === 'create' && d.item) {
			const data = buildCardData(d.item, state);
			console.log(`${tag}CREATE   ${d.item.id} → "${data.name}" (${d.reason})`);
			if (!dryRun) {
				await trelloFetch('POST', '/cards', {
					idList: data.idList,
					name: data.name,
					desc: data.desc,
					idLabels: data.idLabels,
				});
			}
			created++;
		} else if (d.action === 'update' && d.item && d.card) {
			const data = buildCardData(d.item, state);
			console.log(`${tag}UPDATE   ${d.item.id} (${d.reason})`);
			if (!dryRun) {
				await trelloFetch('PUT', `/cards/${d.card.id}`, {
					name: data.name,
					desc: data.desc,
					idList: data.idList,
					idLabels: data.idLabels,
				});
			}
			updated++;
		} else if (d.action === 'archive' && d.card) {
			console.log(`${tag}ARCHIVE  ${d.card.name} (${d.reason})`);
			if (!dryRun) {
				await trelloFetch('PUT', `/cards/${d.card.id}/closed`, { value: true });
			}
			archived++;
		} else if (d.action === 'orphan-archive' && d.card) {
			console.log(`${tag}ORPHAN   ${d.card.name} (${d.reason})`);
			if (!dryRun) {
				await trelloFetch('PUT', `/cards/${d.card.id}/closed`, { value: true });
			}
			archived++;
		}
	}

	return { created, updated, archived, noop };
}

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log(`Sync BACKLOG.md → Trello board ${TRELLO_BOARD_ID}`);
	console.log(`Modo: ${DRY_RUN ? 'DRY-RUN (no aplica cambios)' : 'LIVE'}`);
	console.log('');

	const md = fs.readFileSync(
		path.resolve(process.cwd(), 'docs/ops/BACKLOG.md'),
		'utf-8',
	);
	const items = parseBacklog(md);
	console.log(`BACKLOG.md   : ${items.length} ítems en "Pendientes activos"`);

	if (process.argv.includes('--debug-parse')) {
		console.log('--- DEBUG estados parseados ---');
		for (const i of items) {
			const cp = i.estado.codePointAt(0)?.toString(16) ?? '??';
			console.log(
				`  ${i.id.padEnd(10)} estado="${i.estado}" (U+${cp}) cancelado=${i.cancelado} tipo="${i.tipo}" estadoTexto="${i.estadoTexto.substring(0, 60)}"`,
			);
		}
		console.log('-------------------------------');
	}

	const state = await loadTrelloState();
	const trelloKnown = Object.keys(state.cardsByBlId).length;
	console.log(
		`Trello board : ${state.allCards.length} cards activas (${trelloKnown} con prefijo BL-)`,
	);

	// Validar que todas las listas necesarias existan
	const missing = (Object.keys(state.listsByBucket) as ListBucket[]).filter(
		(k) => !state.listsByBucket[k],
	);
	if (missing.length > 0) {
		console.error(
			`Listas faltantes en el board: ${missing.join(', ')}. Verificá la estructura.`,
		);
		process.exit(1);
	}

	console.log('');
	const diffs = diff(items, state);
	const summary = await applyChanges(diffs, state, DRY_RUN);

	console.log('');
	console.log('───────────────────────────────────────────');
	console.log(
		`Resumen: created=${summary.created} updated=${summary.updated} archived=${summary.archived} noop=${summary.noop}`,
	);
	if (DRY_RUN) console.log('(dry-run, ningún cambio aplicado en Trello)');
}

main().catch((err: Error) => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
