import { Globe } from './icons';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { SUPPORTED_LANGUAGES, type Language } from '../i18n';
import { useSession } from '../lib/queries';
import { cx } from './ui';

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-xl">
      {/* Postmark stamp: perforated edge, cancellation ring, coral pin. */}
      <svg viewBox="0 0 40 40" className="size-8" aria-hidden>
        <rect x="3" y="3" width="34" height="34" fill="#ffc93c" />
        <rect x="3" y="3" width="34" height="34" fill="none" stroke="#2e3fd6" strokeWidth="2" strokeDasharray="3 2.2" />
        <circle cx="20" cy="20" r="10.5" fill="none" stroke="#2e3fd6" strokeWidth="1.6" />
        <path d="M20 13.5c-2.6 0-4.6 2-4.6 4.6 0 3.5 4.6 8 4.6 8s4.6-4.5 4.6-8c0-2.6-2-4.6-4.6-4.6z" fill="#ff5c7a" />
        <circle cx="20" cy="18.2" r="1.6" fill="#ffc93c" />
      </svg>
      Mapmory
    </span>
  );
}

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <label className="relative flex items-center gap-1.5 text-sm">
      <Globe aria-hidden className="size-4 text-ink-soft" />
      <span className="sr-only">{t('nav.language')}</span>
      <select
        value={i18n.language.slice(0, 2)}
        onChange={(e) => void i18n.changeLanguage(e.target.value as Language)}
        className="cursor-pointer rounded-md bg-transparent py-1 pr-1 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {t(`nav.languages.${l}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const session = useSession();
  const link = ({ isActive }: { isActive: boolean }) => cx('rounded-md px-2 py-1 text-sm font-medium hover:bg-sand', isActive && 'text-accent-strong');
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded bg-ink px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t('nav.skip')}
      </a>
      <header className="border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" aria-label={t('nav.home')}>
            <Logo />
          </Link>
          <nav aria-label={t('nav.main')} className="flex items-center gap-1 sm:gap-3">
            <NavLink to="/create" className={link}>
              {t('nav.create')}
            </NavLink>
            <NavLink to="/account" className={link}>
              {session.data?.user ? t('nav.myPosters') : t('nav.signIn')}
            </NavLink>
            <LanguageSwitch />
          </nav>
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-soft">
          <span>{t('footer.tagline')}</span>
          <nav aria-label={t('footer.label')} className="flex flex-wrap gap-4">
            <Link to="/privacy" className="hover:underline">
              {t('footer.privacy')}
            </Link>
            <Link to="/imprint" className="hover:underline">
              {t('footer.imprint')}
            </Link>
            <a href="https://www.openstreetmap.org/copyright" className="hover:underline" rel="noopener noreferrer" target="_blank">
              {t('footer.osm')}
            </a>
          </nav>
        </div>
      </footer>
      <ScrollRestoration />
    </div>
  );
}
