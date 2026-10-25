import { MAX_PHOTOS, PHOTO_FRAMES, type Photo, type PhotoFrame } from '@mapmory/design-schema';
import { pageHeightDu } from '@mapmory/poster-core';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, isApiError, MAX_PHOTO_BYTES, PHOTO_TYPES } from '../../../api';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, ShieldCheck, Trash2, TriangleAlert } from '../../../components/icons';
import { Button, Callout, ColorField, Dialog, IconButton, SectionTitle, Slider, ToggleGroup, cx } from '../../../components/ui';
import { useDesign, useEditor } from '../../../store/editor';
import { addPhoto, clampToPage, gesture, nextId, removePhoto, updatePhoto } from '../actions';
import { usePreflight } from './TextPanel';

const ERROR_CODES = ['unsupported_image', 'invalid_image', 'photo_limit', 'payload_too_large'] as const;

/** Photos placed on the poster. Uploads are re-encoded by the server, which removes location data (docs/api.md). */
export function PhotosPanel() {
  const { t } = useTranslation();
  const design = useDesign();
  const projectId = useEditor((s) => s.projectId)!;
  const selectedId = useEditor((s) => s.ui.selectedPhotoId);
  const setUi = useEditor((s) => s.setUi);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const full = design.photos.length >= MAX_PHOTOS;
  const selected = design.photos.find((p) => p.id === selectedId) ?? design.photos[0];

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadPhoto(projectId, file),
    onSuccess: (photo) => {
      const d = useEditor.getState().design!;
      const id = nextId('p', d.photos);
      addPhoto({
        id,
        photoId: photo.id,
        center: [500, Math.round(pageHeightDu(d.page) / 2)],
        widthDu: 400,
        aspect: Math.min(5, Math.max(0.2, photo.height / photo.width)),
        pxWidth: Math.max(1, Math.min(20000, photo.width)),
        rotationDeg: 0,
        frame: 'polaroid',
        frameColor: '#FFFFFF',
      });
      setUi({ selectedPhotoId: id });
    },
  });

  const start = (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    upload.reset();
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return setLocalError(t('editor.photos.errors.unsupported_image'));
    if (file.size > MAX_PHOTO_BYTES) return setLocalError(t('editor.photos.errors.payload_too_large'));
    upload.mutate(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!full) start(e.dataTransfer.files[0]);
  };

  const uploadError = upload.error
    ? t(`editor.photos.errors.${ERROR_CODES.find((c) => isApiError(upload.error, c)) ?? 'generic'}`)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cx('airmail flex flex-col items-center gap-3 rounded-2xl p-5 text-center', dragOver && 'border-brand bg-sand')}
        >
          <input
            ref={fileRef}
            id="photo-file"
            type="file"
            accept={PHOTO_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-label={t('editor.photos.choose')}
            data-testid="photo-file"
            onChange={(e) => start(e.target.files?.[0])}
          />
          <p className="text-sm">{t('editor.photos.drop')}</p>
          <Button variant="secondary" size="sm" disabled={full || upload.isPending} loading={upload.isPending} onClick={() => fileRef.current?.click()} data-testid="photo-upload">
            <Plus aria-hidden className="size-4" />
            {t('editor.photos.choose')}
          </Button>
          <p className="text-xs text-ink-soft">{full ? t('editor.photos.full', { max: MAX_PHOTOS }) : t('editor.photos.formats')}</p>
        </div>
        <p className="flex items-start gap-2 text-xs text-ink-soft">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 [--icon-duo:var(--color-ok)]" />
          {t('editor.photos.privacy')}
        </p>
        <span className="sr-only" role="status" aria-live="polite">
          {upload.isPending ? t('editor.photos.uploading') : upload.isSuccess ? t('editor.photos.added') : ''}
        </span>
        {(localError || uploadError) && (
          <Callout tone="error">
            {localError ?? uploadError}
          </Callout>
        )}
      </section>

      {design.photos.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('editor.photos.list')}>
          <SectionTitle>{t('editor.photos.list')}</SectionTitle>
          <ul className="grid grid-cols-4 gap-2" data-testid="photo-list">
            {design.photos.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={selected?.id === p.id}
                  aria-label={t('editor.photos.select', { n: i + 1 })}
                  onClick={() => setUi({ selectedPhotoId: p.id })}
                  className={cx('block aspect-square w-full overflow-hidden rounded-lg border-2', selected?.id === p.id ? 'border-brand' : 'border-line')}
                >
                  <img src={api.photoUrl(p.photoId)} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && <PhotoSettings key={selected.id} photo={selected} />}
    </div>
  );
}

