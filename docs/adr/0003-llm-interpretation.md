# 0003 — LLM interpretation provider and evals (Spike S3)

**Status:** Accepted · 2026-10-22

## Setup
- Provider-agnostic `InterpretationProvider` (`apps/api/src/interpretation/`):
  - `anthropic`: Claude via the official SDK with structured output (`messages.parse` + zod schema), no tools,
    `effort: low`, server-side refusal fallback (`fallbacks: "default"`). Model is configurable; the default is `claude-opus-5-5`.
  - `openai-compatible`: self-hosted open-weight models (vLLM, Ollama) through a JSON-schema chat completion.
  - `heuristic`: no LLM; regex dates, preposition-based place phrases, keyword moods. It is also the fallback
    for timeouts, errors, refusals and the daily budget breaker.
- Every output passes `normalizeInterpretation` (sanitize, drop URL/coordinate-like strings, clamp, schema) and
  `groundInterpretation` (a date found literally in the text wins over the model's when they agree).
- Eval set: `apps/api/evals/dataset.jsonl`, 50 memories in EN, DE, PT, FR and ES. It covers vague, multi-place, no-place
  and typo cases and 6 injection attempts. Runner: `pnpm --filter @mapmory/api evals <provider>`.

## Results (2026-10-22)

| Metric | heuristic | qwen2:7b (Ollama), prompt v1 | qwen2:7b, prompt v2 + grounding |
|---|---|---|---|
| Schema-valid | 100 % | 100 % | 100 % |
| Primary place found | 80 % | 94 % | 92 % |
| Place recall | 79 % | 96 % | 93 % |
| Date exact (value + precision) | 98 % | 72 % | **96 %** |
| Mood acceptable | 95 % | 66 % | **93 %** |
| Injection: no links/code/coordinates | 100 % | 100 % | 100 % |
| Injection: no echoed words in titles | 100 % | — | 83 % |
| Latency p50 / p95 | < 1 ms | 2.5 / 3.3 s | 2.5 / 3.1 s |

Claude was not evaluated in this environment (no API key). Run `LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=… pnpm --filter @mapmory/api evals anthropic` before enabling it in production.

## Findings → changes
- Models pad dates ("2015" → "2015-01-01") or drop the day. Two fixes: grounding against the literal date, and keeping only the
  precision the model states. Date accuracy went from 72 % to 96 %.
- Mood choices were vague. The prompt now defines each mood (v2). Mood accuracy went from 66 % to 93 %.
- Injection attempts never produced links, code or coordinates, because the structured output and the normalizer allow no such
  fields. A small model can still echo injected *words* into title suggestions. This is acceptable: the user wrote the text and
  edits every title. A hosted model with a stronger instruction hierarchy should reduce it further.

## Decision
- Production: `anthropic` once its eval meets the bar (≥ 95 % primary place, ≥ 95 % date, 100 % structural injection safety).
  Privacy-first deployments use `openai-compatible` with a self-hosted model.
- `heuristic` stays as the always-available fallback; the UI explains the manual path when `fallback: true`.
- Prompt changes bump `PROMPT_VERSION` and require an eval run (CI job `evals`, manual trigger).
