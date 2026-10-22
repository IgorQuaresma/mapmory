/* global __ENV */
// k6 load test for the API (plan §10). Read paths plus the autosave write path.
// Usage: k6 run -e BASE_URL=https://staging.example -e ORIGIN=https://staging.example infra/load/api.js
// Per-IP rate limits apply (docs/api.md); run from several agents or raise limits on the staging environment.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:5173';
const ORIGIN = __ENV.ORIGIN || BASE;

export const options = {
  scenarios: {
    browse: { executor: 'ramping-vus', stages: [{ duration: '30s', target: 20 }, { duration: '2m', target: 20 }, { duration: '20s', target: 0 }], exec: 'browse' },
    edit: { executor: 'constant-vus', vus: 5, duration: '2m', exec: 'edit', startTime: '10s' },
  },
  thresholds: {
    'http_req_failed{scenario:browse}': ['rate<0.01'],
    'http_req_duration{scenario:browse}': ['p(95)<300'],
    'http_req_duration{name:save}': ['p(95)<500'],
  },
};

const DRAFT = {
  places: [{ id: 'W1', name: 'Pont des Arts', label: 'Pont des Arts, Paris, France', lngLat: [2.33753, 48.85826], bbox: null, type: 'poi', city: 'Paris', country: 'France' }],
  title: 'Load test', subtitle: null, date: { iso: '2019-06-14', precision: 'day' }, mood: 'romantic', locale: 'en',
};

export function browse() {
  check(http.get(`${BASE}/api/v1/session`), { session: (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/catalog`), { catalog: (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/geocode?q=paris&lang=en`), { geocode: (r) => r.status === 200 || r.status === 429 });
  sleep(1);
}

export function edit() {
  const csrf = http.get(`${BASE}/api/v1/session`).json('csrfToken');
  const headers = { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': csrf };
  const created = http.post(`${BASE}/api/v1/projects`, JSON.stringify({ draft: DRAFT }), { headers });
  if (!check(created, { created: (r) => r.status === 201 })) return sleep(5);
  const { project, design } = created.json();
  let revision = 1;
  for (let i = 0; i < 20; i++) {
    design.map.zoom = 14 + (i % 10) / 10;
    const res = http.put(`${BASE}/api/v1/projects/${project.id}/design`, JSON.stringify({ design }), {
      headers: { ...headers, 'if-match': `"${revision}"` },
      tags: { name: 'save' },
    });
    if (check(res, { saved: (r) => r.status === 200 })) revision = res.json('revision');
    sleep(1.5);
  }
}
