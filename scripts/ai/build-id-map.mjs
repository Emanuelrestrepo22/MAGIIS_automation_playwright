#!/usr/bin/env node
/**
 * build-id-map — ID-MAP central TS-ID ↔ MG-key ↔ spec (Fase 4).
 *
 * Fuentes (en orden de confianza):
 *   1. Registry local verificado `tests/features/gateway-pg/data/xray-keys.ts`
 *      (CFG por pasarela + wallet addCard) → mg_key `confirmed`.
 *   2. Tokens explícitos `[TS-<GW>-TCxxxx]` en títulos de tests dentro de
 *      `tests/features/gateway-pg/**` → spec_paths (join explícito).
 *   3. Annotations `{ type: 'tms', description: 'MG-###' }` a nivel describe:
 *      si el archivo referencia UN solo TS-ID → mg_key `confirmed`;
 *      si referencia varios → mg_key compartida, `needs-review` (join heurístico).
 *   4. Factories parametrizadas (`_parametrized/factories/*`): el consumer por
 *      pasarela cubre los 8 casos CFG canónicos → spec_paths; para eBiz el
 *      TS-ID se resuelve vía stripe_ref del L1 derivado (`needs-review`).
 *   4b. Factory HOLD (`factories/hold.factory`): join ESTRUCTURAL — import +
 *      lista `cases:` de cada llamada + `registry.holdTcIds`, filtrado por los
 *      intents que expone la pasarela. Sus consumers son THIN (sin títulos
 *      literales), así que para ellos el join por texto de §2 se DESCARTA: el
 *      docblock deja de ser load-bearing.
 *   5. Pares §3.1 / derivación Fase 4: stripe_ref viene del L1 de cada pasarela.
 *
 * Reglas duras: JAMÁS fabricar keys MG (sin fuente → mg_key null). Keys de la
 * denylist (planes/executions/épicas) nunca se asignan como Test key.
 *
 * Cobertura ≠ ejecución: `spec_coverage` distingue `executable` de `fixme-only`
 * (el spec declara el caso como `test.fixme`, trazable pero sin ejecutar). Sólo
 * los joins estructurales de §4 pueden marcarlo; §2 no ve `test.fixme` interno.
 *
 * Salidas:
 *   - docs/gateway-pg/id-map.json                     (SoT)
 *   - docs/gateway-pg/{stripe,authorize,ebizcharge}/ID-MAP.md (renders GENERATED)
 *
 * Uso: node scripts/ai/build-id-map.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const rp = (p) => resolve(ROOT, p);
const readJson = (p) => JSON.parse(readFileSync(rp(p), 'utf8'));
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');

const GATEWAYS = [
	{ gateway: 'stripe', l1: 'docs/gateway-pg/stripe/normalized-test-cases.json', prefix: 'TS-STRIPE-' },
	{ gateway: 'authorize', l1: 'docs/gateway-pg/authorize/normalized-test-cases.json', prefix: 'TS-AUTHORIZE-' },
	{ gateway: 'ebizcharge', l1: 'docs/gateway-pg/ebizcharge/normalized-test-cases.json', prefix: 'TS-EBIZ-' }
];

// ---------- 0. filas base desde los L1 ----------
/** @type {Map<string, any>} ts_id → row */
const rows = new Map();
const l1ByGateway = {};
for (const { gateway, l1, prefix } of GATEWAYS) {
	const data = readJson(l1);
	l1ByGateway[gateway] = data;
	for (const c of data.cases) {
		rows.set(c.test_case_id, {
			ts_id: c.test_case_id,
			gateway,
			stripe_ref: gateway === 'stripe' ? null : (c.stripe_ref ?? null),
			tcid: c.test_case_id.slice(prefix.length),
			mg_key: null,
			spec_paths: [],
			fixme_spec_paths: [],
			spec_coverage: 'none',
			status: 'unmapped',
			_sources: [],
			// Sólo los joins ESTRUCTURALES de §4 pueden marcar un (fila, spec) como placeholder
			// `test.fixme` o como ejecutable; el scan por texto de §2 no sabe distinguirlos.
			_fixmePaths: new Set(),
			_execPaths: new Set()
		});
	}
}

