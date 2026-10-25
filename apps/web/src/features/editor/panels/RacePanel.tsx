import { MAX_ROUTES, PANEL_LAYOUTS, SPORT_EVENTS, type Leg, type PanelLayout, type SportEvent } from '@mapmory/design-schema';
import { fitRoutesView, makeRacePoster, makeSingleMapPoster } from '@mapmory/poster-core';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Trophy, Upload } from '../../../components/icons';
import { Button, Callout, Field, Select, SectionTitle, Slider, Switch, TextInput, ToggleGroup, cx } from '../../../components/ui';
import { ActivityImportError, importActivityFiles } from '../../../lib/activity-import';
import { useDesign, useEditor } from '../../../store/editor';
import { gesture, replaceDesign, setLegView, updateLeg, updateSport } from '../actions';
import { DISCIPLINE_ICONS, DistanceField, TimeField } from '../../../components/RaceFields';
import { applyImportedLegs, emptyRace, withFinishTime } from '../race';

/**
 * Race posters: one map panel per leg (e.g. swim, bike and run of a triathlon), each with its own view, route and
 * stats. Importing the athlete's activity files fills in routes, distances and times in one step.
 */
export function RacePanel() {
  const design = useDesign();
  return design.sport ? <RaceSettings /> : <MakeRace />;
}

function MakeRace() {
  const { t, i18n } = useTranslation();
  const [event, setEvent] = useState<SportEvent>('triathlon');
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-soft">{t('race.intro')}</p>
      <Field label={t('race.event')}>
        {({ id }) => (
          <Select<SportEvent> id={id} value={event} onChange={setEvent} options={SPORT_EVENTS.map((e) => ({ value: e, label: t(`race.events.${e}`) }))} />
        )}
      </Field>
      <Button className="w-fit" onClick={() => replaceDesign((d) => makeRacePoster(d, emptyRace(event), i18n.language))} data-testid="race-make">
        <Trophy aria-hidden className="size-4" />
        {t('race.make')}
      </Button>
    </div>
  );
}

