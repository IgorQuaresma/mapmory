import type { Discipline } from '@mapmory/design-schema';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Bike, Run, Swim } from './icons';
import { formatRaceTime, parseDistance, parseRaceTime } from '../features/editor/race';
import { Field, TextInput } from './ui';

export const DISCIPLINE_ICONS: Record<Discipline, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = { swim: Swim, bike: Bike, run: Run };

/** A time typed as h:mm:ss; `onChange` only fires for valid times (or an empty field, as null). */
interface GestureProps {
  /** Editor fields group typing into one undo step. */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}

export function TimeField({
  label,
  hint,
  value,
  onChange,
  testId,
  onGestureStart,
  onGestureEnd,
}: { label: string; hint?: string; value: number | null; onChange: (s: number | null) => void; testId: string } & GestureProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(formatRaceTime(value));
  const [invalid, setInvalid] = useState(false);
  // Follow outside changes (undo, import) unless the field holds an unfinished or invalid edit.
  const shown = invalid || parseRaceTime(text) === value ? text : formatRaceTime(value);
  return (
    <Field label={label} hint={hint ?? t('race.timeHint')} error={invalid ? t('race.timeInvalid') : undefined}>
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          placeholder="h:mm:ss"
          value={shown}
          onChange={(e) => {
            setText(e.target.value);
            const s = parseRaceTime(e.target.value);
            setInvalid(s === undefined);
            if (s !== undefined) onChange(s);
          }}
          onFocus={onGestureStart}
          onBlur={() => {
            if (!invalid) setText(formatRaceTime(value));
            onGestureEnd?.();
          }}
          data-testid={testId}
        />
      )}
    </Field>
  );
}

/** A distance in km ("3.8" or "3,8"); `onChange` only fires for valid values (or an empty field, as null). */
export function DistanceField({
  label,
  value,
  onChange,
  testId,
  onGestureStart,
  onGestureEnd,
}: { label: string; value: number | null; onChange: (km: number | null) => void; testId: string } & GestureProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value === null ? '' : String(value));
  const [invalid, setInvalid] = useState(false);
  const shown = invalid || parseDistance(text) === value ? text : value === null ? '' : String(value);
  return (
    <Field label={label} error={invalid ? t('race.distanceInvalid') : undefined}>
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          inputMode="decimal"
          value={shown}
          onChange={(e) => {
            setText(e.target.value);
            const km = parseDistance(e.target.value);
            setInvalid(km === undefined);
            if (km !== undefined) onChange(km);
          }}
          onFocus={onGestureStart}
          onBlur={onGestureEnd}
          data-testid={testId}
        />
      )}
    </Field>
  );
}
