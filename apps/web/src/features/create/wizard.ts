import type { DraftSport, GeocodeResult, InterpretResponse, Interpretation, Mood } from '@mapmory/design-schema';
import { detectRace } from '@mapmory/poster-core';
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
  /** A race found in the memory text (in the browser, nothing is sent), or entered by the user. */
  race: DraftSport | null;
  /** Make a race poster (one map per leg) from `race`. */
  raceOn: boolean;
  setMemoryText: (v: string) => void;
  setResult: (r: InterpretResponse) => void;
  startManual: (unavailable?: boolean) => void;
  patch: (p: Partial<Pick<WizardState, 'places' | 'title' | 'date' | 'mood' | 'keepMemoryText' | 'race' | 'raceOn'>>) => void;
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
  race: null as DraftSport | null,
  raceOn: false,
};

/** Wizard state survives reloads within the tab (sessionStorage only — memories are not stored locally). */
export const useWizard = create<WizardState>()(
  persist(
    (set, get) => ({
      ...empty,
      setMemoryText: (memoryText) => set({ memoryText }),
      setResult: (result) => {
        const race = detectRace(get().memoryText);
        set({
          result,
          manual: false,
          unavailable: result.fallback,
          places: result.places.map((p) => p.candidates[0]).filter((c): c is GeocodeResult => !!c),
          // A race poster is titled with the event as the user wrote it ("Ironman Frankfurt").
          title: race?.name ?? result.interpretation.titleIdeas[0] ?? '',
          date: result.interpretation.date,
          mood: result.interpretation.mood,
          race,
          raceOn: race !== null,
        });
      },
      startManual: (unavailable = false) =>
        set({ result: null, manual: true, unavailable, places: [], title: '', date: { iso: null, precision: 'unknown' }, race: null, raceOn: false }),
      patch: (p) => set(p),
      clear: () => set(empty),
    }),
    { name: 'mapmory-wizard', storage: createJSONStorage(() => sessionStorage) },
  ),
);