function RaceSettings() {
  const { t } = useTranslation();
  const design = useDesign();
  const sport = design.sport!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'warn' | 'ok'; text: string } | null>(null);
  const legName = (l: Leg) => l.label || t(`race.disciplines.${l.discipline}`);

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setMessage(null);
    setBusy(true);
    try {
      const imported = await importActivityFiles(files, sport.legs.map((l) => l.discipline));
      const current = useEditor.getState().design!;
      const result = applyImportedLegs(current, imported);
      // One undo step for the whole import.
      replaceDesign(() => result.design);
      if (result.overLimit) setMessage({ tone: 'error', text: t('race.import.overLimit', { max: MAX_ROUTES }) });
      else if (result.missing.length > 0) setMessage({ tone: 'warn', text: t('race.import.missing', { legs: result.missing.map(legName).join(', ') }) });
      else setMessage({ tone: 'ok', text: t('race.import.done', { count: result.assigned.length }) });
    } catch (e) {
      setMessage({ tone: 'error', text: t(`race.import.errors.${e instanceof ActivityImportError ? e.code : 'unreadable'}`) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold" data-testid="race-event">
          {t(`race.events.${sport.event}`)}
        </p>
        <p className="text-sm text-ink-soft">{t('race.help')}</p>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('race.import.title')}</SectionTitle>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".fit,.gpx,.tcx,.geojson,.json,application/gpx+xml,application/geo+json,application/json,application/vnd.ant.fit"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('race.import.button')}
          data-testid="race-file"
          onChange={(e) => void onFiles([...(e.target.files ?? [])])}
        />
        <Button variant="secondary" size="sm" className="w-fit" loading={busy} disabled={busy} onClick={() => fileRef.current?.click()} data-testid="race-import">
          <Upload aria-hidden className="size-4" />
          {t('race.import.button')}
        </Button>
        <p className="text-xs text-ink-soft">{t('race.import.formats')}</p>
        {message && (
          <Callout tone={message.tone} className="text-sm">
            <span data-testid="race-import-message">{message.text}</span>
          </Callout>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label={t('race.legs')}>
        <SectionTitle>{t('race.legs')}</SectionTitle>
        <ul className="flex flex-col gap-3" data-testid="leg-list">
          {sport.legs.map((leg) => (
            <LegCard key={leg.id} leg={leg} />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>{t('race.layoutTitle')}</SectionTitle>
        <ToggleGroup<PanelLayout>
          label={t('race.layout')}
          value={sport.layout}
          onChange={(layout) => updateSport({ layout })}
          options={PANEL_LAYOUTS.filter((l) => l !== 'hero' || sport.legs.length === 3).map((l) => ({ value: l, label: t(`race.layouts.${l}`) }))}
        />
        {sport.legs.length > 1 && (
          <Slider
            label={t('race.gap')}
            value={sport.gapDu}
            min={0}
            max={150}
            onChange={(gapDu) => updateSport({ gapDu })}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
          />
        )}
        <Switch label={t('race.showStats')} hint={t('race.showStatsHint')} checked={sport.showStats} onChange={(showStats) => updateSport({ showStats })} />
        {sport.showStats && (
          <Slider
            label={t('race.statsSize')}
            value={sport.statsSizeDu}
            min={8}
            max={48}
            onChange={(statsSizeDu) => updateSport({ statsSizeDu })}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
          />
        )}
        <ToggleGroup<'metric' | 'imperial'>
          label={t('race.units')}
          value={sport.units}
          onChange={(units) => updateSport({ units })}
          options={[
            { value: 'metric', label: t('race.unitNames.metric') },
            { value: 'imperial', label: t('race.unitNames.imperial') },
          ]}
        />
        <TimeField label={t('race.finishTime')} hint={t('race.finishTimeHint')} value={sport.finishTimeS} onChange={(finishTimeS) => replaceDesign((d) => withFinishTime(d, finishTimeS))} testId="race-finish" onGestureStart={gesture.start} onGestureEnd={gesture.end} />
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-xs text-ink-soft">{t('race.singleHint')}</p>
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => replaceDesign(makeSingleMapPoster)} data-testid="race-single">
          {t('race.single')}
        </Button>
      </section>
    </div>
  );
}

function LegCard({ leg }: { leg: Leg }) {
  const { t } = useTranslation();
  const design = useDesign();
  const selected = useEditor((s) => s.ui.selectedLegId === leg.id);
  const setUi = useEditor((s) => s.setUi);
  const Icon = DISCIPLINE_ICONS[leg.discipline];
  const route = leg.routeId ? design.routes.find((r) => r.id === leg.routeId) : undefined;

  const fit = () => {
    const view = route ? fitRoutesView(design, [route], leg.id) : null;
    if (view) setLegView(leg.id, view);
  };

  return (
    <li
      className={cx('flex flex-col gap-3 rounded-xl border bg-white p-3', selected ? 'border-focus ring-2 ring-focus/30' : 'border-line')}
      data-testid={`leg-${leg.id}`}
      onFocus={() => setUi({ selectedLegId: leg.id })}
      onPointerDown={() => setUi({ selectedLegId: leg.id })}
    >
      <div className="flex items-center gap-2">
        <Icon aria-hidden className="size-5 text-brand" />
        <span className="text-sm font-semibold">{t(`race.disciplines.${leg.discipline}`)}</span>
      </div>
      <Field label={t('race.label')}>
        {({ id }) => (
          <TextInput
            id={id}
            value={leg.label}
            maxLength={40}
            onFocus={gesture.start}
            onBlur={gesture.end}
            onChange={(e) => updateLeg(leg.id, { label: e.target.value.replace(/[\p{Cc}\p{Cs}]/gu, '') })}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <DistanceField label={t('race.distance')} value={leg.distanceKm} onChange={(distanceKm) => updateLeg(leg.id, { distanceKm })} testId={`leg-distance-${leg.id}`} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
        <TimeField label={t('race.time')} value={leg.timeS} onChange={(timeS) => updateLeg(leg.id, { timeS })} testId={`leg-time-${leg.id}`} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
      </div>
      <Field label={t('race.route')}>
        {({ id }) => (
          <Select<string>
            id={id}
            value={leg.routeId ?? ''}
            onChange={(v) => updateLeg(leg.id, { routeId: v || null })}
            options={[{ value: '', label: t('race.noRoute') }, ...design.routes.map((r) => ({ value: r.id, label: r.name || r.id }))]}
          />
        )}
      </Field>
      <Button variant="ghost" size="sm" className="w-fit" disabled={!route} onClick={fit} data-testid={`leg-fit-${leg.id}`}>
        <Compass aria-hidden className="size-4" />
        {t('race.fit')}
      </Button>
    </li>
  );
}