function setKey(tsId, mgKey, source, heuristic = false) {
	const r = rows.get(tsId);
	if (!r) return;
	if (r.mg_key && r.mg_key !== mgKey) {
		r._sources.push(`CONFLICTO key ${r.mg_key} vs ${mgKey} (${source})`);
		r.status = 'needs-review';
		return;
	}
	r.mg_key = mgKey;
	r._sources.push(source + (heuristic ? ' (heurístico)' : ''));
	if (heuristic) r.status = 'needs-review';
}
/** Avisos no fatales del build (join roto, caso desconocido, TS-ID inexistente…). */
const warnings = [];
const warn = (msg) => warnings.push(msg);

/**
 * @param fixme `true` = el spec declara el caso como placeholder `test.fixme` (cobertura NO
 *   ejecutada) · `false` = el spec lo ejecuta · `null` = desconocido (scan por texto de §2).
 */
function addSpec(tsId, specPath, heuristic = false, fixme = null) {
	const r = rows.get(tsId);
	if (!r) return;
	if (!r.spec_paths.includes(specPath)) r.spec_paths.push(specPath);
	if (fixme === true) r._fixmePaths.add(specPath);
	if (fixme === false) r._execPaths.add(specPath);
	if (heuristic && r.status !== 'confirmed') r.status = 'needs-review';
}
/** Quita un spec de TODAS las filas — para que un join estructural reemplace al de texto. */
function dropSpec(specPath) {
	for (const r of rows.values()) {
		const i = r.spec_paths.indexOf(specPath);
		if (i >= 0) r.spec_paths.splice(i, 1);
		r._fixmePaths.delete(specPath);
		r._execPaths.delete(specPath);
	}
}

// ---------- 1. registry xray-keys.ts ----------
const registryText = readFileSync(rp('tests/features/gateway-pg/data/xray-keys.ts'), 'utf8');
const denyMatch = registryText.match(/XRAY_KEY_DENYLIST_RECOMMENDED\s*=\s*\n?\s*'([^']+)'/);
const DENYLIST = new Set(denyMatch ? denyMatch[1].split(',') : []);

function parseGatewayBlock(name) {
	const start = registryText.indexOf(`\t${name}: {`);
	if (start < 0) return null;
	const nextIdx = registryText.indexOf('\n\t}', start);
	const block = registryText.slice(start, nextIdx);
	const grab = (section, valRe) => {
		const m = block.match(new RegExp(`${section}:\\s*{([\\s\\S]*?)}`));
		if (!m) return {};
		const out = {};
		for (const p of m[1].matchAll(new RegExp(`(\\w+):\\s*'(${valRe})'`, 'g'))) out[p[1]] = p[2];
		return out;
	};
	return {
		cfg: grab('cfg', 'MG-\\d+'),
		cfgTcIds: grab('cfgTcIds', 'TS-[A-Z0-9-]+'),
		// Las keys MG del área HOLD (`hold:`) NO se leen: hoy son 14× `null` en las 4 pasarelas
		// (plantilla `noHoldKeys()`) y el área mapea por `@atc`, no 1:1 por caso. Cuando QA cree
		// los Tests espejo, cablearlas EXPLÍCITAMENTE acá — jamás derivarlas de otra área.
		holdTcIds: grab('holdTcIds', 'TS-[A-Z0-9-]+'),
		wallet: grab('wallet', 'MG-\\d+')
	};
}
const registry = {
	stripe: parseGatewayBlock('stripe'),
	authorize: parseGatewayBlock('authorize'),
	ebizcharge: parseGatewayBlock('ebizcharge')
};
for (const gw of Object.keys(registry)) {
	const r = registry[gw];
	if (!r) continue;
	for (const [caseKey, tsId] of Object.entries(r.cfgTcIds)) {
		const key = r.cfg[caseKey];
		if (key && !DENYLIST.has(key)) setKey(tsId, key, `xray-keys.ts cfg.${caseKey}`);
	}
}

