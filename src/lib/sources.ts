import {
  COINS,
  DEX_IDS,
  LLAMA_DEX_SLUGS,
  LLAMA_RHEA_NAMES,
  RHEA_CEX,
  RHEA_COIN_PATH,
  RHEA_DECIMALS,
  RHEA_SUPPLY_FALLBACK,
  resolveIds,
  type IdsData,
} from './ids';
import { cgGet, errMsg, getJson, gtGet } from './http';
import {
  ZEC_BUCKETS,
  type CexZecData,
  type CoinKey,
  type HoldersData,
  type NearDexData,
  type PriceHistoryData,
  type PricesData,
  type RheaBook,
  type RheaBooksData,
  type RheaCexTicker,
  type RheaDexData,
  type RheaDexPair,
  type RheaMarketData,
  type RheaVenuesData,
  type Series,
  type SourceDataMap,
  type ZecBucket,
  type ZecHistoryData,
  type ZecPool,
  type ZecPoolsData,
} from './types';

export interface Ctx {
  env: 'browser' | 'node';
  ids: IdsData;
  zecPools?: ZecPoolsData | null;
}

interface SourceDef<T> {
  label: string;
  /** false = too many calls or no CORS; only the scheduled snapshot runs it. */
  browser: boolean;
  /** Built from complete UTC days (or rarely-changing ids): fetched once a day, reused until midnight. */
  daily?: boolean;
  run: (ctx: Ctx) => Promise<T>;
}

const DAY = 86_400;
const COIN_KEYS = Object.keys(COINS) as CoinKey[];
const LLAMA_IDS = COIN_KEYS.map((k) => COINS[k].llama).join(',');

const num = (v: unknown): number => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) ? x : 0;
};
const numOrNull = (v: unknown): number | null => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) ? x : null;
};

export const bucketOf = (p: Pick<ZecPool, 'dex' | 'network'>): ZecBucket =>
  p.dex === DEX_IDS.rhea
    ? 'rhea'
    : p.dex === DEX_IDS.nearIntents
      ? 'nearIntents'
      : p.network === 'near'
        ? 'nearOther'
        : p.network === 'solana'
          ? 'solana'
          : p.network === 'bsc'
            ? 'bsc'
            : 'other';

async function prices(): Promise<PricesData> {
  const cur = await getJson<{ coins: Record<string, { price: number }> }>(`https://coins.llama.fi/prices/current/${LLAMA_IDS}`);
  const pct = (period: string) =>
    getJson<{ coins: Record<string, number> }>(`https://coins.llama.fi/percentage/${LLAMA_IDS}?period=${period}`).then(
      (r) => r.coins,
      () => ({}) as Record<string, number>,
    );
  const [d1, d7, d30] = await Promise.all([pct('24h'), pct('7d'), pct('30d')]);
  const out = {} as PricesData;
  for (const k of COIN_KEYS) {
    const id = COINS[k].llama;
    const price = cur.coins[id]?.price;
    if (!price) throw new Error(`DefiLlama returned no ${COINS[k].symbol} price`);
    const ch = (m: Record<string, number>) => (typeof m[id] === 'number' ? m[id] / 100 : null);
    out[k] = { price, ch24h: ch(d1), ch7d: ch(d7), ch30d: ch(d30) };
  }
  return out;
}

async function priceHistory(): Promise<PriceHistoryData> {
  const d = await getJson<{ coins: Record<string, { prices: { timestamp: number; price: number }[] }> }>(
    `https://coins.llama.fi/chart/${LLAMA_IDS}?span=91&period=1d`,
  );
  const out = {} as PriceHistoryData;
  for (const k of COIN_KEYS) {
    const p = d.coins[COINS[k].llama]?.prices;
    if (!p?.length) throw new Error(`DefiLlama returned no ${COINS[k].symbol} price history`);
    out[k] = p.map((x) => [x.timestamp, x.price]);
  }
  return out;
}

interface CgCoin {
  market_data: {
    market_cap?: { usd?: number };
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
  };
}

