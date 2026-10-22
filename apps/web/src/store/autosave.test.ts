import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import type { ApiClient } from '../api/types';
import { sampleDesign } from '../test/fixtures';
import { createAutosaver } from './autosave';
import { useEditor } from './editor';
import { setView } from '../features/editor/actions';

function fakeClient(impl: ApiClient['saveDesign']) {
  return { saveDesign: vi.fn(impl) } as unknown as ApiClient & { saveDesign: ReturnType<typeof vi.fn> };
}

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEditor.getState().load('p1', sampleDesign(), 3);
  });
  afterEach(() => vi.useRealTimers());

  it('debounces changes into one save with If-Match revision', async () => {
    const client = fakeClient(async (_id, _d, rev) => ({ revision: rev + 1 }));
    const saver = createAutosaver(useEditor, client, 1500);
    setView({ zoom: 10 });
    setView({ zoom: 11 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.saveDesign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(client.saveDesign).toHaveBeenCalledTimes(1);
    expect(client.saveDesign.mock.calls[0]![2]).toBe(3);
    expect(useEditor.getState().revision).toBe(4);
    expect(useEditor.getState().save).toMatchObject({ status: 'saved', dirty: false });
    saver.dispose();
  });

  it('rebases onto the server revision after a 409 conflict', async () => {
    const client = fakeClient(async (_id, _d, rev) => {
      if (rev === 3) throw new ApiError({ status: 409, code: 'revision_conflict', revision: 7 });
      return { revision: rev + 1 };
    });
    const saver = createAutosaver(useEditor, client, 10);
    setView({ zoom: 12 });
    await vi.advanceTimersByTimeAsync(50);
    expect(client.saveDesign).toHaveBeenCalledTimes(2);
    expect(client.saveDesign.mock.calls[1]![2]).toBe(7);
    expect(useEditor.getState().revision).toBe(8);
    expect(useEditor.getState().save.rebased).toBe(true);
    saver.dispose();
  });

  it('goes offline on network errors and retries on flush', async () => {
    let fail = true;
    const client = fakeClient(async (_id, _d, rev) => {
      if (fail) throw new ApiError({ status: 0, code: 'network_error' });
      return { revision: rev + 1 };
    });
    const saver = createAutosaver(useEditor, client, 10);
    setView({ zoom: 9 });
    await vi.advanceTimersByTimeAsync(50);
    expect(useEditor.getState().save.status).toBe('offline');
    fail = false;
    await saver.flush();
    expect(useEditor.getState().save).toMatchObject({ status: 'saved', dirty: false });
    saver.dispose();
  });

  it('does not save on load', async () => {
    const client = fakeClient(async () => ({ revision: 1 }));
    const saver = createAutosaver(useEditor, client, 10);
    useEditor.getState().load('p2', sampleDesign(), 1);
    await vi.advanceTimersByTimeAsync(50);
    expect(client.saveDesign).not.toHaveBeenCalled();
    saver.dispose();
  });
});