// ---------- 2/3. scan de specs ----------
function* walk(dir) {
	for (const e of readdirSync(dir)) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) yield* walk(p);
		else if (p.endsWith('.ts')) yield p;
	}
}
const TS_TOKEN = /TS-(?:STRIPE-P2|STRIPE|AUTHORIZE|EBIZ)-TC\d{3,4}/g;
const TMS_ANNOT = /type:\s*'tms',\s*description:\s*'(MG-\d+)'/g;

const specRoot = rp('tests/features/gateway-pg');
for (const abs of walk(specRoot)) {
	const p = rel(abs);
	if (!p.endsWith('.spec.ts')) continue; // solo specs (excluye data/, helpers, registry)
	const text = readFileSync(abs, 'utf8');
	const tsIds = [...new Set([...text.matchAll(TS_TOKEN)].map((m) => m[0]))];
	const tmsKeys = [...new Set([...text.matchAll(TMS_ANNOT)].map((m) => m[1]))].filter((k) => !DENYLIST.has(k));
	for (const id of tsIds) addSpec(id, p);
	if (tmsKeys.length === 1 && tsIds.length >= 1) {
		const heuristic = tsIds.length > 1;
		for (const id of tsIds) setKey(id, tmsKeys[0], `tms describe-level en ${p}`, heuristic);
	}
	// varios tms keys en un archivo → asociación por-test ambigua: solo spec_paths.
}

// ---------- 4. factories parametrizadas ----------
const CFG_ORDER = ['viewUnlinked', 'linkValid', 'linkInvalid', 'cancelUnlink', 'unlink', 'exclusivity', 'reloadPersistence', 'linkStatus'];
const factoryConsumers = [];
for (const abs of walk(specRoot)) {
	const text = readFileSync(abs, 'utf8');
	if (/factories\/gateway-config\.factory/.test(text)) factoryConsumers.push(rel(abs));
}
for (const consumer of factoryConsumers) {
	const gw = consumer.includes('/authorize/') ? 'authorize' : consumer.includes('/ebizcharge/') ? 'ebizcharge' : consumer.includes('/stripe/') ? 'stripe' : null;
	if (!gw || !registry[gw]) continue;
	for (const caseKey of CFG_ORDER) {
		let tsId = registry[gw].cfgTcIds[caseKey] ?? null;
		let heuristic = false;
		if (!tsId && gw === 'ebizcharge') {
			// registry eBiz aún null → resolver vía stripe_ref del L1 derivado (join heurístico)
			const stripeId = registry.stripe?.cfgTcIds[caseKey];
			const hit = l1ByGateway.ebizcharge.cases.find((c) => c.stripe_ref === stripeId);
			if (hit) { tsId = hit.test_case_id; heuristic = true; }
		}
		if (tsId) addSpec(tsId, consumer, heuristic);
	}
}
// wallet addCard (wallet-add-card.factory): join heurístico por título de matriz
const walletConsumers = [];
for (const abs of walk(specRoot)) {
	const text = readFileSync(abs, 'utf8');
	if (/factories\/wallet-add-card\.factory/.test(text)) walletConsumers.push(rel(abs));
}
for (const consumer of walletConsumers) {
	const gw = consumer.includes('/authorize/') ? 'authorize' : consumer.includes('/ebizcharge/') ? 'ebizcharge' : consumer.includes('/stripe/') ? 'stripe' : null;
	if (!gw || !registry[gw]) continue;
	const walletKey = registry[gw].wallet?.addCard ?? null;
	const candidates = l1ByGateway[gw].cases.filter((c) => {
		const t = c.title.toLowerCase();
		return t.includes('wallet') && (t.includes('vincul') || t.includes('agregar')) && t.includes('datos válidos');
	});
	if (candidates.length === 1) {
		addSpec(candidates[0].test_case_id, consumer, true);
		if (walletKey && !DENYLIST.has(walletKey)) setKey(candidates[0].test_case_id, walletKey, `xray-keys.ts wallet.addCard vía ${consumer}`, true);
	}
}

