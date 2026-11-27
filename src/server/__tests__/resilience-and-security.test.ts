import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '@/server/shared/db/schema';
import { CircuitBreaker } from '@/server/shared/resilience/circuit-breaker';
import { computeBankJustifiedPbv } from '@/server/modules/market-data/domain/market-data.types';
import { WebCryptoHasher } from '@/server/modules/auth/infra/web-crypto-hasher';
import { D1IdxCatalogRepository } from '@/server/modules/watchlist/infra/d1-idx-catalog-repository';
import type { IdxStockRecord } from '@/server/modules/watchlist/domain/watchlist.types';
import { createTestD1 } from './d1-test-helper';

function makeStockRecord(ticker: string, syncedAt: number): IdxStockRecord {
  return {
    ticker,
    companyName: `PT ${ticker} Tbk`,
    sector: 'INDUSTRIALS',
    currentPrice: 1000,
    openPrice: 1000,
    dailyChange: 0,
    dailyChangeBps: 0,
    periodLabel: 'TTM',
    eps: 100,
    bvps: 1000,
    dps: 20,
    roeBps: 1200,
    derX100: 50,
    epsGrowthBps: 1000,
    targetPerX100: 1200,
    targetPbvX100: 180,
    marketCapIdr: 1_000_000_000_000,
    adtvIdr: 5_000_000_000,
    roaBps: 800,
    roicBps: 1200,
    operatingMarginBps: 1500,
    netMarginBps: 1000,
    revenueGrowthBps: 1000,
    netIncomeGrowthBps: 1000,
    currentRatioX100: 180,
    netDebtToEbitdaX100: 50,
    equityToAssetsBps: 5000,
    wholesaleDerX100: null,
    cfoToNiX100: 110,
    fcfMarginBps: 800,
    fcfYieldBps: 500,
    cfoPositive: 1,
    fcfPositive: 1,
    piotroskiFScore: 7,
    altmanZX100: 350,
    source: 'tradingview',
    syncedAt,
  };
}

describe('Resilience, Security & Catalog Sync Guards', () => {
  it('CircuitBreaker enforces 3-state HALF-OPEN single-probe lock after cooldown', async () => {
    const breaker = new CircuitBreaker(2, 20);
    const openErr = () => new Error('CIRCUIT_OPEN');

    // Trip breaker to OPEN
    await expect(
      breaker.execute(async () => {
        throw new Error('fail-1');
      }, openErr),
    ).rejects.toThrow('fail-1');
    await expect(
      breaker.execute(async () => {
        throw new Error('fail-2');
      }, openErr),
    ).rejects.toThrow('fail-2');

    expect(breaker.isOpen()).toBe(true);

    // Wait for cooldown so breaker enters HALF-OPEN
    await new Promise((r) => setTimeout(r, 30));

    let resolveProbe!: (v: string) => void;
    const probePromise = breaker.execute(
      () => new Promise<string>((resolve) => {
        resolveProbe = resolve;
      }),
      openErr,
    );

    // Concurrent second request while probe is in-flight MUST be fast-failed
    await expect(breaker.execute(async () => 'should-not-run', openErr)).rejects.toThrow(
      'CIRCUIT_OPEN',
    );

    // Probe succeeds -> breaker closes cleanly
    resolveProbe('ok');
    await expect(probePromise).resolves.toBe('ok');
    expect(breaker.isOpen()).toBe(false);
  });

  it('WebCryptoHasher supports optional PASSWORD_PEPPER while remaining backward-compatible with legacy hashes', async () => {
    const hasher = new WebCryptoHasher();
    const pepper = 'test-pepper-secret-value';

    const legacyHash = await hasher.hash('Password123');
    expect(legacyHash.startsWith('pbkdf2_sha256$')).toBe(true);
    expect(await hasher.verify('Password123', legacyHash)).toBe(true);
    expect(await hasher.verify('Password123', legacyHash, pepper)).toBe(true);

    const pepperedHash = await hasher.hash('Password123', pepper);
    expect(pepperedHash.startsWith('pbkdf2_sha256_p$')).toBe(true);
    expect(await hasher.verify('Password123', pepperedHash, pepper)).toBe(true);
    expect(await hasher.verify('Password123', pepperedHash, 'wrong-pepper')).toBe(false);
    expect(await hasher.verify('Password123', pepperedHash)).toBe(false);
  });

  it('computeBankJustifiedPbv computes ROE-linked justified P/B clamped to [0.5x, 4.5x]', () => {
    expect(computeBankJustifiedPbv(null)).toBe(2.5);
    expect(computeBankJustifiedPbv(21.2)).toBe(2.53); // BBCA-like
    expect(computeBankJustifiedPbv(18)).toBe(2); // BMRI/BBRI-like
    expect(computeBankJustifiedPbv(6)).toBe(0.5); // Floor clamp for weak banks
    expect(computeBankJustifiedPbv(40)).toBe(4.5); // Ceiling clamp
  });

  it('D1IdxCatalogRepository refuses to prune a populated catalog on suspicious partial sync (ENG-03)', async () => {
    const { d1 } = createTestD1();
    const repo = new D1IdxCatalogRepository(drizzle(d1, { schema }));

    // Seed 220 stocks (above MIN_PRUNE_CATALOG_SIZE = 200)
    const t1 = 1_700_000_000_000;
    const initialBatch: IdxStockRecord[] = [];
    for (let i = 0; i < 220; i++) {
      const a = String.fromCharCode(65 + Math.floor(i / 26));
      const b = String.fromCharCode(65 + (i % 26));
      initialBatch.push(makeStockRecord(`AA${a}${b}`, t1));
    }
    await repo.upsertMany(initialBatch, t1);
    expect((await repo.listAll()).length).toBe(220);

    // Partial upstream failure returns only 10 stocks -> MUST NOT wipe the other 210 stocks!
    const t2 = t1 + 60_000;
    const partialBatch = initialBatch.slice(0, 10).map((s) => ({ ...s, syncedAt: t2 }));
    await repo.upsertMany(partialBatch, t2);
    expect((await repo.listAll()).length).toBe(220);

    // Healthy full sync (>= 50% and >= 200) DOES prune delisted tickers
    const t3 = t2 + 60_000;
    const healthyBatch = initialBatch.slice(0, 210).map((s) => ({ ...s, syncedAt: t3 }));
    await repo.upsertMany(healthyBatch, t3);
    expect((await repo.listAll()).length).toBe(210);
  });
});
