#!/usr/bin/env node
/**
 * check-remote-sync.mjs — Detectar drift entre gitlab/main y github/main.
 *
 * Post-BL-023 el flujo esperado es:
 *   gitlab/main (canonical) ──► mirror push ──► github/main
 *
 * Este script verifica que ambos apunten al mismo commit (o estén muy
 * cerca). Si divergen más del umbral, el mirror probablemente falló y
 * hay que inspeccionar GitLab → Settings → Repository → Mirroring.
 *
 * Uso:
 *   pnpm ci:sync-check                # exit 0 si sincronizado, exit 1 si drift
 *   node scripts/ci/check-remote-sync.mjs --threshold 10
 *
 * Cadencia sugerida: manual antes de retros, o schedule semanal (GitHub
 * Actions cron o task scheduler).
 */

import { execSync } from 'node:child_process';

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

const args = process.argv.slice(2);
const thresholdIdx = args.indexOf('--threshold');
const DRIFT_THRESHOLD = thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1]) || 5 : 5;

function hasRemote(name) {
  try {
    const remotes = execSync('git remote', { encoding: 'utf8' }).trim().split('\n');
    return remotes.includes(name);
  } catch {
    return false;
  }
}

function fetchMain(remote) {
  try {
    execSync(`git fetch ${remote} main --quiet`, { timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch (err) {
    console.error(`${c.red}❌ Fetch ${remote}/main falló: ${err.message.slice(0, 100)}${c.reset}`);
    return false;
  }
}

function revCount(from, to) {
  try {
    return parseInt(execSync(`git rev-list --count ${from}..${to}`, { encoding: 'utf8' }).trim()) || 0;
  } catch {
    return 0;
  }
}

function shortSha(ref) {
  try {
    return execSync(`git rev-parse --short ${ref}`, { encoding: 'utf8' }).trim();
  } catch {
    return '???????';
  }
}

console.log(`${c.bold}check-remote-sync — magiis-playwright${c.reset}`);
console.log(`${c.gray}Threshold: ${DRIFT_THRESHOLD} commits${c.reset}\n`);

if (!hasRemote('gitlab') || !hasRemote('github')) {
  console.error(`${c.red}❌ Faltan remotes: se requieren 'gitlab' y 'github' configurados.${c.reset}`);
  console.error(`${c.gray}   git remote add gitlab https://...${c.reset}`);
  process.exit(1);
}

if (!fetchMain('gitlab') || !fetchMain('github')) {
  process.exit(1);
}

const githubBehindGitlab = revCount('github/main', 'gitlab/main');
const gitlabBehindGithub = revCount('gitlab/main', 'github/main');

const gitlabSha = shortSha('gitlab/main');
const githubSha = shortSha('github/main');

console.log(`  gitlab/main : ${gitlabSha}`);
console.log(`  github/main : ${githubSha}\n`);

if (githubBehindGitlab === 0 && gitlabBehindGithub === 0) {
  console.log(`${c.green}${c.bold}✅ Remotes sincronizados.${c.reset}`);
  process.exit(0);
}

console.log(`${c.yellow}⚠️  Drift detectado:${c.reset}`);
if (githubBehindGitlab > 0) {
  console.log(`   github/main está ${githubBehindGitlab} commit(s) atrás de gitlab/main`);
}
if (gitlabBehindGithub > 0) {
  console.log(`   gitlab/main está ${gitlabBehindGithub} commit(s) atrás de github/main (inesperado — gitlab es canonical)`);
}

if (githubBehindGitlab > DRIFT_THRESHOLD || gitlabBehindGithub > 0) {
  console.error(`\n${c.red}${c.bold}❌ Drift supera el umbral o hay commits huérfanos en github.${c.reset}`);
  console.error(`${c.gray}   Posibles causas:${c.reset}`);
  console.error(`${c.gray}     - Mirror GitLab → GitHub deshabilitado o con errores${c.reset}`);
  console.error(`${c.gray}     - Push manual a github/main (prohibido post-BL-023)${c.reset}`);
  console.error(`${c.gray}   Verificar: GitLab → Settings → Repository → Mirroring repositories${c.reset}`);
  console.error(`${c.gray}   Click "Update Now" en el icono 🔄 si aparece status error.${c.reset}`);
  process.exit(1);
}

console.log(`\n${c.yellow}Drift menor (<${DRIFT_THRESHOLD}), el mirror probablemente está procesando. Re-verificar en 5 min.${c.reset}`);
process.exit(0);