async function rheaMarket(ctx: Ctx): Promise<RheaMarketData> {
  try {
    const md = (await cgGet<CgCoin>(RHEA_COIN_PATH)).market_data;
    const mcapHistory =
      ctx.env === 'node'
        ? await cgGet<{ market_caps: [number, number][] }>(`/coins/${COINS.rhea.coingecko}/market_chart?vs_currency=usd&days=30&interval=daily`).then(
            (r): Series => r.market_caps.map(([t, v]) => [Math.round(t / 1000), v]),
            () => null,
          )
        : null;
    return {
      method: 'coingecko',
      mcapUsd: md.market_cap?.usd || null,
      circulating: md.circulating_supply || null,
      totalSupply: md.total_supply || null,
      maxSupply: md.max_supply || null,
      mcapHistory,
    };
  } catch (e) {
    const [m, p] = await Promise.all([
      getJson<Record<string, { mcap: number }>>('https://coins.llama.fi/mcaps', {
        init: { method: 'POST', body: JSON.stringify({ coins: [COINS.rhea.llama] }), headers: { 'Content-Type': 'application/json' } },
      }),
      getJson<{ coins: Record<string, { price: number }> }>(`https://coins.llama.fi/prices/current/${COINS.rhea.llama}`),
    ]);
    const mcap = m[COINS.rhea.llama]?.mcap ?? null;
    const price = p.coins[COINS.rhea.llama]?.price ?? null;
    if (!mcap) throw new Error(`CoinGecko: ${errMsg(e)}; DefiLlama has no mcap either`);
    return {
      method: 'defillama',
      mcapUsd: mcap,
      circulating: price ? mcap / price : null,
      totalSupply: RHEA_SUPPLY_FALLBACK.total,
      maxSupply: RHEA_SUPPLY_FALLBACK.max,
      mcapHistory: null,
      note: `CoinGecko unavailable (${errMsg(e)}); mcap from DefiLlama, total supply as of ${RHEA_SUPPLY_FALLBACK.asOf}`,
    };
  }
}

async function nearDex(): Promise<NearDexData> {
  const d = await getJson<{
    total24h: number | null;
    totalDataChart: Series;
    protocols: { name: string; total24h: number | null }[];
  }>('https://api.llama.fi/overview/dexs/near?excludeTotalDataChartBreakdown=true');
  const rhea = d.protocols.find((p) => LLAMA_RHEA_NAMES.includes(p.name));
  return {
    total24h: d.total24h ?? null,
    daily: d.totalDataChart.slice(-120),
    rhea24h: rhea?.total24h ?? null,
    top: d.protocols
      .filter((p) => p.total24h)
      .sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))
      .slice(0, 5)
      .map((p) => ({ name: p.name, vol24h: p.total24h ?? 0 })),
  };
}

async function rheaDex(): Promise<RheaDexData> {
  const errors: string[] = [];
  for (const slug of LLAMA_DEX_SLUGS) {
    try {
      const d = await getJson<{ total24h: number | null; totalDataChart: Series }>(
        `https://api.llama.fi/summary/dexs/${slug}?excludeTotalDataChartBreakdown=true`,
      );
      if (d.totalDataChart?.length) return { slug, total24h: d.total24h ?? null, daily: d.totalDataChart.slice(-120) };
      errors.push(`${slug}: empty`);
    } catch (e) {
      errors.push(`${slug}: ${errMsg(e)}`);
    }
  }
  throw new Error(`no DefiLlama DEX slug answered (${errors.join('; ')})`);
}

interface GtPool {
  id: string;
  attributes: { name: string; volume_usd?: { h24?: string | null }; reserve_in_usd?: string | null };
  relationships: { dex: { data: { id: string } } };
}

async function zecPools(ctx: Ctx): Promise<ZecPoolsData> {
  const pools = new Map<string, ZecPool>();
  const errors: string[] = [];
  for (const t of ctx.ids.zecTokens) {
    const maxPages = t.network === 'near' ? 4 : 2;
    for (let page = 1; page <= maxPages; page++) {
      let d: { data: GtPool[] };
      try {
        d = await gtGet<{ data: GtPool[] }>(
          `/networks/${t.network}/tokens/${encodeURIComponent(t.address)}/pools?page=${page}&sort=h24_volume_usd_desc`,
        );
      } catch (e) {
        // Losing a chain's top pools would shrink the denominator and inflate Rhea's share, so fail
        // the whole source (the last good snapshot is shown as stale instead). Later pages are small.
        if (page === 1) throw new Error(`${t.label}: ${errMsg(e)}`);
        errors.push(`${t.label} page ${page}: ${errMsg(e)}`);
        break;
      }
      for (const x of d.data) {
        if (pools.has(x.id)) continue;
        pools.set(x.id, {
          id: x.id,
          network: t.network,
          dex: x.relationships.dex.data.id,
          name: x.attributes.name,
          vol24h: num(x.attributes.volume_usd?.h24),
          reserveUsd: numOrNull(x.attributes.reserve_in_usd),
        });
      }
      if (d.data.length < 20 || d.data.every((x) => num(x.attributes.volume_usd?.h24) < 1_000)) break;
    }
  }
  return { tokens: ctx.ids.zecTokens, pools: [...pools.values()], errors };
}

