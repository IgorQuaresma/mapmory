import { CORNERS, CUSTOM_PAPER_LIMITS_MM, FRAME_STYLES, PAPER_IDS, PAPER_SIZES, type Corner, type FrameStyle, type PaperId } from '@mapmory/design-schema';
import { changePaper, pageHeightDu } from '@mapmory/poster-core';
import { RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ColorField, Field, SectionTitle, Select, Slider, Switch, TextInput, ToggleGroup } from '../../../components/ui';
import { useDesign, useEditor } from '../../../store/editor';
import { gesture, replaceDesign, updateMap, updatePage } from '../actions';

export function LayoutPanel() {
  const { t } = useTranslation();
  const design = useDesign();
  const showGuides = useEditor((s) => s.ui.showGuides);
  const setUi = useEditor((s) => s.setUi);
  const { page, map } = design;
  const H = pageHeightDu(page);
  const [custom, setCustom] = useState({ w: String(page.trimMm.w), h: String(page.trimMm.h) });
  const [customError, setCustomError] = useState<string | null>(null);

  const setPaper = (paper: PaperId, orientation = page.orientation) => {
    if (paper === 'custom') {
      applyCustom(orientation);
      return;
    }
    replaceDesign((d) => changePaper(d, paper, orientation));
  };
  const applyCustom = (orientation = page.orientation) => {
    const w = Number(custom.w);
    const h = Number(custom.h);
    const { min, max } = CUSTOM_PAPER_LIMITS_MM;
    if (!(w >= min && w <= max && h >= min && h <= max)) {
      setCustomError(t('editor.layout.customRange', { min, max }));
      return;
    }
    setCustomError(null);
    replaceDesign((d) => changePaper(d, 'custom', orientation, { w, h }));
  };
  const inset = (side: keyof typeof map.insetDu, v: number) =>
    updateMap({ insetDu: { ...useEditor.getState().design!.map.insetDu, [side]: v } });
  const frame = (patch: Partial<typeof page.frame>) => updatePage({ frame: { ...useEditor.getState().design!.page.frame, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.layout.paper')}</SectionTitle>
        <Field label={t('editor.layout.size')}>
          {({ id }) => (
            <Select<PaperId>
              id={id}
              value={page.paper}
              onChange={(p) => setPaper(p)}
              options={PAPER_IDS.map((p) => ({ value: p, label: p === 'custom' ? t('editor.layout.custom') : PAPER_SIZES[p].label }))}
            />
          )}
        </Field>
        {page.paper === 'custom' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('editor.layout.widthMm')}>
                {({ id }) => <TextInput id={id} inputMode="decimal" value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} onBlur={() => applyCustom()} />}
              </Field>
              <Field label={t('editor.layout.heightMm')}>
                {({ id }) => <TextInput id={id} inputMode="decimal" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} onBlur={() => applyCustom()} />}
              </Field>
            </div>
            {customError && <p role="alert" className="text-xs font-medium text-bad">{customError}</p>}
          </div>
        )}
        <ToggleGroup<'portrait' | 'landscape'>
          label={t('editor.layout.orientation')}
          value={page.orientation}
          onChange={(o) => setPaper(page.paper, o)}
          options={[
            { value: 'portrait', label: <><RectangleVertical aria-hidden className="size-4" />{t('editor.layout.portrait')}</> },
            { value: 'landscape', label: <><RectangleHorizontal aria-hidden className="size-4" />{t('editor.layout.landscape')}</> },
          ]}
        />
        <p className="text-xs text-ink-soft">{t('editor.layout.sizeNote')}</p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.layout.spacing')}</SectionTitle>
        <Slider label={t('editor.layout.margin')} value={page.marginDu} min={0} max={250} onChange={(marginDu) => updatePage({ marginDu })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
        <Slider label={t('editor.layout.mapTop')} value={map.insetDu.top} min={0} max={Math.min(1200, Math.floor(H - map.insetDu.bottom - 120))} onChange={(v) => inset('top', v)} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
        <Slider label={t('editor.layout.mapBottom')} value={map.insetDu.bottom} min={0} max={Math.min(1200, Math.floor(H - map.insetDu.top - 120))} onChange={(v) => inset('bottom', v)} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
        <Slider label={t('editor.layout.mapSides')} value={map.insetDu.left} min={0} max={400} onChange={(v) => updateMap({ insetDu: { ...useEditor.getState().design!.map.insetDu, left: v, right: v } })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => updateMap({ insetDu: { top: 0, right: 0, left: 0, bottom: map.insetDu.bottom } })}>
            {t('editor.layout.fullBleed')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => updateMap({ insetDu: { top: page.marginDu, right: page.marginDu, left: page.marginDu, bottom: map.insetDu.bottom } })}>
            {t('editor.layout.framed')}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.layout.frame')}</SectionTitle>
        <ToggleGroup<FrameStyle> label={t('editor.layout.frameStyle')} value={page.frame.style} onChange={(style) => frame({ style })} options={FRAME_STYLES.map((f) => ({ value: f, label: t(`frames.${f}`) }))} />
        {page.frame.style !== 'none' && (
          <>
            <ColorField label={t('editor.layout.frameColor')} value={page.frame.color} onChange={(color) => frame({ color })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
            <Slider label={t('editor.layout.frameWidth')} value={page.frame.widthDu} min={0.5} max={20} step={0.5} onChange={(widthDu) => frame({ widthDu })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
            <Slider label={t('editor.layout.frameInset')} value={page.frame.insetDu} min={0} max={200} onChange={(insetDu) => frame({ insetDu })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.layout.page')}</SectionTitle>
        <ColorField label={t('editor.layout.background')} value={page.background} onChange={(background) => updatePage({ background })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
        <Field label={t('editor.layout.attribution')} hint={t('editor.layout.attributionHint')}>
          {({ id, describedBy }) => (
            <Select<Corner>
              id={id}
              describedBy={describedBy}
              value={design.attribution.corner}
              onChange={(corner) => replaceDesign((d) => ({ ...d, attribution: { corner } }))}
              options={CORNERS.map((c) => ({ value: c, label: t(`corners.${c}`) }))}
            />
          )}
        </Field>
        <Switch label={t('editor.layout.safety')} hint={t('editor.layout.safetyHint')} checked={showGuides} onChange={(v) => setUi({ showGuides: v })} />
      </section>
    </div>
  );
}
