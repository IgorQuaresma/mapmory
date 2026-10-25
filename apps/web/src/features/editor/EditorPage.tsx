import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, CloudOff, Download, Loader2, Redo2, RotateCcw, Share2, TriangleAlert, Undo2 } from '../../components/icons';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { api, isApiError } from '../../api';
import { Button, Callout, Dialog, IconButton, LiveRegion, cx } from '../../components/ui';
import { deleteDraft, getDraft, type LocalDraft } from '../../lib/drafts';
import { useMediaQuery } from '../../lib/hooks';
import { queryKeys, useCatalog } from '../../lib/queries';
import { autosaveControl, useAutosave } from '../../store/autosave';
import { redo, undo, useEditor, useHistory, type PanelId } from '../../store/editor';
import { replaceDesign } from './actions';
import { AreaPanel } from './panels/AreaPanel';
import { LayoutPanel } from './panels/LayoutPanel';
import { MarkersPanel } from './panels/MarkersPanel';
import { PhotosPanel } from './panels/PhotosPanel';
import { RacePanel } from './panels/RacePanel';
import { RoutesPanel } from './panels/RoutesPanel';
import { StylePanel } from './panels/StylePanel';
import { TextPanel } from './panels/TextPanel';
import { ShareDialog } from '../share/ShareDialog';
import { PosterPreview } from './PosterPreview';

// Race comes first: this edition leads with race posters (one map per leg).
const PANELS: { id: PanelId; render: () => ReactNode }[] = [
  { id: 'race', render: () => <RacePanel /> },
  { id: 'style', render: () => <StylePanel /> },
  { id: 'area', render: () => <AreaPanel /> },
  { id: 'markers', render: () => <MarkersPanel /> },
  { id: 'routes', render: () => <RoutesPanel /> },
  { id: 'photos', render: () => <PhotosPanel /> },
  { id: 'text', render: () => <TextPanel /> },
  { id: 'layout', render: () => <LayoutPanel /> },
];

export default function EditorPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const catalog = useCatalog();
  const project = useQuery({ queryKey: queryKeys.project(id), queryFn: () => api.getProject(id), staleTime: Infinity, gcTime: 0, retry: (n, e) => !isApiError(e, 'not_found') && n < 2 });
  const loadedId = useEditor((s) => s.projectId);
  const hasDesign = useEditor((s) => s.design !== null);
  const [draft, setDraft] = useState<LocalDraft | null>(null);

  useEffect(() => {
    if (!project.data) return;
    useEditor.getState().load(id, project.data.design, project.data.revision);
    void getDraft(id).then((d) => {
      if (d && JSON.stringify(d.design) !== JSON.stringify(project.data.design)) setDraft(d);
    });
  }, [project.data, id]);

  useEffect(() => () => useEditor.getState().reset(), []);

  if (project.isError) {
    return (
      <main id="main" className="mx-auto max-w-lg p-8">
        <Callout tone="error" title={isApiError(project.error, 'not_found') ? t('editor.notFound') : t('errors.generic')}>
          <Link className="underline" to="/create">
            {t('editor.startNew')}
          </Link>
        </Callout>
      </main>
    );
  }
  if (!project.data || !catalog.data || loadedId !== id || !hasDesign) return <EditorSkeleton />;
  return <Editor projectId={id} draft={draft} onDraftHandled={() => setDraft(null)} />;
}

function EditorSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex h-dvh flex-col" aria-busy="true">
      <div className="h-14 border-b border-line bg-white" />
      <div className="flex flex-1">
        <div className="hidden w-[380px] border-r border-line bg-white p-4 md:block">
          <div className="skeleton h-8 w-40 rounded" />
          <div className="mt-4 grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton aspect-[3/4] rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center bg-lav">
          <div className="skeleton aspect-[1/1.414] h-[70%] rounded shadow" />
          <span className="sr-only" role="status">
            {t('editor.loading')}
          </span>
        </div>
      </div>
    </div>
  );
}

