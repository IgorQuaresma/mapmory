import type { GeocodeResult, InterpretResponse, Interpretation, Mood } from '@mapmory/design-schema';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface WizardState {
  memoryText: string;
  result: InterpretResponse | null;
  /** Manual path: no interpretation (user skipped, or the LLM was unavailable). */
  manual: boolean;
  unavailable: boolean;
  places: GeocodeResult[];
  title: string;
  date: Interpretation['date'];
  mood: Mood;
  keepMemoryText: boolean;
  setMemoryText: (v: string) => void;
  setResult: (r: InterpretResponse) => void;
  startManual: (unavailable?: boolean) => void;
  patch: (p: Partial<Pick<WizardState, 'places' | 'title' | 'date' | 'mood' | 'keepMemoryText'>>) => void;
  clear: () => void;
}

const empty = {
  memoryText: '',
  result: null,
  manual: false,
  unavailable: false,
  places: [] as GeocodeResult[],
  title: '',
  date: { iso: null, precision: 'unknown' } as Interpretation['date'],
  mood: 'neutral' as Mood,
  keepMemoryText: false,
};

/** Wizard state survives reloads within the tab (sessionStorage only — memories are not stored locally). */
export const useWizard = create<WizardState>()(
  persist(
    (set) => ({
      ...empty,
      setMemoryText: (memoryText) => set({ memoryText }),
      setResult: (result) =>
        set({
          result,
          manual: false,
          unavailable: result.fallback,
          places: result.places.map((p) => p.candidates[0]).filter((c): c is GeocodeResult => !!c),
          title: result.interpretation.titleIdeas[0] ?? '',
          date: result.interpretation.date,
          mood: result.interpretation.mood,
        }),
      startManual: (unavailable = false) => set({ result: null, manual: true, unavailable, places: [], title: '', date: { iso: null, precision: 'unknown' } }),
      patch: (p) => set(p),
      clear: () => set(empty),
    }),
    { name: 'mapmory-wizard', storage: createJSONStorage(() => sessionStorage) },
  ),
);
