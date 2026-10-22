import { HttpApi } from './http';
import { MockApi } from './mock';
import type { ApiClient } from './types';

export * from './types';
export * from './errors';

export const isMockApi = import.meta.env.VITE_API_MOCK === '1';

/** The app-wide API client: the HTTP implementation, or the in-memory mock with VITE_API_MOCK=1. */
export const api: ApiClient = isMockApi ? new MockApi() : new HttpApi();
