# MAGIIS AI Tools Guide

## Purpose
Routing guide for Antigravity-managed agent work in this repo. Use Gemini for context-heavy analysis and backlog assembly, Codex for code changes, and Claude Sonnet or Claude Code only as optional fallbacks when available.

## Current Stack
- Antigravity: session admin and multi-step task orchestration.
- Gemini 3.1 Pro: long-context analysis, docs normalization, backlog prioritization, and context bootstrapping.
- Codex GPT-5.x: code generation, refactors, and file edits.
- Claude Sonnet 4.6: optional second-pass reasoning for hard tradeoffs.
- Claude Code: optional fallback for local execution and review.
- Gemini API runtime: `tests/config/aiRuntime.ts` resolves `GEMINI_API_KEY` from `AI_STUDIO_GEMINI_MAGIIS` when the standard env var is not present, and `tests/shared/utils/geminiClient.ts` consumes the shared key.
- Current delivery focus: contractor portal web. Passenger App flow 2 is active under its dedicated prompt, and App Driver flow 2 is paused until it is explicitly reactivated.
- Passenger App flows should gate on the home label under the profile toggle before wallet or trip work; use `pnpm mobile:passenger:profile-mode-smoke` to validate `personal` vs `business` from the home shell, `pnpm mobile:passenger:personal-3ds-hold-flow` for the full personal 3DS + hold journey with dumps, and `pnpm mobile:passenger:business-no3ds-hold-flow` for the business hold journey without 3DS.
- In Passenger wallet, the stable principal action is the visible `button.card-item-opts` on the target card row followed by the popover action `Principal`; the popover also exposes `Eliminar` for delete flows.
- Contractor web flows that depend on hold state must be staged in carrier first; contractor does not own the hold toggle.
- Contractor recorder evidence currently shows that card `4000 0027 6000 3184` triggers 3DS consistently; in contractor and carrier validations, treat that challenge as an operational signal for `hold` being active.
- The same contractor recorder also shows `Nuevo Viaje` after login, so the shared dashboard shell and `NewTravelPageBase` can be reused when the runtime and recording agree.

## Session Bootstrap
1. Load `AGENTS.md`.
2. Load `CLAUDE.md`.
3. Load this guide.
4. Load the task prompt and source documents.
5. Ask Gemini for normalized JSON or concise markdown before editing.
6. Pass normalized output to Codex for code generation.
7. If the implementation is missing selector or interaction evidence, request the relevant Playwright recorder trace from `tests/features/gateway-pg/recorded/*.recorded.ts` before coding.

## Agent Map

| Agente | Modelo | Función |
| --- | --- | --- |
| `orquestador` | Gemini 3.1 Pro | Inicia contexto del repo, lee docs extensos, arma primera pasada normalizada. |
| `analista-docs` | Gemini 3.1 Pro | Matrices QA, xlsx, normalización y entrada con trazabilidad. |
| `priorizador-flujos` | Gemini 3.1 Pro | Ranking P1/P2, priorización de backlog, reducción de duplicados. |
| `generador-drafts` | Codex GPT-5.x | Specs Playwright, page objects, fixtures y datos. |
| `colaborador-appium` | Codex GPT-5.x | Borradores Appium, handoff mobile y flujos híbridos. |

## Routing By Task
| Task | Preferred Tool |
| --- | --- |
| Bootstrap repo context for a new session | Gemini |
| Analyze QA docs and build backlog artifacts | Gemini |
| Normalize large matrices or long-form documentation | Gemini |
| Prioritize critical flows and coverage gaps | Gemini |
| Analyze a Playwright recorder trace when docs are not enough | Gemini |
| Prepare carrier hold preconditions for contractor web | Codex or a carrier-focused Playwright run |
| Implement or refine contractor portal web specs | Codex |
| Generate Playwright specs, page objects, fixtures, or data | Codex |
| Refactor an existing file | Codex |
| Handle Appium or hybrid web -> mobile flows | Codex |
| Continue App Driver flow 2 | Paused; do not prioritize until reactivated |
| Resolve a hard ambiguity or tie-breaker | Claude Sonnet 4.6 |
| Debug failing GitHub Actions | Claude Code if available, otherwise the repo's CI-fix workflow |

## Canonical Contracts
- `CLAUDE.md`
- `AGENTS.md`
- `docs/codex-prompts/README.md`
- `docs/gateway-pg/stripe/ARCHITECTURE.md`
- `tests/config/runtime.ts`
- `tests/config/aiRuntime.ts`
- `global-setup.multi-role.ts`
- `tests/shared/utils/geminiClient.ts`
- `tests/coverage/`
- `docs/codex-prompts/implement-contractor-specs-by-recording.md`

## Output Discipline
- Keep traceability from source case ID to spec, page object, fixture, and coverage row.
- Keep mobile and web coverage separate.
- Use `tests/coverage/` for manual matrix coverage and `tests/specs/` for implementation drafts.
- Treat recorder traces as evidence for selector order, interactions, and screen transitions when docs are incomplete.

## Notes
- If a task starts to exceed the available context, split it into smaller prompts rather than forcing a bigger conversation.
- Contractor web is the active lane; treat App Driver work as paused until a task explicitly reactivates it.
- When contractor needs new selectors or visual evidence, ask for a recorder that covers login, card linking, and travel creation before coding the spec.
- If the contractor session opens on the carrier shell because of cached state, the recorder should include logout/clean bootstrap before the contractor login.

## Validated Bootstrap Pattern
- `tests/config/runtime.ts` is the source of truth for role-aware `loginPath` and `dashboardPattern`.
- `tests/pages/shared/LoginPage.ts` should be treated as the canonical login bootstrap; it now waits for `domcontentloaded` instead of a full load event.
- `tests/pages/carrier/DashboardPage.ts` validates the portal shell first and then the CTA anchor when that CTA exists for the role.
- For carrier + contractor global setup, prefer `waitForURL(roleConfig.dashboardPattern)` over hardcoded `/dashboard`.
- If contractor does not expose the carrier CTA, do not force `Nuevo Viaje` into the bootstrap contract.
- Use carrier to set up hold on/off before contractor cases that depend on that state.
- With the contractor recorder `tests/test-7.spec.ts`, the 3DS challenge becomes part of the validation signal: hold ON should surface it during travel creation; hold OFF should not, even if the test card is always-authenticate.
- The contractor recorder also proves that the travel form is aligned with the carrier shell, so prioritize shared POMs before adding contractor-only wrappers.

## Continuous Improvement
- When a run validates a better shell, locator, or wait condition, feed that finding back into `AGENTS.md`, the relevant skill, and the prompt README in the same cycle.
- If a flow fails because of auth/bootstrap rather than business logic, treat it as a contract update opportunity before reworking the spec draft.