// ---------- 4b. factory HOLD (hold.factory) — join ESTRUCTURAL ----------
// Los consumers de `hold.factory` son THIN: no tienen títulos literales, así que el scan de §2
// sólo los ataba porque su docblock lista TS-IDs como texto plano (frágil: trimear un comentario
// rompía la trazabilidad, y de hecho acreditaba de MÁS — refs Stripe de la tabla eBiz y los 5
// casos Authorize que viven en archivos dedicados). Este bloque reconstruye el join desde la
// ESTRUCTURA — import + lista `cases:` de cada llamada + `registry.holdTcIds` — y DESCARTA el
// join por texto de esos archivos (`dropSpec`), de modo que el comentario deja de ser
// load-bearing. Keys MG del área HOLD: siguen `null` por diseño (nunca fabricar).
const HOLD_FACTORY_PATH = 'tests/features/gateway-pg/specs/_parametrized/factories/hold.factory.ts';
const RESOLVER_PATH = 'tests/fixtures/gateways/_shared/resolver.ts';
const INTENT_MAP_CONST = { stripe: 'STRIPE', authorize: 'AUTHORIZE', ebizcharge: 'EBIZCHARGE' };

/** Quita comentarios para que un docblock NUNCA aporte al join estructural. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

/**
 * Ejes por caso de la taxonomía HOLD, parseados de `HOLD_CASE_SPECS` en la factory — NO se
 * duplica la taxonomía acá. `null` si el parseo falla (la factory cambió de forma).
 */
function parseHoldCaseSpecs() {
	let text;
	try {
		text = readFileSync(rp(HOLD_FACTORY_PATH), 'utf8');
	} catch {
		return null;
	}
	const block = text.match(/HOLD_CASE_SPECS[^=]*=\s*{([\s\S]*?)\n};/);
	if (!block) return null;
	const out = new Map();
	for (const m of block[1].matchAll(/^\t(\w+):\s*{([^}]*)}/gm)) {
		out.set(m[1], {
			intent: m[2].match(/intent:\s*'([A-Z_]+)'/)?.[1] ?? null,
			holdAxis: m[2].match(/holdAxis:\s*'(\w+)'/)?.[1] ?? null,
			cardFlow: m[2].match(/cardFlow:\s*'(\w+)'/)?.[1] ?? null
		});
	}
	return out.size > 0 ? out : null;
}

/** Intents que expone cada pasarela (`*_INTENT_MAP` del resolver) — la factory filtra por acá. */
function parseSupportedIntents() {
	let text;
	try {
		text = readFileSync(rp(RESOLVER_PATH), 'utf8');
	} catch {
		return {};
	}
	const out = {};
	for (const [gw, constName] of Object.entries(INTENT_MAP_CONST)) {
		const m = text.match(new RegExp(`${constName}_INTENT_MAP[^=]*=\\s*{([\\s\\S]*?)\\n};`));
		if (m) out[gw] = new Set([...m[1].matchAll(/^\t([A-Z_]+):/gm)].map((x) => x[1]));
	}
	return out;
}

/**
 * Espejo de `HOLD_BASE_CASES` en la factory: el motor `runStepwiseHoldJourney` sólo ejercita
 * tarjeta NUEVA y sin exigir el toggle en OFF; el resto sale como `test.fixme`.
 * SI CAMBIA `unsupportedReason` EN LA FACTORY, ACTUALIZAR ESTA REGLA.
 */
const holdIsExecutable = (spec) => spec.cardFlow === 'new' && spec.holdAxis !== 'off';

