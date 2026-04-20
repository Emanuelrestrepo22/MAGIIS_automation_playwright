#!/usr/bin/env node
/**
 * pre-push.mjs — Ritual pre-push para magiis-playwright
 *
 * 10 checks en <30s antes de cada git push.
 * Previene pushes con errores evitables (tsc roto, .only olvidado, secrets).
 *
 * Uso:
 *   pnpm pp            # alias
 *   pnpm prepush       # alias largo
 *   node scripts/ci/pre-push.mjs   # directo
 *
 * Escape:
 *   SKIP_HOOKS=true git push    # si alguna vez se activa como hook
 *
 * Ver: docs/ci/CI-USAGE-GUIDELINES.md
 */

import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// ANSI colors
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

const failures = [];
const warnings = [];

function runCheck(id, name, fn, { warningOnly = false } = {}) {
  const start = performance.now();
  try {
    const result = fn();
    const elapsed = Math.round(performance.now() - start);
    if (result?.fail) {
      const prefix = warningOnly ? c.yellow : c.red;
      const arr = warningOnly ? warnings : failures;
      arr.push({ id, name, reason: result.reason });
      console.log(`${prefix}${warningOnly ? '⚠️ ' : '❌'} [${id}] ${name} ${c.gray}(${elapsed}ms)${c.reset}`);
      if (result.detail) console.log(`${c.gray}   ${result.detail}${c.reset}`);
    } else {
      const elapsed2 = Math.round(performance.now() - start);
      console.log(`${c.green}✅ [${id}] ${name} ${c.gray}(${elapsed2}ms)${c.reset}`);
    }
  } catch (err) {
    const arr = warningOnly ? warnings : failures;
    arr.push({ id, name, reason: err.message });
    const prefix = warningOnly ? c.yellow : c.red;
    console.log(`${prefix}${warningOnly ? '⚠️ ' : '❌'} [${id}] ${name} — EXCEPTION: ${err.message}${c.reset}`);
  }
}

function grepForbidden(pattern, paths, { excludeFiles = [], flags = '' } = {}) {
  try {
    const pathArgs = paths.filter(p => {
      try { execSync(`test -e "${p}"`, { stdio: 'ignore' }); return true; } catch { return false; }
    });
    if (pathArgs.length === 0) return { fail: false };
    const cmd = `grep -rn --include="*.ts" ${flags} "${pattern}" ${pathArgs.join(' ')} 2>&1`;
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.split('\n').filter(l => l.trim() && !excludeFiles.some(f => l.includes(f)));
    if (lines.length > 0) {
      return {
        fail: true,
        reason: `${lines.length} ocurrencia(s) encontradas`,
        detail: lines.slice(0, 5).join('\n   ') + (lines.length > 5 ? `\n   ... y ${lines.length - 5} mas` : ''),
      };
    }
    return { fail: false };
  } catch (err) {
    // grep exit 1 = no matches = OK
    if (err.status === 1) return { fail: false };
    throw err;
  }
}

console.log(`${c.bold}${c.cyan}Pre-push ritual — magiis-playwright${c.reset}`);
console.log(`${c.gray}--------------------------------------------${c.reset}\n`);

const totalStart = performance.now();

// [1] .only
runCheck('1/10', 'Sin test.only / describe.only / it.only',
  () => {
    const paths = ['tests/'];
    const pathArgs = paths.filter(p => {
      try { execSync(`test -e "${p}"`, { stdio: 'ignore' }); return true; } catch { return false; }
    });
    if (pathArgs.length === 0) return { fail: false };
    try {
      const out = execSync(
        `grep -rn --include="*.ts" "test\\.only\\|describe\\.only\\|it\\.only" ${pathArgs.join(' ')} 2>&1`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const lines = out.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        return {
          fail: true,
          reason: `${lines.length} ocurrencia(s) de .only`,
          detail: lines.slice(0, 5).join('\n   ') + (lines.length > 5 ? `\n   ... y ${lines.length - 5} mas` : ''),
        };
      }
      return { fail: false };
    } catch (err) {
      if (err.status === 1) return { fail: false };
      throw err;
    }
  });

