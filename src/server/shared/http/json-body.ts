import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../types';
import {
  payloadTooLargeError,
  validationError,
  zodToValidationError,
} from './problem';

export const MAX_JSON_BODY_BYTES = 64 * 1024; // 64 KB

/**
 * Safely reads and validates a JSON request body with strict byte-length enforcement,
 * preventing chunked/missing Content-Length DoS bypasses before JSON parsing.
 */
export async function parseJsonBody<T extends z.ZodType>(
  c: Context<AppEnv>,
  schema: T,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<z.infer<T>> {
  let buffer: ArrayBuffer;
  try {
    buffer = await c.req.arrayBuffer();
  } catch {
    throw validationError('Unable to read request body.');
  }

  if (buffer.byteLength > maxBytes) {
    throw payloadTooLargeError();
  }

  let rawBody: unknown;
  try {
    const text = new TextDecoder().decode(buffer);
    rawBody = JSON.parse(text);
  } catch {
    throw validationError('Request body must be valid JSON.');
  }

  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    throw zodToValidationError(parsed.error);
  }

  return parsed.data;
}
