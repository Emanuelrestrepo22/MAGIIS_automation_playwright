#!/usr/bin/env node
/**
 * pre-push.mjs — Ritual pre-push para magiis-playwright
 *
 * 11 checks + 1 check opcional (gitleaks si instalado) en <30s antes de cada git push.
 * Previene pushes con errores evitables (tsc roto, .only olvidado, secrets,
 * merge conflicts contra main).
 *
 * Uso:
 *   pnpm pp            # alias
 *   pnpm prepush       # alias largo
 *   node scripts/ci/pre-push.mjs   # directo
 *
 * Escape:
 *   SKIP_HOOKS=true git push    # bypass intencional (WIP, emergencia)
 *
 * Política de checks (ver docs/ci/MERGE-POLICY.md §Pre-push):
 *   - Check 8  (warning) — branch behind de gitlab/main. Sugiere rebase, no bloquea.
 *                         Threshold reducido a > 0 para feedback temprano.
 *   - Check 12 (BLOQUEANTE) — merge dry-run contra gitlab/main. Bloquea solo
 *                              si el merge produce conflict markers reales.
 *                              Diseño: permite ramas multi-agente behind siempre
 *                              que no haya conflict sustantivo — sí bloquea
 *                              push que claramente va a romper main.
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

// Estado compartido para checks que consultan gitlab/main. Evita fetches
// duplicados entre check 8 (behind count) y check 11 (merge dry-run).
const mainRemoteState = {
  resolved: null,       // nombre del remote resuelto (gitlab > origin > primero)
  fetched: false,       // true si ya se ejecutó `git fetch <remote> main`
  behind: null,         // cuántos commits behind quedó HEAD vs <remote>/main
};

function resolveMainRemote() {
  if (mainRemoteState.resolved !== null) return mainRemoteState.resolved;
  try {
    const remotes = execSync('git remote', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (remotes.length === 0) { mainRemoteState.resolved = ''; return ''; }
    if (remotes.includes('gitlab')) { mainRemoteState.resolved = 'gitlab'; return 'gitlab'; }
    if (remotes.includes('origin')) { mainRemoteState.resolved = 'origin'; return 'origin'; }
    mainRemoteState.resolved = remotes[0];
    return remotes[0];
  } catch {
    mainRemoteState.resolved = '';
    return '';
  }
}

function ensureMainFetched(remoteName) {
  if (mainRemoteState.fetched) return true;
  try {
    execSync(`git fetch ${remoteName} main --quiet`, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
    mainRemoteState.fetched = true;
    return true;
  } catch {
    return false;
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
console.log(`${c.gray}11 checks + gitleaks opcional${c.reset}`);
console.log(`${c.gray}--------------------------------------------${c.reset}\n`);

const totalStart = performance.now();

// [1] .only
runCheck('1/11', 'Sin test.only / describe.only / it.only',
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
runCheck('2/11', 'Sin cards 3155 (LEGACY_3DS_SUCCESS) fuera de overrides',
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
runCheck('3/11', 'Sin TODO(temp) ni FIXME(urgent) sin resolver',
  () => {
    const paths = ['tests/'];
    try { execSync('test -d src', { stdio: 'ignore' }); paths.push('src/'); } catch {}
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
runCheck('4/11', 'Sin credenciales hardcodeadas',
  () => {
    const paths = ['tests/'];
    try { execSync('test -d src', { stdio: 'ignore' }); paths.push('src/'); } catch {}
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
runCheck('5/11', 'Sin .env files en staged',
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
runCheck('6/11', 'Sin console.log nuevos en tests/features/*.spec.ts',
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
runCheck('7/11', 'test.fixme con justificacion comentario',
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

// [8] Branch cerca de gitlab/main (warning — threshold agresivo post-BL-023)
// Sigue siendo WARNING (no bloquea). El bloqueo real lo hace check 11 (merge
// dry-run) si hay conflict sustantivo. Así permite ramas multi-agente behind
// siempre que el merge siga siendo limpio.
runCheck('8/11', 'Branch cerca de gitlab/main (remote dinamico)',
  () => {
    const remoteName = resolveMainRemote();
    if (!remoteName) return { fail: false };

    const fetched = ensureMainFetched(remoteName);
    if (!fetched) {
      return {
        fail: true,
        reason: `No se pudo fetchear ${remoteName} (offline?)`,
        detail: 'el merge dry-run también se saltó en check 11',
      };
    }

    try {
      const behind = parseInt(execSync(`git rev-list --count HEAD..${remoteName}/main`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()) || 0;
      mainRemoteState.behind = behind;
      if (behind > 0) {
        return {
          fail: true,
          reason: `${behind} commit(s) behind ${remoteName}/main — considerá rebase`,
          detail: `git fetch ${remoteName} main && git rebase ${remoteName}/main`,
        };
      }
      return { fail: false };
    } catch (err) {
      return { fail: true, reason: err.message.slice(0, 100) };
    }
  }, { warningOnly: true });

// [9] BL/TC en mensaje de commit o branch
runCheck('9/11', 'Trazabilidad BL-NNN / TC-xxx en branch o commit',
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
runCheck('10/11', 'TypeScript compila (tsc --noEmit)',
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

// [11] Merge dry-run contra gitlab/main (BLOQUEANTE — previene conflicts reales)
// Diseño BL-023: en vez de bloquear por "estar behind" (que frena flujo
// multi-agente en paralelo), bloqueamos solo si el merge dry-run produce
// conflict markers sustantivos. Ramas que están behind pero mergean limpias
// pasan. Si tu rama toca los mismos hunks que main avanzado → bloqueo con
// instrucción concreta de rebase.
runCheck('11/11', 'Merge dry-run contra gitlab/main sin conflicts',
  () => {
    const remoteName = resolveMainRemote();
    if (!remoteName) return { fail: false };

    const branch = (() => {
      try { return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(); }
      catch { return ''; }
    })();
    // En main/develop mergear contra main no tiene sentido.
    if (branch === 'main' || branch === 'develop') return { fail: false };

    // Early-return: si ya sabemos (del check 8) que la rama está up-to-date,
    // el merge-tree siempre será vacío — saltear el trabajo.
    if (mainRemoteState.behind === 0) return { fail: false };

    if (!ensureMainFetched(remoteName)) {
      // Fetch falló (offline). Check 8 ya reporta el warning; no duplicamos.
      return { fail: false };
    }

    try {
      const base = execSync(`git merge-base HEAD ${remoteName}/main`, { encoding: 'utf8' }).trim();
      const mergeOut = execSync(`git merge-tree ${base} HEAD ${remoteName}/main 2>&1`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const conflictMarkerRegex = /^(<{7}|>{7}|={7})/m;
      if (!conflictMarkerRegex.test(mergeOut)) return { fail: false };

      // Hay conflict. Mejor esfuerzo para mostrar archivos afectados.
      // Uso [^\n]*? (lazy pero sin cruzar líneas) para evitar backtracking O(n²)
      // sobre output potencialmente grande.
      const conflictFiles = new Set();
      for (const m of mergeOut.matchAll(/^(?:added in both|changed in both)[^\n]*\n(?:[^\n]*\n){0,4}?\s+our\s+\d+\s+([^\n]+)/gm)) {
        conflictFiles.add(m[1].trim());
      }
      const sample = [...conflictFiles].slice(0, 5).join(', ') || '(ver git merge-tree output)';
      return {
        fail: true,
        reason: `merge dry-run contra ${remoteName}/main produce conflicts`,
        detail: `archivos conflictivos: ${sample}\n   ejecutá: git fetch ${remoteName} main && git rebase ${remoteName}/main`,
      };
    } catch (err) {
      // Buffer overflow = divergencia enorme, señal útil para el dev.
      if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        return {
          fail: true,
          reason: `merge-tree output excedió 10MB (divergencia enorme con ${remoteName}/main)`,
          detail: `rebase manual requerido: git fetch ${remoteName} main && git rebase ${remoteName}/main`,
        };
      }
      // Otros errores (timeout, comando fail): no bloquear, solo nota.
      return { fail: false };
    }
  });

// [12] Gitleaks (opcional — solo si esta instalado en PATH)
runCheck('12/opt', 'Gitleaks secrets scan (si instalado)',
  () => {
    try {
      execSync('gitleaks version', { stdio: 'ignore', timeout: 5000 });
    } catch {
      // No instalado — skip silencioso
      return { fail: false };
    }
    try {
      execSync('gitleaks detect --source=. --no-git --log-level=error', {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      });
      return { fail: false };
    } catch (err) {
      const out = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
      if (out.includes('not recognized') || out.includes('command not found') || err.status === 127) {
        return { fail: false };
      }
      return {
        fail: true,
        reason: 'Gitleaks detecto posibles secrets',
        detail: out.slice(0, 500),
      };
    }
  }, { warningOnly: true });

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
