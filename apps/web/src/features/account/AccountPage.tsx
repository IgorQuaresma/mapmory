import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, Plus, Trash2 } from '../../components/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api';
import { MagicLinkForm } from '../../components/MagicLinkForm';
import { Button, Callout, Dialog, IconButton, SectionTitle, Spinner, TextInput } from '../../components/ui';
import { downloadBlob, useFocusHeading } from '../../lib/hooks';
import { queryKeys, useSession } from '../../lib/queries';

export default function AccountPage() {
  const { t, i18n } = useTranslation();
  const heading = useFocusHeading<HTMLHeadingElement>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const session = useSession();
  const user = session.data?.user;
  const projects = useQuery({ queryKey: queryKeys.projects, queryFn: () => api.listProjects() });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const signOut = useMutation({ mutationFn: () => api.signOut(), onSuccess: () => qc.invalidateQueries() });
  const exportData = useMutation({
    mutationFn: () => api.downloadDataExport(),
    onSuccess: (blob) => downloadBlob(blob, 'mapmory-data.json'),
  });
  const deleteAccount = useMutation({
    mutationFn: () => api.deleteAccount(),
    onSuccess: async () => {
      setConfirmDelete(false);
      await qc.invalidateQueries();
      navigate('/');
    },
  });
  const deleteProject = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      setDeleteProjectId(null);
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const confirmWord = t('account.deleteWord');

  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl focus:outline-none">
          {t('account.title')}
        </h1>
        {user && <p className="text-ink-soft">{t('account.signedInAs', { email: user.email })}</p>}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="posters">
        <div className="flex items-center justify-between">
          <SectionTitle as="h2">
            <span id="posters">{t('account.posters')}</span>
          </SectionTitle>
          <Link to="/create" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline">
            <Plus aria-hidden className="size-4" />
            {t('account.newPoster')}
          </Link>
        </div>
        {projects.isLoading && <Spinner label={t('editor.loading')} />}
        {projects.data?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="text-ink-soft">{t('account.noPosters')}</p>
            <Link to="/create" className="mt-3 inline-block font-medium text-accent-strong underline">
              {t('landing.cta')}
            </Link>
          </div>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.data?.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
              <Link to={`/design/${p.id}`} className="min-w-0 flex-1">
                <p className="truncate font-display text-lg">{p.title}</p>
                <p className="text-xs text-ink-soft">
                  {t('account.updated', { date: fmt(p.updatedAt) })}
                  {p.expiresAt && <> · {t('account.expires', { date: fmt(p.expiresAt) })}</>}
                </p>
              </Link>
              <IconButton label={t('account.deletePoster', { title: p.title })} onClick={() => setDeleteProjectId(p.id)}>
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        {!user && projects.data && projects.data.length > 0 && <Callout tone="info">{t('account.anonymousNote')}</Callout>}
      </section>

      {!session.data ? null : !user ? (
        <section className="max-w-md">
          <MagicLinkForm callbackPath="/account" />
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5" aria-labelledby="privacy-controls">
          <SectionTitle as="h2">
            <span id="privacy-controls">{t('account.privacy')}</span>
          </SectionTitle>
          <p className="text-sm text-ink-soft">{t('account.privacyLead')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => exportData.mutate()} loading={exportData.isPending}>
              <Download aria-hidden className="size-4" />
              {t('account.downloadData')}
            </Button>
            <Button variant="secondary" onClick={() => signOut.mutate()} loading={signOut.isPending}>
              <LogOut aria-hidden className="size-4" />
              {t('account.signOut')}
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden className="size-4" />
              {t('account.delete')}
            </Button>
          </div>
        </section>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t('account.deleteTitle')} description={t('account.deleteBody')}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmText.trim().toUpperCase() === confirmWord.toUpperCase()) deleteAccount.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('account.deleteType', { word: confirmWord })}
            <TextInput value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </label>
          {deleteAccount.isError && <Callout tone="error">{t('errors.generic')}</Callout>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t('ui.cancel')}
            </Button>
            <Button type="submit" variant="danger" loading={deleteAccount.isPending} disabled={confirmText.trim().toUpperCase() !== confirmWord.toUpperCase()}>
              {t('account.deleteConfirm')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!deleteProjectId} onOpenChange={(o) => !o && setDeleteProjectId(null)} title={t('account.deletePosterTitle')} description={t('account.deletePosterBody')}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteProjectId(null)}>
            {t('ui.cancel')}
          </Button>
          <Button variant="danger" loading={deleteProject.isPending} onClick={() => deleteProjectId && deleteProject.mutate(deleteProjectId)}>
            {t('account.deletePosterConfirm')}
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
