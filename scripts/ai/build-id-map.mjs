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
 *   5. Pares §3.1 / derivación Fase 4: stripe_ref viene del L1 de cada pasarela.
 *
 * Reglas duras: JAMÁS fabricar keys MG (sin fuente → mg_key null). Keys de la
 * denylist (planes/executions/épicas) nunca se asignan como Test key.
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
			status: 'unmapped',
			_sources: []
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
function addSpec(tsId, specPath, heuristic = false) {
	const r = rows.get(tsId);
	if (!r) return;
	if (!r.spec_paths.includes(specPath)) r.spec_paths.push(specPath);
	if (heuristic && r.status !== 'confirmed') r.status = 'needs-review';
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

// ---------- status final ----------
for (const r of rows.values()) {
	if (r.status === 'needs-review') continue;
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
		with_specs: sub.filter((r) => r.spec_paths.length).length
	};
}
const out = {
	generated_at: new Date().toISOString(),
	generator: 'scripts/ai/build-id-map.mjs',
	notes: [
		'SoT central de trazabilidad TS-ID ↔ MG-key ↔ spec (Fase 4, 2026-07-26).',
		'mg_key null = sin key Xray conocida (JAMÁS fabricar; ver xray-keys.ts).',
		'status: confirmed = fuentes explícitas · needs-review = algún join heurístico · unmapped = sin key ni spec.',
		'stripe_ref: equivalencia §3.1 / derivación Fase 4 hacia el caso Stripe canónico.'
	],
	summary,
	rows: all.map(({ _sources, ...r }) => ({ ...r, sources: _sources }))
};
writeFileSync(rp('docs/gateway-pg/id-map.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('id-map.json escrito. Resumen:', JSON.stringify(summary, null, 1));

// ---------- renders por pasarela ----------
for (const { gateway } of GATEWAYS) {
	const sub = all.filter((r) => r.gateway === gateway);
	const s = summary[gateway];
	const lines = [
		`# ID-MAP — ${gateway}`,
		'',
		'> **GENERATED — no editar a mano.** Regenerar con `node scripts/ai/build-id-map.mjs`.',
		'> Fuente de verdad: [`docs/gateway-pg/id-map.json`](../id-map.json). Keys MG desde `tests/features/gateway-pg/data/xray-keys.ts` + annotations `tms` en specs — nunca fabricadas.',
		'',
		`Total: ${s.total} · confirmed: ${s.confirmed} · needs-review: ${s['needs-review']} · unmapped: ${s.unmapped} · con MG-key: ${s.with_mg_key} · con spec: ${s.with_specs}`,
		'',
		'| TS-ID | Ref Stripe | MG key | Specs | Status |',
		'| --- | --- | --- | --- | --- |',
		...sub.map((r) =>
			`| ${r.ts_id} | ${r.stripe_ref ?? '—'} | ${r.mg_key ?? '—'} | ${r.spec_paths.map((p) => `\`${p}\``).join('<br>') || '—'} | ${r.status} |`
		),
		''
	];
	const dest = `docs/gateway-pg/${gateway}/ID-MAP.md`;
	writeFileSync(rp(dest), lines.join('\n'), 'utf8');
	console.log(`render escrito: ${dest} (${sub.length} filas)`);
}
