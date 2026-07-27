#!/usr/bin/env node
/**
 * derive-gateway-matrix — derivación determinista de matrices por pasarela
 * desde el L1 canónico Stripe (docs/gateway-pg/stripe/normalized-test-cases.json).
 *
 * Pipeline (Fase 4, carrier/gateway-standardization):
 *   1. Lee el L1 Stripe (224 casos) + el delta declarativo de la pasarela
 *      (scripts/ai/gateway-deltas/<gateway>.json).
 *   2. Filtra exclusiones:
 *        clase 1 — tags contiene @3ds;
 *        clase 2 — phase2_status ∈ {deprecated-redundant, collapsed-alias};
 *        clase 3 — no-migrables §3.2 (excluded_source_ids del delta);
 *        clase 4 — patrones extra del delta (excluded_title_patterns).
 *   3. Matchea los activos contra la matriz destino existente:
 *        pins §3.1 + extra_pins del delta → ya-cubierto;
 *        título normalizado idéntico → ya-cubierto (title-match);
 *        resto → derivable-nuevo.
 *   4. Asigna IDs nuevos: menor ID libre dentro del grupo de rango de la sección
 *      (id_groups + section_map del delta), en orden del L1. NUNCA renumera
 *      existentes; NUNCA fabrica keys MG.
 *   5. --apply: agrega filas L0 a las matrices destino (sección análoga: append
 *      a tabla existente o creación de sección nueva) + genera el L1
 *      normalized-test-cases.json de la pasarela con total = cases.length.
 *
 * Uso:
 *   node scripts/ai/derive-gateway-matrix.mjs --gateway authorize            # dry-run
 *   node scripts/ai/derive-gateway-matrix.mjs --gateway ebizcharge --apply   # escribe
 *
 * Exit codes: 0 OK · 1 conflicto/validación fallida.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const STRIPE_L1 = 'docs/gateway-pg/stripe/normalized-test-cases.json';
const PHASE2_EXCLUDED = new Set(['deprecated-redundant', 'collapsed-alias']);

// ---------- CLI ----------
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const gwIdx = args.indexOf('--gateway');
const GATEWAY = gwIdx >= 0 ? args[gwIdx + 1] : null;
if (!GATEWAY || !['authorize', 'ebizcharge'].includes(GATEWAY)) {
	console.error('Uso: node scripts/ai/derive-gateway-matrix.mjs --gateway <authorize|ebizcharge> [--apply]');
	process.exit(1);
}

const rp = (p) => resolve(ROOT, p);
const readJson = (p) => JSON.parse(readFileSync(rp(p), 'utf8'));

const delta = readJson(`scripts/ai/gateway-deltas/${GATEWAY}.json`);
const stripeL1 = readJson(STRIPE_L1);

// ---------- helpers ----------
const isRealKey = (k) => !k.startsWith('_');
const cleanMap = (obj = {}) => Object.fromEntries(Object.entries(obj).filter(([k]) => isRealKey(k)));

const pins = { ...cleanMap(delta.pinned_pairs), ...cleanMap(delta.extra_pins) };
const reversePins = Object.fromEntries(Object.entries(pins).map(([s, t]) => [t, s]));

function substituteTitle(title) {
	let out = title;
	for (const [from, to] of delta.title_substitutions) out = out.split(from).join(to);
	return out;
}

function normalizeTitle(t) {
	return t
		.toLowerCase()
		.replace(/\*\*/g, '')
		.replace(/`/g, '')
		.replace(/authorize\.net|authorize|ebizcharge|stripe/g, 'GW')
		.replace(/\s+/g, ' ')
		.trim();
}

function detectIntent(title) {
	const t = title.toLowerCase();
	if (t.includes('cvc incorrecto') || t.includes('cvv mismatch') || t.includes('cvc (antifraude)')) return 'DECLINE_INVALID_CVC';
	if (t.includes('declinada') || t.includes('rechazado genérico') || t.includes('fondos insuficientes')) return 'DECLINE_AUTHORIZE';
	return 'HAPPY_NO_AUTH';
}

function cardCell(intent, cardFlow, stripeCase) {
	// Casos de configuración de pasarela (App Store) no ejercitan tarjeta.
	if ((stripeCase?.module || '').endsWith('/config')) return '—';
	const base = delta.intent_cards[intent];
	return cardFlow === 'existing' ? `${base} (stored)` : base;
}

function outcomeCell(intent) {
	if (intent === 'HAPPY_NO_AUTH') return 'Response Code 1';
	if (intent === 'DECLINE_AUTHORIZE') return 'Response Code 2 → error visible, viaje no creado';
	return '`cvvResultCode = "N"` — rechazo según política MAGIIS';
}

// ---------- parse matrices destino existentes ----------
const ID_ROW = new RegExp(`^\\|\\s*(${delta.id_prefix}\\d{4})\\s*\\|\\s*([^|]*)\\|`);
const matrixText = {};
const existingRows = []; // { id, num, title, file, section }
for (const file of delta.matrix_files) {
	const text = readFileSync(rp(file), 'utf8');
	matrixText[file] = text;
	let section = '';
	for (const line of text.split(/\r?\n/)) {
		const h = line.match(/^#{2,3}\s+(.*)$/);
		if (h) section = h[1].trim();
		const m = line.match(ID_ROW);
		if (m) {
			existingRows.push({
				id: m[1],
				num: Number(m[1].slice(delta.id_prefix.length)),
				title: m[2].trim(),
				file,
				section
			});
		}
	}
}
const existingById = new Map(existingRows.map((r) => [r.id, r]));
const existingByNormTitle = new Map();
for (const r of existingRows) {
	const k = normalizeTitle(r.title);
	if (!existingByNormTitle.has(k)) existingByNormTitle.set(k, r);
}

// ---------- clasificación ----------
const cls = { threeds: [], phase2: [], sec32: [], deltaExcl: [], covered: [], news: [], conflicts: [] };
const coveredDetail = []; // { stripeId, targetId, via }
const orphanPins = []; // pins cuyo stripe id NO es activo (documentados, sin acción)

const excludedIds = cleanMap(delta.excluded_source_ids);
const patterns = delta.excluded_title_patterns || [];

const actives = [];
for (const c of stripeL1.cases) {
	if ((c.tags || []).includes('@3ds')) { cls.threeds.push(c); continue; }
	if (PHASE2_EXCLUDED.has(c.phase2_status)) { cls.phase2.push(c); continue; }
	actives.push(c);
}
for (const c of actives) {
	if (excludedIds[c.test_case_id]) { cls.sec32.push(c); continue; }
	const hit = patterns.find((p) => c.title.toLowerCase().includes(p.pattern.toLowerCase()));
	if (hit) { cls.deltaExcl.push({ ...c, _reason: hit.reason }); continue; }

	const pin = pins[c.test_case_id];
	if (pin) {
		if (!existingById.has(pin)) {
			cls.conflicts.push(`pin ${c.test_case_id} → ${pin}: el ID destino no existe en las matrices ${GATEWAY}`);
			continue;
		}
		cls.covered.push(c);
		coveredDetail.push({ stripeId: c.test_case_id, targetId: pin, via: 'pin' });
		continue;
	}
	const tm = existingByNormTitle.get(normalizeTitle(c.title));
	if (tm && !coveredDetail.some((d) => d.targetId === tm.id)) {
		cls.covered.push(c);
		coveredDetail.push({ stripeId: c.test_case_id, targetId: tm.id, via: 'title-match' });
		continue;
	}
	cls.news.push(c);
}
for (const [stripeId, targetId] of Object.entries(pins)) {
	if (!actives.some((c) => c.test_case_id === stripeId)) orphanPins.push(`${stripeId} → ${targetId}`);
}

// ---------- asignación de IDs nuevos ----------
const usedNums = new Set(existingRows.map((r) => r.num));
const groups = delta.id_groups;
function allocate(groupName) {
	const [lo, hi] = groups[groupName].range;
	for (let n = lo; n <= hi; n++) {
		if (!usedNums.has(n)) { usedNums.add(n); return n; }
	}
	throw new Error(`Rango agotado para grupo ${groupName} [${lo}..${hi}]`);
}

const derived = []; // filas nuevas con id asignado
for (const c of cls.news) {
	const map = delta.section_map[c.section];
	if (!map) {
		cls.conflicts.push(`caso nuevo ${c.test_case_id} sin section_map para sección "${c.section}"`);
		continue;
	}
	const num = allocate(map.group);
	const id = `${delta.id_prefix}${num}`;
	const title = substituteTitle(c.title);
	const intent = detectIntent(c.title);
	derived.push({ id, num, title, intent, stripe: c, map });
}

if (cls.conflicts.length) {
	console.error('CONFLICTOS — abortando sin escribir:');
	for (const x of cls.conflicts) console.error('  - ' + x);
	process.exit(1);
}

// ---------- reporte ----------
const viaPin = coveredDetail.filter((d) => d.via === 'pin').length;
const viaTitle = coveredDetail.filter((d) => d.via === 'title-match').length;
console.log(`== derive-gateway-matrix — gateway=${GATEWAY} (${APPLY ? 'APPLY' : 'DRY-RUN'}) ==`);
console.log(`L1 Stripe total:                 ${stripeL1.cases.length}`);
console.log(`excluidos @3ds:                  ${cls.threeds.length}`);
console.log(`excluidos phase2:                ${cls.phase2.length}`);
console.log(`activos:                         ${actives.length}`);
console.log(`excluidos §3.2 (explícitos):     ${cls.sec32.length}`);
console.log(`excluidos delta-config:          ${cls.deltaExcl.length}`);
console.log(`candidatos derivables:           ${actives.length - cls.sec32.length - cls.deltaExcl.length}`);
console.log(`ya cubiertos:                    ${cls.covered.length} (pins: ${viaPin}, title-match: ${viaTitle})`);
console.log(`nuevos derivados:                ${derived.length}`);
console.log(`pins huérfanos (stripe inactivo/excluido — documentados, sin acción): ${orphanPins.length}`);
for (const o of orphanPins) console.log(`    · ${o}`);
console.log('asignaciones nuevas:');
for (const d of derived) console.log(`    ${d.stripe.test_case_id} → ${d.id}  [${d.map.group}] ${d.stripe.section}`);
const l1Total = existingRows.length + derived.length;
console.log(`total L1 ${GATEWAY} resultante:  ${existingRows.length} existentes + ${derived.length} derivados = ${l1Total}`);

if (!APPLY) {
	console.log('\nDRY-RUN: no se escribió nada. Ejecutar con --apply para materializar L0+L1.');
	process.exit(0);
}

// ---------- APPLY: edición de matrices (L0) ----------
const EOL_OF = (t) => (t.includes('\r\n') ? '\r\n' : '\n');
const byFile = new Map(); // file → { appends: Map(heading→rows[]), creates: Map(section→{rows, note}) }
for (const d of derived) {
	const f = d.map.file;
	if (!byFile.has(f)) byFile.set(f, { appends: new Map(), creates: new Map() });
	const bucket = byFile.get(f);
	if (d.map.mode === 'append') {
		if (!bucket.appends.has(d.map.heading)) bucket.appends.set(d.map.heading, []);
		bucket.appends.get(d.map.heading).push(d);
	} else {
		const secTitle = substituteTitle(d.stripe.section);
		if (!bucket.creates.has(secTitle)) bucket.creates.set(secTitle, { note: d.map.note || null, rows: [] });
		bucket.creates.get(secTitle).rows.push(d);
	}
}

function appendRowCells(d) {
	const cells = [d.id, d.title];
	for (const col of d.map.columns || []) {
		if (col === 'card') cells.push(cardCell(d.intent, d.stripe.card_flow, d.stripe));
		else if (col === 'hold') cells.push(d.title.toLowerCase().includes('sin hold') ? 'OFF' : 'ON');
		else if (col === 'outcome') cells.push(outcomeCell(d.intent));
		else if (col === 'stripe_ref') cells.push(`\`${d.stripe.test_case_id}\``);
	}
	return `| ${cells.join(' | ')} |`;
}

