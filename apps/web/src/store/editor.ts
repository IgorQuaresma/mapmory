import { DesignSchema, type Design } from '@mapmory/design-schema';
import { temporal, type TemporalState } from 'zundo';
import { create, useStore } from 'zustand';

export type PanelId = 'race' | 'style' | 'area' | 'markers' | 'routes' | 'photos' | 'text' | 'layout';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export interface UiState {
  panel: PanelId;
  selectedMarkerId: string | null;
  selectedPhotoId: string | null;
  /** A freely placed text selected on the poster (opens its card in the Text panel). */
  selectedTextId: string | null;
  /** The race leg whose panel is highlighted (Race panel and preview). */
  selectedLegId: string | null;
  showGuides: boolean;
  mapLocked: boolean;
  /** Preview zoom relative to "fit" (1 = fit to available space). */
  previewZoom: number;
  mobilePanelOpen: boolean;
}

export interface SaveState {
  status: SaveStatus;
  dirty: boolean;
  lastSavedAt: number | null;
  /** Set when a save hit a revision conflict and was rebased onto the server revision. */
  rebased: boolean;
}

export interface EditorState {
  projectId: string | null;
  revision: number;
  design: Design | null;
  ui: UiState;
  save: SaveState;
  load: (projectId: string, design: Design, revision: number) => void;
  /** Applies a change; it is validated against the schema and ignored if invalid. Returns success. */
  update: (recipe: (d: Design) => Design) => boolean;
  /** Starts a continuous edit (slider drag, map pan, colour picker): history records one entry. */
  beginGesture: () => void;
  endGesture: () => void;
  setUi: (patch: Partial<UiState>) => void;
  setSave: (patch: Partial<SaveState>) => void;
  setRevision: (revision: number) => void;
  reset: () => void;
}

export const HISTORY_LIMIT = 100;

const initialUi: UiState = {
  panel: 'style',
  selectedMarkerId: null,
  selectedPhotoId: null,
  selectedTextId: null,
  selectedLegId: null,
  showGuides: false,
  mapLocked: false,
  previewZoom: 1,
  mobilePanelOpen: false,
};
const initialSave: SaveState = { status: 'idle', dirty: false, lastSavedAt: null, rebased: false };

let gestureDepth = 0;
let gestureStart: Design | null = null;

export const useEditor = create<EditorState>()(
  temporal(
    (set, get) => ({
      projectId: null,
      revision: 0,
      design: null,
      ui: initialUi,
      save: initialSave,

      load: (projectId, design, revision) => {
        const t = useEditor.temporal.getState();
        t.pause();
        // Race posters open on the Race panel, where the activity import is.
        set({ projectId, design, revision, ui: { ...initialUi, panel: design.sport ? 'race' : 'style' }, save: { ...initialSave, status: 'saved' } });
        t.clear();
        t.resume();
        gestureDepth = 0;
        gestureStart = null;
      },

      update: (recipe) => {
        const current = get().design;
        if (!current) return false;
        const next = recipe(current);
        if (next === current) return true;
        const result = DesignSchema.safeParse(next);
        if (!result.success) {
          if (import.meta.env.DEV) console.warn('Rejected invalid design change', result.error.issues);
          return false;
        }
        set({ design: next, save: { ...get().save, dirty: true } });
        return true;
      },

      beginGesture: () => {
        if (gestureDepth++ === 0) {
          gestureStart = get().design;
          useEditor.temporal.getState().pause();
        }
      },

      endGesture: () => {
        if (gestureDepth === 0) return;
        if (--gestureDepth > 0) return;
        const t = useEditor.temporal;
        t.getState().resume();
        const start = gestureStart;
        gestureStart = null;
        if (start && start !== get().design) {
          t.setState((s) => ({
            pastStates: [...s.pastStates, { design: start }].slice(-HISTORY_LIMIT),
            futureStates: [],
          }));
        }
      },

      setUi: (patch) => set({ ui: { ...get().ui, ...patch } }),
      setSave: (patch) => set({ save: { ...get().save, ...patch } }),
      setRevision: (revision) => set({ revision }),
      reset: () => {
        const t = useEditor.temporal.getState();
        t.pause();
        set({ projectId: null, design: null, revision: 0, ui: initialUi, save: initialSave });
        t.clear();
        t.resume();
      },
    }),
    {
      limit: HISTORY_LIMIT,
      // History covers the design only — UI state (selection, panels) is never undone (plan §6.3).
      partialize: (s) => ({ design: s.design }),
      equality: (a, b) => a.design === b.design,
    },
  ),
);

export function useHistory<T>(selector: (s: TemporalState<{ design: Design | null }>) => T): T {
  return useStore(useEditor.temporal, selector);
}

export const undo = () => useEditor.temporal.getState().undo();
export const redo = () => useEditor.temporal.getState().redo();

/** Shorthand for components: current design (non-null inside the editor). */
export function useDesign(): Design {
  const d = useEditor((s) => s.design);
  if (!d) throw new Error('useDesign() used outside a loaded editor');
  return d;
}
