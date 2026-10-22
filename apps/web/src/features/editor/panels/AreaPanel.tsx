import { MAP_SHAPES, type MapShape } from '@mapmory/design-schema';
import { offsetCenter, shapePath } from '@mapmory/poster-core';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Compass, Crosshair } from '../../../components/icons';
import { useTranslation } from 'react-i18next';
import { Button, ColorField, IconButton, SectionTitle, Slider, Switch, ToggleGroup } from '../../../components/ui';
import { useDesign, useEditor } from '../../../store/editor';
import { gesture, setView, updateMap } from '../actions';

export function ShapeIcon({ shape }: { shape: MapShape }) {
  return (
    <svg viewBox="-1 -1 22 26" className="size-5" aria-hidden>
      <path d={shapePath(shape, 20, 24)} fill="currentColor" />
    </svg>
  );
}

export function AreaPanel() {
  const { t } = useTranslation();
  const design = useDesign();
  const locked = useEditor((s) => s.ui.mapLocked);
  const selectedMarkerId = useEditor((s) => s.ui.selectedMarkerId);
  const setUi = useEditor((s) => s.setUi);
  const { map } = design;
  const pan = (dx: number, dy: number) => {
    const step = 80; // design units ≈ 9 % of the map width
    setView({ center: offsetCenter(map.center, map.zoom, map.bearing, [dx * step, dy * step]) });
  };
  const target = design.markers.find((m) => m.id === selectedMarkerId) ?? design.markers[0];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-soft">{t('editor.area.help')}</p>
      <Switch label={t('editor.area.lock')} hint={t('editor.area.lockHint')} checked={locked} onChange={(v) => setUi({ mapLocked: v })} />

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.area.move')}</SectionTitle>
        <div className="grid w-fit grid-cols-3 gap-1">
          <span />
          <IconButton variant="secondary" label={t('editor.area.panUp')} onClick={() => pan(0, -1)}>
            <ArrowUp aria-hidden className="size-4" />
          </IconButton>
          <span />
          <IconButton variant="secondary" label={t('editor.area.panLeft')} onClick={() => pan(-1, 0)}>
            <ArrowLeft aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            variant="secondary"
            label={t('editor.area.recenter')}
            disabled={!target}
            onClick={() => target && setView({ center: target.lngLat })}
          >
            <Crosshair aria-hidden className="size-4" />
          </IconButton>
          <IconButton variant="secondary" label={t('editor.area.panRight')} onClick={() => pan(1, 0)}>
            <ArrowRight aria-hidden className="size-4" />
          </IconButton>
          <span />
          <IconButton variant="secondary" label={t('editor.area.panDown')} onClick={() => pan(0, 1)}>
            <ArrowDown aria-hidden className="size-4" />
          </IconButton>
          <span />
        </div>
        <Slider
          label={t('editor.area.zoom')}
          value={map.zoom}
          min={1}
          max={18}
          step={0.05}
          format={(v) => v.toFixed(1)}
          onChange={(v) => setView({ zoom: v })}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
        />
        <Slider
          label={t('editor.area.rotation')}
          value={map.bearing}
          min={-180}
          max={180}
          step={1}
          format={(v) => `${Math.round(v)}°`}
          onChange={(v) => setView({ bearing: v })}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
        />
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setView({ bearing: 0 })} disabled={map.bearing === 0}>
          <Compass aria-hidden className="size-4" />
          {t('editor.area.northUp')}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.area.shape')}</SectionTitle>
        <ToggleGroup<MapShape>
          label={t('editor.area.shape')}
          value={map.shape}
          onChange={(shape) => updateMap({ shape })}
          options={MAP_SHAPES.map((s) => ({ value: s, title: t(`shapes.${s}`), label: <ShapeIcon shape={s} /> }))}
        />
        <Slider
          label={t('editor.area.outline')}
          value={map.outline.widthDu}
          min={0}
          max={12}
          step={0.5}
          format={(v) => (v === 0 ? t('editor.none') : v.toFixed(1))}
          onChange={(widthDu) => updateMap({ outline: { ...useEditor.getState().design!.map.outline, widthDu } })}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
        />
        {map.outline.widthDu > 0 && (
          <ColorField
            label={t('editor.area.outlineColor')}
            value={map.outline.color}
            onChange={(color) => updateMap({ outline: { ...useEditor.getState().design!.map.outline, color } })}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
          />
        )}
      </section>
    </div>
  );
}
