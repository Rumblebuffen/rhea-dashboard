export const inBrowser = typeof window !== 'undefined';

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface GetOpts {
  init?: RequestInit;
  timeoutMs?: number;
}

function hostOf(url: string): string {
  try {
    return new URL(url, inBrowser ? window.location.href : undefined).host;
  } catch {
    return url;
  }
}

export async function getJson<T>(url: string, { init = {}, timeoutMs = 20_000 }: GetOpts = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (!inBrowser) headers.set('User-Agent', 'rhea-dashboard-snapshot (github.com/Rumblebuffen/rhea-dashboard)');
  const host = hostOf(url);
  try {
    const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${host} HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`${host} timed out after ${timeoutMs / 1000}s`);
    if (inBrowser && e instanceof TypeError) throw new Error(`${host} unreachable from the browser (network or CORS)`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Keyless GeckoTerminal allows ~30 calls/min and keyless CoinGecko far fewer, so calls to
// each are queued with a minimum gap. The browser makes few calls and stays snappy.
const GAP_MS = inBrowser ? { gt: 350, cg: 0 } : { gt: 3_000, cg: 7_000 };
const queues: Record<string, { chain: Promise<unknown>; last: number }> = {};

function paced<T>(key: keyof typeof GAP_MS, fn: () => Promise<T>): Promise<T> {
  const q = (queues[key] ??= { chain: Promise.resolve(), last: 0 });
  const run = async () => {
    const wait = q.last + GAP_MS[key] - Date.now();
    if (wait > 0) await sleep(wait);
    q.last = Date.now();
    return fn();
  };
  const p = q.chain.then(run, run);
  q.chain = p.catch(() => undefined);
  return p;
}

const memo = new Map<string, Promise<unknown>>();

/** Clears per-run memoised responses; call at the start of every collection pass. */
export function resetMemo() {
  memo.clear();
}

export function gtGet<T>(path: string): Promise<T> {
  const url = `https://api.geckoterminal.com/api/v2${path}`;
  return paced('gt', async () => {
    try {
      return await getJson<T>(url);
    } catch (e) {
      if (inBrowser || !errMsg(e).includes('HTTP 429')) throw e;
      console.warn(`GeckoTerminal 429 on ${path}; retrying once in 60s`);
      await sleep(60_000);
      return getJson<T>(url);
    }
  });
}

export function cgGet<T>(path: string): Promise<T> {
  const url = `https://api.coingecko.com/api/v3${path}`;
  const hit = memo.get(url);
  if (hit) return hit as Promise<T>;
  const p = paced('cg', () => getJson<T>(url));
  memo.set(url, p);
  p.catch(() => memo.delete(url));
  return p;
}
