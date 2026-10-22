import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useFocusHeading } from '../lib/hooks';

function Prose({ title, sections }: { title: string; sections: { h: string; p: string }[] }) {
  const heading = useFocusHeading<HTMLHeadingElement>();
  return (
    <main id="main" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 ref={heading} tabIndex={-1} className="font-display text-4xl focus:outline-none">
        {title}
      </h1>
      {sections.map((s) => (
        <section key={s.h} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{s.h}</h2>
          <p className="leading-relaxed text-ink-soft">{s.p}</p>
        </section>
      ))}
    </main>
  );
}

const PRIVACY_KEYS = ['what', 'memory', 'ai', 'retention', 'rights', 'cookies', 'processors'] as const;

export function PrivacyPage() {
  const { t } = useTranslation();
  return <Prose title={t('privacy.title')} sections={PRIVACY_KEYS.map((k) => ({ h: t(`privacy.${k}.h`), p: t(`privacy.${k}.p`) }))} />;
}

export function ImprintPage() {
  const { t } = useTranslation();
  return <Prose title={t('imprint.title')} sections={[{ h: t('imprint.operator.h'), p: t('imprint.operator.p') }, { h: t('imprint.data.h'), p: t('imprint.data.p') }]} />;
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-20">
      <h1 className="font-display text-4xl">{t('notFound.title')}</h1>
      <p className="text-ink-soft">{t('notFound.body')}</p>
      <Link to="/" className="font-medium text-accent-strong underline">
        {t('notFound.home')}
      </Link>
    </main>
  );
}
