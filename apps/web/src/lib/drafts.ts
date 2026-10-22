import { migrateDesign, type Design } from '@mapmory/design-schema';

/** Local copy of unsaved changes, so a closed tab or lost connection never loses work (plan §6.3). */
export interface LocalDraft {
  projectId: string;
  design: Design;
  baseRevision: number;
  updatedAt: number;
}

const DB_NAME = 'mapmory';
const STORE = 'drafts';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'projectId' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const putDraft = (d: LocalDraft) => tx('readwrite', (s) => s.put(d));
/** Drafts saved by an older app version are migrated to the current schema; unreadable ones are ignored. */
export const getDraft = (projectId: string) =>
  tx<LocalDraft | undefined>('readonly', (s) => s.get(projectId)).then((r) => {
    if (!r) return null;
    try {
      return { ...r, design: migrateDesign(r.design) };
    } catch {
      return null;
    }
  });
export const deleteDraft = (projectId: string) => tx('readwrite', (s) => s.delete(projectId));
