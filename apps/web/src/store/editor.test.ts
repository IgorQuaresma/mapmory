import { beforeEach, describe, expect, it } from 'vitest';
import { sampleDesign } from '../test/fixtures';
import { HISTORY_LIMIT, redo, undo, useEditor } from './editor';
import { gesture, setPaletteColor, setView, updateText } from '../features/editor/actions';

const state = () => useEditor.getState();
const history = () => useEditor.temporal.getState();

describe('editor store', () => {
  beforeEach(() => state().load('p1', sampleDesign(), 1));

  it('starts with an empty history after load', () => {
    expect(history().pastStates).toHaveLength(0);
    expect(state().save.dirty).toBe(false);
  });

  it('records one history entry per discrete change and undoes/redoes it', () => {
    const original = state().design!.map.palette.roads;
    setPaletteColor('roads', '#FF0000');
    expect(state().design!.map.palette.roads).toBe('#FF0000');
    expect(history().pastStates).toHaveLength(1);
    undo();
    expect(state().design!.map.palette.roads).toBe(original);
    redo();
    expect(state().design!.map.palette.roads).toBe('#FF0000');
  });

  it('groups a gesture (slider drag) into a single entry', () => {
    const startZoom = state().design!.map.zoom;
    gesture.start();
    for (let z = 10; z < 14; z += 0.5) setView({ zoom: z });
    gesture.end();
    expect(history().pastStates).toHaveLength(1);
    expect(state().design!.map.zoom).toBe(13.5);
    undo();
    expect(state().design!.map.zoom).toBe(startZoom);
  });

  it('does not record a history entry for a gesture without changes', () => {
    gesture.start();
    gesture.end();
    expect(history().pastStates).toHaveLength(0);
  });

  it('supports nested gestures (colour picker inside a drag) as one entry', () => {
    gesture.start();
    setPaletteColor('land', '#111111');
    gesture.start();
    setPaletteColor('land', '#222222');
    gesture.end();
    setPaletteColor('land', '#333333');
    gesture.end();
    expect(history().pastStates).toHaveLength(1);
  });

  it('ignores UI changes in history', () => {
    state().setUi({ panel: 'text', showGuides: true });
    expect(history().pastStates).toHaveLength(0);
  });

  it('rejects changes that fail schema validation', () => {
    const before = state().design;
    expect(updateText('title', { content: 'bad\u0000text' })).toBe(false);
    expect(state().design).toBe(before);
    expect(setPaletteColor('roads', 'red')).toBe(false);
    expect(history().pastStates).toHaveLength(0);
  });

  it('caps the history at the configured limit', () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) setView({ zoom: 5 + (i % 10) * 0.1 + i * 0.0001 });
    expect(history().pastStates.length).toBe(HISTORY_LIMIT);
  });

  it('marks the design dirty on change', () => {
    setView({ bearing: 10 });
    expect(state().save.dirty).toBe(true);
  });
});
