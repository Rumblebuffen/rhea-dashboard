import { cfgNum, type PositionConfig, type ThesisConfig } from './config';
import { pct, price as fmtPrice, share } from './format';
import { DEX_IDS, RHEA_CEX, RHEA_SUPPLY_FALLBACK, networkLabel } from './ids';
import { tradeStatus, type TradeStatus } from './signals';
import { worstStatus, type Loaded, type Status } from './status';
import { ZEC_BUCKETS, type RheaBook, type RheaCexTicker, type RheaDexPair, type Series, type SourceId } from './types';

const DAY = 86_400;
const todayStart = () => Math.floor(Date.now() / 1000 / DAY) * DAY;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (a: number | null | undefined, b: number | null | undefined): number | null => (a != null && b ? a / b : null);

export interface BlockMeta {
  status: Status;
  updatedAt: number | null;
  sources: string[];
  problems: string[];
}

function meta(l: Loaded, ids: SourceId[]): BlockMeta {
  const rs = ids.map((id) => l[id]);
  const present = rs.filter((r) => r.status !== 'missing');
  const times = present.map((r) => r.fetchedAt).filter((t): t is number => t != null);
  return {
    status: present.length ? worstStatus(present.map((r) => r.status)) : 'missing',
    updatedAt: times.length ? Math.min(...times) : null,
    sources: [...new Set(rs.map((r) => r.label))],
    problems: rs.filter((r) => r.error).map((r) => `${r.label} (${r.status}): ${r.error}`),
  };
}

function why(l: Loaded, id: SourceId): string {
  const r = l[id];
  return r.error ? `${r.label}: ${r.error}` : `${r.label}: no data`;
}

// ---------- windows over daily series (complete UTC days only) ----------

function windowSum(s: Series, end: number, days: number): number | null {
  const from = end - days * DAY;
  let total = 0;
  let n = 0;
  for (const [t, v] of s) {
    if (t >= from && t < end) {
      total += v;
      n++;
    }
  }
  return n >= Math.ceil(days * 0.8) ? total : null;
}

export interface Trend {
  now: number | null;
  prev: number | null;
  /** Relative change of the share vs the prior window (−0.5 = share halved). */
  change: number | null;
  pp: number | null;
}

function shareTrend(num: Series, den: Series, days: number): Trend {
  const end = todayStart();
  const now = ratio(windowSum(num, end, days), windowSum(den, end, days));
  const prev = ratio(windowSum(num, end - days * DAY, days), windowSum(den, end - days * DAY, days));
  return { now, prev, change: now != null && prev ? now / prev - 1 : null, pp: now != null && prev != null ? now - prev : null };
}

function volChange(s: Series, days: number): number | null {
  const end = todayStart();
  const now = windowSum(s, end, days);
  const prev = windowSum(s, end - days * DAY, days);
  return now != null && prev ? now / prev - 1 : null;
}

interface ZecSeries {
  days: number[];
  rhea: Series;
  total: Series;
  amm: Series;
}

function zecSeries(l: Loaded): ZecSeries | null {
  const h = l.zecHistory.data;
  if (!h?.days.length) return null;
  const total = h.days.map((_, i) => sum(ZEC_BUCKETS.map((b) => h.buckets[b]?.[i] ?? 0)));
  return {
    days: h.days,
    rhea: h.days.map((d, i) => [d, h.buckets.rhea[i] ?? 0]),
    total: h.days.map((d, i) => [d, total[i]]),
    amm: h.days.map((d, i) => [d, total[i] - (h.buckets.nearIntents[i] ?? 0)]),
  };
}

// ---------- venue naming ----------

const PROTOCOL: Record<string, string> = {
  'rhea-finance': 'Rhea',
  'near-intents': 'NEAR Intents',
  orca: 'Orca',
  zerofi: 'ZeroFi',
  raydium: 'Raydium',
  'raydium-clmm': 'Raydium',
  'raydium-cp': 'Raydium',
  meteora: 'Meteora',
  'meteora-damm-v2': 'Meteora',
  pumpswap: 'PumpSwap',
  'pancakeswap-v3-bsc': 'PancakeSwap',
  pancakeswap_v2: 'PancakeSwap',
  pancakeswap: 'PancakeSwap',
  'uniswap-bsc': 'Uniswap',
  'uniswap-v4-bsc': 'Uniswap',
  topaz: 'Topaz',
  apeswap_bsc: 'ApeSwap',
};

