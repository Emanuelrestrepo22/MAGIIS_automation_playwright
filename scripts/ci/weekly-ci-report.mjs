#!/usr/bin/env node
/**
 * weekly-ci-report.mjs — Reporte semanal de salud CI
 *
 * Uso:
 *   node scripts/ci/weekly-ci-report.mjs [--platform=gitlab|github] [--output=stdout|file]
 *
 * Genera:
 *   - Pipelines totales semana
 *   - Success rate
 *   - Duration p50/p95
 *   - Consumo de minutos (proyeccion mensual)
 *   - Flaky offenders
 *
 * Target: postear a docs/reports/CI-WEEKLY-{date}.md o Slack webhook.
 *
 * Estado: ESQUELETO — implementar parser completo post-adopcion (ver BL-018)
 */

import { readFileSync } from 'node:fs';

const platform = process.argv.find(a => a.startsWith('--platform='))?.split('=')[1] ?? 'gitlab';
const output = process.argv.find(a => a.startsWith('--output='))?.split('=')[1] ?? 'stdout';

// Leer token de .mcp.json (GitLab) o env var GH_TOKEN (GitHub)
function getToken() {
  if (platform === 'gitlab') {
    try {
      const mcp = JSON.parse(readFileSync('.mcp.json', 'utf8'));
      return mcp.mcpServers?.gitlab?.env?.GITLAB_PERSONAL_ACCESS_TOKEN;
    } catch { return null; }
  }
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
}

const token = getToken();
if (!token) {
  console.error(`Token no encontrado para ${platform}`);
  console.error(`Para GitLab: configurar GITLAB_PERSONAL_ACCESS_TOKEN en .mcp.json`);
  console.error(`Para GitHub: configurar env var GH_TOKEN`);
  process.exit(1);
}

// TODO (BL-018): implementar parser completo
// - GET /projects/:id/pipelines?updated_after=<hace7dias> (GitLab)
// - GET /repos/:owner/:repo/actions/runs?created=><hace7dias> (GitHub)
// - Calcular success_rate, duration p50/p95, minutos consumidos
// - Generar markdown con tabla de metricas
// - Opcion --output=file => guardar en docs/reports/CI-WEEKLY-{date}.md

const today = new Date().toISOString().slice(0, 10);

console.log(`# CI Weekly Report - ${today}`);
console.log(`Platform: ${platform}`);
console.log(`Output: ${output}`);
console.log('');
console.log('## Estado');
console.log('');
console.log('Esqueleto creado. Implementacion completa pendiente en BL-018.');
console.log('');
console.log('## Como revisar manualmente mientras tanto');
console.log('');
console.log('**GitLab:**');
console.log('  Analyze -> CI/CD analytics -> Pipeline charts');
console.log('');
console.log('**GitHub:**');
console.log('  Actions -> (workflow) -> Usage metrics');
console.log('');
console.log('## Metricas objetivo');
console.log('');
console.log('| Metrica              | Target      |');
console.log('|----------------------|-------------|');
console.log('| Pipeline p95         | < 15 min    |');
console.log('| Success rate         | > 95%       |');
console.log('| Flaky test rate      | < 2%        |');
console.log('| CI minutes consumed  | < 70% cupo  |');
console.log('| MR lead time         | < 2 dias    |');
