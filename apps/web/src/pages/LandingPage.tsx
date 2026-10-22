import type { DraftInput } from '@mapmory/design-schema';
import { ArrowRight, Download, Lock, MapPinned, PenLine, Palette, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ExamplePoster } from '../components/ExamplePoster';
import { FIXTURE_PLACES, toResult } from '../api/fixtures';

const place = (id: string) => toResult(FIXTURE_PLACES.find((p) => p.id === id)!);
const EXAMPLES: { input: DraftInput; themeId: 'blush' | 'classic-ink' | 'midnight' }[] = [
  { themeId: 'blush', input: { places: [place('W1')], title: 'Where it all began', subtitle: null, date: { iso: '2019-06-14', precision: 'day' }, mood: 'romantic', locale: 'en' } },
  { themeId: 'classic-ink', input: { places: [place('W8')], title: 'Our first trip', subtitle: null, date: { iso: '2022-08', precision: 'month' }, mood: 'adventurous', locale: 'en' } },
  { themeId: 'midnight', input: { places: [place('W10')], title: 'The night we met', subtitle: null, date: { iso: '2017', precision: 'year' }, mood: 'neutral', locale: 'en' } },
];

export default function LandingPage() {
  const { t } = useTranslation();
  return (
    <main id="main">
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="w-fit rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">{t('landing.kicker')}</p>
          <h1 className="font-display text-4xl leading-tight sm:text-6xl">{t('landing.title')}</h1>
          <p className="max-w-xl text-lg text-ink-soft">{t('landing.lead')}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/create" className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-6 font-medium text-white shadow-sm hover:bg-accent-strong" data-testid="cta-create">
              {t('landing.cta')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <span className="text-sm text-ink-soft">{t('landing.ctaNote')}</span>
          </div>
        </div>
        <div className="relative flex h-[380px] items-center justify-center sm:h-[460px]" aria-label={t('landing.examplesLabel')} role="img">
          <div className="absolute -rotate-6 translate-x-[-58%] translate-y-4 opacity-95">
            <ExamplePoster {...EXAMPLES[1]!} width={200} />
          </div>
          <div className="absolute rotate-6 translate-x-[58%] translate-y-6 opacity-95">
            <ExamplePoster {...EXAMPLES[2]!} width={200} />
          </div>
          <div className="relative z-10">
            <ExamplePoster {...EXAMPLES[0]!} width={250} />
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-white" aria-labelledby="how">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 id="how" className="font-display text-3xl">
            {t('landing.howTitle')}
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              { icon: PenLine, key: 'tell' },
              { icon: MapPinned, key: 'place' },
              { icon: Palette, key: 'design' },
              { icon: Download, key: 'print' },
            ].map(({ icon: Icon, key }, i) => (
              <li key={key} className="flex flex-col gap-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-sand">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="font-semibold">
                  {i + 1}. {t(`landing.how.${key}.title`)}
                </h3>
                <p className="text-sm text-ink-soft">{t(`landing.how.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="privacy-promise">
        <h2 id="privacy-promise" className="font-display text-3xl">
          {t('landing.privacyTitle')}
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            { icon: Lock, key: 'discard' },
            { icon: ShieldCheck, key: 'tracking' },
            { icon: Trash2, key: 'delete' },
          ].map(({ icon: Icon, key }) => (
            <li key={key} className="flex gap-3 rounded-2xl border border-line bg-white p-5">
              <Icon aria-hidden className="size-5 shrink-0 text-ok" />
              <div>
                <h3 className="font-semibold">{t(`landing.privacy.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-ink-soft">{t(`landing.privacy.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
