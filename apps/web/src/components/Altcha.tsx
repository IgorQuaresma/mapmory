import 'altcha';
import type {} from 'altcha/types/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/** Open-source proof-of-work bot check (ALTCHA, plan §3) for anonymous interpretations. */
export function AltchaWidget({ onVerified }: { onVerified: (payload: string | null) => void }) {
  const ref = useRef<HTMLElement>(null);
  const { i18n } = useTranslation();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<{ state: string; payload?: string }>).detail;
      onVerified(detail.state === 'verified' ? (detail.payload ?? null) : null);
    };
    el.addEventListener('statechange', onState);
    return () => el.removeEventListener('statechange', onState);
  }, [onVerified]);
  return <altcha-widget ref={ref} challenge="/api/v1/altcha/challenge" language={i18n.language.slice(0, 2)} auto="onload" />;
}