function Editor({ projectId, draft, onDraftHandled }: { projectId: string; draft: LocalDraft | null; onDraftHandled: () => void }) {
  const { t } = useTranslation();
  useAutosave();
  useShortcuts();
  const panel = useEditor((s) => s.ui.panel);
  const mobileOpen = useEditor((s) => s.ui.mobilePanelOpen);
  const setUi = useEditor((s) => s.setUi);
  const isDesktop = useMediaQuery('(min-width: 900px)');

  const tabs = (
    <Tabs.Root value={panel} onValueChange={(v) => setUi({ panel: v as PanelId, mobilePanelOpen: true })} className="flex min-h-0 flex-1 flex-col">
      <Tabs.List aria-label={t('editor.panels.label')} className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-2 pt-2">
        {PANELS.map((p) => (
          <Tabs.Trigger
            key={p.id}
            value={p.id}
            className="rounded-t-lg border-b-2 border-transparent px-2.5 py-2 text-sm font-medium text-ink-soft hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink"
          >
            {t(`editor.panels.${p.id}`)}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {PANELS.map((p) => (
        <Tabs.Content key={p.id} value={p.id} className="min-h-0 flex-1 overflow-y-auto p-4 focus-visible:outline-none">
          {p.render()}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <TopBar projectId={projectId} />
      {draft && (
        <div className="border-b border-sun bg-sun/25 px-4 py-2 text-sm text-warn" role="status">
          <span>{t('editor.draft.found')}</span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-3"
            onClick={() => {
              replaceDesign(() => draft.design);
              onDraftHandled();
            }}
          >
            {t('editor.draft.restore')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-1"
            onClick={() => {
              void deleteDraft(projectId);
              onDraftHandled();
            }}
          >
            {t('editor.draft.discard')}
          </Button>
        </div>
      )}
      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
          <aside aria-label={t('editor.panels.label')} className="flex w-[380px] shrink-0 flex-col border-r border-line bg-white">
            {tabs}
          </aside>
          <main id="main" className="flex min-w-0 flex-1 flex-col" aria-label={t('editor.preview.label')}>
            <PosterPreview />
          </main>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <main id="main" className="flex min-h-0 flex-1 flex-col" aria-label={t('editor.preview.label')}>
            <PosterPreview />
          </main>
          <section
            aria-label={t('editor.panels.label')}
            className={cx(
              'flex flex-col rounded-t-2xl border-t border-line bg-white shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] transition-[height]',
              mobileOpen ? 'h-[55dvh]' : 'h-auto',
            )}
            data-testid="bottom-sheet"
          >
            <button
              type="button"
              aria-expanded={mobileOpen}
              onClick={() => setUi({ mobilePanelOpen: !mobileOpen })}
              className="mx-auto mt-2 flex h-6 w-24 items-center justify-center"
              aria-label={mobileOpen ? t('editor.sheet.collapse') : t('editor.sheet.expand')}
            >
              <span className="h-1.5 w-12 rounded-full bg-line" />
            </button>
            {mobileOpen ? (
              tabs
            ) : (
              <div className="flex gap-1 overflow-x-auto px-3 pb-3">
                {PANELS.map((p) => (
                  <Button key={p.id} size="sm" variant="secondary" onClick={() => setUi({ panel: p.id, mobilePanelOpen: true })}>
                    {t(`editor.panels.${p.id}`)}
                  </Button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function TopBar({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canUndo = useHistory((s) => s.pastStates.length > 0);
  const canRedo = useHistory((s) => s.futureStates.length > 0);
  const title = useEditor((s) => s.design?.texts.find((x) => x.role === 'title')?.content);
  const [confirmReset, setConfirmReset] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    try {
      const res = await api.resetDesign(projectId);
      useEditor.getState().setRevision(res.revision);
      replaceDesign(() => res.design);
      useEditor.getState().setSave({ dirty: false, status: 'saved' });
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white px-2 sm:px-3">
      <IconButton label={t('editor.back')} onClick={() => navigate('/account')}>
        <ArrowLeft aria-hidden className="size-5" />
      </IconButton>
      <h1 className="min-w-0 flex-1 truncate font-display text-lg">{title || t('editor.untitled')}</h1>
      <div className="flex items-center gap-0.5">
        <IconButton label={t('editor.undo')} onClick={undo} disabled={!canUndo} data-testid="undo">
          <Undo2 aria-hidden className="size-5" />
        </IconButton>
        <IconButton label={t('editor.redo')} onClick={redo} disabled={!canRedo} data-testid="redo">
          <Redo2 aria-hidden className="size-5" />
        </IconButton>
        <IconButton label={t('editor.reset')} onClick={() => setConfirmReset(true)} className="hidden sm:inline-flex">
          <RotateCcw aria-hidden className="size-5" />
        </IconButton>
        <IconButton
          label={t('share.button')}
          onClick={() => void autosaveControl.flush().finally(() => setShareOpen(true))}
          data-testid="share-open"
        >
          <Share2 aria-hidden className="size-5" />
        </IconButton>
      </div>
      <ShareDialog projectId={projectId} open={shareOpen} onOpenChange={setShareOpen} />
      <SaveIndicator />
      <Button
        onClick={() => void autosaveControl.flush().finally(() => navigate(`/design/${projectId}/export`))}
        data-testid="go-export"
        aria-label={t('editor.export')}
      >
        <Download aria-hidden className="size-4" />
        <span className="hidden sm:inline">{t('editor.export')}</span>
      </Button>
      <Dialog open={confirmReset} onOpenChange={setConfirmReset} title={t('editor.resetTitle')} description={t('editor.resetBody')}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>
            {t('ui.cancel')}
          </Button>
          <Button variant="danger" loading={resetting} onClick={() => void reset()}>
            {t('editor.resetConfirm')}
          </Button>
        </div>
      </Dialog>
    </header>
  );
}

function SaveIndicator() {
  const { t } = useTranslation();
  const save = useEditor((s) => s.save);
  const status = save.dirty && save.status === 'saved' ? 'pending' : save.status;
  const map = {
    idle: { icon: null, text: '' },
    pending: { icon: <Loader2 aria-hidden className="size-4 opacity-40" />, text: t('editor.save.pending') },
    saving: { icon: <Loader2 aria-hidden className="size-4 animate-spin" />, text: t('editor.save.saving') },
    saved: { icon: <Check aria-hidden className="size-4 text-ok" />, text: t('editor.save.saved') },
    offline: { icon: <CloudOff aria-hidden className="size-4 text-warn" />, text: t('editor.save.offline') },
    error: { icon: <TriangleAlert aria-hidden className="size-4 text-bad" />, text: t('editor.save.error') },
  } as const;
  const item = map[status];
  return (
    <div className="flex items-center gap-1.5 px-1 text-xs text-ink-soft" data-testid="save-status" data-status={status}>
      {item.icon}
      <span className="hidden md:inline">{item.text}</span>
      <LiveRegion>{status === 'pending' ? '' : item.text}</LiveRegion>
    </div>
  );
}

/** ⌘/Ctrl+Z undo, ⇧⌘/Ctrl+Z or Ctrl+Y redo — native undo still works inside text fields. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
