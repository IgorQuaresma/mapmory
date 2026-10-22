import { MARKER_ICONS, MAX_MARKERS, type MarkerIcon } from '@mapmory/design-schema';
import { MARKER_ICON_PATHS, computeLayout, formatCoordinates, fromScreen, toScreen } from '@mapmory/poster-core';
import { getTheme } from '@mapmory/themes';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlaceSearch } from '../../../components/PlaceSearch';
import { Button, ColorField, IconButton, SectionTitle, Slider, ToggleGroup, cx } from '../../../components/ui';
import { useDesign, useEditor } from '../../../store/editor';
import { gesture, nextId, replaceDesign, setView, updateMarker } from '../actions';

export function MarkerIconSvg({ icon, color = 'currentColor', className = 'size-5' }: { icon: MarkerIcon; color?: string; className?: string }) {
  const p = MARKER_ICON_PATHS[icon];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={p.d} fill={color} fillRule={p.evenOdd ? 'evenodd' : 'nonzero'} />
    </svg>
  );
}

export function MarkersPanel() {
  const { t } = useTranslation();
  const design = useDesign();
  const selectedId = useEditor((s) => s.ui.selectedMarkerId);
  const setUi = useEditor((s) => s.setUi);
  const selected = design.markers.find((m) => m.id === selectedId) ?? design.markers[0];

  const add = () => {
    const id = nextId('m', design.markers);
    const theme = getTheme(design.map.themeId);
    replaceDesign((d) => ({
      ...d,
      markers: [...d.markers, { id, lngLat: d.map.center, icon: d.markers[0]?.icon ?? 'pin', color: theme.accent, sizeDu: 32 }],
    }));
    setUi({ selectedMarkerId: id });
  };
  const remove = (id: string) => {
    replaceDesign((d) => ({ ...d, markers: d.markers.filter((m) => m.id !== id) }));
    setUi({ selectedMarkerId: null });
  };
  /** Keyboard/button alternative to dragging (WCAG 2.5.7): nudge in screen space. */
  const nudge = (dx: number, dy: number) => {
    if (!selected) return;
    const { viewport } = computeLayout(design).map;
    const [x, y] = toScreen(selected.lngLat, viewport);
    const [lng, lat] = fromScreen([x + dx * 10, y + dy * 10], viewport);
    updateMarker(selected.id, { lngLat: [Number(lng.toFixed(7)), Number(lat.toFixed(7))] });
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-soft">{t('editor.markers.help')}</p>
      <section className="flex flex-col gap-2">
        <SectionTitle>{t('editor.markers.list')}</SectionTitle>
        {design.markers.length === 0 && <p className="text-sm text-ink-soft">{t('editor.markers.empty')}</p>}
        <ul className="flex flex-col gap-1.5">
          {design.markers.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={selected?.id === m.id}
                onClick={() => setUi({ selectedMarkerId: m.id })}
                className={cx(
                  'flex flex-1 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm',
                  selected?.id === m.id ? 'border-ink bg-sand' : 'border-line bg-white hover:bg-sand',
                )}
              >
                <MarkerIconSvg icon={m.icon} color={m.color} />
                <span>
                  <span className="font-medium">{t('editor.markers.name', { n: i + 1 })}</span>
                  <span className="block text-xs text-ink-soft">{formatCoordinates(m.lngLat)}</span>
                </span>
              </button>
              <IconButton label={t('editor.markers.remove', { n: i + 1 })} onClick={() => remove(m.id)}>
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" className="w-fit" onClick={add} disabled={design.markers.length >= MAX_MARKERS}>
          <Plus aria-hidden className="size-4" />
          {t('editor.markers.add')}
        </Button>
      </section>

      {selected && (
        <section className="flex flex-col gap-4" aria-label={t('editor.markers.editSelected')}>
          <SectionTitle>{t('editor.markers.appearance')}</SectionTitle>
          <ToggleGroup<MarkerIcon>
            label={t('editor.markers.icon')}
            value={selected.icon}
            onChange={(icon) => updateMarker(selected.id, { icon })}
            options={MARKER_ICONS.map((icon) => ({ value: icon, title: t(`icons.${icon}`), label: <MarkerIconSvg icon={icon} /> }))}
          />
          <ColorField
            label={t('editor.markers.color')}
            value={selected.color}
            onChange={(color) => updateMarker(selected.id, { color })}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
          />
          <Slider
            label={t('editor.markers.size')}
            value={selected.sizeDu}
            min={8}
            max={160}
            step={1}
            onChange={(sizeDu) => updateMarker(selected.id, { sizeDu })}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
          />
          <SectionTitle>{t('editor.markers.position')}</SectionTitle>
          <div className="flex flex-wrap items-center gap-1">
            <IconButton variant="secondary" label={t('editor.markers.nudgeLeft')} onClick={() => nudge(-1, 0)}>
              <ArrowLeft aria-hidden className="size-4" />
            </IconButton>
            <IconButton variant="secondary" label={t('editor.markers.nudgeUp')} onClick={() => nudge(0, -1)}>
              <ArrowUp aria-hidden className="size-4" />
            </IconButton>
            <IconButton variant="secondary" label={t('editor.markers.nudgeDown')} onClick={() => nudge(0, 1)}>
              <ArrowDown aria-hidden className="size-4" />
            </IconButton>
            <IconButton variant="secondary" label={t('editor.markers.nudgeRight')} onClick={() => nudge(1, 0)}>
              <ArrowRight aria-hidden className="size-4" />
            </IconButton>
            <Button variant="secondary" size="sm" onClick={() => updateMarker(selected.id, { lngLat: design.map.center })}>
              <Crosshair aria-hidden className="size-4" />
              {t('editor.markers.toCenter')}
            </Button>
          </div>
          <PlaceSearch
            label={t('editor.markers.moveToPlace')}
            onSelect={(r) => {
              updateMarker(selected.id, { lngLat: r.lngLat });
              setView({ center: r.lngLat });
            }}
          />
        </section>
      )}
    </div>
  );
}
