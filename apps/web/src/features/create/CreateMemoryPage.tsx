import { MAX_MEMORY_TEXT } from '@mapmory/design-schema';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, isApiError } from '../../api';
import { AltchaWidget } from '../../components/Altcha';
import { Stepper } from '../../components/Stepper';
import { Button, Callout, Textarea } from '../../components/ui';
import { useFocusHeading } from '../../lib/hooks';
import { useSession } from '../../lib/queries';
import { useWizard } from './wizard';

const EXAMPLES = ['engaged', 'grewUp', 'trip'] as const;

export default function CreateMemoryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const heading = useFocusHeading<HTMLHeadingElement>();
  const session = useSession();
  const { memoryText, setMemoryText, setResult, startManual } = useWizard();
  const [altcha, setAltcha] = useState<string | null>(null);
  const onVerified = useCallback((p: string | null) => setAltcha(p), []);
  const needsAltcha = !!session.data?.features.altcha && !session.data.user;
  const max = session.data?.limits.maxMemoryText ?? MAX_MEMORY_TEXT;

  const interpret = useMutation({
    mutationFn: () => api.interpret({ text: memoryText.trim(), locale: i18n.language, altcha: altcha ?? undefined }),
    onSuccess: (res) => {
      setResult(res);
      navigate('/create/place');
    },
    onError: (e) => {
      if (isApiError(e, 'interpretation_unavailable') || isApiError(e, 'internal')) {
        startManual(true);
        navigate('/create/place');
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (memoryText.trim().length < 3 || (needsAltcha && !altcha)) return;
    interpret.mutate();
  };

  const errorText = interpret.error
    ? isApiError(interpret.error, 'rate_limited') || isApiError(interpret.error, 'quota_exceeded')
      ? t('create.errors.rateLimited')
      : isApiError(interpret.error, 'altcha_required') || isApiError(interpret.error, 'altcha_invalid')
        ? t('create.errors.altcha')
        : t('errors.generic')
    : null;

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12">
      <Stepper current="memory" />
      <div className="flex flex-col gap-3">
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl sm:text-4xl focus:outline-none">
          {t('create.title')}
        </h1>
        <p className="text-ink-soft">{t('create.lead')}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4" aria-describedby="memory-privacy">
        <label htmlFor="memory" className="text-sm font-medium">
          {t('create.label')}
        </label>
        <Textarea
          id="memory"
          rows={6}
          maxLength={max}
          value={memoryText}
          onChange={(e) => setMemoryText(e.target.value)}
          placeholder={t('create.placeholder')}
          aria-describedby="memory-count memory-privacy"
          className="text-base"
          data-testid="memory-input"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <span id="memory-count" aria-live="polite">
            {t('create.count', { count: memoryText.length, max })}
          </span>
          <span id="memory-privacy">{t('create.privacy')}</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{t('create.examplesTitle')}</span>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setMemoryText(t(`create.examples.${ex}`))}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-sm hover:border-ink-soft"
              >
                {t(`create.exampleLabels.${ex}`)}
              </button>
            ))}
          </div>
        </div>
        {needsAltcha && <AltchaWidget onVerified={onVerified} />}
        {errorText && <Callout tone="error">{errorText}</Callout>}
        <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/create/place?manual=1"
            onClick={() => startManual(false)}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            <Search aria-hidden className="size-4" />
            {t('create.skip')}
          </Link>
          <Button type="submit" size="lg" loading={interpret.isPending} disabled={memoryText.trim().length < 3 || (needsAltcha && !altcha)} data-testid="interpret-submit">
            {interpret.isPending ? (
              t('create.interpreting')
            ) : (
              <>
                <Sparkles aria-hidden className="size-4" />
                {t('create.submit')}
                <ArrowRight aria-hidden className="size-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}
