import { FALLBACK_IDS, type IdsData } from './ids';
import { errMsg, resetMemo } from './http';
import { SOURCES, type Ctx } from './sources';
import type { Snapshot, SourceDataMap, SourceId, SourceResult } from './types';

/**
 * live     fetched from the public API by this browser just now (or within the 5-minute cache)
 * snapshot from public/data/snapshot.json, written by the scheduled GitHub Action < 45 min ago
 * stale    last known value, older than 45 min, because a fresh fetch failed
 * missing  no value at all; the UI shows "—" and the reason
 */
export type Status = 'live' | 'snapshot' | 'stale' | 'missing';

export const SNAPSHOT_MAX_AGE_MS = 45 * 60_000;
const LIVE_CACHE_MS = 5 * 60_000;
const RANK: Record<Status, number> = { live: 0, snapshot: 1, stale: 2, missing: 3 };

export interface Resolved<T> {
  status: Status;
  data: T | null;
  fetchedAt: number | null;
  error?: string;
  label: string;
}

export type Loaded = { [K in SourceId]: Resolved<SourceDataMap[K]> } & { snapshotAt: number | null };

export function worstStatus(list: Status[]): Status {
  return list.reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), 'live');
}

async function capture<K extends SourceId>(id: K, ctx: Ctx): Promise<SourceResult<SourceDataMap[K]>> {
  const started = Date.now();
  try {
    const data = await SOURCES[id].run(ctx);
    return { ok: true, fetchedAt: Date.now(), data };
  } catch (e) {
    return { ok: false, fetchedAt: started, data: null, error: errMsg(e) };
  }
}

/** Server side (scripts/snapshot.mjs): run every source, including the snapshot-only ones. */
export async function collectSnapshot(): Promise<Snapshot> {
  resetMemo();
  const ids = await capture('ids', { env: 'node', ids: FALLBACK_IDS });
  const ctx: Ctx = { env: 'node', ids: ids.data ?? FALLBACK_IDS };
  const [prices, priceHistory, rheaMarket, nearDex, rheaDex, cexZec, rheaVenues, rheaBooks, holders, zecPools] = await Promise.all([
    capture('prices', ctx),
    capture('priceHistory', ctx),
    capture('rheaMarket', ctx),
    capture('nearDex', ctx),
    capture('rheaDex', ctx),
    capture('cexZec', ctx),
    capture('rheaVenues', ctx),
    capture('rheaBooks', ctx),
    capture('holders', ctx),
    capture('zecPools', ctx),
  ]);
  const zecHistory = await capture('zecHistory', { ...ctx, zecPools: zecPools.data });
  return {
    version: 1,
    fetchedAt: Date.now(),
    sources: { ids, prices, priceHistory, rheaMarket, nearDex, rheaDex, zecPools, zecHistory, cexZec, rheaVenues, rheaBooks, holders },
  };
}

async function cachedLive<T>(id: SourceId, run: () => Promise<T>): Promise<{ data: T; fetchedAt: number }> {
  const key = `rhea-dashboard:${id}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const hit = JSON.parse(raw) as { data: T; fetchedAt: number };
      if (Date.now() - hit.fetchedAt < LIVE_CACHE_MS) return hit;
    }
  } catch {
    // storage blocked (private mode): just fetch
  }
  const entry = { data: await run(), fetchedAt: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // quota or blocked storage: the value is still used for this render
  }
  return entry;
}

async function resolveOne<K extends SourceId>(id: K, snap: Snapshot | null, ctx: Ctx): Promise<Resolved<SourceDataMap[K]>> {
  const def = SOURCES[id];
  const s = snap?.sources[id] as SourceResult<SourceDataMap[K]> | undefined;
  const snapFresh = !!s?.ok && Date.now() - s.fetchedAt < SNAPSHOT_MAX_AGE_MS;
  if (snapFresh) return { status: 'snapshot', data: s!.data, fetchedAt: s!.fetchedAt, label: def.label };
  if (def.browser) {
    try {
      const { data, fetchedAt } = await cachedLive(id, () => def.run(ctx));
      return { status: 'live', data, fetchedAt, label: def.label };
    } catch (e) {
      if (s?.data) return { status: 'stale', data: s.data, fetchedAt: s.fetchedAt, error: errMsg(e), label: def.label };
      return { status: 'missing', data: null, fetchedAt: null, error: errMsg(e), label: def.label };
    }
  }
  if (s?.data) return { status: 'stale', data: s.data, fetchedAt: s.fetchedAt, error: s.error, label: def.label };
  return {
    status: 'missing',
    data: null,
    fetchedAt: null,
    error: s?.error ?? 'only the scheduled snapshot fetches this, and no snapshot is available yet',
    label: def.label,
  };
}

/** Browser side: snapshot first (if < 45 min old), then live public APIs, then the stale snapshot. */
export async function loadDashboard(): Promise<Loaded> {
  resetMemo();
  const snap = await fetch(`data/snapshot.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : null))
    .catch(() => null);
  const ids: IdsData = snap?.sources.ids?.data ?? FALLBACK_IDS;
  const ctx: Ctx = { env: 'browser', ids };
  const sourceIds = Object.keys(SOURCES) as SourceId[];
  const resolved = await Promise.all(sourceIds.map((id) => resolveOne(id, snap, ctx)));
  const out = Object.fromEntries(sourceIds.map((id, i) => [id, resolved[i]])) as unknown as Loaded;
  out.snapshotAt = snap?.fetchedAt ?? null;
  return out;
}
