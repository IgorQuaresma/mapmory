import { useEffect } from 'react';
import { api, isApiError } from '../api';
import { deleteDraft, putDraft } from '../lib/drafts';
import { useEditor } from './editor';

export const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Saves the design 1.5 s after the last change, with `If-Match` (plan §6.3). On a revision conflict the
 * client rebases onto the server revision and re-sends (this tab's latest edit wins); network failures
 * switch to "offline" and retry when the browser comes back online. A local IndexedDB copy is kept
 * until the server has the change.
 */
export function createAutosaver(store = useEditor, client = api, debounceMs = AUTOSAVE_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const save = async (): Promise<void> => {
    if (inFlight) {
      await inFlight;
      if (!store.getState().save.dirty) return;
    }
    const { projectId, design, revision } = store.getState();
    if (!projectId || !design || !store.getState().save.dirty) return;
    store.getState().setSave({ status: 'saving' });
    inFlight = (async () => {
      let rev = revision;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await client.saveDesign(projectId, design, rev);
          const stillSame = store.getState().design === design;
          store.getState().setRevision(res.revision);
          store.getState().setSave({ status: 'saved', dirty: !stillSame, lastSavedAt: Date.now() });
          if (stillSame) void deleteDraft(projectId);
          else schedule();
          return;
        } catch (e) {
          if (isApiError(e, 'revision_conflict') && attempt === 0 && typeof e.body.revision === 'number') {
            rev = e.body.revision;
            store.getState().setRevision(rev);
            store.getState().setSave({ rebased: true });
            continue;
          }
          if (isApiError(e, 'network_error') || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
            store.getState().setSave({ status: 'offline' });
          } else {
            store.getState().setSave({ status: 'error' });
          }
          return;
        }
      }
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, debounceMs);
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.design === prev.design || !state.design || !state.projectId) return;
    if (state.projectId !== prev.projectId) return; // a fresh load is not a change
    schedule();
    if (draftTimer) clearTimeout(draftTimer);
    const { projectId, design, revision } = state;
    draftTimer = setTimeout(() => void putDraft({ projectId, design, baseRevision: revision, updatedAt: Date.now() }), 300);
  });

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return save();
  };

  return {
    flush,
    dispose: () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      if (draftTimer) clearTimeout(draftTimer);
    },
  };
}

/** Lets other UI (e.g. the Export button) wait until pending changes are on the server. */
export const autosaveControl = { flush: async (): Promise<void> => {} };

export function useAutosave() {
  useEffect(() => {
    const saver = createAutosaver();
    autosaveControl.flush = saver.flush;
    const onOnline = () => void saver.flush();
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saver.flush();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onHide);
      void saver.flush();
      saver.dispose();
      autosaveControl.flush = async () => {};
    };
  }, []);
}