const holdCaseSpecs = parseHoldCaseSpecs();
const holdIntents = parseSupportedIntents();
const holdConsumers = [];
for (const abs of walk(specRoot)) {
	const text = readFileSync(abs, 'utf8');
	if (/factories\/hold\.factory/.test(text)) holdConsumers.push({ consumer: rel(abs), text });
}
if (holdConsumers.length > 0 && !holdCaseSpecs) {
	warn(`hold.factory: no se pudo parsear HOLD_CASE_SPECS en ${HOLD_FACTORY_PATH} — ${holdConsumers.length} consumer(s) quedan SIN join estructural (§2 por texto sigue vigente).`);
}
for (const { consumer, text } of holdCaseSpecs ? holdConsumers : []) {
	const gw = consumer.includes('/authorize/') ? 'authorize' : consumer.includes('/ebizcharge/') ? 'ebizcharge' : consumer.includes('/stripe/') ? 'stripe' : null;
	if (!gw || !registry[gw]) {
		warn(`hold.factory: consumer sin pasarela resoluble en el path (o sin bloque en el registry): ${consumer}`);
		continue;
	}
	const code = stripComments(text);
	// Un consumer que además define tests propios conserva el join por texto (no se purga).
	if (/\btest(?:\.\w+)?\s*\(/.test(code)) {
		warn(`hold.factory: ${consumer} define tests propios además de consumir la factory — se mantiene el join por texto de §2 (posible sobre-acreditación).`);
	} else {
		dropSpec(consumer);
	}
	const calls = code.split(/(?=defineHoldSuite\s*\()/).slice(1);
	if (calls.length === 0) warn(`hold.factory: ${consumer} importa la factory pero no invoca defineHoldSuite() — sin cobertura acreditada.`);
	for (const call of calls) {
		const listed = call.match(/cases:\s*\[([\s\S]*?)\]/);
		// Sin `cases:` la factory genera la taxonomía completa (default `HOLD_ALL_CASES`).
		const requested = listed ? [...listed[1].matchAll(/'(\w+)'/g)].map((m) => m[1]) : [...holdCaseSpecs.keys()];
		for (const holdCase of requested) {
			const spec = holdCaseSpecs.get(holdCase);
			if (!spec) {
				warn(`hold.factory: ${consumer} pide el caso '${holdCase}', ausente de HOLD_CASE_SPECS (¿renombrado?).`);
				continue;
			}
			// La factory NO genera el caso si la pasarela no expone su intent (ej. eBiz + AVS).
			if (spec.intent && holdIntents[gw] && !holdIntents[gw].has(spec.intent)) continue;
			const tsId = registry[gw].holdTcIds[holdCase] ?? null;
			if (!tsId) continue; // la matriz de esa pasarela no modela el caso → sin TC ID (no inventar)
			if (!rows.has(tsId)) {
				warn(`hold.factory: holdTcIds.${holdCase} de '${gw}' apunta a ${tsId}, inexistente en el L1 de la pasarela.`);
				continue;
			}
			addSpec(tsId, consumer, false, !holdIsExecutable(spec));
		}
	}
}

// ---------- status + cobertura final ----------
for (const r of rows.values()) {
	// Placeholder = el spec DECLARA el caso pero lo emite como `test.fixme` (no ejecuta).
	r.fixme_spec_paths = r.spec_paths.filter((p) => r._fixmePaths.has(p) && !r._execPaths.has(p));
	r.spec_coverage = r.spec_paths.length === 0 ? 'none' : r.fixme_spec_paths.length < r.spec_paths.length ? 'executable' : 'fixme-only';
	if (r.status === 'needs-review') continue;
	// status = confianza del JOIN (no ejecutabilidad — eso lo dice spec_coverage).
	r.status = r.mg_key || r.spec_paths.length ? 'confirmed' : 'unmapped';
}

// ---------- salida JSON ----------
const all = [...rows.values()].sort((a, b) => a.gateway.localeCompare(b.gateway) || a.ts_id.localeCompare(b.ts_id, 'en', { numeric: true }));
const summary = {};
for (const gw of GATEWAYS.map((g) => g.gateway)) {
	const sub = all.filter((r) => r.gateway === gw);
	summary[gw] = {
		total: sub.length,
		confirmed: sub.filter((r) => r.status === 'confirmed').length,
		'needs-review': sub.filter((r) => r.status === 'needs-review').length,
		unmapped: sub.filter((r) => r.status === 'unmapped').length,
		with_mg_key: sub.filter((r) => r.mg_key).length,
		// with_specs = con ALGÚN spec (ejecutable o placeholder) — compat histórica.
		with_specs: sub.filter((r) => r.spec_paths.length).length,
		with_executable_specs: sub.filter((r) => r.spec_coverage === 'executable').length,
		with_fixme_only_specs: sub.filter((r) => r.spec_coverage === 'fixme-only').length
	};
}
const out = {
	generated_at: new Date().toISOString(),
	generator: 'scripts/ai/build-id-map.mjs',
	notes: [
		'SoT central de trazabilidad TS-ID ↔ MG-key ↔ spec (Fase 4, 2026-07-26).',
		'mg_key null = sin key Xray conocida (JAMÁS fabricar; ver xray-keys.ts).',
		'status: confirmed = fuentes explícitas · needs-review = algún join heurístico · unmapped = sin key ni spec. Mide CONFIANZA DEL JOIN, no ejecutabilidad.',
		'stripe_ref: equivalencia §3.1 / derivación Fase 4 hacia el caso Stripe canónico.',
		'spec_coverage: executable = al menos un spec EJECUTA el caso · fixme-only = sólo hay placeholders `test.fixme` (cobertura declarada y trazable, NO ejecutada) · none = sin spec. fixme_spec_paths lista esos placeholders.',
		'with_specs cuenta ambos (executable + fixme-only) por compat: para cobertura REAL usar with_executable_specs.',
		'La marca fixme sólo la produce el join estructural de factories (§4). Los specs escritos a mano se acreditan por texto (§2), que no ve un `test.fixme` interno → esas filas pueden seguir sobreestimando (ej. specs `e2e-mobile` Stripe).',
		'hold.factory (§4b): join estructural = import + lista `cases:` de cada llamada + registry.holdTcIds, filtrado por los intents que expone la pasarela. Para esos consumers THIN el join por texto de §2 se DESCARTA: sus docblocks listan refs Stripe y TS-IDs de otros archivos que no son cobertura propia.'
	],
	summary,
	rows: all.map(({ _sources, _fixmePaths, _execPaths, ...r }) => ({ ...r, sources: _sources }))
};
writeFileSync(rp('docs/gateway-pg/id-map.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('id-map.json escrito. Resumen:', JSON.stringify(summary, null, 1));
for (const w of warnings) console.warn(`WARN ${w}`);

// ---------- renders por pasarela ----------
for (const { gateway } of GATEWAYS) {
	const sub = all.filter((r) => r.gateway === gateway);
	const s = summary[gateway];
	const lines = [
		`# ID-MAP — ${gateway}`,
		'',
		'> **GENERATED — no editar a mano.** Regenerar con `node scripts/ai/build-id-map.mjs`.',
		'> Fuente de verdad: [`docs/gateway-pg/id-map.json`](../id-map.json). Keys MG desde `tests/features/gateway-pg/data/xray-keys.ts` + annotations `tms` en specs — nunca fabricadas.',
		'> Un spec marcado **(fixme)** DECLARA el caso pero lo emite como `test.fixme`: cobertura trazable, NO ejecutada — no cuenta como cobertura real.',
		'',
		`Total: ${s.total} · confirmed: ${s.confirmed} · needs-review: ${s['needs-review']} · unmapped: ${s.unmapped} · con MG-key: ${s.with_mg_key} · con spec: ${s.with_specs} (ejecutable: ${s.with_executable_specs} · sólo fixme: ${s.with_fixme_only_specs})`,
		'',
		'| TS-ID | Ref Stripe | MG key | Specs | Status |',
		'| --- | --- | --- | --- | --- |',
		...sub.map((r) =>
			`| ${r.ts_id} | ${r.stripe_ref ?? '—'} | ${r.mg_key ?? '—'} | ${r.spec_paths.map((p) => `\`${p}\`${r.fixme_spec_paths.includes(p) ? ' **(fixme)**' : ''}`).join('<br>') || '—'} | ${r.status} |`
		),
		''
	];
	const dest = `docs/gateway-pg/${gateway}/ID-MAP.md`;
	writeFileSync(rp(dest), lines.join('\n'), 'utf8');
	console.log(`render escrito: ${dest} (${sub.length} filas)`);
}
