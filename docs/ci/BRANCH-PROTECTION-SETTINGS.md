# Branch protection — Settings de GitLab y GitHub

Configuración objetivo de branch protection para magiis-playwright.
Parte aplicada hoy via API (BL-017a), parte requiere triggers externos (BL-017b).

**Última actualización:** 2026-04-20

---

## Estado actual vs objetivo

### GitLab — `repo.magiis/magiis-testing`

#### ✅ Aplicado hoy (2026-04-20 via API)

| Setting | Estado | Notas |
|---|---|---|
| `only_allow_merge_if_all_discussions_are_resolved` | ✅ ON | Obligatorio resolver todos los threads antes de merge |
| `remove_source_branch_after_merge` | ✅ ON | Cleanup automático post-merge |
| Protected branch `main`: allow_force_push = false | ✅ ON | Ya estaba desde antes |
| Protected branch `main`: push access = Maintainers | ✅ ON | Ya estaba desde antes |

#### 🔴 Pendiente por trigger externo

| Setting | Bloqueo | Trigger para activar |
|---|---|---|
| `only_allow_merge_if_pipeline_succeeds` | Cupo CI GitLab agotado | **1 de mayo** (reset cupo) o runner propio activo |
| `approvals_before_merge: 1` | Único dev = auto-bloqueo | Equipo ≥ 2 devs |
| `Require code owner approval` | CODEOWNERS apunta a único dev | Equipo ≥ 2 devs + CODEOWNERS plural |

#### 🟡 Opcional — evaluar después

| Setting | Cuándo |
|---|---|
| Push rules: commit message regex | Fase 4 maduro — commitlint ya valida local |
| Push rules: deny commits with secrets | Premium feature — no disponible en Free |

---

### GitHub — mirror del repo

**Estado:** settings UI manuales — no hay token `GH_TOKEN` en `.mcp.json` para automatizar hoy. Al próximo pull del repo, aplicar manualmente:

#### Settings → Branches → Rule para `main`

Activable hoy (sin equipo ≥ 2):

- [x] Require status checks to pass before merging (GitHub tiene cupo disponible)
  - Status checks: `quick-checks`, `E2E Smoke (TEST)`
- [x] Require branches to be up to date before merging
- [x] Require linear history (opcional)
- [x] Do not allow bypassing the above settings
- [x] Require conversation resolution before merging

Pendiente equipo ≥ 2:

- [ ] Require a pull request before merging → Required approvals: 1
- [ ] Require review from Code Owners
- [ ] Restrict who can push

Opcional:

- [ ] Require signed commits (solo si se adopta GPG signing)

#### Settings → Actions → General

- Fork pull request workflows from outside collaborators: Require approval for first-time contributors

---

## Cómo re-aplicar via GitLab API

Comando de referencia (para cuando se levanten los triggers):

```powershell
$token = (Get-Content -Raw .mcp.json | ConvertFrom-Json).mcpServers.gitlab.env.GITLAB_PERSONAL_ACCESS_TOKEN
$headers = @{ 'PRIVATE-TOKEN' = $token }
$projectEnc = [Uri]::EscapeDataString('repo.magiis/magiis-testing')

# Activar pipelines_must_succeed (cuando vuelva cupo)
$body = @{ only_allow_merge_if_pipeline_succeeds = $true } | ConvertTo-Json
Invoke-RestMethod -Uri "https://gitlab.com/api/v4/projects/$projectEnc" -Headers $headers -Method PUT -ContentType 'application/json' -Body $body

# Activar approvals required (cuando haya ≥2 devs)
$approvals = @{ approvals_before_merge = 1 } | ConvertTo-Json
Invoke-RestMethod -Uri "https://gitlab.com/api/v4/projects/$projectEnc/approvals" -Headers $headers -Method POST -ContentType 'application/json' -Body $approvals
```

---

## BL tracking

- **BL-017a** — settings aplicables hoy (✅ hecho 2026-04-20)
- **BL-017b** — settings pendientes por trigger externo
- **BL-014b** — GitLab workflow optimization (espera cupo reset)

---

## Referencias

- `docs/ops/CI-GATES-IMPLEMENTATION-PLAN.md` §Fase 5
- `docs/ci/CI-USAGE-GUIDELINES.md`
- `.github/CODEOWNERS`
- `docs/ops/BACKLOG.md` BL-014, BL-017
- `.claude/skills/magiis-ci-efficiency/references/quality-gates.md`
