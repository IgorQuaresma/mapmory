import {
  BLEED_OPTIONS_MM,
  EXPORT_DPIS,
  EXPORT_FORMATS,
  PAPER_SIZES,
  type ExportFormat,
  type ExportJob,
  type ExportOptions,
} from '@mapmory/design-schema';
import { estimateFileSizeMb, exportGeometry, preflight } from '@mapmory/poster-core';
import { createCanvasMeasure, loadDesignFonts } from '@mapmory/poster-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, CircleX, Download, Info, TriangleAlert } from '../../components/icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api, isApiError } from '../../api';
import { MagicLinkForm } from '../../components/MagicLinkForm';
import { Stepper } from '../../components/Stepper';
import { Button, Callout, LiveRegion, SectionTitle, Spinner, Switch, ToggleGroup, cx } from '../../components/ui';
import { useFocusHeading } from '../../lib/hooks';
import { queryKeys, useSession } from '../../lib/queries';

const ACTIVE = new Set(['queued', 'rendering', 'composing', 'uploading']);

export default function ExportPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const heading = useFocusHeading<HTMLHeadingElement>();
  const session = useSession();
  const project = useQuery({ queryKey: [...queryKeys.project(id), 'export'], queryFn: () => api.getProject(id), staleTime: 0 });
  const design = project.data?.design;
  const paper = design && design.page.paper !== 'custom' ? PAPER_SIZES[design.page.paper] : null;
  const recommendedDpi = paper?.maxRecommendedDpi ?? 300;

  const [options, setOptions] = useState<ExportOptions>({ format: 'pdf', dpi: 300, bleedMm: 3, cropMarks: false, colorProfile: 'srgb' });
  const [touchedDpi, setTouchedDpi] = useState(false);
  useEffect(() => {
    if (!touchedDpi) setOptions((o) => ({ ...o, dpi: recommendedDpi }));
  }, [recommendedDpi, touchedDpi]);
  const set = (patch: Partial<ExportOptions>) =>
    setOptions((o) => {
      const next = { ...o, ...patch };
      if (next.bleedMm === 0) next.cropMarks = false;
      if (next.format !== 'pdf') next.colorProfile = 'srgb';
      return next;
    });

  const [measure, setMeasure] = useState<ReturnType<typeof createCanvasMeasure>>();
  useEffect(() => {
    if (design) void loadDesignFonts(design.texts).then(() => setMeasure(() => createCanvasMeasure()));
  }, [design]);
  const geometry = design ? exportGeometry(design, options) : null;
  const issues = useMemo(() => (design ? preflight(design, options, measure) : []), [design, options, measure]);
  const blocking = issues.some((i) => i.severity === 'error');
  /** Names what an issue is about: a text, marker or photo by id, a race leg by its label. */
  const issueTarget = (code: string, target: string) => {
    if (code === 'leg-without-route' || code === 'stats-too-wide') {
      const leg = design?.sport?.legs.find((l) => l.id === target);
      return t('targets.leg', { name: leg ? leg.label || t(`race.disciplines.${leg.discipline}`) : target });
    }
    return t(code === 'marker-outside-map' ? 'targets.marker' : code === 'photo-low-resolution' ? 'targets.photo' : 'targets.text', { id: target });
  };

  const exportsList = useQuery({ queryKey: queryKeys.exports(id), queryFn: () => api.listExports(id), enabled: !!session.data?.user });
  const [activeId, setActiveId] = useState<string | null>(null);
  const job = useQuery({
    queryKey: queryKeys.exportJob(activeId ?? ''),
    queryFn: () => api.getExport(activeId!),
    enabled: !!activeId,
    refetchInterval: (q) => (q.state.data && !ACTIVE.has(q.state.data.status) ? false : 2000),
  });
  useEffect(() => {
    if (job.data && !ACTIVE.has(job.data.status)) void qc.invalidateQueries({ queryKey: queryKeys.exports(id) });
  }, [job.data, id, qc]);

  const start = useMutation({
    mutationFn: () => api.createExport(id, options),
    onSuccess: (j) => {
      qc.setQueryData(queryKeys.exportJob(j.id), j);
      setActiveId(j.id);
    },
  });

  const user = session.data?.user;
  const cmyk = !!session.data?.features.cmyk;
  const fmt = new Intl.NumberFormat(i18n.language);

  if (project.isError) return <main id="main" className="mx-auto max-w-xl p-8"><Callout tone="error">{t('editor.notFound')}</Callout></main>;

  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Stepper current="export" />
      <div className="flex flex-col gap-2">
        <Link to={`/design/${id}`} className="inline-flex w-fit items-center gap-2 text-sm font-medium hover:underline">
          <ArrowLeft aria-hidden className="size-4" />
          {t('export.backToEditor')}
        </Link>
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl focus:outline-none">
          {t('export.title')}
        </h1>
        <p className="text-ink-soft">{t('export.lead')}</p>
      </div>

      {!design ? (
        <Spinner label={t('editor.loading')} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
              <SectionTitle as="h2">{t('export.format')}</SectionTitle>
              <div role="radiogroup" aria-label={t('export.format')} className="grid gap-2 sm:grid-cols-2">
                {EXPORT_FORMATS.map((f: ExportFormat) => (
                  <label key={f} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', options.format === f ? 'border-brand bg-sand' : 'border-field')}>
                    <input type="radio" name="format" value={f} checked={options.format === f} onChange={() => set({ format: f })} className="mt-1 accent-brand" />
                    <span>
                      <span className="font-medium">{t(`export.formats.${f}.name`)}</span>
                      <span className="block text-xs text-ink-soft">{t(`export.formats.${f}.desc`)}</span>
                    </span>
                  </label>
                ))}
              </div>

              <SectionTitle as="h2">{t('export.resolution')}</SectionTitle>
              <ToggleGroup<string>
                label={t('export.resolution')}
                value={String(options.dpi)}
                onChange={(v) => {
                  setTouchedDpi(true);
                  set({ dpi: Number(v) as ExportOptions['dpi'] });
                }}
                options={EXPORT_DPIS.map((d) => ({ value: String(d), label: `${d} DPI${d === recommendedDpi ? ` · ${t('export.recommended')}` : ''}` }))}
              />
              <p className="text-xs text-ink-soft">{t('export.dpiHint', { dpi: recommendedDpi, paper: paper?.label ?? t('editor.layout.custom') })}</p>

              <SectionTitle as="h2">{t('export.bleed')}</SectionTitle>
              <ToggleGroup<string>
                label={t('export.bleed')}
                value={String(options.bleedMm)}
                onChange={(v) => set({ bleedMm: Number(v) as ExportOptions['bleedMm'] })}
                options={BLEED_OPTIONS_MM.map((b) => ({ value: String(b), label: b === 0 ? t('export.noBleed') : `${b} mm` }))}
              />
              <p className="text-xs text-ink-soft">{t('export.bleedHint')}</p>
              <Switch label={t('export.cropMarks')} hint={t('export.cropMarksHint')} checked={options.cropMarks} onChange={(cropMarks) => set({ cropMarks })} />
              {options.bleedMm === 0 && <p className="-mt-2 text-xs text-ink-soft">{t('export.cropNeedsBleed')}</p>}

              {cmyk && options.format === 'pdf' && (
                <>
                  <SectionTitle as="h2">{t('export.color')}</SectionTitle>
                  <ToggleGroup<ExportOptions['colorProfile']>
                    label={t('export.color')}
                    value={options.colorProfile}
                    onChange={(colorProfile) => set({ colorProfile })}
                    options={[
                      { value: 'srgb', label: t('export.srgb') },
                      { value: 'cmyk-fogra39', label: t('export.cmyk') },
                    ]}
                  />
                  <p className="text-xs text-ink-soft">{t('export.cmykHint')}</p>
                </>
              )}
            </section>

            <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5" aria-labelledby="checklist">
              <SectionTitle as="h2">
                <span id="checklist">{t('export.checklist')}</span>
              </SectionTitle>
              {issues.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-ok">
                  <CircleCheck aria-hidden className="size-4" /> {t('export.allGood')}
                </p>
              )}
              <ul className="flex flex-col gap-2" data-testid="preflight">
                {issues.map((i, idx) => (
                  <li key={`${i.code}-${i.target ?? idx}`} className="flex items-start gap-2 text-sm">
                    {i.severity === 'error' ? <CircleX aria-hidden className="mt-0.5 size-4 text-bad" /> : i.severity === 'warning' ? <TriangleAlert aria-hidden className="mt-0.5 size-4 text-warn" /> : <Info aria-hidden className="mt-0.5 size-4 text-ink-soft" />}
                    <span>
                      <span className="sr-only">{t(`export.severity.${i.severity}`)}: </span>
                      {t(`preflight.${i.code}`, { dpi: options.dpi, recommended: recommendedDpi })}
                      {i.target && <span className="text-ink-soft"> ({issueTarget(i.code, i.target)})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl bg-sand p-5 text-sm text-ink-soft">
              <h2 className="mb-2 font-semibold text-ink">{t('export.guidanceTitle')}</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>{t('export.guidance.srgb')}</li>
                <li>{t('export.guidance.bleed')}</li>
                <li>{t('export.guidance.attribution')}</li>
              </ul>
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5" aria-labelledby="summary">
              <SectionTitle as="h2">
                <span id="summary">{t('export.summary')}</span>
              </SectionTitle>
              {geometry && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-ink-soft">{t('export.paper')}</dt>
                  <dd>{paper?.label ?? `${design.page.trimMm.w} × ${design.page.trimMm.h} mm`}</dd>
                  <dt className="text-ink-soft">{t('export.pageSize')}</dt>
                  <dd>{`${fmt.format(Number(geometry.pageMm.w.toFixed(1)))} × ${fmt.format(Number(geometry.pageMm.h.toFixed(1)))} mm`}</dd>
                  <dt className="text-ink-soft">{t('export.pixels')}</dt>
                  <dd data-testid="pixel-size">{`${fmt.format(geometry.pagePx.w)} × ${fmt.format(geometry.pagePx.h)} px`}</dd>
                  <dt className="text-ink-soft">{t('export.megapixels')}</dt>
                  <dd>{fmt.format(Number(geometry.megapixels.toFixed(1)))} MP</dd>
                  <dt className="text-ink-soft">{t('export.estimate')}</dt>
                  <dd>≈ {estimateFileSizeMb(geometry, options.format)} MB</dd>
                </dl>
              )}
            </section>

            {!session.data ? (
              <Spinner label={t('editor.loading')} />
            ) : !user ? (
              <MagicLinkForm callbackPath={`/design/${id}/export`} intro={t('export.signInIntro')} />
            ) : !user.emailVerified ? (
              <Callout tone="warn">{t('export.verifyEmail')}</Callout>
            ) : (
              <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
                <Button size="lg" onClick={() => start.mutate()} loading={start.isPending} disabled={blocking || (job.data ? ACTIVE.has(job.data.status) : false)} data-testid="start-export">
                  {t('export.create')}
                </Button>
                {start.isError && <Callout tone="error">{exportErrorText(start.error, t)}</Callout>}
                {job.data && <JobStatus job={job.data} />}
              </section>
            )}

            {exportsList.data && exportsList.data.length > 0 && (
              <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5" aria-labelledby="previous">
                <SectionTitle as="h2">
                  <span id="previous">{t('export.previous')}</span>
                </SectionTitle>
                <ul className="flex flex-col gap-2 text-sm">
                  {exportsList.data.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span>
                        {e.options.format.toUpperCase()} · {e.options.dpi} DPI
                        <span className="block text-xs text-ink-soft">{new Date(e.createdAt).toLocaleString(i18n.language)}</span>
                      </span>
                      {e.status === 'done' && e.downloadUrl ? (
                        <a className="text-sm font-medium text-accent-strong underline" href={e.downloadUrl} download>
                          {t('export.download')}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-soft">{t(`export.status.${e.status}`)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

function JobStatus({ job }: { job: ExportJob }) {
  const { t } = useTranslation();
  const ext = { pdf: 'pdf', png: 'png', jpeg: 'jpg', tiff: 'tif' }[job.options.format];
  const text = job.status === 'done' ? t('export.ready') : job.status === 'failed' ? t('export.failed') : `${t(`export.status.${job.status}`)} ${job.progress}%`;
  return (
    <div className="flex flex-col gap-3" data-testid="export-status" data-status={job.status}>
      <LiveRegion>{text}</LiveRegion>
      {ACTIVE.has(job.status) && (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress} aria-label={t('export.progress')}>
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(4, job.progress)}%` }} />
          </div>
          <p className="text-sm text-ink-soft">{text}</p>
        </>
      )}
      {job.status === 'done' && job.downloadUrl && (
        <>
          <a
            href={job.downloadUrl}
            download={`mapmory-poster.${ext}`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-6 font-medium text-white hover:bg-brand-strong [--icon-duo:var(--color-sun)]"
            data-testid="download-link"
          >
            <Download aria-hidden className="size-4" />
            {t('export.downloadFile', { format: job.options.format.toUpperCase() })}
          </a>
          <p className="text-xs text-ink-soft">{t('export.expires')}</p>
        </>
      )}
      {job.status === 'failed' && <Callout tone="error">{t('export.failedHelp')}</Callout>}
    </div>
  );
}

function exportErrorText(e: unknown, t: (k: string) => string) {
  if (isApiError(e, 'export_in_progress')) return t('export.errors.inProgress');
  if (isApiError(e, 'quota_exceeded') || isApiError(e, 'rate_limited')) return t('export.errors.quota');
  if (isApiError(e, 'export_too_large')) return t('export.errors.tooLarge');
  if (isApiError(e, 'auth_required') || isApiError(e, 'email_unverified')) return t('export.verifyEmail');
  if (isApiError(e, 'feature_unavailable')) return t('export.errors.unavailable');
  return t('errors.generic');
}
