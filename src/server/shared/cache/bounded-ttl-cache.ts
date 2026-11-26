interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Memory-bounded TTL cache for Worker isolates.
 * Evicts expired entries first, then oldest entries when capacity is reached,
 * preventing unbounded memory growth from arbitrary key lookups.
 */
export class BoundedTtlCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = 500,
  ) {}

  get(key: K, nowMs: number = Date.now()): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= nowMs) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, nowMs: number = Date.now()): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.prune(nowMs);
    }
    this.store.set(key, {
      value,
      expiresAt: nowMs + this.ttlMs,
    });
  }

  private prune(nowMs: number): void {
    for (const [k, entry] of this.store) {
      if (entry.expiresAt <= nowMs) {
        this.store.delete(k);
      }
    }
    while (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }
}