// Daily volume for the pools that carry today's ZEC volume, summed by bucket (Rhea, NEAR Intents, …).
async function zecHistory(ctx: Ctx): Promise<ZecHistoryData> {
  const all = ctx.zecPools?.pools;
  if (!all?.length) throw new Error('needs the ZEC pool list, which failed');
  const chosen: ZecPool[] = [];
  const coverage: ZecHistoryData['coverage'] = [];
  for (const network of [...new Set(all.map((p) => p.network))]) {
    const pools = all.filter((p) => p.network === network && p.vol24h > 0).sort((a, b) => b.vol24h - a.vol24h);
    const total = pools.reduce((s, p) => s + p.vol24h, 0);
    let covered = 0;
    let picked = 0;
    for (const p of pools) {
      const isRhea = p.dex === DEX_IDS.rhea && p.vol24h >= 500;
      if (!isRhea && (covered >= 0.9 * total || picked >= 8)) continue;
      chosen.push(p);
      covered += p.vol24h;
      picked++;
    }
    coverage.push({ network, covered24h: covered, total24h: total });
  }

  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const days = Array.from({ length: 90 }, (_, i) => today - (90 - i) * DAY);
  const buckets = Object.fromEntries(ZEC_BUCKETS.map((b) => [b, days.map(() => 0)])) as Record<ZecBucket, number[]>;
  const errors: string[] = [];
  const fetched = new Set<string>();
  chosen.sort((a, b) => Number(b.dex === DEX_IDS.rhea) - Number(a.dex === DEX_IDS.rhea));
  for (const p of chosen) {
    const address = p.id.slice(p.network.length + 1);
    try {
      const d = await gtGet<{ data: { attributes: { ohlcv_list: number[][] } } }>(
        `/networks/${p.network}/pools/${encodeURIComponent(address)}/ohlcv/day?limit=91&currency=usd`,
      );
      for (const candle of d.data.attributes.ohlcv_list) {
        const i = (candle[0] - days[0]) / DAY;
        if (Number.isInteger(i) && i >= 0 && i < days.length) buckets[bucketOf(p)][i] += candle[5];
      }
      fetched.add(p.id);
    } catch (e) {
      errors.push(`${p.name} (${p.dex}): ${errMsg(e)}`);
    }
  }
  // Without Rhea's biggest ZEC pool the numerator is wrong, so publish nothing rather than a skewed share.
  const topRhea = chosen.filter((p) => p.dex === DEX_IDS.rhea).sort((a, b) => b.vol24h - a.vol24h)[0];
  if (!fetched.size || (topRhea && !fetched.has(topRhea.id))) {
    throw new Error(`history incomplete: ${errors.slice(0, 3).join('; ') || 'GeckoTerminal returned no OHLCV'}`);
  }
  for (const c of coverage) {
    c.covered24h = chosen.filter((p) => p.network === c.network && fetched.has(p.id)).reduce((s, p) => s + p.vol24h, 0);
  }
  for (const b of ZEC_BUCKETS) buckets[b] = buckets[b].map(Math.round);
  return { days, buckets, poolsUsed: fetched.size, coverage, errors };
}

interface CgTicker {
  base: string;
  market: { name: string; identifier: string };
  converted_volume?: { usd?: number };
  is_anomaly: boolean;
  is_stale: boolean;
  cost_to_move_up_usd?: number | null;
  bid_ask_spread_percentage?: number | null;
}

