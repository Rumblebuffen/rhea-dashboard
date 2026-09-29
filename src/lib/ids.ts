import { cgGet, errMsg, gtGet } from './http';

/*
 * Every id here was resolved by API lookup on 2026-09-29, not guessed:
 *   RHEA contracts  <- CoinGecko /coins/rhea-2 `platforms`
 *   RHEA decimals   <- ft_metadata on token.rhealab.near (NEAR RPC)
 *   ZEC tokens      <- GeckoTerminal /search/pools + /tokens/multi (`coingecko_coin_id`)
 *   DefiLlama slugs <- /protocols (parent "rhea-finance" = Ref Finance + Burrow after the 2025 merger)
 *   Pool / dex ids  <- DexScreener /latest/dex/pairs/near/refv1-6065 and GeckoTerminal pool lists
 * resolveIds() repeats the lookups on every snapshot run. The constants are the fallbacks.
 */

export const COINS = {
  rhea: { coingecko: 'rhea-2', llama: 'coingecko:rhea-2', symbol: 'RHEA' },
  zec: { coingecko: 'zcash', llama: 'coingecko:zcash', symbol: 'ZEC' },
  near: { coingecko: 'near', llama: 'coingecko:near', symbol: 'NEAR' },
} as const;

export interface RheaContracts {
  near: string;
  bsc: string;
  solana: string;
}

export const RHEA_CONTRACTS_FALLBACK: RheaContracts = {
  near: 'token.rhealab.near',
  bsc: '0x4c067de26475e1cefee8b8d1f6e2266b33a2372e',
  solana: '8SMMso8Muv8d6i4WmMDthKt6TN1ysN6937sx3DKLXZqB',
};

export const RHEA_DECIMALS = 18;

// Supply is capped at 1B and ~999.2M is minted; only used when CoinGecko is unreachable.
export const RHEA_SUPPLY_FALLBACK = { total: 999_199_423, max: 1_000_000_000, asOf: '2026-09-29' };

export interface ZecToken {
  network: string;
  address: string;
  coingeckoId: string;
  label: string;
}

// ZEC as it trades onchain. A token only counts if its symbol is ZEC and GeckoTerminal maps it to a
// Zcash CoinGecko id. That rule drops spoof mints (Solana F6Kk…, 9SWX…, CRRB… report $1B+ of fake
// liquidity) and look-alikes such as "Zcash Shielded Assets" (symbol STAMP) or Base "Zetardio Coin".
export const ZEC_TOKENS_FALLBACK: ZecToken[] = [
  { network: 'near', address: 'zec.omft.near', coingeckoId: 'near-intents-bridged-zec', label: 'NEAR · zec.omft.near' },
  {
    network: 'solana',
    address: 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS',
    coingeckoId: 'omnibridge-bridged-zcash-solana',
    label: 'Solana · Omni-bridged ZEC',
  },
  {
    network: 'bsc',
    address: '0x1ba42e5193dfa8b03d15dd1b86a3113bbbef8eeb',
    coingeckoId: 'binance-peg-zcash-token',
    label: 'BSC · Binance-Peg ZEC',
  },
];

// Same dex ids on DexScreener and GeckoTerminal.
export const DEX_IDS = { rhea: 'rhea-finance', nearIntents: 'near-intents' } as const;

// Rhea's NEAR DEX child first, then the parent, then the pre-merge Ref Finance slug.
export const LLAMA_DEX_SLUGS = ['rhea-dex', 'rhea-finance', 'ref-finance'];
export const LLAMA_RHEA_NAMES = ['Rhea Dex', 'Ref Finance'];

export const RHEA_CEX = [
  { key: 'gate', name: 'Gate', coingeckoMarket: 'gate', symbol: 'RHEA_USDT' },
  { key: 'mexc', name: 'MEXC', coingeckoMarket: 'mxc', symbol: 'RHEAUSDT' },
] as const;

export const LINKS = {
  site: 'https://rhea.finance',
  dex: 'https://dex.rhea.finance',
  zecPool: 'https://dexscreener.com/near/refv1-6065',
  repo: 'https://github.com/Rumblebuffen/rhea-dashboard',
};

