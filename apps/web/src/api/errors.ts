/** Stable error codes from docs/api.md. */
export type ApiErrorCode =
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
  | 'network_error'
  | 'internal';

export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  code?: string;
  detail?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly body: ProblemDetails;

  constructor(body: ProblemDetails) {
    super(body.detail ?? body.title ?? `Request failed (${body.status})`);
    this.name = 'ApiError';
    this.status = body.status;
    this.code = (body.code as ApiErrorCode | undefined) ?? (body.status >= 500 ? 'internal' : 'validation_failed');
    this.body = body;
  }
}

export const isApiError = (e: unknown, code?: ApiErrorCode): e is ApiError =>
  e instanceof ApiError && (code === undefined || e.code === code);
