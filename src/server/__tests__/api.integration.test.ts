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
});
