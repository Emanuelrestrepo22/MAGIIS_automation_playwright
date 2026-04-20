#!/usr/bin/env node
/**
 * weekly-ci-report.mjs — Reporte semanal de salud CI
 *
 * Genera métricas de pipelines de los últimos 7 días (default) desde GitLab o GitHub Actions API.
 *
 * Uso:
 *   pnpm ci:report                                  # GitLab por default, stdout
 *   pnpm ci:report -- --platform=gitlab
 *   pnpm ci:report -- --platform=github
 *   pnpm ci:report -- --days=14
 *   pnpm ci:report -- --output=file                 # guarda docs/reports/CI-WEEKLY-<date>.md
 *   pnpm ci:report -- --platform=gitlab --output=file --days=30
 *
 * Métricas reportadas:
 *   - Pipelines totales (runs) en la ventana
 *   - Success rate global + por tipo (main vs MR/PR)
 *   - Duración p50 / p95
 *   - Pipelines cancelados (indicador de concurrency cancel redundantes)
 *   - Minutos consumidos (+proyección mensual)
 *   - Top 5 pipelines más lentos
 *
 * Tokens:
 *   GitLab: .mcp.json -> mcpServers.gitlab.env.GITLAB_PERSONAL_ACCESS_TOKEN
 *   GitHub: env var GH_TOKEN o GITHUB_TOKEN
 *
 * Output file path: docs/reports/CI-WEEKLY-YYYY-MM-DD.md
 *
 * Ref: docs/ops/BACKLOG.md BL-018
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith('--'))
		.map((a) => {
			const [k, v] = a.replace(/^--/, '').split('=');
			return [k, v ?? true];
		}),
);

const platform = args.platform ?? 'gitlab';
const output = args.output ?? 'stdout';
const days = parseInt(args.days ?? '7', 10);

if (!['gitlab', 'github'].includes(platform)) {
	console.error(`Platform inválido: ${platform}. Usar 'gitlab' o 'github'.`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const GITLAB_PROJECT_PATH = 'repo.magiis/magiis-testing';
const GITHUB_OWNER_REPO = detectGithubRepo();

function detectGithubRepo() {
	try {
		const remotes = execSync('git remote -v', { encoding: 'utf8' });
		const match = remotes.match(/github\.com[:/]([^/\s]+)\/([^/\s.]+)/);
		if (match) return `${match[1]}/${match[2]}`;
	} catch {
		// no-op
	}
	return null;
}

function getToken() {
	if (platform === 'gitlab') {
		try {
			const mcp = JSON.parse(readFileSync('.mcp.json', 'utf8'));
			return mcp.mcpServers?.gitlab?.env?.GITLAB_PERSONAL_ACCESS_TOKEN;
		} catch {
			return null;
		}
	}
	return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
}

const token = getToken();
if (!token) {
	console.error(`Token no encontrado para ${platform}`);
	console.error(platform === 'gitlab'
		? '  GitLab: configurar GITLAB_PERSONAL_ACCESS_TOKEN en .mcp.json'
		: '  GitHub: configurar env var GH_TOKEN o GITHUB_TOKEN');
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Windows ventana
// ---------------------------------------------------------------------------
const now = new Date();
const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const todayISO = now.toISOString().slice(0, 10);
const sinceISO = since.toISOString();

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------
async function fetchGitlabPipelines() {
	const projectEnc = encodeURIComponent(GITLAB_PROJECT_PATH);
	const all = [];
	let page = 1;
	const maxPages = 10; // hard cap

	while (page <= maxPages) {
		const url = `https://gitlab.com/api/v4/projects/${projectEnc}/pipelines?updated_after=${sinceISO}&per_page=100&page=${page}`;
		const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
		if (!res.ok) throw new Error(`GitLab API ${res.status}: ${await res.text()}`);
		const batch = await res.json();
		if (batch.length === 0) break;
		all.push(...batch);
		if (batch.length < 100) break;
		page++;
	}

	// Traer detalle (duration, ref) para cada uno — en batches
	const detailed = [];
	for (const p of all) {
		const res = await fetch(`https://gitlab.com/api/v4/projects/${projectEnc}/pipelines/${p.id}`, {
			headers: { 'PRIVATE-TOKEN': token },
		});
		if (res.ok) {
			detailed.push(await res.json());
		}
	}

	return detailed.map((p) => ({
		id: p.id,
		status: p.status,
		duration: p.duration,
		ref: p.ref,
		source: p.source,
		created: p.created_at,
		url: p.web_url,
		sha: p.sha?.slice(0, 8),
	}));
}

async function fetchGithubRuns() {
	if (!GITHUB_OWNER_REPO) {
		throw new Error('No se detectó un remote de GitHub. Agregar git remote add github <url> si aplica.');
	}
	const all = [];
	let page = 1;
	const maxPages = 10;

	while (page <= maxPages) {
		const url = `https://api.github.com/repos/${GITHUB_OWNER_REPO}/actions/runs?created=>=${sinceISO.slice(0, 10)}&per_page=100&page=${page}`;
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
		});
		if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
		const data = await res.json();
		all.push(...(data.workflow_runs ?? []));
		if (!data.workflow_runs || data.workflow_runs.length < 100) break;
		page++;
	}

	return all.map((r) => ({
		id: r.id,
		status: mapGithubStatus(r),
		duration: r.run_started_at && r.updated_at ? Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000) : null,
		ref: r.head_branch,
		source: r.event,
		created: r.created_at,
		url: r.html_url,
		sha: r.head_sha?.slice(0, 8),
	}));
}

function mapGithubStatus(run) {
	if (run.status === 'completed') {
		if (run.conclusion === 'success') return 'success';
		if (run.conclusion === 'failure') return 'failed';
		if (run.conclusion === 'cancelled') return 'canceled';
		if (run.conclusion === 'skipped') return 'skipped';
		return run.conclusion ?? 'unknown';
	}
	return run.status;
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------
function percentile(arr, p) {
	if (arr.length === 0) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const idx = Math.floor((sorted.length - 1) * (p / 100));
	return sorted[idx];
}

function computeMetrics(pipelines) {
	const durations = pipelines.filter((p) => p.duration && p.duration > 0).map((p) => p.duration);
	const succeeded = pipelines.filter((p) => p.status === 'success').length;
	const failed = pipelines.filter((p) => p.status === 'failed').length;
	const canceled = pipelines.filter((p) => p.status === 'canceled').length;
	const skipped = pipelines.filter((p) => p.status === 'skipped').length;
	const total = pipelines.length;
	const terminal = succeeded + failed + canceled + skipped;
	const mainPipelines = pipelines.filter((p) => p.ref === 'main');
	const mrPipelines = pipelines.filter((p) => p.ref !== 'main');
	const mainSuccess = mainPipelines.filter((p) => p.status === 'success').length;
	const mrSuccess = mrPipelines.filter((p) => p.status === 'success').length;

	const totalSeconds = durations.reduce((a, b) => a + b, 0);
	const totalMinutes = Math.round(totalSeconds / 60);
	const avgMin = durations.length > 0 ? Math.round(totalSeconds / durations.length / 60) : 0;
	const p50sec = percentile(durations, 50);
	const p95sec = percentile(durations, 95);

	// Proyección mensual asumiendo consumo constante
	const projectedMonthly = Math.round(totalMinutes * (30 / days));

	// Top 5 pipelines más lentos
	const top5slow = [...pipelines]
		.filter((p) => p.duration)
		.sort((a, b) => b.duration - a.duration)
		.slice(0, 5);

	return {
		window: { days, since: sinceISO.slice(0, 10), until: todayISO },
		totals: { total, succeeded, failed, canceled, skipped, terminal },
		successRate: terminal > 0 ? Math.round((succeeded / terminal) * 100) : 0,
		mainPipelines: { total: mainPipelines.length, succeeded: mainSuccess, successRate: mainPipelines.length > 0 ? Math.round((mainSuccess / mainPipelines.length) * 100) : 0 },
		mrPipelines: { total: mrPipelines.length, succeeded: mrSuccess, successRate: mrPipelines.length > 0 ? Math.round((mrSuccess / mrPipelines.length) * 100) : 0 },
		duration: { avgMin, p50min: Math.round(p50sec / 60), p95min: Math.round(p95sec / 60) },
		consumption: { totalMinutes, projectedMonthly },
		top5slow: top5slow.map((p) => ({ id: p.id, ref: p.ref, durationMin: Math.round(p.duration / 60), status: p.status, url: p.url })),
	};
}

// ---------------------------------------------------------------------------
// Render markdown
// ---------------------------------------------------------------------------
function renderMarkdown(metrics, platformLabel) {
	const { window, totals, successRate, mainPipelines, mrPipelines, duration, consumption, top5slow } = metrics;

	const successEmoji = successRate >= 95 ? '🟢' : successRate >= 85 ? '🟡' : '🔴';
	const p95Emoji = duration.p95min <= 15 ? '🟢' : duration.p95min <= 20 ? '🟡' : '🔴';
	const budgetEmoji = consumption.projectedMonthly <= 1400 ? '🟢' : consumption.projectedMonthly <= 1700 ? '🟡' : '🔴';

	return `# CI Weekly Report — ${todayISO}

**Platform:** ${platformLabel}
**Ventana:** ${window.since} → ${window.until} (${window.days} días)

---

## 📊 Resumen ejecutivo

| Métrica | Valor | Target | Status |
|---|---|---|---|
| Pipelines totales | ${totals.total} | — | — |
| Success rate global | ${successRate}% | >95% | ${successEmoji} |
| Duración p95 | ${duration.p95min} min | <15 min | ${p95Emoji} |
| Consumo ${window.days}d | ${consumption.totalMinutes} min | — | — |
| Proyección 30d | ~${consumption.projectedMonthly} min | <1400 | ${budgetEmoji} |

## 📈 Breakdown

### Status distribution

| Status | Count | % |
|---|---|---|
| ✅ Succeeded | ${totals.succeeded} | ${totals.terminal > 0 ? Math.round((totals.succeeded / totals.terminal) * 100) : 0}% |
| ❌ Failed | ${totals.failed} | ${totals.terminal > 0 ? Math.round((totals.failed / totals.terminal) * 100) : 0}% |
| ⏹️ Canceled | ${totals.canceled} | ${totals.terminal > 0 ? Math.round((totals.canceled / totals.terminal) * 100) : 0}% |
| ⏭️ Skipped | ${totals.skipped} | ${totals.terminal > 0 ? Math.round((totals.skipped / totals.terminal) * 100) : 0}% |

### Por branch

| Tipo | Total | Success | Success rate |
|---|---|---|---|
| main | ${mainPipelines.total} | ${mainPipelines.succeeded} | ${mainPipelines.successRate}% |
| MRs / branches | ${mrPipelines.total} | ${mrPipelines.succeeded} | ${mrPipelines.successRate}% |

### Duración

| Métrica | Valor |
|---|---|
| Promedio | ${duration.avgMin} min |
| p50 | ${duration.p50min} min |
| p95 | ${duration.p95min} min |

## 🐢 Top 5 pipelines más lentos

${top5slow.length > 0
	? top5slow.map((p, i) => `${i + 1}. [\`${p.id}\`](${p.url}) — ${p.durationMin} min — \`${p.ref}\` (${p.status})`).join('\n')
	: 'No hay datos de duración en la ventana.'}

## 🎯 Observaciones automatizadas

${generateObservations(metrics)}

## 🔗 Referencias

- \`docs/ci/CI-USAGE-GUIDELINES.md\` — guía de uso CI del equipo
- \`docs/ops/CI-GATES-IMPLEMENTATION-PLAN.md\` — plan Quality Gates progresivos
- Dashboard oficial: ${platform === 'gitlab' ? 'Analyze → CI/CD analytics' : 'Actions → Usage'}

---

*Reporte generado automáticamente por \`scripts/ci/weekly-ci-report.mjs\` — BL-018.*
`;
}

function generateObservations(metrics) {
	const obs = [];
	if (metrics.successRate < 95 && metrics.totals.terminal >= 5) {
		obs.push(`- ⚠️ Success rate ${metrics.successRate}% bajo target (95%). Investigar los ${metrics.totals.failed} fallos.`);
	}
	if (metrics.duration.p95min > 15 && metrics.duration.p95min <= 20) {
		obs.push(`- 🟡 p95 ${metrics.duration.p95min} min cerca del límite (15 min). Considerar cache optimization.`);
	}
	if (metrics.duration.p95min > 20) {
		obs.push(`- 🔴 p95 ${metrics.duration.p95min} min excede target (15 min). Auditar workflow con skill \`magiis-ci-efficiency\`.`);
	}
	if (metrics.consumption.projectedMonthly > 1700) {
		obs.push(`- 🔴 Proyección mensual ${metrics.consumption.projectedMonthly} min cerca del cupo. Considerar runner propio o optimizaciones.`);
	} else if (metrics.consumption.projectedMonthly > 1400) {
		obs.push(`- 🟡 Proyección mensual ${metrics.consumption.projectedMonthly} min sobre target (1400). Monitoreo semanal recomendado.`);
	}
	const cancelRate = metrics.totals.terminal > 0 ? (metrics.totals.canceled / metrics.totals.terminal) * 100 : 0;
	if (cancelRate > 30) {
		obs.push(`- ℹ️ Alta tasa de cancelados (${Math.round(cancelRate)}%) — confirma que \`concurrency\` / \`interruptible\` está funcionando correctamente.`);
	}
	if (obs.length === 0) {
		obs.push('- ✅ Todas las métricas dentro de target. Sin acción requerida.');
	}
	return obs.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
	try {
		const fetcher = platform === 'gitlab' ? fetchGitlabPipelines : fetchGithubRuns;
		const platformLabel = platform === 'gitlab' ? `GitLab (${GITLAB_PROJECT_PATH})` : `GitHub (${GITHUB_OWNER_REPO ?? 'unknown'})`;

		console.error(`[ci-report] Fetching ${platformLabel} pipelines últimos ${days} días...`);
		const pipelines = await fetcher();
		console.error(`[ci-report] Recibidos ${pipelines.length} pipelines.`);

		const metrics = computeMetrics(pipelines);
		const markdown = renderMarkdown(metrics, platformLabel);

		if (output === 'file') {
			const dir = resolve('docs/reports');
			if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
			const filePath = resolve(dir, `CI-WEEKLY-${todayISO}.md`);
			writeFileSync(filePath, markdown, 'utf8');
			console.error(`[ci-report] Guardado en: ${filePath}`);
		} else {
			process.stdout.write(markdown);
		}
	} catch (err) {
		console.error(`[ci-report] ERROR: ${err.message}`);
		if (err.stack) console.error(err.stack);
		process.exit(1);
	}
})();
