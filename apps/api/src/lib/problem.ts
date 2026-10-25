/** Stable error codes the UI relies on (docs/api.md). */
export type ProblemCode =
  | 'validation_failed'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'altcha_required'
  | 'altcha_invalid'
  | 'auth_required'
  | 'email_unverified'
  | 'not_found'
  | 'revision_conflict'
  | 'export_in_progress'
  | 'export_too_large'
  | 'feature_unavailable'
  | 'csrf_invalid'
  | 'interpretation_unavailable'
  | 'payload_too_large'
  | 'unsupported_image'
  | 'invalid_image'
  | 'photo_limit'
  | 'internal';

const TITLES: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict',
  413: 'Payload Too Large', 415: 'Unsupported Media Type', 422: 'Unprocessable Content', 429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable',
};

export class Problem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ProblemCode,
    message?: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message ?? code);
  }

  toJSON() {
    return {
      type: 'about:blank',
      title: TITLES[this.status] ?? 'Error',
      status: this.status,
      code: this.code,
      ...(this.message && this.message !== this.code ? { detail: this.message } : {}),
      ...this.extra,
    };
  }
}

export const notFound = () => new Problem(404, 'not_found', 'Not found');