// [2] Cards deprecated
runCheck('2/10', 'Sin cards 3155 (LEGACY_3DS_SUCCESS) fuera de overrides',
  () => {
    const paths = ['tests/', 'src/'];
    const existing = paths.filter(p => {
      try { execSync(`test -e "${p}"`, { stdio: 'ignore' }); return true; } catch { return false; }
    });
    if (existing.length === 0) return { fail: false };
    const excludeFiles = [
      'tests/data/gateway-pg/stripe-cards.ts',
      'tests/features/gateway-pg/data/stripe-cards.ts',
      'tests/fixtures/stripe/card-policy.ts',
      'tests/e2e/shared/e2eFlowConfig.ts',
      'tests/features/gateway-pg/data/driver-happy-path-scenarios.ts',
    ];
    try {
      const out = execSync(
        `grep -rn --include="*.ts" "4000002500003155\\|CARDS\\.LEGACY_3DS_SUCCESS" ${existing.join(' ')} 2>&1`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const lines = out.split('\n').filter(l => {
        if (!l.trim()) return false;
        if (excludeFiles.some(f => l.includes(f))) return false;
        // Excluir lineas que son solo comentarios (JSDoc, // comment)
        const codePart = l.replace(/^[^:]+:\d+:\s*/, '');
        if (/^\s*\*|^\s*\/\//.test(codePart)) return false;
        return true;
      });
      if (lines.length > 0) {
        return {
          fail: true,
          reason: `${lines.length} uso(s) de card deprecated fuera de overrides`,
          detail: lines.slice(0, 5).join('\n   ') + (lines.length > 5 ? `\n   ... y ${lines.length - 5} mas` : ''),
        };
      }
      return { fail: false };
    } catch (err) {
      if (err.status === 1) return { fail: false };
      throw err;
    }
  });

// [3] TODO(temp) / FIXME(urgent)
runCheck('3/10', 'Sin TODO(temp) ni FIXME(urgent) sin resolver',
  () => {
    const paths = ['tests/', 'src/'];
    const existing = paths.filter(p => {
      try { execSync(`test -e "${p}"`, { stdio: 'ignore' }); return true; } catch { return false; }
    });
    if (existing.length === 0) return { fail: false };
    try {
      const out = execSync(
        `grep -rn --include="*.ts" "TODO(temp)\\|FIXME(urgent)" ${existing.join(' ')} 2>&1`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const lines = out.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        return {
          fail: true,
          reason: `${lines.length} TODO(temp)/FIXME(urgent) pendiente(s)`,
          detail: lines.slice(0, 5).join('\n   ') + (lines.length > 5 ? `\n   ... y ${lines.length - 5} mas` : ''),
        };
      }
      return { fail: false };
    } catch (err) {
      if (err.status === 1) return { fail: false };
      throw err;
    }
  });

// [4] Credenciales hardcodeadas
runCheck('4/10', 'Sin credenciales hardcodeadas',
  () => {
    const paths = ['tests/', 'src/'];
    const existing = paths.filter(p => {
      try { execSync(`test -e "${p}"`, { stdio: 'ignore' }); return true; } catch { return false; }
    });
    if (existing.length === 0) return { fail: false };
    try {
      // Patrón como variable para evitar conflicto con template literal
      const credPattern = '(PASS_CARRIER|PASS_CONTRACTOR|SECRET_KEY)\\s*=\\s*[\'"][^\'\"${}]{3,}';
      const out = execSync(
        `grep -rn --include="*.ts" -E "${credPattern}" ${existing.join(' ')} 2>&1`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const lines = out.split('\n').filter(l => l.trim())
        .filter(l => !l.includes('process.env') && !l.includes('secrets.') && !l.includes('// example'));
      if (lines.length > 0) {
        return { fail: true, reason: 'Posible credencial hardcodeada', detail: lines.slice(0, 3).join('\n   ') };
      }
      return { fail: false };
    } catch (err) {
      if (err.status === 1) return { fail: false };
      throw err;
    }
  });

// [5] .env files en staged
runCheck('5/10', 'Sin .env files en staged',
  () => {
    try {
      const out = execSync('git diff --cached --name-only', { encoding: 'utf8' });
      const envs = out.split('\n').filter(l => {
        const trimmed = l.trim();
        return /^\.env(\.(test|uat|prod|local))?$/.test(trimmed) ||
               /\/\.env(\.(test|uat|prod|local))?$/.test(trimmed);
      });
      if (envs.length > 0) {
        return { fail: true, reason: '.env staged — usar .env.example', detail: envs.join(', ') };
      }
      return { fail: false };
    } catch (err) {
      if (err.status === 1) return { fail: false };
      throw err;
    }
  });

// [6] console.log nuevos en specs (warning)
runCheck('6/10', 'Sin console.log nuevos en tests/features/*.spec.ts',
  () => {
    try {
      const out = execSync(
        'git diff --cached -- "tests/features/**/*.spec.ts" 2>/dev/null',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const lines = out.split('\n')
        .filter(l => l.startsWith('+') && !l.startsWith('+++'))
        .filter(l => l.includes('console.log'))
        .filter(l => !l.includes('debugLog'));
      if (lines.length > 0) {
        return {
          fail: true,
          reason: `${lines.length} console.log nuevo(s) — usar debugLog() de tests/helpers/`,
          detail: lines.slice(0, 3).join('\n   '),
        };
      }
      return { fail: false };
    } catch (err) {
      if (err.status === 1) return { fail: false };
      throw err;
    }
  }, { warningOnly: true });

// [7] test.fixme sin justificacion
runCheck('7/10', 'test.fixme con justificacion comentario',
  () => {
    try {
      const out = execSync(
        `grep -rn --include="*.ts" "test\\.fixme" tests/ 2>&1`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const lines = out.split('\n').filter(l => l.trim());
      // Para cada match, verificar si la linea anterior tiene justificacion
      const unjustified = lines.filter(l => {
        // Buscar si el archivo tiene comentario de justificacion antes del test.fixme
        // Si la linea ya contiene un comentario inline, OK
        if (l.includes('// FIXME:') || l.includes('// ISSUE-') || l.includes('// BL-') || l.includes('// TODO(')) {
          return false;
        }
        // Extraer archivo y numero de linea
        const match = l.match(/^([^:]+):(\d+):/);
        if (!match) return false;
        const [, file, lineNum] = match;
        const lineN = parseInt(lineNum);
        if (lineN <= 1) return true; // primera linea, no hay anterior
        try {
          const prevOut = execSync(
            `sed -n '${Math.max(1, lineN - 1)}p' "${file}" 2>/dev/null`,
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
          );
          const prevLine = prevOut.trim();
          return !(prevLine.includes('// FIXME:') || prevLine.includes('// ISSUE-') ||
                   prevLine.includes('// BL-') || prevLine.includes('// TODO('));
        } catch {
          return true;
        }
      });
      if (unjustified.length > 0) {
        return {
          fail: true,
          reason: `${unjustified.length} test.fixme sin comentario de justificacion`,
          detail: unjustified.slice(0, 3).join('\n   '),
        };
      }
      return { fail: false };
    } catch (err) {
      if (err.status === 1) return { fail: false };
      throw err;
    }
  }, { warningOnly: true });

// [8] Branch actualizada con main
runCheck('8/10', 'Branch cerca de origin/main',
  () => {
    try {
      execSync('git fetch origin main --quiet', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
      const behindStr = execSync('git rev-list --count HEAD..origin/main 2>/dev/null || echo 0', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const behind = parseInt(behindStr) || 0;
      if (behind > 5) {
        return {
          fail: true,
          reason: `${behind} commits behind main`,
          detail: 'Considera: git rebase origin/main',
        };
      }
      return { fail: false };
    } catch (err) {
      return {
        fail: true,
        reason: 'No se pudo fetchear (offline?)',
        detail: err.message.slice(0, 100),
      };
    }
  }, { warningOnly: true });

// [9] BL/TC en mensaje de commit o branch
runCheck('9/10', 'Trazabilidad BL-NNN / TC-xxx en branch o commit',
  () => {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      if (['main', 'develop'].includes(branch)) return { fail: false };
      const lastCommit = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
      const combined = branch + ' ' + lastCommit;
      const hasRef = /BL-\d+|TC-\w+|TS-STRIPE-TC\d+|TS-GATEWAY-TC\d+/i.test(combined);
      if (!hasRef) {
        return {
          fail: true,
          reason: 'Sin referencia a backlog/TC en branch ni commit',
          detail: `branch=${branch}, commit="${lastCommit}"`,
        };
      }
      return { fail: false };
    } catch (err) {
      return { fail: true, reason: err.message };
    }
  }, { warningOnly: true });

// [10] TypeScript compila
runCheck('10/10', 'TypeScript compila (tsc --noEmit)',
  () => {
    // Resolver tsc: primero pnpm exec, luego node_modules local, luego git root
    function findTsc() {
      // Opcion 1: pnpm exec tsc
      try {
        execSync('pnpm exec tsc --version', { stdio: 'ignore', timeout: 5000 });
        return 'pnpm exec tsc';
      } catch {}
      // Opcion 2: node_modules/.bin/tsc local
      try {
        execSync('test -f node_modules/.bin/tsc', { stdio: 'ignore' });
        return 'node_modules/.bin/tsc';
      } catch {}
      // Opcion 3: git common dir (soporta worktrees — apunta al main)
      try {
        const gitCommonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
        // git-common-dir es .git/ del main => su padre es el root del main
        const mainRoot = gitCommonDir.replace(/[/\\]\.git[/\\]?$/, '').replace(/[/\\]\.git$/, '');
        const tscPath = `${mainRoot}/node_modules/typescript/bin/tsc`;
        execSync(`test -f "${tscPath}"`, { stdio: 'ignore' });
        return `node "${tscPath}"`;
      } catch {}
      return null;
    }
    const tscCmd = findTsc();
    if (!tscCmd) {
      return { fail: true, reason: 'tsc no encontrado — instalar dependencias (pnpm install)', detail: '' };
    }
    try {
      execSync(`${tscCmd} --noEmit`, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
      return { fail: false };
    } catch (err) {
      const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
      const errorLines = output.split('\n').filter(l => l.includes('error TS')).slice(0, 5);
      return {
        fail: true,
        reason: 'TypeScript errors',
        detail: errorLines.length > 0 ? errorLines.join('\n   ') : output.slice(0, 300),
      };
    }
  });

// Summary
const totalElapsed = Math.round((performance.now() - totalStart) / 1000);
console.log(`\n${c.gray}--------------------------------------------${c.reset}`);
console.log(`${c.bold}Total: ${totalElapsed}s${c.reset}`);

if (failures.length > 0) {
  console.log(`\n${c.red}${c.bold}FAIL — ${failures.length} error(es) bloqueantes:${c.reset}`);
  for (const f of failures) {
    console.log(`   ${c.red}[${f.id}]${c.reset} ${f.name} — ${f.reason}`);
  }
  console.log(`\n${c.gray}Bypass (si es intencional):${c.reset}`);
  console.log(`   ${c.cyan}SKIP_HOOKS=true git push${c.reset}\n`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.log(`\n${c.yellow}${warnings.length} warning(s) — push permitido, revisar si aplica:${c.reset}`);
  for (const w of warnings) {
    console.log(`   ${c.yellow}[${w.id}]${c.reset} ${w.name} — ${w.reason}`);
  }
}

console.log(`\n${c.green}${c.bold}Pre-push OK${c.reset}\n`);
process.exit(0);
