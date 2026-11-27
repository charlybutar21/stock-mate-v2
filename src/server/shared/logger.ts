const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'email',
  'sm_session',
  '__host-sm_session',
  'sm_at',
  '__host-sm_at',
  'cookie',
  'set-cookie',
  'authorization',
  'token',
  'tokenhash',
  'token_hash',
  'apikey',
  'api_key',
  'jwt_secret',
  'catalog_sync_secret',
  'password_pepper',
  'cf-connecting-ip',
  'ip',
  'clientip',
]);

function sanitizeMeta(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeMeta);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeMeta(val);
      }
    }
    return out;
  }
  return value;
}

export type LogLevel = 'info' | 'warn' | 'error';

export function logJson(
  level: LogLevel,
  message: string,
  correlationId: string,
  meta?: Record<string, unknown>,
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    correlationId,
    message,
    ...(meta ? { meta: sanitizeMeta(meta) } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}
