import { useQuery } from '@tanstack/react-query';
import { buildStyle, computeLayout } from '@mapmory/poster-core';
import { Poster, loadDesignFonts } from '@mapmory/poster-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api, isApiError } from '../../api';
import { MapCanvas } from '../../components/MapCanvas';
import { Callout, Spinner } from '../../components/ui';
import { useCatalog } from '../../lib/queries';

/**
 * Public, read-only preview behind a share link (plan §12 v1): a watermarked, low-resolution live render.
 * There is no export or edit path from here.
 */
export default function SharedPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const catalog = useCatalog();
  const shared = useQuery({ queryKey: ['shared', token], queryFn: () => api.getShared(token), retry: (n, e) => !isApiError(e, 'not_found') && n < 1 });
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.min(560, e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [shared.data]);

  const design = shared.data?.design;
  useEffect(() => {
    if (design) void loadDesignFonts(design.texts);
  }, [design]);
  const layout = useMemo(() => (design ? computeLayout(design) : null), [design]);
  // One style per map panel: race posters draw each leg's route in its own panel.
  const styles = useMemo(
    () => (design && layout && catalog.data ? layout.panels.map((p) => buildStyle(design, catalog.data!.tiles, p.leg?.id ?? null)) : null),
    [design, layout, catalog.data],
  );

  if (shared.isError) {
    return (
      <main id="main" className="mx-auto max-w-lg space-y-4 p-8">
        <Callout tone="warn" title={t('share.pageTitle')}>
          {t('share.notFound')}
        </Callout>
        <Link to="/create" className="font-medium text-accent-strong underline">
          {t('share.makeYourOwn')}
        </Link>
      </main>
    );
  }
  if (!design || !layout || !styles) {
    return (
      <main id="main" className="flex flex-1 items-center justify-center p-12">
        <Spinner label={t('editor.loading')} />
      </main>
    );
  }

  const scale = width / layout.outer.w;
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-8">
      <h1 className="text-center font-display text-3xl">{shared.data!.title}</h1>
      <div ref={box} className="w-full">
        <div
          className="relative mx-auto overflow-hidden rounded-sm shadow-xl"
          style={{ width: layout.outer.w * scale, height: layout.outer.h * scale }}
          data-testid="shared-poster"
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: layout.outer.w, height: layout.outer.h }}>
            <Poster
              design={design}
              layout={layout}
              photoSrc={(id) => api.sharedPhotoUrl(token, id)}
              renderMap={(rect, panel) => (
                <MapCanvas
                  styleSpec={styles[panel.index]!}
                  view={{ center: panel.viewport.center, zoom: panel.viewport.zoom, bearing: panel.viewport.bearing }}
                  interactive={false}
                  pixelRatio={1}
                  ariaLabel={t('editor.preview.mapLabel')}
                  style={{ width: Math.round(rect.w), height: Math.round(rect.h) }}
                />
              )}
            />
          </div>
          <Watermark label={t('share.watermark')} />
        </div>
      </div>
      <Link to="/create" className="rounded-full bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-strong">
        {t('share.makeYourOwn')}
      </Link>
    </main>
  );
}

function Watermark({ label }: { label: string }) {
  const text = label.toUpperCase();
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" data-testid="watermark">
      <defs>
        <pattern id="mm-watermark" width="220" height="140" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <text x="10" y="80" fontSize="28" fontWeight="700" fontFamily="sans-serif" letterSpacing="6" fill="#000" fillOpacity="0.10">
            {text}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#mm-watermark)" />
    </svg>
  );
}
