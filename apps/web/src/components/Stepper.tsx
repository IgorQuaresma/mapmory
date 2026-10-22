import { Check } from './icons';
import { useTranslation } from 'react-i18next';
import { cx } from './ui';

const STEPS = ['memory', 'place', 'design', 'export'] as const;

export function Stepper({ current }: { current: (typeof STEPS)[number] }) {
  const { t } = useTranslation();
  const idx = STEPS.indexOf(current);
  return (
    <nav aria-label={t('steps.label')}>
      <ol className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 sm:gap-3" aria-current={i === idx ? 'step' : undefined}>
            <span
              className={cx(
                'flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
                i < idx && 'border-ok bg-ok text-white',
                i === idx && 'border-brand bg-brand text-white',
                i > idx && 'border-line bg-white text-ink-soft',
              )}
            >
              {i < idx ? <Check aria-hidden className="size-3.5" /> : i + 1}
            </span>
            <span className={cx('font-medium', i === idx ? 'text-ink' : 'hidden text-ink-soft sm:inline')}>
              {t(`steps.${s}`)}
              {i < idx && <span className="sr-only"> ({t('steps.done')})</span>}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden className="h-px w-4 bg-line sm:w-8" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
