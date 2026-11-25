import { describe, expect, it } from 'vitest';
import { createApp } from '../index';
import { createTestD1 } from './d1-test-helper';

function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('SameSite=Lax');
  const match = setCookie!.match(/sm_session=([^;]+)/);
  expect(match?.[1]).toBeTruthy();
  return `sm_session=${match![1]}`;
}

describe('Stock-Mate v2 API Integration', () => {
  it('returns healthy status on GET /api/v1/health', async () => {
    const { d1 } = createTestD1();
    const app = createApp();

    const res = await app.request('http://localhost/api/v1/health', {}, { DB: d1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' });
    expect(res.headers.get('x-correlation-id')).toMatch(/^req_/);
  });

  it('handles full auth lifecycle with hashed tokens & RFC 7807 errors', async () => {
    const { d1, sqlite } = createTestD1();
    const app = createApp();

    // Register User A
    const regRes = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'Investor@Example.com',
          name: 'Budi Investor',
          password: 'Password123',
        }),
      },
      { DB: d1 },
    );
    expect(regRes.status).toBe(201);
    const cookie = extractSessionCookie(regRes);
    const rawToken = cookie.split('=')[1]!;
    const regJson = (await regRes.json()) as { user: { id: string; email: string; name: string } };
    expect(regJson.user.email).toBe('investor@example.com');

    // Verify password is PBKDF2-SHA256 hashed and session token is SHA-256 hashed (not raw)
    const userRow = sqlite.prepare('SELECT password_hash FROM users LIMIT 1').get() as {
      password_hash: string;
    };
    expect(userRow.password_hash).toMatch(/^pbkdf2_sha256\$100000\$/);

    const sessionRow = sqlite.prepare('SELECT token_hash FROM sessions LIMIT 1').get() as {
      token_hash: string;
    };
    expect(sessionRow.token_hash).not.toBe(rawToken);
    expect(sessionRow.token_hash).toHaveLength(64);

    // Duplicate email (case-insensitive) -> 409 RFC 7807
    const dupRes = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'INVESTOR@example.com',
          name: 'Another User',
          password: 'Password123',
        }),
      },
      { DB: d1 },
    );
    expect(dupRes.status).toBe(409);
    expect(dupRes.headers.get('content-type')).toContain('application/problem+json');

    // GET /me authenticated
    const meRes = await app.request(
      'http://localhost/api/v1/auth/me',
      { headers: { Cookie: cookie } },
      { DB: d1 },
    );
    expect(meRes.status).toBe(200);
    expect(((await meRes.json()) as { user: { name: string } }).user.name).toBe('Budi Investor');

    // Wrong password -> 401 generic
    const badLoginRes = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'investor@example.com',
          password: 'WrongPassword1',
        }),
      },
      { DB: d1 },
    );
    expect(badLoginRes.status).toBe(401);
    expect(badLoginRes.headers.get('content-type')).toContain('application/problem+json');

    // Valid login -> 200
    const loginRes = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'investor@example.com',
          password: 'Password123',
        }),
      },
      { DB: d1 },
    );
    expect(loginRes.status).toBe(200);
    const loginCookie = extractSessionCookie(loginRes);

    // Logout -> 204 and session invalidated
    const logoutRes = await app.request(
      'http://localhost/api/v1/auth/logout',
      { method: 'POST', headers: { Cookie: loginCookie } },
      { DB: d1 },
    );
    expect(logoutRes.status).toBe(204);

    const afterLogoutMe = await app.request(
      'http://localhost/api/v1/auth/me',
      { headers: { Cookie: loginCookie } },
      { DB: d1 },
    );
    expect(afterLogoutMe.status).toBe(401);
  });

  it('enforces Watchlist CRUD, IDOR isolation, soft-delete re-add, Rp 1 price, and index usage', async () => {
    const { d1, sqlite } = createTestD1();
    const app = createApp();

    // Register User A & User B
    const regA = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@example.com', name: 'User A', password: 'Password123' }),
      },
      { DB: d1 },
    );
    const cookieA = extractSessionCookie(regA);

    const regB = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'b@example.com', name: 'User B', password: 'Password123' }),
      },
      { DB: d1 },
    );
    const cookieB = extractSessionCookie(regB);

    // Create stock matching Golden Case 1
    const createRes = await app.request(
      'http://localhost/api/v1/watchlist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          ticker: 'icbp',
          companyName: 'Indofood CBP Sukses Makmur',
          sector: 'CONSUMER_NON_CYCLICALS',
          currentPrice: 9000,
          ownedLots: 25,
          avgBuyPrice: 8400,
          targetBuyPrice: 7000,
          investmentThesis: 'Strong consumer moat',
          fundamentals: {
            periodLabel: 'TTM Q3 2026',
            eps: 450,
            bvps: 2000,
            dps: 250,
            roePct: 22.5,
            der: 0.6,
            epsGrowthPct: 12.0,
            targetPer: 22.0,
            targetPbv: 4.8,
            discountRatePct: 12.0,
            projectionYears: 5,
            terminalGrowthPct: 4.0,
            dividendGrowthPct: 5.0,
          },
        }),
      },
      { DB: d1 },
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      item: {
        id: string;
        ticker: string;
        ownedLots: number;
        avgBuyPrice: number | null;
        valuation: { fairValue: { moderate: number }; mosPct: number };
      };
    };
    expect(created.item.ticker).toBe('ICBP');
    expect(created.item.ownedLots).toBe(25);
    expect(created.item.avgBuyPrice).toBe(8400);
    expect(created.item.valuation.fairValue.moderate).toBe(9600);
    expect(created.item.valuation.mosPct).toBe(6.25);

    // Duplicate ticker for User A -> 409
    const dupTickerRes = await app.request(
      'http://localhost/api/v1/watchlist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          ticker: 'ICBP',
          companyName: 'Duplicate',
          sector: 'CONSUMER_NON_CYCLICALS',
          currentPrice: 1,
        }),
      },
      { DB: d1 },
    );
    expect(dupTickerRes.status).toBe(409);

    // Sub-50 Rp 1 stock allowed (BEI 2026 rule)
    const rp1Res = await app.request(
      'http://localhost/api/v1/watchlist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          ticker: 'PENY',
          companyName: 'Penny Stock IDX',
          sector: 'TECHNOLOGY',
          currentPrice: 1,
        }),
      },
      { DB: d1 },
    );
    expect(rp1Res.status).toBe(201);

    // IDOR check: User B cannot read, patch, or delete User A's item (always 404)
    const idorGet = await app.request(
      `http://localhost/api/v1/watchlist/${created.item.id}`,
      { headers: { Cookie: cookieB } },
      { DB: d1 },
    );
    expect(idorGet.status).toBe(404);

    const idorPatch = await app.request(
      `http://localhost/api/v1/watchlist/${created.item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookieB },
        body: JSON.stringify({ currentPrice: 100 }),
      },
      { DB: d1 },
    );
    expect(idorPatch.status).toBe(404);

    const idorDelete = await app.request(
      `http://localhost/api/v1/watchlist/${created.item.id}`,
      { method: 'DELETE', headers: { Cookie: cookieB } },
      { DB: d1 },
    );
    expect(idorDelete.status).toBe(404);

    // Patch price & assumptions for User A
    const patchRes = await app.request(
      `http://localhost/api/v1/watchlist/${created.item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          currentPrice: 5000,
          fundamentals: { discountRatePct: 11.0 },
        }),
      },
      { DB: d1 },
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      item: { currentPrice: number; valuation: { valuationStatus: string } };
    };
    expect(patched.item.currentPrice).toBe(5000);
    expect(patched.item.valuation.valuationStatus).toBe('UNDERVALUED');

    // Soft delete ICBP -> 204, hidden from list, re-adding ICBP succeeds
    const delRes = await app.request(
      `http://localhost/api/v1/watchlist/${created.item.id}`,
      { method: 'DELETE', headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(delRes.status).toBe(204);

    const listAfterDel = await app.request(
      'http://localhost/api/v1/watchlist?sort=mos_desc',
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(listAfterDel.status).toBe(200);
    const listJson = (await listAfterDel.json()) as { items: Array<{ ticker: string }> };
    expect(listJson.items.map((i) => i.ticker)).toEqual(['PENY']);

    // Re-add ICBP after soft delete -> 201
    const reAddRes = await app.request(
      'http://localhost/api/v1/watchlist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          ticker: 'ICBP',
          companyName: 'Indofood CBP Re-added',
          sector: 'CONSUMER_NON_CYCLICALS',
          currentPrice: 8500,
        }),
      },
      { DB: d1 },
    );
    expect(reAddRes.status).toBe(201);

    // Verify EXPLAIN QUERY PLAN uses indexes (ZERO full table SCAN)
    const plan = sqlite
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT w.id, f.id
         FROM watchlist_items w
         LEFT JOIN stock_fundamentals f ON f.watchlist_item_id = w.id
         WHERE w.user_id = ? AND w.deleted_at IS NULL
         ORDER BY w.updated_at DESC`,
      )
      .all('user-1') as Array<{ detail: string }>;

    const details = plan.map((p) => p.detail).join(' | ');
    expect(details).toContain('idx_watchlist_user_active');
    expect(details).not.toMatch(/\bSCAN\b/i);
  });

  it('protects and serves GET /api/v1/market-data/idx/:ticker', async () => {
    const { d1 } = createTestD1();
    const app = createApp({
      marketDataProvider: {
        async fetchIdxQuote(ticker) {
          return {
            ticker,
            companyName: 'PT Bank Central Asia Tbk',
            sector: 'FINANCIALS',
            currentPrice: 5550,
            periodLabel: 'TTM (Yahoo Finance)',
            fundamentals: {
              eps: 483,
              bvps: 2307,
              dps: 381,
              roePct: 21.2,
              der: null,
              epsGrowthPct: 9.5,
              targetPer: 15,
              targetPbv: 2.5,
            },
            source: 'yahoo_finance',
            fetchedAt: new Date().toISOString(),
          };
        },
      },
    });

    // Unauthenticated -> 401
    const unauth = await app.request('http://localhost/api/v1/market-data/idx/BBCA', {}, { DB: d1 });
    expect(unauth.status).toBe(401);

    // Register & fetch
    const reg = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'md@example.com', name: 'MD User', password: 'Password123' }),
      },
      { DB: d1 },
    );
    const cookie = extractSessionCookie(reg);

    // Invalid ticker -> 400 RFC 7807
    const badTicker = await app.request(
      'http://localhost/api/v1/market-data/idx/INVALID123',
      { headers: { Cookie: cookie } },
      { DB: d1 },
    );
    expect(badTicker.status).toBe(400);
    expect(badTicker.headers.get('content-type')).toContain('application/problem+json');

    // Valid ticker -> 200
    const ok = await app.request(
      'http://localhost/api/v1/market-data/idx/bbca',
      { headers: { Cookie: cookie } },
      { DB: d1 },
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { quote: { ticker: string; currentPrice: number } };
    expect(body.quote.ticker).toBe('BBCA');
    expect(body.quote.currentPrice).toBe(5550);
  });

  it('enforces OWASP security controls: CSP, no-store, CSRF, 413/415 body guards, log-injection, session fixation rotation, and 429 rate limiting', async () => {
    const { d1, sqlite } = createTestD1();
    const app = createApp({
      authRateLimitMax: 4,
      authRateLimitWindowMs: 60_000,
    });

    // 1. Security Headers, Cache-Control: no-store, and Log-Injection Correlation ID Sanitization
    const maliciousCorrelationRes = await app.request(
      'http://localhost/api/v1/health',
      {
        headers: {
          'x-correlation-id': 'evil","level":"error","injected":true',
        },
      },
      { DB: d1 },
    );
    expect(maliciousCorrelationRes.status).toBe(200);
    expect(maliciousCorrelationRes.headers.get('x-correlation-id')).toMatch(
      /^req_[a-f0-9]{16}$/,
    );
    expect(maliciousCorrelationRes.headers.get('x-frame-options')).toBe('DENY');
    expect(maliciousCorrelationRes.headers.get('x-content-type-options')).toBe('nosniff');
    expect(maliciousCorrelationRes.headers.get('cache-control')).toContain('no-store');
    expect(maliciousCorrelationRes.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    );

    // 2. Cross-Origin CSRF attack blocked with 403 RFC 7807
    const csrfAttack = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil-phishing.example.com',
          'Sec-Fetch-Site': 'cross-site',
        },
        body: JSON.stringify({ email: 'a@example.com', password: 'Password123' }),
      },
      { DB: d1 },
    );
    expect(csrfAttack.status).toBe(403);
    expect(csrfAttack.headers.get('content-type')).toContain('application/problem+json');

    // 3. Content-Type text/plain form-CSRF bypass blocked with 415 RFC 7807
    const textPlainAttack = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"email":"a@example.com","password":"Password123"}',
      },
      { DB: d1 },
    );
    expect(textPlainAttack.status).toBe(415);
    expect(textPlainAttack.headers.get('content-type')).toContain('application/problem+json');

    // 4. Oversized payload (> 64 KB) blocked with 413 RFC 7807
    const oversizedAttack = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '100000',
        },
        body: JSON.stringify({ email: 'a@example.com', password: 'Password123' }),
      },
      { DB: d1 },
    );
    expect(oversizedAttack.status).toBe(413);
    expect(oversizedAttack.headers.get('content-type')).toContain('application/problem+json');

    // 5. Session Fixation Rotation: logging in while presenting an existing session invalidates the old session
    const regRes = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '10.0.0.1',
        },
        body: JSON.stringify({
          email: 'sec@example.com',
          name: 'Sec Tester',
          password: 'Password123',
        }),
      },
      { DB: d1 },
    );
    expect(regRes.status).toBe(201);
    const firstCookie = extractSessionCookie(regRes);

    // Insert an expired session for the user to verify automatic pruning on login
    const userRow = sqlite
      .prepare('SELECT id FROM users WHERE email = ?')
      .get('sec@example.com') as { id: string };
    sqlite
      .prepare(
        'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('exp_1', userRow.id, 'expired_hash_123', Date.now() - 10_000, Date.now() - 20_000);

    const loginRes = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: firstCookie,
          'cf-connecting-ip': '10.0.0.1',
        },
        body: JSON.stringify({
          email: 'sec@example.com',
          password: 'Password123',
        }),
      },
      { DB: d1 },
    );
    expect(loginRes.status).toBe(200);
    const rotatedCookie = extractSessionCookie(loginRes);
    expect(rotatedCookie).not.toBe(firstCookie);

    // Old session cookie must now be rejected (401), and expired session must be pruned
    const oldSessionCheck = await app.request(
      'http://localhost/api/v1/auth/me',
      { headers: { Cookie: firstCookie } },
      { DB: d1 },
    );
    expect(oldSessionCheck.status).toBe(401);

    const remainingSessions = sqlite
      .prepare('SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?')
      .get(userRow.id) as { cnt: number };
    expect(remainingSessions.cnt).toBe(1);

    // 6. Malformed Watchlist ID param rejected cleanly with 404 RFC 7807
    const malformedIdRes = await app.request(
      'http://localhost/api/v1/watchlist/invalid$$id!!',
      { headers: { Cookie: rotatedCookie } },
      { DB: d1 },
    );
    expect(malformedIdRes.status).toBe(404);

    // 7. Brute-Force Rate Limiter on /api/v1/auth/login triggers 429 Too Many Requests + Retry-After
    for (let i = 0; i < 4; i++) {
      const attempt = await app.request(
        'http://localhost/api/v1/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': '203.0.113.99',
          },
          body: JSON.stringify({
            email: 'nonexistent@example.com',
            password: 'WrongPassword123',
          }),
        },
        { DB: d1 },
      );
      expect(attempt.status).toBe(401);
    }

    const rateLimitedRes = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.99',
        },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'WrongPassword123',
        }),
      },
      { DB: d1 },
    );
    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.headers.get('retry-after')).toBeTruthy();
    expect(rateLimitedRes.headers.get('content-type')).toContain('application/problem+json');
  });
});