for (const [file, bucket] of byFile) {
	const eol = EOL_OF(matrixText[file]);
	let lines = matrixText[file].split(/\r?\n/);

	// appends: insertar tras la última fila de la primera tabla bajo el heading
	for (const [heading, rows] of bucket.appends) {
		const hIdx = lines.findIndex((l) => l.trim() === heading);
		if (hIdx < 0) throw new Error(`Heading no encontrado en ${file}: ${heading}`);
		let end = lines.length;
		for (let i = hIdx + 1; i < lines.length; i++) {
			if (/^#{2,3}\s/.test(lines[i])) { end = i; break; }
		}
		let lastRow = -1;
		for (let i = hIdx + 1; i < end; i++) if (lines[i].startsWith('|')) lastRow = i;
		if (lastRow < 0) throw new Error(`Sin tabla bajo el heading en ${file}: ${heading}`);
		lines.splice(lastRow + 1, 0, ...rows.map(appendRowCells));
	}

	// creates: bloques nuevos antes del anchor
	if (bucket.creates.size) {
		const anchorCfg = delta.create_anchor[file];
		if (!anchorCfg) throw new Error(`Sin create_anchor para ${file}`);
		const anchorIdx = lines.findIndex((l) => l.trim() === anchorCfg.before_heading);
		if (anchorIdx < 0) throw new Error(`Anchor no encontrado en ${file}: ${anchorCfg.before_heading}`);
		let n = anchorCfg.numbering_start;
		const blocks = [];
		for (const [secTitle, { note, rows }] of bucket.creates) {
			const headingText = n == null ? `## ${secTitle}` : `## ${n}. ${secTitle}`;
			if (n != null) n++;
			const block = [
				headingText,
				'',
				'> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.',
				...(note ? [`> ${note}`] : []),
				'',
				'| ID | Descripción | Card | Ref Stripe |',
				'| --- | --- | --- | --- |',
				...rows.map((d) => `| ${d.id} | ${d.title} | ${cardCell(d.intent, d.stripe.card_flow, d.stripe)} | \`${d.stripe.test_case_id}\` |`),
				'',
				'---',
				''
			];
			blocks.push(...block);
		}
		lines.splice(anchorIdx, 0, ...blocks);
		if (anchorCfg.renumber_anchor_to != null) {
			const oldH = anchorCfg.before_heading;
			const newH = oldH.replace(/^## \d+\./, `## ${anchorCfg.renumber_anchor_to}.`);
			lines = lines.map((l) => (l.trim() === oldH ? newH : l));
		}
	}

	writeFileSync(rp(file), lines.join(eol), 'utf8');
	console.log(`L0 actualizado: ${file}`);
}

// ---------- APPLY: L1 JSON de la pasarela ----------
const derivedCases = derived.map((d) => ({
	test_case_id: d.id,
	title: d.title.replace(/\*\*/g, ''),
	module: (d.stripe.module || '').replace('gateway-pg-stripe', delta.module_slug) || delta.module_slug,
	portal: d.stripe.portal ?? null,
	environment: ['TEST'],
	priority: d.stripe.priority ?? null,
	source_type: 'md',
	source_file: basename(d.map.file),
	tags: [delta.tag, '@gateway-pg'],
	critical_flow: d.stripe.critical_flow ?? false,
	section: substituteTitle(d.stripe.section),
	subsection: d.stripe.subsection || '',
	card_flow: d.stripe.card_flow ?? 'n/a',
	origin: 'derived',
	stripe_ref: d.stripe.test_case_id,
	intent: d.intent,
	card: cardCell(d.intent, d.stripe.card_flow, d.stripe).replace(/`/g, '')
}));

const existingCases = existingRows.map((r) => ({
	test_case_id: r.id,
	title: r.title.replace(/\*\*/g, ''),
	module: delta.module_slug,
	portal: null,
	environment: ['TEST'],
	priority: null,
	source_type: 'md',
	source_file: basename(r.file),
	tags: [delta.tag, '@gateway-pg'],
	critical_flow: false,
	section: r.section,
	subsection: '',
	card_flow: null,
	origin: 'existing',
	stripe_ref: reversePins[r.id] ?? null
}));

const allCases = [...existingCases, ...derivedCases].sort((a, b) =>
	a.test_case_id.localeCompare(b.test_case_id, 'en', { numeric: true })
);
const with3ds = allCases.filter((c) => (c.tags || []).includes('@3ds'));
if (with3ds.length) {
	console.error(`ASSERT FAIL: ${with3ds.length} casos con @3ds en el L1 derivado de ${GATEWAY}`);
	process.exit(1);
}
const l1 = {
	generated_at: new Date().toISOString(),
	generator: 'scripts/ai/derive-gateway-matrix.mjs',
	gateway: GATEWAY,
	source_l1: STRIPE_L1,
	source_matrices: delta.matrix_files,
	total: allCases.length,
	notes: [
		'Derivación determinista Fase 4 (2026-07-26): activos Stripe sin @3ds, sin phase2 deprecated/collapsed, sin no-migrables §3.2 ni exclusiones delta.',
		'origin=existing: fila preexistente de la matriz (title desde L0; campos no inferibles en null).',
		'origin=derived: espejo del caso Stripe referenciado en stripe_ref.',
		'total verificado programáticamente = cases.length. Cero casos @3ds (assert).'
	],
	cases: allCases
};
writeFileSync(rp(delta.l1_output), JSON.stringify(l1, null, 2) + '\n', 'utf8');
console.log(`L1 escrito: ${delta.l1_output} (total=${l1.total}, @3ds=0 ✓)`);
