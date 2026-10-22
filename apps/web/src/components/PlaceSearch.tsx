import type { GeocodeResult } from '@mapmory/design-schema';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useDebounced } from '../lib/hooks';
import { Spinner, TextInput, cx } from './ui';

/** Accessible autocomplete (combobox pattern) backed by the geocoder proxy. */
export function PlaceSearch({
  onSelect,
  label,
  placeholder,
  autoFocus,
}: {
  onSelect: (r: GeocodeResult) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q.trim(), 300);
  const { data, isFetching, isError } = useQuery({
    queryKey: ['geocode', debounced, i18n.language],
    queryFn: () => api.geocode(debounced, i18n.language.slice(0, 2)),
    enabled: debounced.length >= 2,
    staleTime: 5 * 60_000,
  });
  const results = debounced.length >= 2 ? (data ?? []) : [];

  const choose = (r: GeocodeResult) => {
    onSelect(r);
    setQ('');
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <TextInput
          id={id}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder ?? t('place.searchPlaceholder')}
          value={q}
          maxLength={200}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          className="pl-9"
        />
      </div>
      {open && debounced.length >= 2 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          {isFetching && results.length === 0 && (
            <div className="px-3 py-2">
              <Spinner label={t('place.searching')} />
            </div>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-soft">{isError ? t('place.searchError') : t('place.noResults')}</p>
          )}
          {results.length > 0 && (
            <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-72 overflow-auto py-1">
              {results.map((r, i) => (
                <li
                  key={r.id}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(r);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cx('flex cursor-pointer items-start gap-2 px-3 py-2 text-sm', i === active && 'bg-sand')}
                >
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-ink-soft">{r.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
