import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2Off } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ShareLink } from '../../api';
import { Button, Callout, Dialog, LiveRegion } from '../../components/ui';

/** Create, copy and revoke the read-only preview link of a poster (plan §12 v1). */
export function ShareDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['share', projectId];
  const status = useQuery({ queryKey: key, queryFn: () => api.getShareStatus(projectId), enabled: open });
  const [link, setLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);

  const create = useMutation({
    mutationFn: () => api.createShareLink(projectId),
    onSuccess: (l) => {
      setLink(l);
      setRevoked(false);
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const revoke = useMutation({
    mutationFn: () => api.revokeShareLink(projectId),
    onSuccess: () => {
      setLink(null);
      setRevoked(true);
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const expiresAt = link?.expiresAt ?? status.data?.active?.expiresAt;
  const date = expiresAt ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(expiresAt)) : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the field stays selectable for manual copying */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('share.title')} description={t('share.body')}>
      <div className="space-y-4" data-testid="share-dialog">
        {link && (
          <div className="space-y-2">
            <label htmlFor="share-url" className="text-sm font-medium">
              {t('share.linkLabel')}
            </label>
            <div className="flex gap-2">
              <input
                id="share-url"
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-line bg-sand/40 px-3 py-2 text-sm"
                data-testid="share-url"
              />
              <Button variant="secondary" onClick={() => void copy()}>
                {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                {copied ? t('share.copied') : t('share.copy')}
              </Button>
            </div>
          </div>
        )}
        {date && (link || status.data?.active) && <p className="text-sm text-ink-soft">{t('share.expires', { date })}</p>}
        {revoked && <Callout tone="ok">{t('share.revoked')}</Callout>}
        {(create.isError || revoke.isError) && <Callout tone="error">{t('errors.generic')}</Callout>}
        <div className="flex flex-wrap justify-end gap-2">
          {(link || status.data?.active) && (
            <Button variant="ghost" onClick={() => revoke.mutate()} disabled={revoke.isPending} data-testid="share-revoke">
              <Link2Off aria-hidden className="size-4" />
              {t('share.revoke')}
            </Button>
          )}
          <Button onClick={() => create.mutate()} disabled={create.isPending} data-testid="share-create">
            {create.isPending ? t('share.creating') : t('share.create')}
          </Button>
        </div>
        <LiveRegion>{copied ? t('share.copied') : revoked ? t('share.revoked') : ''}</LiveRegion>
      </div>
    </Dialog>
  );
}