// DEX tickers on CoinGecko use contract addresses as the base; those are counted from GeckoTerminal instead.
const isContractBase = (s: string) => /^0x[0-9a-f]{40}$/i.test(s) || s.includes('.') || s.length > 20;

function packVenues(method: CexZecData['method'], venues: Map<string, number>, excluded: number): CexZecData {
  const list = [...venues].map(([name, vol24h]) => ({ name, vol24h })).filter((v) => v.vol24h > 0);
  list.sort((a, b) => b.vol24h - a.vol24h);
  return { method, venues: list, total: list.reduce((s, v) => s + v.vol24h, 0), excluded };
}

async function cexZec(): Promise<CexZecData> {
  try {
    const venues = new Map<string, number>();
    let excluded = 0;
    for (let page = 1; page <= 3; page++) {
      const d = await cgGet<{ tickers: CgTicker[] }>(`/coins/${COINS.zec.coingecko}/tickers?page=${page}`);
      for (const t of d.tickers) {
        if (isContractBase(t.base) || t.is_anomaly || t.is_stale) {
          excluded++;
          continue;
        }
        venues.set(t.market.name, (venues.get(t.market.name) ?? 0) + (t.converted_volume?.usd ?? 0));
      }
      if (d.tickers.length < 100) break;
    }
    return packVenues('coingecko', venues, excluded);
  } catch (e) {
    const markets = await getJson<
      { exchange_name: string; category: string; outlier: boolean; quotes: { USD: { volume_24h: number } } }[]
    >('https://api.coinpaprika.com/v1/coins/zec-zcash/markets?quotes=USD').catch((e2: unknown) => {
      throw new Error(`CoinGecko: ${errMsg(e)}; CoinPaprika: ${errMsg(e2)}`);
    });
    const venues = new Map<string, number>();
    let excluded = 0;
    for (const m of markets) {
      if (m.category !== 'Spot' || m.outlier) {
        excluded++;
        continue;
      }
      venues.set(m.exchange_name, (venues.get(m.exchange_name) ?? 0) + (m.quotes?.USD?.volume_24h ?? 0));
    }
    return packVenues('coinpaprika', venues, excluded);
  }
}

interface DsPair {
  dexId: string;
  url: string;
  labels?: string[];
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
}

async function rheaVenues(ctx: Ctx): Promise<RheaVenuesData> {
  const errors: string[] = [];
  const dex: RheaDexPair[] = [];
  const contracts = ctx.ids.rheaContracts;
  await Promise.all(
    (['near', 'bsc', 'solana'] as const).map(async (chain) => {
      const addr = contracts[chain].toLowerCase();
      try {
        const pairs = await getJson<DsPair[]>(`https://api.dexscreener.com/token-pairs/v1/${chain}/${contracts[chain]}`);
        for (const p of pairs) {
          const rheaIsBase = p.baseToken.address.toLowerCase() === addr;
          if (!rheaIsBase && p.quoteToken.address.toLowerCase() !== addr) continue;
          const other = rheaIsBase ? p.quoteToken : p.baseToken;
          dex.push({
            chain,
            dex: p.dexId,
            pair: `RHEA/${other.symbol}`,
            counter: other.symbol,
            url: p.url,
            vol24h: p.volume?.h24 ?? 0,
            liquidityUsd: p.liquidity?.usd ?? null,
            labels: p.labels ?? [],
          });
        }
      } catch (e) {
        errors.push(`DexScreener ${chain}: ${errMsg(e)}`);
      }
    }),
  );
  const cex: RheaCexTicker[] = [];
  try {
    const d = await cgGet<{ tickers: CgTicker[] }>(`/coins/${COINS.rhea.coingecko}/tickers?depth=true`);
    for (const v of RHEA_CEX) {
      const ts = d.tickers.filter((t) => t.market.identifier === v.coingeckoMarket && !t.is_stale);
      cex.push({
        key: v.key,
        name: v.name,
        vol24h: ts.length ? ts.reduce((s, t) => s + (t.converted_volume?.usd ?? 0), 0) : null,
        depthUp2pct: ts.length ? ts.reduce((s, t) => s + (t.cost_to_move_up_usd ?? 0), 0) : null,
        spreadPct: ts.length ? Math.min(...ts.map((t) => t.bid_ask_spread_percentage ?? Infinity)) : null,
      });
    }
  } catch (e) {
    errors.push(`CoinGecko RHEA tickers: ${errMsg(e)}`);
  }
  if (!dex.length && !cex.length) throw new Error(errors.join('; '));
  return { dex, cex, errors };
}

