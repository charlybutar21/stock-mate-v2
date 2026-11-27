/**
 * 3-state (CLOSED / OPEN / HALF-OPEN) circuit breaker protecting upstream
 * market-data calls against cascading latency spikes and post-cooldown thundering herds.
 */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openUntilMs = 0;
  private halfOpenInFlight = false;

  constructor(
    private readonly failureThreshold: number = 3,
    private readonly cooldownMs: number = 60_000,
  ) {}

  isOpen(nowMs: number = Date.now()): boolean {
    if (this.openUntilMs > nowMs) {
      return true;
    }
    return this.openUntilMs > 0 && this.halfOpenInFlight;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntilMs = 0;
    this.halfOpenInFlight = false;
  }

  recordFailure(nowMs: number = Date.now()): void {
    this.halfOpenInFlight = false;
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

    const isHalfOpenProbe = this.openUntilMs > 0 && this.openUntilMs <= now;
    if (isHalfOpenProbe) {
      this.halfOpenInFlight = true;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (isFailure(err)) {
        this.recordFailure(Date.now());
      } else if (isHalfOpenProbe) {
        this.halfOpenInFlight = false;
      }
      throw err;
    }
  }
}
