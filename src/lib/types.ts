import type { IdsData, ZecToken } from './ids';

/** [unix seconds, value]; daily series use UTC day starts. */
export type Series = [number, number][];

export type CoinKey = 'rhea' | 'zec' | 'near';

export interface CoinPrice {
  price: number;
  ch24h: number | null;
  ch7d: number | null;
  ch30d: number | null;
}

export type PricesData = Record<CoinKey, CoinPrice>;
export type PriceHistoryData = Record<CoinKey, Series>;

export interface RheaMarketData {
  method: 'coingecko' | 'defillama';
  mcapUsd: number | null;
  circulating: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  mcapHistory: Series | null;
  note?: string;
}

export interface NearDexData {
  total24h: number | null;
  daily: Series;
  rhea24h: number | null;
  top: { name: string; vol24h: number }[];
}

export interface RheaDexData {
  slug: string;
  total24h: number | null;
  daily: Series;
}

export interface ZecPool {
  id: string;
  network: string;
  dex: string;
  name: string;
  vol24h: number;
  reserveUsd: number | null;
}

export interface ZecPoolsData {
  tokens: ZecToken[];
  pools: ZecPool[];
  errors: string[];
}

export const ZEC_BUCKETS = ['rhea', 'nearIntents', 'nearOther', 'solana', 'bsc', 'other'] as const;
export type ZecBucket = (typeof ZEC_BUCKETS)[number];

export interface ZecHistoryData {
  /** Complete UTC days, oldest first. */
  days: number[];
  buckets: Record<ZecBucket, number[]>;
  poolsUsed: number;
  coverage: { network: string; covered24h: number; total24h: number }[];
  errors: string[];
}

export interface CexZecData {
  method: 'coingecko' | 'coinpaprika';
  venues: { name: string; vol24h: number }[];
  total: number;
  excluded: number;
}

export interface RheaDexPair {
  chain: string;
  dex: string;
  pair: string;
  counter: string;
  url: string;
  vol24h: number;
  liquidityUsd: number | null;
  labels: string[];
}

export interface RheaCexTicker {
  key: string;
  name: string;
  vol24h: number | null;
  depthUp2pct: number | null;
  spreadPct: number | null;
}

export interface RheaVenuesData {
  dex: RheaDexPair[];
  cex: RheaCexTicker[];
  errors: string[];
}

export interface RheaBook {
  key: string;
  name: string;
  asks: [number, number][];
  bids: [number, number][];
  vol24hUsd: number | null;
}

export interface RheaBooksData {
  books: RheaBook[];
  errors: Record<string, string>;
}

export interface HoldersData {
  contract: string;
  count: number | null;
  top: { account: string; amount: number }[];
}

export interface SourceDataMap {
  ids: IdsData;
  prices: PricesData;
  priceHistory: PriceHistoryData;
  rheaMarket: RheaMarketData;
  nearDex: NearDexData;
  rheaDex: RheaDexData;
  zecPools: ZecPoolsData;
  zecHistory: ZecHistoryData;
  cexZec: CexZecData;
  rheaVenues: RheaVenuesData;
  rheaBooks: RheaBooksData;
  holders: HoldersData;
}

export type SourceId = keyof SourceDataMap;

export interface SourceResult<T> {
  ok: boolean;
  fetchedAt: number;
  data: T | null;
  error?: string;
  /** Daily sources only: the value stays current until this time (next UTC midnight). */
  freshUntil?: number;
}

export interface Snapshot {
  version: 1;
  fetchedAt: number;
  sources: { [K in SourceId]?: SourceResult<SourceDataMap[K]> };
}
