import type { ProblemDetails } from '@/shared/contracts';

export class ApiClientError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetails;

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.problem = problem;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'StockMate');
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const isJson =
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json');

  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    const problem = body as ProblemDetails | null;
    throw new ApiClientError(
      res.status,
      problem?.detail ?? `Request failed (${res.status})`,
      problem ?? undefined,
    );
  }

  return body as T;
}
