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
      ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
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

/** Pedido com renovação automática do access token (excepto rotas de auth e /admin). */
async function send(path: string, init: RequestInit) {
  let res = await raw(path, init);
  const renewable = accessToken && !path.startsWith('/auth/') && !path.startsWith('/admin');
  if (res.status === 401 && renewable && (await refresh())) res = await raw(path, init);
  return res;
}

async function fail(res: Response): Promise<never> {
  const json = await res.json().catch(() => ({}));
  throw new ApiError(
    json.error?.code ?? 'INTERNAL_ERROR',
    json.error?.message ?? res.statusText,
    res.status,
  );
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await send(path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) return fail(res);
  return (await res.json()).data as T;
}

/** Envia um ficheiro (multipart). */
export async function apiUpload<T>(
  path: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  // campos antes do ficheiro (o servidor só os lê se vierem primeiro)
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', file);
  const res = await send(path, { method: 'POST', body: form });
  if (!res.ok) return fail(res);
  return (await res.json()).data as T;
}

/** Descarrega um ficheiro autenticado. */
export async function apiDownload(path: string, filename: string) {
  const res = await send(path, { method: 'GET' });
  if (!res.ok) return fail(res);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** Abre um anexo: URLs da própria API precisam do token; externas abrem directamente. */
export async function apiOpen(url: string) {
  if (!url.startsWith('/api/')) return void window.open(url, '_blank', 'noopener');
  const res = await send(url.slice(4), { method: 'GET' });
  if (!res.ok) return fail(res);
  window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
}
