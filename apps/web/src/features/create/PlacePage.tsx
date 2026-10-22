import { MOODS, type GeocodeResult, type Interpretation, type Mood } from '@mapmory/design-schema';
import { boundsOf, buildStyle, formatCoordinates, generateDraft } from '@mapmory/poster-core';
import { MOOD_THEME } from '@mapmory/themes';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, MapPin, MapPinPlus, Star, Trash2 } from '../../components/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api';
import { MapCanvas, type MapView } from '../../components/MapCanvas';
import { PlaceSearch } from '../../components/PlaceSearch';
import { Stepper } from '../../components/Stepper';
import { Button, Callout, Field, IconButton, Select, Spinner, TextInput, cx } from '../../components/ui';
import { useFocusHeading, usePrefersReducedMotion } from '../../lib/hooks';
import { maplibregl, type MapLibreMap } from '../../lib/maplibre';
import { queryKeys, useCatalog } from '../../lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useWizard } from './wizard';

const MAX_PLACES = 5;
const FALLBACK_PLACE: GeocodeResult = {
  id: 'fallback', name: 'Paris', label: 'Paris, France', lngLat: [2.3483915, 48.8534951], bbox: null, type: 'city', city: 'Paris', country: 'France',
};

export default function PlacePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const heading = useFocusHeading<HTMLHeadingElement>();
  const w = useWizard();
  const catalog = useCatalog();
  const [pinMode, setPinMode] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const [map, setMap] = useState<MapLibreMap | null>(null);

  const suggestions = useMemo(() => {
    const seen = new Set(w.places.map((p) => p.id));
    return (w.result?.places ?? []).flatMap((p) => p.candidates).filter((c) => !seen.has(c.id) && (seen.add(c.id), true));
  }, [w.result, w.places]);

  const addPlace = (p: GeocodeResult) => {
    if (w.places.some((x) => x.id === p.id) || w.places.length >= MAX_PLACES) return;
    w.patch({ places: [...w.places, p] });
  };
  const removePlace = (id: string) => w.patch({ places: w.places.filter((p) => p.id !== id) });
  const makeMain = (id: string) => {
    const p = w.places.find((x) => x.id === id)!;
    w.patch({ places: [p, ...w.places.filter((x) => x.id !== id)] });
  };

  const dropPin = async ([lng, lat]: [number, number]) => {
    if (!pinMode) return;
    setPinBusy(true);
    try {
      const found = await api.reverseGeocode(lat, lng, i18n.language.slice(0, 2)).catch(() => null);
      addPlace(
        found ?? {
          id: `pin-${lng.toFixed(5)},${lat.toFixed(5)}`,
          name: t('place.droppedPin'),
          label: formatCoordinates([lng, lat]),
          lngLat: [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
          bbox: null,
          type: 'poi',
          city: null,
          country: null,
        },
      );
    } finally {
      setPinBusy(false);
      setPinMode(false);
    }
  };

  const create = useMutation({
    mutationFn: () =>
      api.createProject({
        draft: {
          places: w.places,
          title: w.title.trim() || null,
          subtitle: w.result?.interpretation.subtitleIdea ?? null,
          date: w.date,
          mood: w.mood,
          locale: i18n.language,
        },
        keepMemoryText: w.keepMemoryText && !!w.memoryText,
        memoryText: w.keepMemoryText && w.memoryText ? w.memoryText : undefined,
      }),
    onSuccess: (res) => {
      qc.setQueryData(queryKeys.project(res.project.id), res);
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
      w.clear();
      navigate(`/design/${res.project.id}`);
    },
  });

  // Map: classic style with labels, so people recognise the area.
  const styleSpec = useMemo(() => {
    if (!catalog.data) return null;
    const d = generateDraft({ places: [FALLBACK_PLACE], title: null, subtitle: null, date: { iso: null, precision: 'unknown' }, mood: 'neutral', locale: i18n.language });
    return buildStyle({ ...d, map: { ...d.map, layers: { ...d.map.layers, labels: true, buildings: true }, labelLanguage: d.map.labelLanguage } }, catalog.data.tiles);
  }, [catalog.data, i18n.language]);
  const [view, setView] = useState<MapView>(() => ({ center: (w.places[0] ?? FALLBACK_PLACE).lngLat, zoom: w.places.length ? 13 : 4, bearing: 0 }));

  useMapPins(map, w.places);
  useEffect(() => {
    if (!map || w.places.length === 0) return;
    const pts = w.places.map((p) => p.lngLat);
    const [west, south, east, north] = pts.length === 1 && w.places[0]!.bbox ? w.places[0]!.bbox : boundsOf(pts);
    map.fitBounds([west, south, east, north], { padding: 64, maxZoom: 15, duration: reduceMotion ? 0 : 600 });
  }, [map, w.places, reduceMotion]);

  const status = w.unavailable ? 'unavailable' : w.manual ? 'manual' : w.result && w.result.places.length === 0 ? 'notFound' : 'found';

  return (
    <main id="main" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <Stepper current="place" />
      <div className="flex flex-col gap-2">
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl focus:outline-none">
          {t('place.title')}
        </h1>
        <p className="text-ink-soft">{t(`place.lead.${status}`)}</p>
      </div>
      {status === 'unavailable' && <Callout tone="info">{t('place.unavailable')}</Callout>}
      {status === 'notFound' && <Callout tone="warn" title={t('place.notFoundTitle')}>{t('place.notFound')}</Callout>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="chosen" className="flex flex-col gap-3">
            <h2 id="chosen" className="text-sm font-semibold">
              {t('place.chosen')}
            </h2>
            {w.places.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">{t('place.noneChosen')}</p>}
            <ul className="flex flex-col gap-2" data-testid="chosen-places">
              {w.places.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                  <MapPin aria-hidden className={cx('size-5 shrink-0', i === 0 ? 'text-accent' : 'text-ink-soft')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {p.name}
                      {i === 0 && <span className="ml-2 rounded bg-sand px-1.5 py-0.5 text-[11px] font-semibold uppercase text-ink-soft">{t('place.main')}</span>}
                    </p>
                    <p className="truncate text-xs text-ink-soft">{p.label}</p>
                  </div>
                  {i > 0 && (
                    <IconButton label={t('place.makeMain', { name: p.name })} onClick={() => makeMain(p.id)}>
                      <Star aria-hidden className="size-4" />
                    </IconButton>
                  )}
                  <IconButton label={t('place.remove', { name: p.name })} onClick={() => removePlace(p.id)}>
                    <Trash2 aria-hidden className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
            {suggestions.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{t('place.alternatives')}</h3>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button key={s.id} type="button" onClick={() => addPlace(s)} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-ink-soft">
                      + {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <PlaceSearch label={t('place.search')} onSelect={addPlace} autoFocus={status !== 'found'} />
          <Button variant={pinMode ? 'primary' : 'secondary'} aria-pressed={pinMode} onClick={() => setPinMode(!pinMode)} disabled={w.places.length >= MAX_PLACES}>
            <MapPinPlus aria-hidden className="size-4" />
            {pinMode ? t('place.pinActive') : t('place.dropPin')}
          </Button>

          <DetailsForm />
        </div>

        <div className="flex flex-col gap-3">
          <div
            className={cx('relative h-[360px] overflow-hidden rounded-2xl border border-line bg-lav lg:h-[560px]', pinMode && 'ring-4 ring-accent/40 [&_canvas]:cursor-crosshair')}
          >
            {styleSpec && (
              <div className="absolute inset-0">
              <MapCanvas
                styleSpec={styleSpec}
                view={view}
                onUserMove={(phase, v) => phase === 'end' && setView(v)}
                onMapClick={(ll) => void dropPin(ll)}
                onReady={setMap}
                ariaLabel={t('place.mapLabel')}
                showAttribution
                className="h-full w-full"
              />
              </div>
            )}
            {pinBusy && (
              <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-2 shadow">
                <Spinner label={t('place.lookingUp')} />
              </div>
            )}
          </div>
          <p className="text-xs text-ink-soft">{t('place.mapHelp')}</p>
        </div>
      </div>

      {create.isError && <Callout tone="error">{t('errors.generic')}</Callout>}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-6">
        <Link to="/create" className="inline-flex items-center gap-2 text-sm font-medium hover:underline">
          <ArrowLeft aria-hidden className="size-4" />
          {t('ui.back')}
        </Link>
        <Button size="lg" onClick={() => create.mutate()} disabled={w.places.length === 0} loading={create.isPending} data-testid="create-design">
          {t('place.continue')}
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </main>
  );
}

function DetailsForm() {
  const { t } = useTranslation();
  const w = useWizard();
  const ideas = w.result?.interpretation.titleIdeas ?? [];
  const date = w.date;
  const setPrecision = (precision: Interpretation['date']['precision']) => {
    const now = new Date();
    const year = date.iso?.slice(0, 4) ?? String(now.getUTCFullYear());
    const month = date.iso?.slice(5, 7) || String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = date.iso?.slice(8, 10) || '01';
    const iso = precision === 'unknown' ? null : precision === 'year' ? year : precision === 'month' ? `${year}-${month}` : `${year}-${month}-${day}`;
    w.patch({ date: { iso, precision } });
  };
  return (
    <section aria-labelledby="details" className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4">
      <h2 id="details" className="text-sm font-semibold">
        {t('place.details')}
      </h2>
      <Field label={t('place.titleLabel')} hint={t('place.titleHint')}>
        {({ id, describedBy }) => (
          <TextInput id={id} aria-describedby={describedBy} value={w.title} maxLength={120} onChange={(e) => w.patch({ title: e.target.value })} data-testid="title-input" />
        )}
      </Field>
      {ideas.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {ideas.map((idea) => (
            <button key={idea} type="button" onClick={() => w.patch({ title: idea })} className="rounded-full bg-sand px-2.5 py-1 text-xs hover:bg-line">
              {idea}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('place.datePrecision')}>
          {({ id }) => (
            <Select<Interpretation['date']['precision']>
              id={id}
              value={date.precision}
              onChange={setPrecision}
              options={(['day', 'month', 'year', 'unknown'] as const).map((p) => ({ value: p, label: t(`place.precision.${p}`) }))}
            />
          )}
        </Field>
        {date.precision !== 'unknown' && (
          <Field label={t('place.date')}>
            {({ id }) =>
              date.precision === 'year' ? (
                <TextInput id={id} inputMode="numeric" pattern="\d{4}" maxLength={4} value={date.iso ?? ''} onChange={(e) => /^\d{0,4}$/.test(e.target.value) && w.patch({ date: { iso: e.target.value.length === 4 ? e.target.value : null, precision: 'year' } })} />
              ) : (
                <TextInput
                  id={id}
                  type={date.precision === 'day' ? 'date' : 'month'}
                  value={date.iso ?? ''}
                  onChange={(e) => w.patch({ date: { iso: e.target.value || null, precision: date.precision } })}
                />
              )
            }
          </Field>
        )}
      </div>
      <Field label={t('place.mood')} hint={t('place.moodHint')}>
        {({ id, describedBy }) => (
          <Select<Mood>
            id={id}
            describedBy={describedBy}
            value={w.mood}
            onChange={(mood) => w.patch({ mood })}
            options={MOODS.map((m) => ({ value: m, label: `${t(`moods.${m}`)} — ${t(`themes.${MOOD_THEME[m]}`)}` }))}
          />
        )}
      </Field>
      {w.memoryText && !w.manual && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-brand" checked={w.keepMemoryText} onChange={(e) => w.patch({ keepMemoryText: e.target.checked })} />
          <span>
            {t('place.keepMemory')}
            <span className="block text-xs text-ink-soft">{t('place.keepMemoryHint')}</span>
          </span>
        </label>
      )}
    </section>
  );
}

/** Pins for the chosen places as MapLibre DOM markers. */
function useMapPins(map: MapLibreMap | null, places: GeocodeResult[]) {
  const markers = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    if (!map) return;
    for (const m of markers.current) m.remove();
    markers.current = places.map((p, i) => {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = `width:${i === 0 ? 30 : 24}px;height:${i === 0 ? 30 : 24}px;`;
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      const path = document.createElementNS(svgNs, 'path');
      path.setAttribute('d', 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z');
      path.setAttribute('fill', i === 0 ? '#ff5c7a' : '#1a61b9');
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', '1.2');
      svg.appendChild(path);
      el.appendChild(svg);
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(p.lngLat).addTo(map);
    });
    return () => {
      for (const m of markers.current) m.remove();
      markers.current = [];
    };
  }, [map, places]);
}
