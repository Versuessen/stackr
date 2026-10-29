// Thin client for the Stackr API. Same-origin only; the session lives in an HttpOnly cookie the
// page cannot read. Every write carries the X-Stackr header the server requires (CSRF guard).

export class ApiError extends Error {
  constructor(public status: number, public key: string, public vars?: Record<string, string | number>) { super(key); }
}

async function parse(res: Response) {
  if (res.status === 304) return null;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new ApiError(res.status, 'err.unknown');
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body?.error?.key ?? 'err.unknown', body?.error?.vars);
  return body;
}

export async function apiGet<T>(path: string, etag?: string | null): Promise<{ data: T | null; etag: string | null }> {
  const res = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    headers: etag ? { 'if-none-match': etag } : {},
    cache: 'no-store',
  });
  return { data: (await parse(res)) as T | null, etag: res.headers.get('etag') };
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-stackr': '1' },
    body: JSON.stringify(body),
  });
  return (await parse(res)) as T;
}
