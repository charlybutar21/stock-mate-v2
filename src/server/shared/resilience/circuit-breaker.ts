/**
 * Lightweight circuit breaker protecting upstream TradingView market-data calls
 * against cascading latency spikes.
 */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openUntilMs = 0;

  constructor(
    private readonly failureThreshold: number = 3,
    private readonly cooldownMs: number = 60_000,
  ) {}

  isOpen(nowMs: number = Date.now()): boolean {
    return this.openUntilMs > nowMs;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntilMs = 0;
  }

  recordFailure(nowMs: number = Date.now()): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.openUntilMs = nowMs + this.cooldownMs;
    }
  }

  async execute<T>(
    fn: () => Promise<T>,
    onOpenError: () => Error,
    isFailure: (err: unknown) => boolean = () => true,
  ): Promise<T> {
    const now = Date.now();
    if (this.isOpen(now)) {
      throw onOpenError();
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (isFailure(err)) {
        this.recordFailure(Date.now());
      }
      throw err;
    }
  }
}
