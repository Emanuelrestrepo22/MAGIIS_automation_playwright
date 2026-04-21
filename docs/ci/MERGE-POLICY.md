# Merge Policy — magiis-playwright

> Política operativa para mergear cambios a `main` sin conflicts estructurales y manteniendo GitLab ↔ GitHub sincronizados. Fuente: resolución BL-023.

## ⚡ Quick reference card — pegar en memoria

```text
SIEMPRE                              NUNCA
────                                 ────
git push gitlab main                 git push github main
pnpm pp (pre-push ritual)            SKIP_HOOKS=true (excepto emergencia)
pnpm ci:sync-check (antes de retro)  Editar bloques viejos en hotspot files
Rama para >200 líneas o multi-agente PR en GitHub mientras gitlab es canonical
Check 11 rojo → git rebase           Mergear con Check 11 rojo
```

**Flujo ordinario por tipo de cambio:**

- Cambio pequeño, uni-agente, pre-push verde → commit directo a main + push gitlab
- Cambio grande o multi-agente → rama + MR GitLab
- Hotspot (BACKLOG.md, CHANGELOG.md) → append-only + commits separados para estado

## Contexto

- **Equipo:** 1 dev (Erika) + N sesiones Claude agent ejecutadas en paralelo.
- **Remotes:**
  - `gitlab` → canonical. **Source of truth.**
  - `github` → mirror automático push-only desde GitLab (post-BL-023 Fase 1).
- **Restricción derivada:** `git push github` directo **está prohibido** una vez activo el mirror. GitHub se actualiza solo vía mirror.

---

## Flujo por tipo de cambio

### A. Commit directo a main (permitido)

Cuando TODAS se cumplen:

- [ ] Sesión uni-agente (ningún otro agente activo tocando el repo)
- [ ] Cambio ≤200 líneas netas
- [ ] Pre-push ritual verde, incluyendo Check 8 (no behind) y Check 11 (merge dry-run)
- [ ] Push solo a `gitlab`. El mirror replica a GitHub automático.

**Ejecución:**

```bash
git commit -m "..."
git push gitlab main
# GitHub se actualiza via mirror en segundos
```

### B. Rama + MR (resto de casos)

Cuando cualquiera se cumple:

- Hay 2+ sesiones Claude activas en el repo
- Cambio >200 líneas
- Cambio toca archivos de configuración críticos (`playwright.config.ts`, `.husky/*`, `tsconfig.json`, workflows CI)
- Hay dudas sobre riesgo

**Ejecución:**

1. Rama siguiendo skill `magiis-branch-convention`: `carrier/*`, `smoke/*`, `scripts/*`, etc.
2. Commits con trazabilidad BL/TC en mensaje.
3. Push a `gitlab`; pre-push ritual valida rebase obligatorio vía Check 11.
4. MR en GitLab → `main` con self-merge.

### C. Hotspot files (BACKLOG.md, CHANGELOG.md, reports/README.md)

- Estrategia `merge=union` activa via `.gitattributes`.
- Cada sesión **solo AGREGA bloques nuevos al final**.
- Cambios de estado sobre bloques existentes (🔴 → 🟡 → 🟢) van en **commit separado**, mismo mensaje, distinto push. Así el diff resuelve natural por línea.
- Si `merge=union` intercala líneas inconsistentes, resolver a mano ordenando post-merge. Nunca dejar el mix en el push final.

---

## Pre-push ritual (post-BL-023)

Implementación: `scripts/ci/pre-push.mjs` · Ejecución: `pnpm pp` · Bypass emergencia: `SKIP_HOOKS=true git push`.

### Checks relevantes al flujo merge

| # | Check | Tipo | Acción en fallo |
|---|---|---|---|
| 8 | Branch cerca de gitlab/main (≥1 commit behind) | warning | sugiere `git rebase gitlab/main` |
| 11 | Merge dry-run contra gitlab/main sin conflicts | **BLOQUEANTE** | push rechazado; lista archivos conflictivos; instrucción de rebase |

**Razonamiento de diseño:**

- Check 8 warning — ramas behind que mergean limpio no deben frenar flujo multi-agente. Se informa, no se bloquea.
- Check 11 bloqueante — detecta el problema real: merge que va a romper main. Evita el caso típico donde 2 agentes tocaron el mismo hunk.