export function protocolOf(dex: string): string {
  if (PROTOCOL[dex]) return PROTOCOL[dex];
  return dex
    .replace(/[-_](v\d+|bsc|clmm|amm)$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- header ----------

export interface PositionVM {
  positionUsd: number | null;
  tokens: number | null;
  pctSupply: number | null;
  avgCost: number | null;
  valueNow: number | null;
  upnl: number | null;
  upnlPct: number | null;
  cashToAdd: number | null;
  notes?: string;
  warnings: string[];
}

export interface HeaderVM {
  meta: BlockMeta;
  price: number | null;
  priceMissing: string;
  ch24h: number | null;
  ch7d: number | null;
  entryHigh: number | null;
  vsEntry: number | null;
  localHigh: number | null;
  localHighDays: number;
  vsLocalHigh: number | null;
  mcap: number | null;
  fdv: number | null;
  marketMissing: string;
  marketNote?: string;
  cheapMcapUsd: number;
  cheapFtvUsd: number;
  band: [number, number];
  bandFlag: boolean | null;
  target: [number, number] | null;
  position: PositionVM;
  trade: TradeStatus;
  addRule: string;
}

// ---------- block B ----------

export interface VenueRow {
  name: string;
  vol24h: number;
  onchain: boolean;
  isRhea: boolean;
}

export interface TrendRow {
  label: string;
  now24h: number | null;
  t7: Trend;
  t30: Trend;
  source: string;
}

export interface BlockBVM {
  meta: BlockMeta;
  rheaZec24h: number | null;
  rheaZecPools: number;
  onchain24h: number | null;
  intents24h: number | null;
  share24h: number | null;
  shareAmm24h: number | null;
  poolsMissing: string;
  cexTotal: number | null;
  cexCount: number;
  cexMethod: string;
  cexThin: boolean;
  cexMissing: string;
  rheaVsCex: number | null;
  solana24h: number | null;
  rheaVsSolana: number | null;
  rheaNear24h: number | null;
  nearTotal24h: number | null;
  nearShare24h: number | null;
  nearMissing: string;
  venues: VenueRow[];
  rankOverall: number | null;
  rankOnchain: number | null;
  onchainCount: number;
  topOnchain: VenueRow | null;
  isTopOnchain: boolean | null;
  trends: TrendRow[];
  chart: { days: number[]; vol: number[]; share: (number | null)[] } | null;
  historyNote: string;
}

// ---------- block A ----------

export interface BetaRow {
  label: string;
  d7: number | null;
  d30: number | null;
}

export interface BlockAVM {
  meta: BlockMeta;
  coins: { label: string; price: number | null; ch7d: number | null; ch30d: number | null }[];
  bars: BetaRow[];
  pricesMissing: string;
}

// ---------- block C ----------

export const SIZES = [10_000, 25_000, 50_000] as const;

export interface SlipCell {
  value: number | null;
  atLeast?: boolean;
}

export interface SizeRow {
  key: string;
  venue: string;
  detail: string;
  url?: string;
  vol24h: number | null;
  liquidity: number | null;
  liquidityKind: string;
  slip: SlipCell[];
  method: string;
  missing?: string;
}

export interface BlockCVM {
  meta: BlockMeta;
  rows: SizeRow[];
  compare: { pancakeVol: number; nearVol: number; pancakeLiq: number | null; nearLiq: number | null; pancakeMoreVolume: boolean; nearDeeper: boolean } | null;
}

// ---------- block D ----------

export interface BlockDVM {
  meta: BlockMeta;
  holders: {
    contract: string;
    count: number | null;
    top10Pct: number | null;
    top10UnlabelledPct: number | null;
    rows: { account: string; amount: number; pct: number | null; label: string }[];
  } | null;
  holdersMissing: string;
  advisor: { date: string | null; note: string; daysSince: number | null; quietDays: number };
}

// ---------- block E ----------

export type LightColor = 'green' | 'amber' | 'red' | 'grey';

export interface LightVM {
  title: string;
  color: LightColor;
  value: string;
  detail: string;
}

export interface BlockEVM {
  meta: BlockMeta;
  lights: LightVM[];
}

export interface View {
  header: HeaderVM;
  a: BlockAVM;
  b: BlockBVM;
  c: BlockCVM;
  d: BlockDVM;
  e: BlockEVM;
  snapshotAt: number | null;
}

const MAJORS = new Set(['WNEAR', 'NEAR', 'USDC', 'USDT', 'USDC.E', 'USDT.E', 'WBNB', 'BNB', 'SOL', 'WSOL', 'ETH', 'WETH']);

function mainPair(pairs: RheaDexPair[], pred: (p: RheaDexPair) => boolean): RheaDexPair | null {
  return (
    pairs
      .filter((p) => pred(p) && MAJORS.has(p.counter.toUpperCase()))
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0] ?? null
  );
}

// Buying X of a 50/50 constant-product pool with quote reserve Q (= TVL/2) pays X/Q above mid on average.
const xykSlip = (tvl: number | null, usdAmt: number): SlipCell => ({ value: tvl ? usdAmt / (tvl / 2) : null });

function bookStats(b: RheaBook): { depth2: number; slips: SlipCell[] } | null {
  const bestAsk = b.asks[0]?.[0];
  if (!bestAsk) return null;
  const bestBid = b.bids[0]?.[0];
  const mid = bestBid ? (bestAsk + bestBid) / 2 : bestAsk;
  const depth2 = sum(b.asks.filter(([p]) => p <= mid * 1.02).map(([p, q]) => p * q));
  const walk = (usdAmt: number): SlipCell => {
    let remaining = usdAmt;
    let cost = 0;
    let qty = 0;
    let last = bestAsk;
    for (const [p, q] of b.asks) {
      const take = Math.min(p * q, remaining);
      cost += take;
      qty += take / p;
      remaining -= take;
      last = p;
      if (remaining <= 0.01) break;
    }
    return remaining > 0.01 ? { value: last / mid - 1, atLeast: true } : { value: cost / qty / mid - 1 };
  };
  return { depth2, slips: SIZES.map(walk) };
}

// Without a book, assume CoinGecko's +2% depth is spread evenly: average slippage = 1% × X / depth.
function tickerSlip(t: RheaCexTicker | undefined, usdAmt: number): SlipCell {
  const d = t?.depthUp2pct;
  if (!d) return { value: null };
  return usdAmt <= d ? { value: (0.01 * usdAmt) / d } : { value: 0.01, atLeast: true };
}

function lowerLow(s: Series | undefined): { cur: number; prev: number; lower: boolean } | null {
  const pts = (s ?? []).map(([, v]) => v);
  if (pts.length < 14) return null;
  const cur = Math.min(...pts.slice(-7));
  const prev = Math.min(...pts.slice(-14, -7));
  return { cur, prev, lower: cur < prev };
}

function holderLabel(account: string): string {
  if (account.endsWith('.rhealab.near')) return 'Rhea protocol';
  if (account.includes('sputnik-dao.near')) return 'DAO';
  if (account.endsWith('ref-finance.near')) return 'Rhea DEX pools';
  if (account === 'intents.near') return 'NEAR Intents';
  if (account.includes('burrow')) return 'Rhea Lend';
  if (/bridge|omft|factory/.test(account)) return 'bridge';
  return '';
}

export function buildView(l: Loaded, position: PositionConfig, thesis: ThesisConfig): View {
  const rules = thesis.rules;
  const p = l.prices.data;
  const hist = l.priceHistory.data;
  const market = l.rheaMarket.data;
  const zs = zecSeries(l);
  const zecTrend7 = zs ? shareTrend(zs.rhea, zs.total, 7) : null;

  // ----- header -----
  const price = p?.rhea.price ?? null;
  const entryHigh = cfgNum(position.entryHigh);
  const localHighDays = rules.localHighDays;
  const recent = hist?.rhea.slice(-localHighDays).map(([, v]) => v) ?? [];
  const localHigh = recent.length ? Math.max(...recent, price ?? 0) : null;
  const totalSupply = market?.totalSupply ?? RHEA_SUPPLY_FALLBACK.total;
  const circulating = market?.circulating ?? null;
  const mcap = price != null && circulating != null ? circulating * price : (market?.mcapUsd ?? null);
  const fdv = price != null ? totalSupply * price : null;
  const band: [number, number] = [thesis.ftvBand[0], thesis.ftvBand[1]];
  const tokens = cfgNum(position.tokenAmount);
  const avgCost = cfgNum(position.avgCostUsd);
  const warnings: string[] = [];
  if (tokens != null && tokens > totalSupply) {
    warnings.push(`tokenAmount is larger than RHEA's entire supply (~${Math.round(totalSupply / 1e6)}M); check config/position.json`);
  }
  const trade = tradeStatus({ price, entryHigh, localHigh, ch7d: p?.rhea.ch7d ?? null, share7Change: zecTrend7?.change ?? null }, rules);

  const header: HeaderVM = {
    meta: meta(l, ['prices', 'rheaMarket', 'priceHistory', 'zecHistory']),
    price,
    priceMissing: why(l, 'prices'),
    ch24h: p?.rhea.ch24h ?? null,
    ch7d: p?.rhea.ch7d ?? null,
    entryHigh,
    vsEntry: price != null && entryHigh ? price / entryHigh - 1 : null,
    localHigh,
    localHighDays,
    vsLocalHigh: price != null && localHigh ? price / localHigh - 1 : null,
    mcap,
    fdv,
    marketMissing: why(l, 'rheaMarket'),
    marketNote: market?.note,
    cheapMcapUsd: thesis.cheapMcapUsd,
    cheapFtvUsd: thesis.cheapFtvUsd,
    band,
    bandFlag: fdv == null ? null : fdv < band[0] || fdv > band[1],
    target: thesis.targetMultipleIfWorks ? [thesis.cheapMcapUsd * thesis.targetMultipleIfWorks[0], thesis.cheapMcapUsd * thesis.targetMultipleIfWorks[1]] : null,
    position: {
      positionUsd: cfgNum(position.positionUsd),
      tokens,
      pctSupply: cfgNum(position.pctSupply) ?? (tokens != null ? tokens / totalSupply : null),
      avgCost,
      valueNow: tokens != null && price != null ? tokens * price : null,
      upnl: tokens != null && avgCost != null && price != null ? tokens * (price - avgCost) : null,
      upnlPct: avgCost && price != null ? price / avgCost - 1 : null,
      cashToAdd: cfgNum(position.cashToAddUsd),
      notes: position.notes,
      warnings,
    },
    trade,
    addRule: thesis.addRule,
  };

  // ----- block B -----
  const pools = l.zecPools.data?.pools ?? [];
  const rheaPools = pools.filter((x) => x.dex === DEX_IDS.rhea);
  const rheaZec24h = pools.length ? sum(rheaPools.map((x) => x.vol24h)) : null;
  const onchain24h = pools.length ? sum(pools.map((x) => x.vol24h)) : null;
  const intents24h = pools.length ? sum(pools.filter((x) => x.dex === DEX_IDS.nearIntents).map((x) => x.vol24h)) : null;
  const solana24h = pools.length ? sum(pools.filter((x) => x.network === 'solana').map((x) => x.vol24h)) : null;

  const onchainVenues = new Map<string, VenueRow>();
  for (const x of pools) {
    const name = `${protocolOf(x.dex)} (${networkLabel(x.network)})`;
    const v = onchainVenues.get(name) ?? { name, vol24h: 0, onchain: true, isRhea: x.dex === DEX_IDS.rhea };
    v.vol24h += x.vol24h;
    onchainVenues.set(name, v);
  }
  const cex = l.cexZec.data;
  const venues: VenueRow[] = [
    ...onchainVenues.values(),
    ...(cex?.venues ?? []).map((v) => ({ name: v.name, vol24h: v.vol24h, onchain: false, isRhea: false })),
  ].sort((a, b) => b.vol24h - a.vol24h);
  const onchainSorted = venues.filter((v) => v.onchain);
  const rheaIdx = venues.findIndex((v) => v.isRhea);
  const rheaOnchainIdx = onchainSorted.findIndex((v) => v.isRhea);

  const nearD = l.nearDex.data;
  const rheaD = l.rheaDex.data;
  const trends: TrendRow[] = [];
  if (zs) {
    trends.push({ label: 'ZEC onchain, all venues', now24h: ratio(rheaZec24h, onchain24h), t7: zecTrend7!, t30: shareTrend(zs.rhea, zs.total, 30), source: 'GeckoTerminal' });
    trends.push({ label: 'ZEC onchain, excl. NEAR Intents', now24h: ratio(rheaZec24h, onchain24h != null && intents24h != null ? onchain24h - intents24h : null), t7: shareTrend(zs.rhea, zs.amm, 7), t30: shareTrend(zs.rhea, zs.amm, 30), source: 'GeckoTerminal' });
  }
  if (nearD && rheaD) {
    trends.push({ label: 'NEAR DEX volume (all pairs)', now24h: ratio(nearD.rhea24h, nearD.total24h), t7: shareTrend(rheaD.daily, nearD.daily, 7), t30: shareTrend(rheaD.daily, nearD.daily, 30), source: 'DefiLlama' });
  }

  const h = l.zecHistory.data;
  const coverage = h?.coverage.map((c) => `${networkLabel(c.network)} ${share(ratio(c.covered24h, c.total24h), 0)}`).join(', ');
  const b: BlockBVM = {
    meta: meta(l, ['zecPools', 'zecHistory', 'cexZec', 'nearDex', 'rheaDex']),
    rheaZec24h,
    rheaZecPools: rheaPools.filter((x) => x.vol24h > 0).length,
    onchain24h,
    intents24h,
    share24h: ratio(rheaZec24h, onchain24h),
    shareAmm24h: ratio(rheaZec24h, onchain24h != null && intents24h != null ? onchain24h - intents24h : null),
    poolsMissing: why(l, 'zecPools'),
    cexTotal: cex?.total ?? null,
    cexCount: cex?.venues.length ?? 0,
    cexMethod: cex ? (cex.method === 'coingecko' ? 'CoinGecko spot tickers' : 'CoinPaprika spot markets') : '',
    cexThin: !!cex && cex.venues.length < 10,
    cexMissing: why(l, 'cexZec'),
    rheaVsCex: ratio(rheaZec24h, cex?.total),
    solana24h,
    rheaVsSolana: solana24h ? ratio(rheaZec24h, solana24h) : null,
    rheaNear24h: nearD?.rhea24h ?? rheaD?.total24h ?? null,
    nearTotal24h: nearD?.total24h ?? null,
    nearShare24h: ratio(nearD?.rhea24h, nearD?.total24h),
    nearMissing: why(l, 'nearDex'),
    venues,
    rankOverall: rheaIdx >= 0 ? rheaIdx + 1 : null,
    rankOnchain: rheaOnchainIdx >= 0 ? rheaOnchainIdx + 1 : null,
    onchainCount: onchainSorted.length,
    topOnchain: onchainSorted[0] ?? null,
    isTopOnchain: onchainSorted.length ? onchainSorted[0].isRhea : null,
    trends,
    chart: zs
      ? {
          days: zs.days,
          vol: zs.rhea.map(([, v]) => v),
          share: zs.days.map((_, i) => (zs.total[i][1] > 0 ? zs.rhea[i][1] / zs.total[i][1] : null)),
        }
      : null,
    historyNote: h
      ? `Daily history = top pools by today's volume (${h.poolsUsed} pools; covers ${coverage} of today's volume). Pools that were big in the past but are quiet today are under-counted.`
      : `No daily history: ${why(l, 'zecHistory')}`,
  };

  // ----- block A -----
  const nearDexDaily = nearD?.daily ?? [];
  const a: BlockAVM = {
    meta: meta(l, ['prices', 'nearDex']),
    coins: p
      ? [
          { label: 'ZEC', price: p.zec.price, ch7d: p.zec.ch7d, ch30d: p.zec.ch30d },
          { label: 'NEAR', price: p.near.price, ch7d: p.near.ch7d, ch30d: p.near.ch30d },
        ]
      : [],
    bars: [
      { label: 'RHEA', d7: p?.rhea.ch7d ?? null, d30: p?.rhea.ch30d ?? null },
      { label: 'ZEC', d7: p?.zec.ch7d ?? null, d30: p?.zec.ch30d ?? null },
      { label: 'NEAR', d7: p?.near.ch7d ?? null, d30: p?.near.ch30d ?? null },
      { label: 'NEAR DEX $ vol', d7: volChange(nearDexDaily, 7), d30: volChange(nearDexDaily, 30) },
    ],
    pricesMissing: why(l, 'prices'),
  };

  // ----- block C -----
  const pairs = l.rheaVenues.data?.dex ?? [];
  const venuesMissing = why(l, 'rheaVenues');
  const dexRow = (key: string, venue: string, pair: RheaDexPair | null): SizeRow => {
    if (!pair) {
      return { key, venue, detail: '', vol24h: null, liquidity: null, liquidityKind: 'pool TVL', slip: SIZES.map(() => ({ value: null })), method: '', missing: l.rheaVenues.data ? 'no RHEA pool with a major pair found' : venuesMissing };
    }
    const concentrated = pair.labels.some((x) => /v3|clmm|dlmm|wp/i.test(x)) || /clmm|v3/i.test(pair.dex);
    return {
      key,
      venue,
      detail: `${pair.pair} · ${protocolOf(pair.dex)}${pair.labels.length ? ` ${pair.labels.join('/')}` : ''}`,
      url: pair.url,
      vol24h: pair.vol24h,
      liquidity: pair.liquidityUsd,
      liquidityKind: 'pool TVL',
      slip: SIZES.map((s) => xykSlip(pair.liquidityUsd, s)),
      method: concentrated ? 'x·y=k on pool TVL (concentrated pool: usually deeper near price)' : 'x·y=k on pool TVL',
    };
  };
  const nearPair = mainPair(pairs, (x) => x.chain === 'near' && x.dex === DEX_IDS.rhea);
  const bscPair = mainPair(pairs, (x) => x.chain === 'bsc' && x.dex.startsWith('pancakeswap'));
  const solPair = mainPair(pairs, (x) => x.chain === 'solana');
  const rows: SizeRow[] = [
    dexRow('near', 'NEAR · Rhea', nearPair),
    dexRow('bsc', 'BNB · PancakeSwap', bscPair),
    dexRow('solana', `Solana${solPair ? ` · ${protocolOf(solPair.dex)}` : ''}`, solPair),
  ];
  const books = l.rheaBooks.data?.books ?? [];
  const tickers = l.rheaVenues.data?.cex ?? [];
  for (const v of RHEA_CEX) {
    const book = books.find((x) => x.key === v.key);
    const ticker = tickers.find((x) => x.key === v.key);
    const stats = book ? bookStats(book) : null;
    rows.push({
      key: v.key,
      venue: v.name,
      detail: 'RHEA/USDT spot',
      vol24h: book?.vol24hUsd ?? ticker?.vol24h ?? null,
      liquidity: stats?.depth2 ?? ticker?.depthUp2pct ?? null,
      liquidityKind: '+2% ask depth',
      slip: stats ? stats.slips : SIZES.map((s) => tickerSlip(ticker, s)),
      method: stats ? `walked the live order book (${book!.asks.length} ask levels) vs mid` : ticker ? 'CoinGecko +2% depth, assumes an even book' : '',
      missing: stats || ticker ? undefined : (l.rheaBooks.data?.errors[v.key] ?? why(l, 'rheaBooks')),
    });
  }
  const c: BlockCVM = {
    meta: meta(l, ['rheaVenues', 'rheaBooks']),
    rows,
    compare:
      nearPair && bscPair
        ? {
            pancakeVol: bscPair.vol24h,
            nearVol: nearPair.vol24h,
            pancakeLiq: bscPair.liquidityUsd,
            nearLiq: nearPair.liquidityUsd,
            pancakeMoreVolume: bscPair.vol24h > nearPair.vol24h,
            nearDeeper: (nearPair.liquidityUsd ?? 0) > (bscPair.liquidityUsd ?? 0),
          }
        : null,
  };

  // ----- block D -----
  const hd = l.holders.data;
  const rowsD = hd?.top.map((x) => ({ account: x.account, amount: x.amount, pct: ratio(x.amount, totalSupply), label: holderLabel(x.account) })) ?? [];
  const pingDate = thesis.lastAdvisorPing?.date ?? null;
  const pingMs = pingDate ? Date.parse(pingDate) : NaN;
  const d: BlockDVM = {
    meta: meta(l, ['holders']),
    holders: hd
      ? {
          contract: hd.contract,
          count: hd.count,
          top10Pct: ratio(sum(rowsD.slice(0, 10).map((x) => x.amount)), totalSupply),
          top10UnlabelledPct: ratio(sum(rowsD.filter((x) => !x.label).slice(0, 10).map((x) => x.amount)), totalSupply),
          rows: rowsD.slice(0, 8),
        }
      : null,
    holdersMissing: why(l, 'holders'),
    advisor: {
      date: pingDate,
      note: thesis.lastAdvisorPing?.note ?? '',
      daysSince: Number.isFinite(pingMs) ? Math.floor((Date.now() - pingMs) / (DAY * 1000)) : null,
      quietDays: rules.advisorQuietDays,
    },
  };

  // ----- block E -----
  const lights: LightVM[] = [];
  {
    const mh = market?.mcapHistory;
    let mcap7: number | null = null;
    let approx = false;
    if (mh && mh.length >= 8) {
      const last = mh[mh.length - 1];
      const base = [...mh].reverse().find(([t]) => t <= last[0] - 7 * DAY);
      mcap7 = base ? last[1] / base[1] - 1 : null;
    }
    if (mcap7 == null && p?.rhea.ch7d != null) {
      mcap7 = p.rhea.ch7d;
      approx = true;
    }
    const t7 = zecTrend7;
    if (!t7 || t7.change == null) {
      lights.push({ title: 'ZEC onchain share rolling over', color: 'grey', value: '—', detail: `needs 14 days of ZEC pool history (${why(l, 'zecHistory')})` });
    } else {
      const rolling = t7.change <= -rules.shareRollingOverPct;
      lights.push({
        title: 'ZEC onchain share rolling over',
        color: rolling ? (mcap7 != null && mcap7 > 0 ? 'red' : 'amber') : 'green',
        value: `7d share ${share(t7.now)} vs ${share(t7.prev)} prior`,
        detail: `${pct(t7.change)} relative · mcap 7d ${pct(mcap7)}${approx ? ' (≈ price)' : ''} · trips at ${pct(-rules.shareRollingOverPct, 0)} with mcap up`,
      });
    }
  }
  {
    const fdv7 = p?.rhea.ch7d ?? null;
    const zecVol7 = zs ? volChange(zs.rhea, 7) : null;
    const vol7 = zecVol7 ?? (rheaD ? volChange(rheaD.daily, 7) : null);
    const volLabel = zecVol7 != null ? 'Rhea ZEC $ vol' : 'Rhea DEX $ vol';
    if (fdv7 == null || vol7 == null) {
      lights.push({ title: 'FDV re-rates without volume', color: 'grey', value: '—', detail: 'needs 7d price change and 14 days of volume history' });
    } else {
      const rerate = fdv7 >= rules.fdvRerateMinPct && vol7 < rules.volumeConfirmMinPct;
      lights.push({
        title: 'FDV re-rates without volume',
        color: rerate ? 'red' : 'green',
        value: `FDV 7d ${pct(fdv7)} · ${volLabel} 7d ${pct(vol7)}`,
        detail: `trips when FDV ≥ ${pct(rules.fdvRerateMinPct, 0)} and volume < ${pct(rules.volumeConfirmMinPct, 0)} (FDV moves with price; supply is fixed)`,
      });
    }
  }
  {
    const days = d.advisor.daysSince;
    lights.push(
      days == null
        ? { title: 'Advisor / NEAR push gone quiet', color: 'grey', value: '— not set', detail: 'set lastAdvisorPing.date in config/thesis.json (X data is paid, so this is manual)' }
        : {
            title: 'Advisor / NEAR push gone quiet',
            color: days > rules.advisorQuietDays ? 'red' : days > rules.advisorQuietDays / 2 ? 'amber' : 'green',
            value: `${days}d since last ping`,
            detail: `${d.advisor.date}${d.advisor.note ? ` · ${d.advisor.note}` : ''} · trips after ${rules.advisorQuietDays}d`,
          },
    );
  }
  {
    const r = lowerLow(hist?.rhea);
    const z = lowerLow(hist?.zec);
    const n = lowerLow(hist?.near);
    if (!r || !z || !n) {
      lights.push({ title: 'Lower lows while ZEC / NEAR hold', color: 'grey', value: '—', detail: why(l, 'priceHistory') });
    } else {
      const word = (x: { lower: boolean }) => (x.lower ? 'lower low' : 'holding');
      lights.push({
        title: 'Lower lows while ZEC / NEAR hold',
        color: !r.lower ? 'green' : z.lower || n.lower ? 'amber' : 'red',
        value: `RHEA 7d low ${fmtPrice(r.cur)} vs ${fmtPrice(r.prev)} prior`,
        detail: `RHEA ${word(r)} · ZEC ${word(z)} · NEAR ${word(n)} (red = falling knife; amber = market-wide dip)`,
      });
    }
  }
  const e: BlockEVM = { meta: meta(l, ['zecHistory', 'prices', 'priceHistory', 'rheaMarket']), lights };

  return { header, a, b, c, d, e, snapshotAt: l.snapshotAt };
}
