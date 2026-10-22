import * as Sentry from '@sentry/node';

/**
 * GlitchTip (open-source, Sentry-compatible) error tracking, enabled when SENTRY_DSN is set (plan §3).
 * Request bodies, cookies, headers, query strings and user data are stripped before sending (plan §8.4).
 */
export function initErrorTracking(service: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.RELEASE,
    serverName: service,
    // Collect nothing about requests, users, queries or job payloads (plan §8.4).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
      }
      delete event.user;
      return event;
    },
    beforeBreadcrumb: (b) => (b.category === 'http' || b.category === 'console' ? null : b),
  });
}

export function captureError(err: unknown, context?: Record<string, string>): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { tags: context } : undefined);
}
