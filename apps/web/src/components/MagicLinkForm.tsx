import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, isApiError } from '../api';
import { useSession } from '../lib/queries';
import { Button, Callout, Field, Spinner, TextInput } from './ui';

/** Passwordless sign-in (plan §3): sends a single-use link; the session is picked up by polling. */
export function MagicLinkForm({ callbackPath, intro }: { callbackPath: string; intro?: string }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const send = useMutation({ mutationFn: () => api.signInMagicLink(email.trim(), callbackPath) });
  useSession({ pollWhileSignedOut: send.isSuccess });

  if (send.isSuccess) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5" role="status" data-testid="check-email">
        <MailCheck aria-hidden className="size-8 text-ok" />
        <h3 className="font-display text-xl">{t('auth.checkTitle')}</h3>
        <p className="text-sm text-ink-soft">{t('auth.checkBody', { email: email.trim() })}</p>
        <Spinner label={t('auth.waiting')} />
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => send.reset()}>
          {t('auth.useOther')}
        </Button>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5" data-testid="magic-link-form">
      <h3 className="font-display text-xl">{t('auth.title')}</h3>
      <p className="text-sm text-ink-soft">{intro ?? t('auth.intro')}</p>
      <Field label={t('auth.email')}>
        {({ id }) => (
          <TextInput id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        )}
      </Field>
      {send.isError && (
        <Callout tone="error">{isApiError(send.error, 'rate_limited') ? t('auth.rateLimited') : t('auth.failed')}</Callout>
      )}
      <Button type="submit" loading={send.isPending} className="w-fit">
        {t('auth.send')}
      </Button>
    </form>
  );
}
