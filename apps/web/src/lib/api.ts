let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => (accessToken = t);

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const raw = (path: string, init: RequestInit = {}) =>
  fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
  });

let refreshing: Promise<boolean> | null = null;

/** Troca o cookie de refresh por um novo access token. Pedidos concorrentes partilham a mesma chamada. */
export function refresh(): Promise<boolean> {
  refreshing ??= raw('/auth/refresh', { method: 'POST' })
    .then(async (r) => {
      accessToken = r.ok ? (await r.json()).data.accessToken : null;
      return r.ok;
    })
    .catch(() => false)
    .finally(() => (refreshing = null));
  return refreshing;
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  };
  let res = await raw(path, init);
  if (res.status === 401 && accessToken && !path.startsWith('/auth/') && (await refresh())) {
    res = await raw(path, init);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      json.error?.code ?? 'INTERNAL_ERROR',
      json.error?.message ?? res.statusText,
      res.status,
    );
  }
  return json.data as T;
}
