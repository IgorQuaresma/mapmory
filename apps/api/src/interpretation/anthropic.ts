import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Interpretation } from '@mapmory/design-schema';
import { LlmOutputSchema, normalizeInterpretation } from './schema';
import { SYSTEM_PROMPT, userMessage } from './prompt';
import { InterpretationFailedError, type InterpretationProvider } from './provider';

export function createAnthropicProvider(opts: { model: string; effort: 'low' | 'medium' | 'high'; timeoutMs: number }): InterpretationProvider {
  // Credentials resolve from the environment (ANTHROPIC_API_KEY or an `ant auth login` profile).
  const client = new Anthropic({ timeout: opts.timeoutMs, maxRetries: 1 });
  return {
    name: `anthropic:${opts.model}`,
    async interpret(text: string, locale: string): Promise<Interpretation> {
      // No tools: the model can only answer in the structured format (plan §8.1).
      // `fallbacks: 'default'` re-runs a safety-classifier refusal on Anthropic's recommended fallback model.
      const response = await client.beta.messages.parse({
        model: opts.model,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage(text, locale) }],
        output_config: { format: betaZodOutputFormat(LlmOutputSchema), effort: opts.effort },
      });
      if (response.stop_reason === 'refusal') throw new InterpretationFailedError('refusal');
      if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new InterpretationFailedError('no_output');
      return normalizeInterpretation(response.parsed_output, locale);
    },
  };
}
