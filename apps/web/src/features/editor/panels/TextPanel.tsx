import { FONT_IDS, MAX_TEXTS, TEXT_SLOTS, type DesignText, type FontId, type TextSlot } from '@mapmory/design-schema';
import { FONT_CATALOG, clampWeight } from '@mapmory/fonts';
import { computeLayout, duToPt, preflight, ptToDu, type PreflightIssue } from '@mapmory/poster-core';
import { createCanvasMeasure, loadDesignFonts } from '@mapmory/poster-react';
import { getTheme } from '@mapmory/themes';
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Eye, EyeOff, Plus, Trash2, TriangleAlert } from '../../../components/icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ColorField, Field, IconButton, Select, Slider, Switch, TextInput, ToggleGroup, cx } from '../../../components/ui';
import { useDesign, useEditor } from '../../../store/editor';
import { addFreeText, clampToPage, gesture, replaceDesign, updateText } from '../actions';

/** Preflight issues for the current design, measured with real font metrics once fonts are loaded. */
export function usePreflight() {
  const design = useDesign();
  const [measure, setMeasure] = useState<ReturnType<typeof createCanvasMeasure> | undefined>();
  useEffect(() => {
    let alive = true;
    void loadDesignFonts(design.texts).then(() => alive && setMeasure(() => createCanvasMeasure()));
    return () => {
      alive = false;
    };
    // Re-measure only when fonts change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.texts.map((t) => `${t.fontId}${t.weight}${t.italic}`).join()]);
  return useMemo(() => preflight(design, undefined, measure), [design, measure]);
}

export function TextPanel() {
  const { t } = useTranslation();
  const design = useDesign();
  const issues = usePreflight();
  const selectedTextId = useEditor((s) => s.ui.selectedTextId);
  const [open, setOpen] = useState<string | null>(selectedTextId ?? design.texts[0]?.id ?? null);
  // Selecting a free text on the poster opens its card.
  const [prevSelected, setPrevSelected] = useState(selectedTextId);
  if (selectedTextId !== prevSelected) {
    setPrevSelected(selectedTextId);
    if (selectedTextId) setOpen(selectedTextId);
  }

  const add = () => {
    const theme = getTheme(design.map.themeId);
    const body = theme.typography.body;
    const id = addFreeText({
      content: t('editor.text.newText'), fontId: body.fontId, weight: clampWeight(body.fontId, body.weight), italic: false, sizeDu: 18,
      letterSpacing: body.letterSpacing, uppercase: body.uppercase, color: theme.textColor, align: 'center',
    });
    if (id) setOpen(id);
  };

  return (
    <div className="flex flex-col gap-3">
      {design.texts.map((text) => (
        <TextCard
          key={text.id}
          text={text}
          open={open === text.id}
          onToggle={() => setOpen(open === text.id ? null : text.id)}
          issues={issues.filter((i) => i.target === text.id)}
        />
      ))}
      <Button variant="secondary" size="sm" className="w-fit" onClick={add} disabled={design.texts.length >= MAX_TEXTS}>
        <Plus aria-hidden className="size-4" />
        {t('editor.text.add')}
      </Button>
    </div>
  );
}

function TextCard({ text, open, onToggle, issues }: { text: DesignText; open: boolean; onToggle: () => void; issues: PreflightIssue[] }) {
  const { t } = useTranslation();
  const design = useDesign();
  const page = design.page;
  const font = FONT_CATALOG[text.fontId];
  const weights = useMemo(() => {
    const out: number[] = [];
    for (let w = font.weights.min; w <= font.weights.max; w += 100) out.push(w);
    return out;
  }, [font]);
  const max = text.role === 'title' ? 120 : 200;
  const ptMin = Math.ceil(duToPt(page, 6) * 2) / 2;
  const ptMax = Math.floor(duToPt(page, 200));
  const set = (patch: Partial<DesignText>) => updateText(text.id, patch);
  const sameSlot = design.texts.filter((x) => x.slot === text.slot).sort((a, b) => a.order - b.order);
  const move = (dir: -1 | 1) => {
    const idx = sameSlot.findIndex((x) => x.id === text.id);
    const target = idx + dir;
    if (target < 0 || target >= sameSlot.length) return;
    const ids = sameSlot.map((x) => x.id);
    [ids[idx], ids[target]] = [ids[target]!, ids[idx]!];
    replaceDesign((d) => ({
      ...d,
      texts: d.texts.map((x) => (x.slot === text.slot ? { ...x, order: ids.indexOf(x.id) } : x)),
    }));
  };
  const headingId = `text-card-${text.id}`;
  const free = text.slot === 'free';
  /** Switching to "anywhere" starts from where the text is currently laid out (centre of its line box). */
  const setSlot = (slot: TextSlot) => {
    if (slot !== 'free') return set({ slot });
    const laid = computeLayout(design).texts.find((x) => x.id === text.id);
    set({ slot, freePosition: text.freePosition ?? clampToPage(design, laid ? [laid.x, laid.y + laid.lineHeightDu / 2] : [500, 500]) });
  };
  /** Keyboard/button alternative to dragging on the poster (WCAG 2.5.7). */
  const nudge = (dx: number, dy: number) => {
    const p = useEditor.getState().design!.texts.find((x) => x.id === text.id)?.freePosition;
    if (p) set({ freePosition: clampToPage(design, [p[0] + dx * 10, p[1] + dy * 10]) });
  };

  return (
    <section className="rounded-xl border border-line bg-white" aria-labelledby={headingId} data-testid={`text-card-${text.id}`}>
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          id={headingId}
          aria-expanded={open}
          aria-controls={`${headingId}-body`}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sand"
        >
          <ChevronDown aria-hidden className={cx('size-4 shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">{t(`editor.text.roles.${text.role}`)}</span>
            <span className={cx('block truncate text-sm', !text.visible && 'text-ink-soft line-through')}>{text.content || '—'}</span>
          </span>
          {issues.some((i) => i.severity !== 'info') && <TriangleAlert aria-label={t('editor.text.hasWarnings')} className="size-4 shrink-0 text-warn" />}
        </button>
        <IconButton label={text.visible ? t('editor.text.hide') : t('editor.text.show')} aria-pressed={!text.visible} onClick={() => set({ visible: !text.visible })}>
          {text.visible ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
        </IconButton>
        {text.role === 'custom' && (
          <IconButton label={t('editor.text.delete')} onClick={() => replaceDesign((d) => ({ ...d, texts: d.texts.filter((x) => x.id !== text.id) }))}>
            <Trash2 aria-hidden className="size-4" />
          </IconButton>
        )}
      </div>
      {open && (
        <div id={`${headingId}-body`} className="flex flex-col gap-4 border-t border-line p-4">
          {issues.map((i) => (
            <p key={i.code} className="flex items-start gap-2 text-xs font-medium text-warn" role="status">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t(`preflight.${i.code}`)}
            </p>
          ))}
          <Field label={t('editor.text.content')} hint={`${text.content.length}/${max}`}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={text.content}
                maxLength={max}
                onFocus={gesture.start}
                onBlur={gesture.end}
                // Control characters are rejected by the schema; strip them while typing.
                onChange={(e) => set({ content: e.target.value.replace(/[\p{Cc}\p{Cs}]/gu, '') })}
                data-testid={`text-input-${text.id}`}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('editor.text.font')}>
              {({ id }) => (
                <Select<FontId>
                  id={id}
                  value={text.fontId}
                  onChange={(fontId) => set({ fontId, weight: clampWeight(fontId, text.weight) })}
                  options={FONT_IDS.map((f) => ({ value: f, label: <span style={{ fontFamily: `'${FONT_CATALOG[f].family}'` }}>{FONT_CATALOG[f].family.replace('Mapmory ', '')}</span> }))}
                />
              )}
            </Field>
            <Field label={t('editor.text.weight')}>
              {({ id }) => (
                <Select<string>
                  id={id}
                  value={String(text.weight)}
                  onChange={(w) => set({ weight: Number(w) })}
                  options={weights.map((w) => ({ value: String(w), label: t(`weights.${w}`) }))}
                />
              )}
            </Field>
          </div>
          <Slider
            label={t('editor.text.size')}
            value={Math.round(duToPt(page, text.sizeDu) * 2) / 2}
            min={ptMin}
            max={ptMax}
            step={0.5}
            format={(v) => `${v} pt`}
            onChange={(pt) => set({ sizeDu: Math.min(200, Math.max(6, Number(ptToDu(page, pt).toFixed(2)))) })}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
          />
          <ColorField label={t('editor.text.color')} value={text.color} onChange={(color) => set({ color })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
          <ToggleGroup<DesignText['align']>
            label={t('editor.text.align')}
            value={text.align}
            onChange={(align) => set({ align })}
            options={[
              { value: 'left', title: t('editor.text.alignLeft'), label: <AlignLeft aria-hidden className="size-4" /> },
              { value: 'center', title: t('editor.text.alignCenter'), label: <AlignCenter aria-hidden className="size-4" /> },
              { value: 'right', title: t('editor.text.alignRight'), label: <AlignRight aria-hidden className="size-4" /> },
            ]}
          />
          <Slider
            label={t('editor.text.letterSpacing')}
            value={text.letterSpacing}
            min={-0.1}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(letterSpacing) => set({ letterSpacing })}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
          />
          <div className="grid grid-cols-2 gap-3">
            <Switch label={t('editor.text.uppercase')} checked={text.uppercase} onChange={(uppercase) => set({ uppercase })} />
            <Switch label={t('editor.text.italic')} checked={text.italic} onChange={(italic) => set({ italic })} />
          </div>
          <Field label={t('editor.text.slot')}>
            {({ id }) => (
              <Select<TextSlot> id={id} value={text.slot} onChange={setSlot} options={TEXT_SLOTS.map((s) => ({ value: s, label: t(`slots.${s}`) }))} />
            )}
          </Field>
          {free ? (
            <>
              <Slider
                label={t('editor.text.rotation')}
                value={text.rotationDeg}
                min={-90}
                max={90}
                format={(v) => `${v}°`}
                onChange={(rotationDeg) => set({ rotationDeg })}
                onGestureStart={gesture.start}
                onGestureEnd={gesture.end}
              />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t('editor.text.position')}</span>
                <p className="text-xs text-ink-soft">{t('editor.text.dragHint')}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <IconButton variant="secondary" size="sm" label={t('editor.text.nudgeLeft')} onClick={() => nudge(-1, 0)}>
                    <ArrowLeft aria-hidden className="size-4" />
                  </IconButton>
                  <IconButton variant="secondary" size="sm" label={t('editor.text.nudgeUp')} onClick={() => nudge(0, -1)}>
                    <ArrowUp aria-hidden className="size-4" />
                  </IconButton>
                  <IconButton variant="secondary" size="sm" label={t('editor.text.nudgeDown')} onClick={() => nudge(0, 1)}>
                    <ArrowDown aria-hidden className="size-4" />
                  </IconButton>
                  <IconButton variant="secondary" size="sm" label={t('editor.text.nudgeRight')} onClick={() => nudge(1, 0)}>
                    <ArrowRight aria-hidden className="size-4" />
                  </IconButton>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('editor.text.order')}</span>
                <IconButton variant="secondary" size="sm" label={t('editor.text.moveUp')} onClick={() => move(-1)}>
                  <ArrowUp aria-hidden className="size-4" />
                </IconButton>
                <IconButton variant="secondary" size="sm" label={t('editor.text.moveDown')} onClick={() => move(1)}>
                  <ArrowDown aria-hidden className="size-4" />
                </IconButton>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Slider
                  label={t('editor.text.offsetX')}
                  value={text.offsetDu[0]}
                  min={-200}
                  max={200}
                  onChange={(x) => set({ offsetDu: [x, useEditor.getState().design!.texts.find((y) => y.id === text.id)!.offsetDu[1]] })}
                  onGestureStart={gesture.start}
                  onGestureEnd={gesture.end}
                />
                <Slider
                  label={t('editor.text.offsetY')}
                  value={text.offsetDu[1]}
                  min={-200}
                  max={200}
                  onChange={(y) => set({ offsetDu: [useEditor.getState().design!.texts.find((x) => x.id === text.id)!.offsetDu[0], y] })}
                  onGestureStart={gesture.start}
                  onGestureEnd={gesture.end}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
