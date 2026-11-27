/**
 * Stock-Mate v2 — Staged Load Test Script (k6)
 *
 * Validates SLO targets across progressive concurrency levels:
 *   - Edge read latency: p95 < 200ms, p99 < 400ms
 *   - Authenticated API read latency: p95 < 250ms, p99 < 500ms
 *   - Availability / error rate: < 0.1% (99.9% SLO)
 *
 * Usage:
 *   # Safe smoke check (default: 20 VUs for 30s)
 *   k6 run scripts/load-test.k6.js
 *
 *   # Staging 10k VU ramp
 *   k6 run -e BASE_URL=https://stock-mate-v2.charlymicolas21.workers.dev -e LOAD_PROFILE=stress_10k scripts/load-test.k6.js
 *
 *   # Distributed 10k -> 50k -> 100k VU target profile (run via k6 Cloud or multi-node k6 Operator)
 *   k6 run -e BASE_URL=https://stock-mate-v2.charlymicolas21.workers.dev -e LOAD_PROFILE=scale_100k \
 *     -e TEST_EMAIL=loadtest@example.com -e TEST_PASSWORD=LoadTest123 scripts/load-test.k6.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'https://stock-mate-v2.charlymicolas21.workers.dev').replace(
  /\/$/,
  '',
);
const LOAD_PROFILE = __ENV.LOAD_PROFILE || 'smoke';
const TEST_EMAIL = __ENV.TEST_EMAIL || '';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || '';

const edgeReadDuration = new Trend('edge_read_duration', true);
const authReadDuration = new Trend('auth_read_duration', true);
const errorRate = new Rate('app_error_rate');

const PROFILES = {
  smoke: [
    { duration: '10s', target: 10 },
    { duration: '20s', target: 20 },
    { duration: '10s', target: 0 },
  ],
  stress_10k: [
    { duration: '1m', target: 1000 },
    { duration: '2m', target: 5000 },
    { duration: '3m', target: 10000 },
    { duration: '2m', target: 10000 },
    { duration: '1m', target: 0 },
  ],
  scale_100k: [
    { duration: '2m', target: 10000 },
    { duration: '3m', target: 10000 },
    { duration: '3m', target: 50000 },
    { duration: '5m', target: 50000 },
    { duration: '4m', target: 100000 },
    { duration: '5m', target: 100000 },
    { duration: '2m', target: 0 },
  ],
};

const selectedStages = PROFILES[LOAD_PROFILE] || PROFILES.smoke;

export const options = {
  stages: selectedStages,
  thresholds: {
    edge_read_duration: ['p(95)<200', 'p(99)<400'],
    auth_read_duration: ['p(95)<250', 'p(99)<500'],
    app_error_rate: ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
  },
  discardResponseBodies: false,
};

export function setup() {
  let cookieHeader = '';

  if (TEST_EMAIL && TEST_PASSWORD) {
    const loginRes = http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'StockMate',
        },
        tags: { endpoint: 'auth_login' },
      },
    );

    if (loginRes.status === 200) {
      const pairs = [];
      for (const [name, list] of Object.entries(loginRes.cookies || {})) {
        if (list && list.length > 0 && list[0].value) {
          pairs.push(`${name}=${list[0].value}`);
        }
      }
      cookieHeader = pairs.join('; ');
    }
  }

  return { cookieHeader };
}

export default function runVirtualUser(data) {
  const roll = Math.random();

  // 80% traffic: Shared Edge-cached catalog snapshot & liveness (0 D1 hits at 100k VUs)
  if (roll < 0.8 || !data.cookieHeader) {
    const snapRes = http.get(`${BASE_URL}/api/v1/catalog/snapshot`, {
      tags: { endpoint: 'catalog_snapshot', group: 'edge_read' },
    });
    edgeReadDuration.add(snapRes.timings.duration);

    const okSnap = check(snapRes, {
      'snapshot status 200 or 304': (r) => r.status === 200 || r.status === 304,
      'snapshot has cache-control': (r) =>
        Boolean(r.headers['Cache-Control'] || r.headers['cache-control']),
    });
    errorRate.add(!okSnap);

    // Conditional ETag revalidation check (304 Not Modified)
    const etag = snapRes.headers['ETag'] || snapRes.headers['etag'];
    if (etag) {
      const revalRes = http.get(`${BASE_URL}/api/v1/catalog/snapshot`, {
        headers: { 'If-None-Match': etag },
        tags: { endpoint: 'catalog_snapshot_304', group: 'edge_read' },
      });
      edgeReadDuration.add(revalRes.timings.duration);
      const okReval = check(revalRes, {
        'etag revalidation returns 304 or 200': (r) => r.status === 304 || r.status === 200,
      });
      errorRate.add(!okReval);
    }

    sleep(1 + Math.random() * 2);
    return;
  }

  // 20% traffic: Authenticated stateless fast-path reads (0 D1 session lookup via __Host-sm_at)
  const authHeaders = {
    Cookie: data.cookieHeader,
    'X-Requested-With': 'StockMate',
  };

  const meRes = http.get(`${BASE_URL}/api/v1/auth/me`, {
    headers: authHeaders,
    tags: { endpoint: 'auth_me', group: 'api_read' },
  });
  authReadDuration.add(meRes.timings.duration);
  const okMe = check(meRes, { 'auth/me 200': (r) => r.status === 200 });
  errorRate.add(!okMe);

  const wlRes = http.get(`${BASE_URL}/api/v1/watchlist`, {
    headers: authHeaders,
    tags: { endpoint: 'watchlist_list', group: 'api_read' },
  });
  authReadDuration.add(wlRes.timings.duration);
  const okWl = check(wlRes, { 'watchlist 200': (r) => r.status === 200 });
  errorRate.add(!okWl);

  sleep(2 + Math.random() * 3);
}
