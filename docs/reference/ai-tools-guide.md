# MAGIIS AI Tools Guide

## Purpose
Routing guide for Antigravity-managed agent work in this repo. Use Gemini for context-heavy analysis and backlog assembly, Codex for code changes, and Claude Sonnet or Claude Code only as optional fallbacks when available.

## Current Stack
- Antigravity: session admin and multi-step task orchestration.
- Gemini 3.1 Pro: long-context analysis, docs normalization, backlog prioritization, and context bootstrapping.
- Codex GPT-5.x: code generation, refactors, and file edits.
- Claude Sonnet 4.6: optional second-pass reasoning for hard tradeoffs.
- Claude Code: optional fallback for local execution and review.

## Session Bootstrap
1. Load `AGENTS.md`.
2. Load `CLAUDE.md`.
3. Load this guide.
4. Load the task prompt and source documents.
5. Ask Gemini for normalized JSON or concise markdown before editing.
6. Pass normalized output to Codex for code generation.
7. If the implementation is missing selector or interaction evidence, request the relevant Playwright recorder trace from `tests/features/gateway-pg/recorded/*.recorded.ts` before coding.

## Agent Map
| Agent | Model | Best For |
| --- | --- | --- |
| `playwright-docs-orchestrator` | Gemini 3.1 Pro | Boots repo context, reads large docs, and assembles the first normalized pass. |
| `qa-doc-analyst` | Gemini 3.1 Pro | Large QA docs, xlsx matrices, and normalization. |
| `critical-flow-prioritizer` | Gemini 3.1 Pro | P1/P2 ranking, backlog prioritization, and duplicate reduction. |
| `playwright-draft-generator` | Codex GPT-5.x | Playwright specs, page objects, fixtures, and data drafts. |
| `appium-hybrid-collaborator` | Codex GPT-5.x | Appium drafts, mobile handoff, and hybrid flows. |

## Routing By Task
| Task | Preferred Tool |
| --- | --- |
| Bootstrap repo context for a new session | Gemini |
| Analyze QA docs and build backlog artifacts | Gemini |
| Normalize large matrices or long-form documentation | Gemini |
| Prioritize critical flows and coverage gaps | Gemini |
| Analyze a Playwright recorder trace when docs are not enough | Gemini |
| Generate Playwright specs, page objects, fixtures, or data | Codex |
| Refactor an existing file | Codex |
| Handle Appium or hybrid web -> mobile flows | Codex |
| Resolve a hard ambiguity or tie-breaker | Claude Sonnet 4.6 |
| Debug failing GitHub Actions | Claude Code if available, otherwise the repo's CI-fix workflow |

## Canonical Contracts
- `CLAUDE.md`
- `AGENTS.md`
- `docs/codex-prompts/README.md`
- `docs/gateway-pg/stripe/ARCHITECTURE.md`
- `tests/coverage/`

## Output Discipline
- Keep traceability from source case ID to spec, page object, fixture, and coverage row.
- Keep mobile and web coverage separate.
- Use `tests/coverage/` for manual matrix coverage and `tests/specs/` for implementation drafts.
- Treat recorder traces as evidence for selector order, interactions, and screen transitions when docs are incomplete.

## Notes
- If a task starts to exceed the available context, split it into smaller prompts rather than forcing a bigger conversation.
