import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import type { ProblemDetails } from '@/shared/contracts';
import type { AppEnv } from '../types';

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly type: string;
  readonly title: string;
  readonly errors?: Record<string, string[]>;

  constructor(params: {
    status: ContentfulStatusCode;
    type: string;
    title: string;
    detail: string;
    errors?: Record<string, string[]>;
  }) {
    super(params.detail);
    this.name = 'AppError';
    this.status = params.status;
    this.type = params.type;
    this.title = params.title;
    this.errors = params.errors;
  }
}

export function validationError(detail: string, errors?: Record<string, string[]>): AppError {
  return new AppError({
    status: 400,
    type: 'https://stock-mate-v2/errors/validation-error',
    title: 'Validation Failed',
    detail,
    errors,
  });
}

export function unauthorizedError(detail = 'Authentication required.'): AppError {
  return new AppError({
    status: 401,
    type: 'https://stock-mate-v2/errors/unauthorized',
    title: 'Unauthorized',
    detail,
  });
}

export function forbiddenError(
  detail = 'Request rejected by security policy.',
): AppError {
  return new AppError({
    status: 403,
    type: 'https://stock-mate-v2/errors/forbidden',
    title: 'Forbidden',
    detail,
  });
}

export function notFoundError(detail = 'Resource not found.'): AppError {
  return new AppError({
    status: 404,
    type: 'https://stock-mate-v2/errors/not-found',
    title: 'Not Found',
    detail,
  });
}

export function conflictError(detail: string): AppError {
  return new AppError({
    status: 409,
    type: 'https://stock-mate-v2/errors/conflict',
    title: 'Conflict',
    detail,
  });
}

export function payloadTooLargeError(
  detail = 'Request payload exceeds the maximum allowed size (64 KB).',
): AppError {
  return new AppError({
    status: 413,
    type: 'https://stock-mate-v2/errors/payload-too-large',
    title: 'Payload Too Large',
    detail,
  });
}

export function unsupportedMediaTypeError(
  detail = 'Content-Type must be application/json.',
): AppError {
  return new AppError({
    status: 415,
    type: 'https://stock-mate-v2/errors/unsupported-media-type',
    title: 'Unsupported Media Type',
    detail,
  });
}

export function tooManyRequestsError(
  detail = 'Too many authentication attempts. Please try again shortly.',
): AppError {
  return new AppError({
    status: 429,
    type: 'https://stock-mate-v2/errors/rate-limit-exceeded',
    title: 'Too Many Requests',
    detail,
  });
}

export function zodToValidationError(err: z.ZodError): AppError {
  const flattened = z.flattenError(err);
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(flattened.fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) {
      fieldErrors[key] = messages.map(String);
    }
  }
  if (flattened.formErrors.length > 0) {
    fieldErrors._form = flattened.formErrors;
  }
  return validationError('One or more fields are invalid.', fieldErrors);
}

export function problemResponse(
  c: Context<AppEnv>,
  error: AppError,
): Response {
  const correlationId = c.get('correlationId') ?? 'req_unknown';
  const body: ProblemDetails = {
    type: error.type,
    title: error.title,
    status: error.status,
    detail: error.message,
    instance: new URL(c.req.url).pathname,
    correlationId,
    ...(error.errors ? { errors: error.errors } : {}),
  };
  return c.json(body, error.status, {
    'Content-Type': 'application/problem+json',
  });
}
