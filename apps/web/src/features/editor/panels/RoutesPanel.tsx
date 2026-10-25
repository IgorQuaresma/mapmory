import { MAX_ROUTES, ROUTE_STYLES, type Route, type RouteStyle } from '@mapmory/design-schema';
import { fitRoutesView, routeFromMarkers } from '@mapmory/poster-core';
import { getTheme } from '@mapmory/themes';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, MapPinned, Plus, Trash2 } from '../../../components/icons';
import { Button, Callout, ColorField, Field, IconButton, SectionTitle, Slider, Switch, TextInput, ToggleGroup } from '../../../components/ui';
import { RouteImportError, importRouteFile } from '../../../lib/routes-import';
import { useDesign } from '../../../store/editor';
import { addRoute, gesture, nextId, removeRoute, replaceDesign, setView, updateRoute } from '../actions';

/** Routes and trips: GPX/GeoJSON tracks or a line connecting the places, drawn by the map renderers (plan §12). */
export function RoutesPanel() {
  const { t } = useTranslation();
  const design = useDesign();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = design.routes.length >= MAX_ROUTES;
  const accent = getTheme(design.map.themeId).accent;

  const newRoute = (name: string, points: [number, number][], style: RouteStyle, existing: Route[]): Route => ({
    id: nextId('r', existing),
    name,
    points,
    color: accent,
    widthDu: 4,
    style,
    endpoints: true,
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const imported = await importRouteFile(file);
      const room = MAX_ROUTES - design.routes.length;
      replaceDesign((d) => {
        const routes = [...d.routes];
        for (const r of imported.slice(0, room)) routes.push(newRoute(r.name, r.points, 'solid', routes));
        return { ...d, routes };
      });
      if (imported.length > room) setError(t('editor.routes.someSkipped', { max: MAX_ROUTES }));
      fitToRoutes([...design.routes, ...imported.slice(0, room)]);
    } catch (e) {
      setError(t(`editor.routes.errors.${e instanceof RouteImportError ? e.code : 'unreadable'}`));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const connectPlaces = () => addRoute(newRoute(t('editor.routes.connectedName'), routeFromMarkers(design), 'dashed', design.routes));

  /** Frames every route in the map area (bearing reset to north, as fitBounds assumes). */
  const fitToRoutes = (routes: Pick<Route, 'points'>[] = design.routes) => {
    // Shape-aware: frames the routes inside a circle, heart or arch, not the surrounding rectangle.
    const view = fitRoutesView(design, routes);
    if (view) setView(view);
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-soft">{t('editor.routes.help')}</p>
      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.routes.add')}</SectionTitle>
        <input
          ref={fileRef}
          type="file"
          accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('editor.routes.import')}
          id="route-file"
          data-testid="route-file"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={full || busy} loading={busy} onClick={() => fileRef.current?.click()} data-testid="route-import">
            <Plus aria-hidden className="size-4" />
            {t('editor.routes.import')}
          </Button>
          <Button variant="secondary" size="sm" disabled={full || design.markers.length < 2} onClick={connectPlaces} data-testid="route-connect">
            <MapPinned aria-hidden className="size-4" />
            {t('editor.routes.connect')}
          </Button>
        </div>
        <p className="text-xs text-ink-soft">
          {full ? t('editor.routes.full', { max: MAX_ROUTES }) : design.markers.length < 2 ? t('editor.routes.connectNeedsTwo') : t('editor.routes.formats')}
        </p>
        {error && (
          <Callout tone="error">
            {error}
          </Callout>
        )}
      </section>

      {design.routes.length > 0 && (
        <section className="flex flex-col gap-3" aria-label={t('editor.routes.list')}>
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>{t('editor.routes.list')}</SectionTitle>
            <Button variant="ghost" size="sm" onClick={() => fitToRoutes()} data-testid="route-fit">
              <Compass aria-hidden className="size-4" />
              {t('editor.routes.fit')}
            </Button>
          </div>
          <ul className="flex flex-col gap-3" data-testid="route-list">
            {design.routes.map((r) => (
              <RouteCard key={r.id} route={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RouteCard({ route }: { route: Route }) {
  const { t } = useTranslation();
  const set = (patch: Partial<Route>) => updateRoute(route.id, patch);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-white p-3" data-testid={`route-${route.id}`}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label={t('editor.routes.name')} hint={t('editor.routes.points', { count: route.points.length })}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={route.name}
                maxLength={60}
                onFocus={gesture.start}
                onBlur={gesture.end}
                onChange={(e) => set({ name: e.target.value.replace(/[\p{Cc}\p{Cs}]/gu, '') })}
              />
            )}
          </Field>
        </div>
        <IconButton label={t('editor.routes.remove', { name: route.name })} onClick={() => removeRoute(route.id)}>
          <Trash2 aria-hidden className="size-4" />
        </IconButton>
      </div>
      <ColorField label={t('editor.routes.color')} value={route.color} onChange={(color) => set({ color })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
      <Slider
        label={t('editor.routes.width')}
        value={route.widthDu}
        min={1}
        max={24}
        step={0.5}
        onChange={(widthDu) => set({ widthDu })}
        onGestureStart={gesture.start}
        onGestureEnd={gesture.end}
      />
      <ToggleGroup<RouteStyle>
        label={t('editor.routes.style')}
        value={route.style}
        onChange={(style) => set({ style })}
        options={ROUTE_STYLES.map((s) => ({ value: s, label: t(`editor.routes.styles.${s}`) }))}
      />
      <Switch label={t('editor.routes.endpoints')} checked={route.endpoints} onChange={(endpoints) => set({ endpoints })} />
    </li>
  );
}
