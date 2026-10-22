import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { clsx } from 'clsx';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import {
  forwardRef,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { useTranslation } from 'react-i18next';

export { clsx as cx };

/* ---------- Button ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:bg-sand',
  ghost: 'text-ink hover:bg-sand',
  danger: 'bg-bad text-white hover:bg-red-800',
};
const sizes = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string; tooltip?: boolean }>(function IconButton(
  { label, tooltip = true, className, children, variant = 'ghost', ...rest },
  ref,
) {
  const btn = (
    <Button ref={ref} variant={variant} aria-label={label} className={clsx('!px-0 w-10', className)} {...rest}>
      {children}
    </Button>
  );
  if (!tooltip) return btn;
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{btn}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 rounded-md bg-ink px-2 py-1 text-xs text-white shadow">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
});

export const TooltipProvider = TooltipPrimitive.Provider;

/* ---------- Fields ---------- */

export function Field({
  label,
  hint,
  error,
  children,
  id,
  className,
  labelHidden,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
  id?: string;
  className?: string;
  labelHidden?: boolean;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errId = error ? `${fieldId}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={fieldId} className={clsx('text-sm font-medium text-ink', labelHidden && 'sr-only')}>
        {label}
      </label>
      {children({ id: fieldId, describedBy })}
      {hint && (
        <p id={hintId} className="text-xs text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-soft/70 focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30 disabled:bg-sand';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(inputCls, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={clsx(inputCls, 'py-3 leading-relaxed', className)} {...rest} />;
});

/* ---------- Select ---------- */

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
  describedBy,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  label?: string;
  id?: string;
  describedBy?: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        aria-describedby={describedBy}
        className={clsx(inputCls, 'flex h-10 items-center justify-between gap-2 text-left', className)}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden className="size-4 text-ink-soft" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-white shadow-lg">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-sand"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2">
                  <Check aria-hidden className="size-4" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ---------- Slider (with gesture grouping for undo) ---------- */

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onGestureStart,
  onGestureEnd,
  format = (v) => String(v),
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  const id = useId();
  const active = useRef(false);
  const start = () => {
    if (!active.current) {
      active.current = true;
      onGestureStart?.();
    }
  };
  const end = () => {
    if (active.current) {
      active.current = false;
      onGestureEnd?.();
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        <output htmlFor={id} className="text-xs tabular-nums text-ink-soft">
          {format(value)}
        </output>
      </div>
      <SliderPrimitive.Root
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          start();
          onChange(v[0]!);
        }}
        onValueCommit={end}
        onPointerUp={end}
        onBlur={end}
        className="relative flex h-5 w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-1.5 grow rounded-full bg-line">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-ink" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-labelledby={`${id}-label`}
          aria-valuetext={format(value)}
          className="block size-5 rounded-full border-2 border-ink bg-white shadow focus-visible:ring-4 focus-visible:ring-focus/40"
        />
      </SliderPrimitive.Root>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

/* ---------- Switch ---------- */

export function Switch({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <span className="text-xs text-ink-soft">{hint}</span>}
      </div>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-ink"
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
    </div>
  );
}

/* ---------- Toggle group ---------- */

export function ToggleGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={clsx('flex flex-wrap gap-1.5', className)}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          title={o.title}
          aria-label={o.title}
          className="flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm hover:bg-sand data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-white"
        >
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

/* ---------- Colour field: swatch + picker + hex input (keyboard friendly) ---------- */

export function ColorField({
  label,
  value,
  onChange,
  onGestureStart,
  onGestureEnd,
  compact,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const normalize = (v: string) => `#${v.replace('#', '').toUpperCase()}`;
  return (
    <PopoverPrimitive.Root
      onOpenChange={(open) => (open ? onGestureStart?.() : onGestureEnd?.())}
    >
      <div className={clsx('flex items-center gap-2', compact && 'flex-col items-start gap-1')}>
        <PopoverPrimitive.Trigger
          aria-label={t('ui.pickColor', { name: label })}
          className="size-9 shrink-0 rounded-lg border border-line shadow-inner"
          style={{ background: value }}
        />
        {!compact && (
          <div className="flex min-w-0 flex-1 flex-col">
            <label htmlFor={id} className="truncate text-xs font-medium text-ink-soft">
              {label}
            </label>
            <HexColorInput
              id={id}
              prefixed
              color={value}
              onChange={(v) => v.length === 7 && onChange(normalize(v))}
              className="h-7 w-24 rounded-md border border-line px-2 font-mono text-xs uppercase focus:border-focus focus:outline-none"
            />
          </div>
        )}
        {compact && <span className="text-[11px] leading-tight text-ink-soft">{label}</span>}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={8} className="z-50 flex flex-col gap-3 rounded-xl border border-line bg-white p-3 shadow-xl">
          <HexColorPicker color={value} onChange={(v) => onChange(normalize(v))} />
          <label className="flex items-center gap-2 text-xs font-medium">
            {t('ui.hex')}
            <HexColorInput
              prefixed
              color={value}
              onChange={(v) => v.length === 7 && onChange(normalize(v))}
              className="h-8 w-full rounded-md border border-line px-2 font-mono text-xs uppercase"
            />
          </label>
          <PopoverPrimitive.Arrow className="fill-white" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/* ---------- Dialog ---------- */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
          <DialogPrimitive.Title className="font-display text-xl">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-2 text-sm text-ink-soft">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="mt-5">{children}</div>
          <DialogPrimitive.Close aria-label={t('ui.close')} className="absolute right-3 top-3 rounded-md p-1.5 text-ink-soft hover:bg-sand">
            <X aria-hidden className="size-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------- Feedback ---------- */

export function Callout({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'error' | 'ok'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    warn: 'border-amber-200 bg-amber-50 text-amber-950',
    error: 'border-red-200 bg-red-50 text-red-950',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  };
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={clsx('rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx(title && 'mt-1')}>{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-soft">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      {label}
    </span>
  );
}

/** Polite live region for status announcements (save state, export progress). */
export function LiveRegion({ children, assertive }: { children: ReactNode; assertive?: boolean }) {
  return (
    <div aria-live={assertive ? 'assertive' : 'polite'} aria-atomic="true" className="sr-only">
      {children}
    </div>
  );
}

export function SectionTitle({ children, as: As = 'h3' }: { children: ReactNode; as?: 'h2' | 'h3' }) {
  return <As className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{children}</As>;
}