type RawLevels = [string, string][];
const toLevels = (x: RawLevels): [number, number][] => x.map(([p, q]) => [num(p), num(q)]);

async function rheaBooks(ctx: Ctx): Promise<RheaBooksData> {
  const books: RheaBook[] = [];
  const errors: Record<string, string> = {};
  const [gate, mexc] = RHEA_CEX;
  await Promise.all([
    (async () => {
      try {
        const [b, t] = await Promise.all([
          getJson<{ asks: RawLevels; bids: RawLevels }>(`https://api.gateio.ws/api/v4/spot/order_book?currency_pair=${gate.symbol}&limit=100`),
          getJson<{ quote_volume: string }[]>(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${gate.symbol}`),
        ]);
        books.push({ key: gate.key, name: gate.name, asks: toLevels(b.asks), bids: toLevels(b.bids), vol24hUsd: numOrNull(t[0]?.quote_volume) });
      } catch (e) {
        errors[gate.key] = errMsg(e);
      }
    })(),
    (async () => {
      if (ctx.env === 'browser') {
        errors[mexc.key] = 'MEXC blocks browser requests (no CORS); its book comes from the scheduled snapshot';
        return;
      }
      try {
        const [b, t] = await Promise.all([
          getJson<{ asks: RawLevels; bids: RawLevels }>(`https://api.mexc.com/api/v3/depth?symbol=${mexc.symbol}&limit=100`),
          getJson<{ quoteVolume: string }>(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${mexc.symbol}`),
        ]);
        books.push({ key: mexc.key, name: mexc.name, asks: toLevels(b.asks), bids: toLevels(b.bids), vol24hUsd: numOrNull(t.quoteVolume) });
      } catch (e) {
        errors[mexc.key] = errMsg(e);
      }
    })(),
  ]);
  if (!books.length) throw new Error(Object.values(errors).join('; '));
  return { books, errors };
}

async function holders(ctx: Ctx): Promise<HoldersData> {
  const contract = ctx.ids.rheaContracts.near;
  const [count, list] = await Promise.all([
    getJson<{ holders: { count: string }[] }>(`https://api.nearblocks.io/v1/fts/${contract}/holders/count`),
    getJson<{ holders: { account: string; amount: string }[] }>(`https://api.nearblocks.io/v1/fts/${contract}/holders?page=1&per_page=25`),
  ]);
  const scale = 10n ** BigInt(RHEA_DECIMALS - 6);
  return {
    contract,
    count: numOrNull(count.holders?.[0]?.count),
    top: list.holders.map((h) => ({ account: h.account, amount: Number(BigInt(h.amount) / scale) / 1e6 })),
  };
}

export const SOURCES: { [K in keyof SourceDataMap]: SourceDef<SourceDataMap[K]> } = {
  ids: { label: 'CoinGecko platforms + GeckoTerminal token map', browser: false, daily: true, run: () => resolveIds() },
  prices: { label: 'DefiLlama coins', browser: true, run: prices },
  priceHistory: { label: 'DefiLlama coins (daily)', browser: true, run: priceHistory },
  rheaMarket: { label: 'CoinGecko (DefiLlama fallback)', browser: true, run: rheaMarket },
  nearDex: { label: 'DefiLlama NEAR DEX volume', browser: true, run: nearDex },
  rheaDex: { label: 'DefiLlama Rhea DEX volume', browser: true, run: rheaDex },
  zecPools: { label: 'GeckoTerminal ZEC pools', browser: true, run: zecPools },
  zecHistory: { label: 'GeckoTerminal daily OHLCV', browser: false, daily: true, run: zecHistory },
  cexZec: { label: 'CoinGecko ZEC tickers (CoinPaprika fallback)', browser: true, run: cexZec },
  rheaVenues: { label: 'DexScreener + CoinGecko tickers', browser: true, run: rheaVenues },
  rheaBooks: { label: 'Gate + MEXC order books', browser: true, run: rheaBooks },
  holders: { label: 'NearBlocks', browser: true, run: holders },
};
