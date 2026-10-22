import type { Interpretation } from '@mapmory/design-schema';
import { z } from 'zod';
import { LlmOutputSchema, normalizeInterpretation } from './schema';
import { SYSTEM_PROMPT, userMessage } from './prompt';
import { InterpretationFailedError, type InterpretationProvider } from './provider';

/**
 * Self-hosted open-weight models (vLLM, Ollama) through an OpenAI-compatible chat endpoint, for deployments that
 * keep memory text on their own infrastructure (plan §3, A5).
 */
export function createOpenAiCompatibleProvider(opts: { baseUrl: string; model: string; apiKey?: string; timeoutMs: number }): InterpretationProvider {
  const schema = z.toJSONSchema(LlmOutputSchema);
  return {
    name: `openai-compatible:${opts.model}`,
    async interpret(text: string, locale: string): Promise<Interpretation> {
      const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify({
          model: opts.model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage(text, locale) },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'interpretation', schema, strict: true } },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs),
        redirect: 'error',
      });
      if (!res.ok) throw new InterpretationFailedError(`http_${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new InterpretationFailedError('no_output');
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        throw new InterpretationFailedError('invalid_json');
      }
      return normalizeInterpretation(json, locale);
    },
  };
}
