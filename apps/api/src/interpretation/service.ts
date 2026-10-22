import type { InterpretResponse } from '@mapmory/design-schema';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import { Counter } from 'prom-client';
import type { Config } from '../config';
import type { Geocoder } from '../geocoding';
import { incrWindow, utcDay } from '../lib/redis';
import { createAnthropicProvider } from './anthropic';
import { createHeuristicProvider } from './heuristic';
import { createOpenAiCompatibleProvider } from './openai-compatible';
import { groundInterpretation } from './ground';
import type { InterpretationProvider } from './provider';

const interpretations = new Counter({
  name: 'mapmory_interpretations_total',
  help: 'Interpretation requests by provider and outcome',
  labelNames: ['provider', 'outcome'] as const,
});

export function createProvider(config: Config): InterpretationProvider | null {
  switch (config.LLM_PROVIDER) {
    case 'anthropic':
      return createAnthropicProvider({ model: config.ANTHROPIC_MODEL, effort: config.ANTHROPIC_EFFORT, timeoutMs: config.LLM_TIMEOUT_MS });
    case 'openai-compatible':
      return createOpenAiCompatibleProvider({ baseUrl: config.OPENAI_COMPAT_BASE_URL, model: config.OPENAI_COMPAT_MODEL, apiKey: config.OPENAI_COMPAT_API_KEY, timeoutMs: config.LLM_TIMEOUT_MS });
    case 'heuristic':
      return null;
  }
}

export interface InterpretationService {
  readonly llmEnabled: boolean;
  interpret(text: string, locale: string): Promise<InterpretResponse>;
}

/**
 * LLM → schema validation → geocoding. On timeout, error, refusal or a tripped budget breaker it falls back to the
 * heuristic and flags `fallback: true` so the UI can explain the manual path (plan §9). Memory text is never logged.
 */
export function createInterpretationService(
  config: Config,
  deps: { redis: Redis; geocoder: Geocoder; log: Pick<FastifyBaseLogger, 'warn'>; provider?: InterpretationProvider | null },
): InterpretationService {
  const llm = deps.provider !== undefined ? deps.provider : createProvider(config);
  const heuristic = createHeuristicProvider();

  return {
    llmEnabled: llm !== null,
    async interpret(text, locale) {
      let interpretation;
      let fallback = true;
      if (llm) {
        const calls = await incrWindow(deps.redis, `llm:calls:${utcDay()}`, 86400);
        if (calls > config.LLM_DAILY_CALL_BUDGET) {
          interpretations.inc({ provider: llm.name, outcome: 'budget_exhausted' });
          deps.log.warn({ calls }, 'LLM daily budget exhausted; using heuristic fallback');
        } else {
          try {
            interpretation = groundInterpretation(text, await llm.interpret(text, locale));
            fallback = false;
            interpretations.inc({ provider: llm.name, outcome: 'ok' });
          } catch (err) {
            interpretations.inc({ provider: llm.name, outcome: 'error' });
            deps.log.warn({ err: { name: (err as Error).name, message: (err as Error).message } }, 'LLM interpretation failed; using heuristic');
          }
        }
      }
      if (!interpretation) {
        interpretation = await heuristic.interpret(text, locale);
        interpretations.inc({ provider: 'heuristic', outcome: 'ok' });
      }

      const lang = locale.slice(0, 2);
      const places = await Promise.all(
        interpretation.places.map(async (p) => ({
          query: p.query,
          role: p.role,
          candidates: await deps.geocoder.search(p.query, { lang, limit: 5 }).catch(() => []),
        })),
      );
      return { interpretation, places, fallback };
    },
  };
}