export const NETWORK_LABELS: Record<string, string> = { near: 'NEAR', solana: 'Solana', bsc: 'BSC', eth: 'Ethereum', base: 'Base' };
export const networkLabel = (n: string) => NETWORK_LABELS[n] ?? n;

// CoinGecko coin call shared (memoised) by id resolution and the market-data source.
export const RHEA_COIN_PATH = `/coins/${COINS.rhea.coingecko}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;

export interface IdsData {
  rheaContracts: RheaContracts;
  zecTokens: ZecToken[];
  notes: string[];
}

export const FALLBACK_IDS: IdsData = {
  rheaContracts: RHEA_CONTRACTS_FALLBACK,
  zecTokens: ZEC_TOKENS_FALLBACK,
  notes: ['Using the fallback id list from src/lib/ids.ts'],
};

async function resolveRheaContracts(): Promise<{ contracts: RheaContracts; note?: string }> {
  try {
    const c = await cgGet<{ platforms?: Record<string, string> }>(RHEA_COIN_PATH);
    const p = c.platforms ?? {};
    return {
      contracts: {
        near: p['near-protocol'] || RHEA_CONTRACTS_FALLBACK.near,
        bsc: p['binance-smart-chain'] || RHEA_CONTRACTS_FALLBACK.bsc,
        solana: p.solana || RHEA_CONTRACTS_FALLBACK.solana,
      },
    };
  } catch (e) {
    return { contracts: RHEA_CONTRACTS_FALLBACK, note: `RHEA contracts from fallback list (CoinGecko: ${errMsg(e)})` };
  }
}

interface GtRef {
  data: { id: string };
}
interface GtSearchPool {
  relationships: { base_token: GtRef; quote_token: GtRef };
}
interface GtToken {
  attributes: { address: string; symbol: string | null; name: string | null; coingecko_coin_id: string | null };
}

function splitGtId(id: string): [string, string] {
  const i = id.indexOf('_');
  return [id.slice(0, i), id.slice(i + 1)];
}

async function discoverZecTokens(): Promise<ZecToken[]> {
  const byNetwork = new Map<string, Set<string>>();
  for (const query of ['ZEC', 'zcash']) {
    for (const page of [1, 2]) {
      const d = await gtGet<{ data: GtSearchPool[] }>(`/search/pools?query=${query}&page=${page}`);
      for (const pool of d.data) {
        for (const side of ['base_token', 'quote_token'] as const) {
          const [network, address] = splitGtId(pool.relationships[side].data.id);
          if (!byNetwork.has(network)) byNetwork.set(network, new Set());
          byNetwork.get(network)!.add(address);
        }
      }
    }
  }
  const found: ZecToken[] = [];
  for (const [network, addresses] of byNetwork) {
    const list = [...addresses].slice(0, 30).map(encodeURIComponent).join(',');
    const d = await gtGet<{ data: GtToken[] }>(`/networks/${network}/tokens/multi/${list}`);
    for (const t of d.data) {
      const a = t.attributes;
      if ((a.symbol ?? '').toUpperCase() === 'ZEC' && a.coingecko_coin_id && /zcash|zec/i.test(a.coingecko_coin_id)) {
        found.push({ network, address: a.address, coingeckoId: a.coingecko_coin_id, label: `${networkLabel(network)} · ${a.name ?? 'ZEC'}` });
      }
    }
  }
  return found;
}

async function resolveZecTokens(): Promise<{ tokens: ZecToken[]; note?: string }> {
  try {
    const found = await discoverZecTokens();
    const tokens = [...ZEC_TOKENS_FALLBACK];
    for (const t of found) {
      if (!tokens.some((k) => k.network === t.network && k.address.toLowerCase() === t.address.toLowerCase())) tokens.push(t);
    }
    return { tokens, note: found.length ? undefined : 'ZEC discovery found nothing; using the fallback list' };
  } catch (e) {
    return { tokens: ZEC_TOKENS_FALLBACK, note: `ZEC tokens from fallback list (GeckoTerminal: ${errMsg(e)})` };
  }
}

export async function resolveIds(): Promise<IdsData> {
  const rhea = await resolveRheaContracts();
  const zec = await resolveZecTokens();
  return { rheaContracts: rhea.contracts, zecTokens: zec.tokens, notes: [rhea.note, zec.note].filter((x): x is string => !!x) };
}
