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

    // Patch price, 2-decimal holding tranches & assumptions for User A
    const patchRes = await app.request(
      `http://localhost/api/v1/watchlist/${created.item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          currentPrice: 5000,
          holdingTranches: [{ lots: 25, buyPrice: 8425.67 }],
          fundamentals: { discountRatePct: 11.0 },
        }),
      },
      { DB: d1 },
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      item: {
        currentPrice: number;
        avgBuyPrice: number | null;
        valuation: { valuationStatus: string };
      };
    };
    expect(patched.item.currentPrice).toBe(5000);
    expect(patched.item.avgBuyPrice).toBe(8425.67);
    expect(patched.item.valuation.valuationStatus).toBe('UNDERVALUED');

    // Verify D1 fixed-point avg_buy_price_x100 stores exact 2-decimal cents
    const dbRow = sqlite
      .prepare('SELECT avg_buy_price, avg_buy_price_x100 FROM watchlist_items WHERE id = ?')
      .get(created.item.id) as { avg_buy_price: number; avg_buy_price_x100: number };
    expect(dbRow.avg_buy_price).toBe(8426);
    expect(dbRow.avg_buy_price_x100).toBe(842567);

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
    expect(maliciousCorrelationRes.headers.get('strict-transport-security')).toContain(
      'max-age=31536000',
    );
    expect(maliciousCorrelationRes.headers.get('permissions-policy')).toContain('camera=()');
    expect(maliciousCorrelationRes.headers.get('cache-control')).toContain('no-store');
    expect(maliciousCorrelationRes.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    );

    // 2. Cross-Origin CSRF & Cross-Origin Referer attacks blocked with 403 RFC 7807
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

    const crossRefererAttack = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Referer: 'https://evil-phishing.example.com/attack',
        },
        body: JSON.stringify({ email: 'a@example.com', password: 'Password123' }),
      },
      { DB: d1 },
    );
    expect(crossRefererAttack.status).toBe(403);

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

    // 4. Oversized payload (> 64 KB) blocked with 413 both WITH and WITHOUT Content-Length header
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

    const chunkedOversizedAttack = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '198.51.100.77',
        },
        body: JSON.stringify({
          email: 'a@example.com',
          password: 'A'.repeat(70_000),
        }),
      },
      { DB: d1 },
    );
    expect(chunkedOversizedAttack.status).toBe(413);

    // 4b. Malformed non-hex session cookie rejected in O(1) with 401
    const malformedCookieRes = await app.request(
      'http://localhost/api/v1/auth/me',
      { headers: { Cookie: 'sm_session=not-a-valid-64-hex-token!!!' } },
      { DB: d1 },
    );
    expect(malformedCookieRes.status).toBe(401);

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

    // 6b. Extreme integer overflow financial input rejected with 400 RFC 7807
    const overflowPriceRes = await app.request(
      'http://localhost/api/v1/watchlist',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: rotatedCookie,
        },
        body: JSON.stringify({
          ticker: 'OVER',
          companyName: 'Overflow Corp',
          sector: 'FINANCIALS',
          currentPrice: 999_999_999_999,
        }),
      },
      { DB: d1 },
    );
    expect(overflowPriceRes.status).toBe(400);
    expect(overflowPriceRes.headers.get('content-type')).toContain('application/problem+json');

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

  it('syncs active IHSG catalog, filters by valuation/MoS/sort/pagination, ensures items, and isolates Custom Watchlists', async () => {
    const { d1, sqlite } = createTestD1();
    const nowIso = new Date().toISOString();

    let universe = [
      // Undervalued: Fair Value ~5768, Price 3000 -> MoS ~48% (UNDERVALUED)
      {
        ticker: 'BBRI',
        companyName: 'PT Bank Rakyat Indonesia Tbk',
        sector: 'FINANCIALS' as const,
        currentPrice: 3000,
        periodLabel: 'TTM (TradingView)',
        fundamentals: {
          eps: 420,
          bvps: 2300,
          dps: 300,
          roePct: 19.0,
          der: null,
          epsGrowthPct: 10.0,
          targetPer: 15,
          targetPbv: 2.5,
        },
        source: 'tradingview' as const,
        fetchedAt: nowIso,
      },
      // Fairly Valued: Median Fair Value ~7200, Price 6000 -> MoS ~16.7% (FAIRLY_VALUED)
      {
        ticker: 'BBCA',
        companyName: 'PT Bank Central Asia Tbk',
        sector: 'FINANCIALS' as const,
        currentPrice: 6000,
        periodLabel: 'TTM (TradingView)',
        fundamentals: {
          eps: 480,
          bvps: 2300,
          dps: 330,
          roePct: 21.0,
          der: null,
          epsGrowthPct: 8.0,
          targetPer: 15,
          targetPbv: 2.5,
        },
        source: 'tradingview' as const,
        fetchedAt: nowIso,
      },
      // Overvalued: Fair Value ~1500, Price 4000 -> MoS negative (OVERVALUED)
      {
        ticker: 'TECH',
        companyName: 'PT Teknologi Mahal Tbk',
        sector: 'TECHNOLOGY' as const,
        currentPrice: 4000,
        periodLabel: 'TTM (TradingView)',
        fundamentals: {
          eps: 75,
          bvps: 600,
          dps: 0,
          roePct: 12.0,
          der: 0.4,
          epsGrowthPct: 5.0,
          targetPer: 20,
          targetPbv: 2.5,
        },
        source: 'tradingview' as const,
        fetchedAt: nowIso,
      },
      // Inactive later when universe prunes
      {
        ticker: 'OLDX',
        companyName: 'PT Emiten Lama Tbk',
        sector: 'ENERGY' as const,
        currentPrice: 200,
        periodLabel: 'TTM (TradingView)',
        fundamentals: {
          eps: 50,
          bvps: 300,
          dps: 10,
          roePct: 14.0,
          der: 0.5,
          epsGrowthPct: 4.0,
          targetPer: 8,
          targetPbv: 1.5,
        },
        source: 'tradingview' as const,
        fetchedAt: nowIso,
      },
    ];

    const app = createApp({
      marketDataProvider: {
        async fetchIdxQuote(ticker) {
          const found = universe.find((s) => s.ticker === ticker);
          if (found) return found;
          return {
            ticker,
            companyName: `PT ${ticker} Tbk`,
            sector: 'INFRASTRUCTURE',
            currentPrice: 2800,
            periodLabel: 'TTM (TradingView)',
            fundamentals: {
              eps: 250,
              bvps: 1500,
              dps: 180,
              roePct: 16.5,
              der: 0.8,
              epsGrowthPct: 7.0,
              targetPer: 16,
              targetPbv: 2.2,
            },
            source: 'tradingview',
            fetchedAt: new Date().toISOString(),
          };
        },
        async fetchIdxQuotesBatch(tickers) {
          const map = new Map();
          for (const t of tickers) {
            const found = universe.find((s) => s.ticker === t);
            if (found) map.set(t, found);
          }
          return map;
        },
        async fetchAllIdxStocks() {
          return universe;
        },
      },
    });

    // Register User A & User B
    const regA = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'cat-a@example.com', name: 'Cat A', password: 'Password123' }),
      },
      { DB: d1 },
    );
    const cookieA = extractSessionCookie(regA);

    const regB = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'cat-b@example.com', name: 'Cat B', password: 'Password123' }),
      },
      { DB: d1 },
    );
    const cookieB = extractSessionCookie(regB);

    // 1. First GET /catalog auto-syncs IHSG universe and computes valuation summaries
    const catRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog?sort=mos_desc',
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(catRes.status).toBe(200);
    const catJson = (await catRes.json()) as {
      items: Array<{ ticker: string; valuation: { valuationStatus: string; mosPct: number | null } }>;
      summary: { totalStocks: number; undervalued: number; fairlyValued: number; overvalued: number };
      pagination: { totalItems: number; totalPages: number; page: number };
    };
    expect(catJson.summary.totalStocks).toBe(4);
    expect(catJson.summary.undervalued).toBe(2); // BBRI, OLDX
    expect(catJson.summary.fairlyValued).toBe(1); // BBCA
    expect(catJson.summary.overvalued).toBe(1); // TECH

    // 2. Filter by valuationStatus=UNDERVALUED + minMos=45
    const underRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog?valuationStatus=UNDERVALUED&minMos=45',
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(underRes.status).toBe(200);
    const underJson = (await underRes.json()) as { items: Array<{ ticker: string }> };
    expect(underJson.items.map((i) => i.ticker)).toEqual(['OLDX', 'BBRI']);

    // 3. Filter by FAIRLY_VALUED and OVERVALUED + sort price_asc
    const fairRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog?valuationStatus=FAIRLY_VALUED',
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(((await fairRes.json()) as { items: Array<{ ticker: string }> }).items.map((i) => i.ticker)).toEqual(['BBCA']);

    const overRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog?valuationStatus=OVERVALUED&maxMos=0',
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(((await overRes.json()) as { items: Array<{ ticker: string }> }).items.map((i) => i.ticker)).toEqual(['TECH']);

    const priceAscRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog?sort=price_asc',
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(((await priceAscRes.json()) as { items: Array<{ ticker: string }> }).items.map((i) => i.ticker)).toEqual([
      'OLDX',
      'BBRI',
      'TECH',
      'BBCA',
    ]);

    // 4. Ensure a catalog stock into personal watchlist_items (idempotent) + add owned position
    const ensure1 = await app.request(
      'http://localhost/api/v1/watchlist/ensure',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ ticker: 'bbri' }),
      },
      { DB: d1 },
    );
    expect(ensure1.status).toBe(201);
    const ensuredItem = ((await ensure1.json()) as { item: { id: string; ticker: string } }).item;
    expect(ensuredItem.ticker).toBe('BBRI');

    const ensure2 = await app.request(
      'http://localhost/api/v1/watchlist/ensure',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ ticker: 'BBRI' }),
      },
      { DB: d1 },
    );
    expect(ensure2.status).toBe(200);
    expect(((await ensure2.json()) as { item: { id: string } }).item.id).toBe(ensuredItem.id);

    // Record position on BBRI (now appears in My Stocks)
    const patchPos = await app.request(
      `http://localhost/api/v1/watchlist/${ensuredItem.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          holdingTranches: [{ lots: 10, buyPrice: 2950 }],
          fundamentals: { targetPbv: 2.8 },
        }),
      },
      { DB: d1 },
    );
    expect(patchPos.status).toBe(200);

    // 5. Explicit POST /catalog/sync prunes inactive OLDX, updates BBRI price while keeping ownedLots & custom targetPbv!
    universe = universe
      .filter((s) => s.ticker !== 'OLDX')
      .map((s) => (s.ticker === 'BBRI' ? { ...s, currentPrice: 3150 } : s));

    const syncRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog/sync',
      { method: 'POST', headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(syncRes.status).toBe(200);
    const syncJson = (await syncRes.json()) as { syncedCount: number; updatedUserItemsCount: number };
    expect(syncJson.syncedCount).toBe(3);
    expect(syncJson.updatedUserItemsCount).toBe(1);

    const afterSyncCat = await app.request(
      'http://localhost/api/v1/watchlist/catalog',
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    const afterSyncJson = (await afterSyncCat.json()) as {
      items: Array<{ ticker: string; currentPrice: number; ownedLots: number; fundamentals: { targetPbv: number | null } }>;
      summary: { totalStocks: number };
    };
    expect(afterSyncJson.summary.totalStocks).toBe(3);
    const bbriMerged = afterSyncJson.items.find((i) => i.ticker === 'BBRI')!;
    expect(bbriMerged.currentPrice).toBe(3150);
    expect(bbriMerged.ownedLots).toBe(10);
    expect(bbriMerged.fundamentals.targetPbv).toBe(2.8);

    // 6. Custom Watchlist Lifecycle: Create with Quick Add tickers -> List -> Filter -> Quick Add -> Remove -> Rename -> IDOR -> Soft Delete
    const createGroupRes = await app.request(
      'http://localhost/api/v1/watchlist/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          name: 'Big Banks',
          description: 'Core banking watchlist',
          tickers: ['BBCA', 'BBRI'],
        }),
      },
      { DB: d1 },
    );
    expect(createGroupRes.status).toBe(201);
    const createdGroup = (
      (await createGroupRes.json()) as { group: { id: string; name: string; tickers: string[]; stockCount: number } }
    ).group;
    expect(createdGroup.name).toBe('Big Banks');
    expect(createdGroup.tickers).toEqual(['BBCA', 'BBRI']);
    expect(createdGroup.stockCount).toBe(2);

    // Case-insensitive duplicate custom watchlist name -> 409
    const dupGroupRes = await app.request(
      'http://localhost/api/v1/watchlist/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ name: 'big banks' }),
      },
      { DB: d1 },
    );
    expect(dupGroupRes.status).toBe(409);

    // Quick Add a stock not yet in catalog (TLKM) -> auto-fetches quote & adds to group
    const quickAddRes = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}/stocks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ ticker: 'tlkm' }),
      },
      { DB: d1 },
    );
    expect(quickAddRes.status).toBe(201);
    expect(((await quickAddRes.json()) as { item: { ticker: string } }).item.ticker).toBe('TLKM');

    // Duplicate Quick Add -> 409
    const dupAddRes = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}/stocks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ ticker: 'BBCA' }),
      },
      { DB: d1 },
    );
    expect(dupAddRes.status).toBe(409);

    // List custom watchlist stocks (overlays user's BBRI owned position!)
    const groupStocksRes = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}/stocks?sort=ticker_asc`,
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(groupStocksRes.status).toBe(200);
    const groupStocksJson = (await groupStocksRes.json()) as {
      items: Array<{ ticker: string; ownedLots: number }>;
    };
    expect(groupStocksJson.items.map((i) => i.ticker)).toEqual(['BBCA', 'BBRI', 'TLKM']);
    expect(groupStocksJson.items.find((i) => i.ticker === 'BBRI')!.ownedLots).toBe(10);

    // Remove BBRI from custom watchlist -> 204, user's owned position in watchlist_items remains untouched!
    const removeStockRes = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}/stocks/BBRI`,
      { method: 'DELETE', headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(removeStockRes.status).toBe(204);

    const verifyPosIntact = await app.request(
      `http://localhost/api/v1/watchlist/${ensuredItem.id}`,
      { headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(verifyPosIntact.status).toBe(200);
    expect(((await verifyPosIntact.json()) as { item: { ownedLots: number } }).item.ownedLots).toBe(10);

    // IDOR isolation: User B cannot access, mutate, or delete User A's custom watchlist
    const idorGroupStocks = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}/stocks`,
      { headers: { Cookie: cookieB } },
      { DB: d1 },
    );
    expect(idorGroupStocks.status).toBe(404);

    const idorGroupPatch = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookieB },
        body: JSON.stringify({ name: 'Hijacked' }),
      },
      { DB: d1 },
    );
    expect(idorGroupPatch.status).toBe(404);

    const idorGroupDelete = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}`,
      { method: 'DELETE', headers: { Cookie: cookieB } },
      { DB: d1 },
    );
    expect(idorGroupDelete.status).toBe(404);

    // Rename & Soft-delete custom watchlist -> re-create with same name succeeds
    const renameRes = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ name: 'Dividend Core' }),
      },
      { DB: d1 },
    );
    expect(renameRes.status).toBe(200);
    expect(((await renameRes.json()) as { group: { name: string } }).group.name).toBe('Dividend Core');

    const delGroupRes = await app.request(
      `http://localhost/api/v1/watchlist/groups/${createdGroup.id}`,
      { method: 'DELETE', headers: { Cookie: cookieA } },
      { DB: d1 },
    );
    expect(delGroupRes.status).toBe(204);

    const recreateGroupRes = await app.request(
      'http://localhost/api/v1/watchlist/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ name: 'Dividend Core' }),
      },
      { DB: d1 },
    );
    expect(recreateGroupRes.status).toBe(201);

    // Verify index usage on custom_watchlists
    const groupPlan = sqlite
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id, name FROM custom_watchlists
         WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY created_at ASC`,
      )
      .all('user-1') as Array<{ detail: string }>;
    const groupPlanStr = groupPlan.map((p) => p.detail).join(' | ');
    expect(groupPlanStr).toContain('idx_custom_watchlists_user_active');
    expect(groupPlanStr).not.toMatch(/\bSCAN\b/i);
  });

  it('computes Fundamental Quality Score (FQS) and filters Radar screener by pillars, grade, ADTV, and trap shield', async () => {
    const { d1 } = createTestD1();
    const nowIso = new Date().toISOString();

    const universe = [
      // Elite Quality + Undervalued + Liquid -> Grade A, PRIME_OPPORTUNITY
      {
        ticker: 'ICBP',
        companyName: 'PT Indofood CBP Sukses Makmur Tbk',
        sector: 'CONSUMER_NON_CYCLICALS' as const,
        currentPrice: 7050,
        periodLabel: 'TTM (TradingView)',
        fundamentals: {
          eps: 710,
          bvps: 4745,
          dps: 265,
          roePct: 18.0,
          der: 0.45,
          epsGrowthPct: 24.0,
          targetPer: 18,
          targetPbv: 3.5,
          marketCapIdr: 83_000_000_000_000,
          adtvIdr: 65_000_000_000,
          roaPct: 7.5,
          roicPct: 14.0,
          operatingMarginPct: 20.0,
          netMarginPct: 14.0,
          revenueGrowthPct: 14.0,
          netIncomeGrowthPct: 24.0,
          currentRatio: 2.5,
          netDebtToEbitda: 0.5,
          equityToAssetsPct: 54.0,
          wholesaleDer: null,
          cfoToNetIncome: 1.25,
          fcfMarginPct: 13.0,
          fcfYieldPct: 9.0,
          cfoPositive: true,
          fcfPositive: true,
          piotroskiFScore: 8,
          altmanZScore: 3.2,
        },
        source: 'tradingview' as const,
        fetchedAt: nowIso,
      },
      // Elite Banking stock (FINANCIALS dual-track)
      {
        ticker: 'BBCA',
        companyName: 'PT Bank Central Asia Tbk',
        sector: 'FINANCIALS' as const,
        currentPrice: 5900,
        periodLabel: 'TTM (TradingView)',
        fundamentals: {
          eps: 483,
          bvps: 2307,
          dps: 336,
          roePct: 21.2,
          der: null,
          epsGrowthPct: 10.0,
          targetPer: 15,
          targetPbv: 2.5,
          marketCapIdr: 727_000_000_000_000,
          adtvIdr: 1_500_000_000_000,
          roaPct: 3.73,
          roicPct: 21.1,
          operatingMarginPct: 63.5,
          netMarginPct: 51.4,
          revenueGrowthPct: 8.0,
          netIncomeGrowthPct: 10.0,
          currentRatio: null,
          netDebtToEbitda: null,
          equityToAssetsPct: 17.3,
          wholesaleDer: 0.02,
          cfoToNetIncome: 1.08,
          fcfMarginPct: 46.6,
          fcfYieldPct: 8.3,
          cfoPositive: true,
          fcfPositive: true,
          piotroskiFScore: null,
          altmanZScore: null,
        },
        source: 'tradingview' as const,
        fetchedAt: nowIso,
      },
      // Loss-making High-Risk Value Trap (illiquid) -> capped <= 50
      {
        ticker: 'TRAP',
        companyName: 'PT Jebakan Nilai Tbk',
        sector: 'INDUSTRIALS' as const,
        currentPrice: 100,
        periodLabel: 'TTM (TradingView)',
        fundamentals: {
          eps: -15,
          bvps: 300,
          dps: 0,
          roePct: -12.0,
          der: 2.8,
          epsGrowthPct: -45.0,
          targetPer: 12,
          targetPbv: 1.8,
          marketCapIdr: 200_000_000_000,
          adtvIdr: 50_000_000,
          roaPct: -6.0,
          roicPct: -8.0,
          operatingMarginPct: -5.0,
          netMarginPct: -10.0,
          revenueGrowthPct: -15.0,
          netIncomeGrowthPct: -45.0,
          currentRatio: 0.6,
          netDebtToEbitda: 5.5,
          equityToAssetsPct: 20.0,
          wholesaleDer: null,
          cfoToNetIncome: null,
          fcfMarginPct: -8.0,
          fcfYieldPct: -12.0,
          cfoPositive: false,
          fcfPositive: false,
          piotroskiFScore: 2,
          altmanZScore: 0.9,
        },
        source: 'tradingview' as const,
        fetchedAt: nowIso,
      },
    ];

    const app = createApp({
      marketDataProvider: {
        async fetchIdxQuote(ticker) {
          const found = universe.find((s) => s.ticker === ticker.toUpperCase());
          if (!found) throw new Error(`Unknown ticker ${ticker}`);
          return found;
        },
        async fetchAllIdxStocks() {
          return universe;
        },
      },
    });

    const regRes = await app.request(
      'http://localhost/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'radar@example.com',
          name: 'Radar Investor',
          password: 'Password123',
        }),
      },
      { DB: d1 },
    );
    expect(regRes.status).toBe(201);
    const cookie = extractSessionCookie(regRes);

    // Default Radar query: all stocks sorted by highest FQS (fqs_desc)
    const defaultRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog?sort=fqs_desc',
      { headers: { Cookie: cookie } },
      { DB: d1 },
    );
    expect(defaultRes.status).toBe(200);
    const defaultBody = (await defaultRes.json()) as {
      items: Array<{ ticker: string; quality: { score: number | null; grade: string; qarpQuadrant: string } }>;
      summary: { totalStocks: number; eliteQuality: number; primeOpportunities: number };
    };
    expect(defaultBody.summary.totalStocks).toBe(3);
    expect(defaultBody.summary.eliteQuality).toBe(2);
    expect(defaultBody.summary.primeOpportunities).toBe(1);
    expect(defaultBody.items.map((i) => i.ticker)[2]).toBe('TRAP');
    expect(defaultBody.items[0]!.quality.grade).toBe('A');
    expect(defaultBody.items[2]!.quality.grade).toBe('D');

    // Radar Prime Value Quality preset filters: minMos=20, minFqs=70, minProfitability=65, minAdtvBillion=1, excludeHighRiskTrap=true
    const primeRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog?minMos=20&minFqs=70&minProfitability=65&minHealth=60&minAdtvBillion=1&excludeHighRiskTrap=true&sort=qarp_desc',
      { headers: { Cookie: cookie } },
      { DB: d1 },
    );
    expect(primeRes.status).toBe(200);
    const primeBody = (await primeRes.json()) as { items: Array<{ ticker: string }> };
    expect(primeBody.items.map((i) => i.ticker)).toEqual(['ICBP']);

    // Piotroski filter returns only ICBP (score 8)
    const piotroskiRes = await app.request(
      'http://localhost/api/v1/watchlist/catalog?minPiotroski=7',
      { headers: { Cookie: cookie } },
      { DB: d1 },
    );
    expect(piotroskiRes.status).toBe(200);
    const piotroskiBody = (await piotroskiRes.json()) as { items: Array<{ ticker: string }> };
    expect(piotroskiBody.items.map((i) => i.ticker)).toEqual(['ICBP']);
  });
});
