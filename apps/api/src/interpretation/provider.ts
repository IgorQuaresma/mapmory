import type { Interpretation } from '@mapmory/design-schema';

export interface InterpretationProvider {
  readonly name: string;
  interpret(text: string, locale: string): Promise<Interpretation>;
}

export class InterpretationFailedError extends Error {}