function PhotoSettings({ photo }: { photo: Photo }) {
  const { t } = useTranslation();
  const design = useDesign();
  const setUi = useEditor((s) => s.setUi);
  const issues = usePreflight().filter((i) => i.target === photo.id);
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<Photo>) => updatePhoto(photo.id, patch);
  /** Keyboard/button alternative to dragging on the poster (WCAG 2.5.7). */
  const nudge = (dx: number, dy: number) => set({ center: clampToPage(design, [photo.center[0] + dx * 10, photo.center[1] + dy * 10]) });

  const remove = () => {
    removePhoto(photo.id);
    setUi({ selectedPhotoId: null });
    setConfirm(false);
    // Delete the stored image unless another element still uses it.
    // The file stays on the server so undo can bring the photo back; unused photos are deleted after 24 h.
  };

  return (
    <section className="flex flex-col gap-4" aria-label={t('editor.photos.selected')}>
      <SectionTitle>{t('editor.photos.selected')}</SectionTitle>
      {issues.map((i) => (
        <p key={i.code} className="flex items-start gap-2 text-xs font-medium text-warn" role="status" data-testid="photo-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t(`preflight.${i.code}`)}
        </p>
      ))}
      <Slider label={t('editor.photos.size')} value={photo.widthDu} min={40} max={1000} step={5} onChange={(widthDu) => set({ widthDu })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
      <Slider
        label={t('editor.photos.rotation')}
        value={photo.rotationDeg}
        min={-180}
        max={180}
        format={(v) => `${v}°`}
        onChange={(rotationDeg) => set({ rotationDeg })}
        onGestureStart={gesture.start}
        onGestureEnd={gesture.end}
      />
      <ToggleGroup<PhotoFrame>
        label={t('editor.photos.frame')}
        value={photo.frame}
        onChange={(frame) => set({ frame })}
        options={PHOTO_FRAMES.map((f) => ({ value: f, label: t(`editor.photos.frames.${f}`) }))}
      />
      {(photo.frame === 'border' || photo.frame === 'polaroid') && (
        <ColorField label={t('editor.photos.frameColor')} value={photo.frameColor} onChange={(frameColor) => set({ frameColor })} onGestureStart={gesture.start} onGestureEnd={gesture.end} />
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('editor.photos.position')}</span>
        <p className="text-xs text-ink-soft">{t('editor.photos.dragHint')}</p>
        <div className="flex flex-wrap items-center gap-1">
          <IconButton variant="secondary" label={t('editor.photos.nudgeLeft')} onClick={() => nudge(-1, 0)}>
            <ArrowLeft aria-hidden className="size-4" />
          </IconButton>
          <IconButton variant="secondary" label={t('editor.photos.nudgeUp')} onClick={() => nudge(0, -1)}>
            <ArrowUp aria-hidden className="size-4" />
          </IconButton>
          <IconButton variant="secondary" label={t('editor.photos.nudgeDown')} onClick={() => nudge(0, 1)}>
            <ArrowDown aria-hidden className="size-4" />
          </IconButton>
          <IconButton variant="secondary" label={t('editor.photos.nudgeRight')} onClick={() => nudge(1, 0)}>
            <ArrowRight aria-hidden className="size-4" />
          </IconButton>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => setConfirm(true)} data-testid="photo-delete">
        <Trash2 aria-hidden className="size-4" />
        {t('editor.photos.delete')}
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm} title={t('editor.photos.deleteTitle')} description={t('editor.photos.deleteBody')}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            {t('ui.cancel')}
          </Button>
          <Button variant="danger" onClick={remove} data-testid="photo-delete-confirm">
            {t('editor.photos.deleteConfirm')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