Ambos checks comparten estado (`mainRemoteState`) para no duplicar el `git fetch` (ahorra 2-5s/push). Check 11 hace early-return si el check 8 ya determinó que la rama está up-to-date.

---

## Anti-patterns (NO hacer)

| ❌ Anti-pattern | Por qué está mal |
|---|---|
| Dejar rama abierta >24h sin rebase | aumenta probabilidad de conflict con main que siguió avanzando |
| 2 sesiones paralelas tocando mismo archivo no-hotspot | conflict garantizado al mergear el segundo; serializar o coordinar antes |
| `git push github` directo (post-mirror) | race con el mirror puede dejar GitHub en estado inconsistente |
| PR en GitHub mientras gitlab es canonical | conflicts estructurales reproducibles (BL-023) — usar MR GitLab |
| `SKIP_HOOKS=true` rutinario | el escape es para emergencias, no flujo normal. Cada uso debería estar justificado en el mensaje de commit |
| Editar bloques existentes de BACKLOG.md en mismo push que nuevos agregados | `merge=union` intercala mal; separar en 2 commits distintos |

---

## Mantenimiento continuo

### Detección de divergencia

Script: `scripts/ci/check-remote-sync.mjs` · Alias: `pnpm ci:sync-check`

Verifica que `gitlab/main` y `github/main` apunten al mismo commit. Si divergen más de 5 commits, falla con instrucción de inspeccionar el mirror en GitLab Settings.

Cadencia: manual antes de retros, o en hook semanal (opcional).

### Signos de que el mirror rompió

- `pnpm ci:sync-check` reporta ahead/behind >0
- GitHub Actions deja de correr sobre commits recientes de GitLab
- `git log github/main..gitlab/main` devuelve varios commits no replicados

**Acción:** GitLab → Settings → Repository → Mirroring repositories → verificar "Last successful update" + errores. Click "Update Now" para reintentar. Si persiste, regenerar el PAT de GitHub y re-configurar.

---

## Gotchas conocidos

### pnpm `--if-present` debe ir ANTES del script name

Sintaxis correcta:

```bash
pnpm --if-present run lint          # ✅ pnpm consume el flag
```

Sintaxis rota (falla con "Invalid option '--if-present'"):

```bash
pnpm lint --if-present              # ❌ se propaga a ESLint
pnpm run lint --if-present          # ❌ idem, al script
```

En workflows CI y scripts de package.json, siempre poner el flag propio de pnpm antes del `run <script>`. Detectado como root cause del fallo inicial de GitHub Actions post-activación del mirror (commit `1939a10`).

### Mirror push GitLab → GitHub no es instantáneo

- Schedule interno de GitLab: 2-5 min por sync
- Si hace falta verificación inmediata: `pnpm ci:sync-check` reporta drift actual
- Para forzar sync manual: GitLab Settings → Repository → Mirroring repositories → 🔄 Update Now

### `merge=union` intercala líneas sin ordenar

Si 2 ramas editan el BACKLOG en líneas cercanas, `merge=union` las concatena en el orden que llegan, no semántico. El merge no falla pero queda feo. Solución: revisar el archivo post-merge y reordenar antes del próximo push.

---

## Protocolo de emergencia — reconciliar remotes

**Usar SOLO si:**

- `pnpm ci:sync-check` reporta drift >50 commits
- El mirror está caído y no se puede reparar en ventana razonable
- Los historiales divergieron por un error operativo

**Requiere autorización textual explícita del dev** por ser destructivo.

```bash
# 1. Confirmar que gitlab/main tiene el trabajo correcto (canonical)
git log gitlab/main -10

# 2. Actualizar main local
git checkout main && git pull gitlab main

# 3. Force-push a github con lease (aborta si alguien más pusheó)
git push github main --force-with-lease

# 4. Validar
git fetch github main && pnpm ci:sync-check
```

Tras el force-push, reactivar/revisar el mirror en GitLab para que el problema no reingrese. Documentar el incidente en `docs/ops/BACKLOG.md`.

---

## Referencias

- BL-023 en `docs/ops/BACKLOG.md` — contexto histórico del problema
- `scripts/ci/pre-push.mjs` — implementación Check 8 + Check 11
- `scripts/ci/check-remote-sync.mjs` — detector de drift
- `.gitattributes` — estrategia merge=union hotspots
- Skill `magiis-branch-convention` — naming y scope de ramas
- `docs/ci/CI-USAGE-GUIDELINES.md` — uso general del CI
