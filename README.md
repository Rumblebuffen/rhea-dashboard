# Rhea Finance — RIA trade dashboard

One page that tracks one trade: **Rhea Finance** (RIA / Rea), the NEAR DEX + lending protocol (Ref Finance + Burrow, merged in 2025) and a ZEC venue.

**Live:** https://rumblebuffen.github.io/rhea-dashboard/

## What's on the page

| Block | What it answers |
|---|---|
| Header: trade state | Price vs `entryHigh`, drawdown, mcap and FDV vs the thesis band (`SCREEN ≠ THESIS BAND` flag), your position from config, and the `ADD` / `HOLD` / `CHASE` status |
| B: the only fundamental | Rhea's $ volume on ZEC pairs, its share of all onchain ZEC volume, vs CEX spot, vs Solana, share of NEAR DEX volume, venue rank, 7d and 30d share changes, 90-day chart |
| A: ecosystem beta | ZEC and NEAR price, 7d / 30d relative strength vs RHEA and NEAR DEX volume |
| C: where size can go on | RHEA liquidity and estimated slippage at $10k / $25k / $50k on Rhea (NEAR), PancakeSwap (BNB), Solana, Gate and MEXC |
| D: distribution | NEAR holder count, top-holder concentration, the manual advisor-ping date |
| E: invalidation | Four traffic lights, each with its latest number |

Every block shows when its data was fetched and whether it is **LIVE** (this browser fetched it), **SNAPSHOT** (scheduled job, under 45 min old), **STALE** (older, because a fresh fetch failed) or **MISSING**. A missing number shows `—` and the reason, never a placeholder.

## Run it locally

```bash
git clone https://github.com/Rumblebuffen/rhea-dashboard.git
```

```bash
cd rhea-dashboard && npm install
```

```bash
npm run snapshot
```

```bash
npm run dev
```

Needs Node 22+. `npm run snapshot` takes a few minutes because it paces its calls to stay under the free rate limits; it writes `public/data/snapshot.json` (gitignored). Without it the page fetches the public APIs straight from your browser, but the ZEC share history, the chart and the MEXC order book only exist in the snapshot. `npm run build` type-checks and builds to `dist/`.

## How it deploys

`.github/workflows/deploy.yml` runs on every push to `main`, every 30 minutes, and on demand. Each run does `npm ci`, `npm run snapshot`, `npm run build`, and deploys `dist/` to GitHub Pages. The snapshot is baked into each deploy rather than committed, so the repository history stays clean.

- **Pages was turned on once** with Settings → Pages → Build and deployment → Source: **GitHub Actions** (the same as `gh api -X POST repos/Rumblebuffen/rhea-dashboard/pages -f build_type=workflow`).
- **Refresh now:** Actions → *Snapshot, build, deploy* → Run workflow.
- **The 90-day history and the id lookups are rebuilt once a day.** They are made of complete UTC days, so every other run that day copies them from the live snapshot. That keeps a normal run to about 10 GeckoTerminal calls (the first run after midnight makes about 40) and clear of its rate limit.
- **If a source fails** during a run, the snapshot keeps that source's last good value from the live site, marked with its original time, so the block shows STALE instead of blank. The history refuses to publish at all if Rhea's main ZEC pool is missing from it, so a partial fetch can't skew the share.
- GitHub pauses scheduled workflows after 60 days with no repository activity. The workflow makes an empty commit after 45 quiet days to prevent that.
- GitHub often starts cron runs late. The page treats a snapshot older than 45 minutes as stale and tries the live APIs instead.

## Config

Edit the two files in `config/` on GitHub (open the file, pencil icon, commit). The site redeploys within about five minutes. **Everything in `config/` is public, and so is the site.** That's why the position fields ship empty.

### `config/position.json`

| Field | Meaning |
|---|---|
| `entryHigh` | The local high you sized against (0.07). Drives "vs entry high" and the dip test for `ADD`. |
| `avgCostUsd` | Average cost per RHEA. Enables uPnL. |
| `positionUsd` | Position size in dollars. |
| `tokenAmount` | RHEA held. Total supply is ~1B, so the brief's example of 1.8b can't be right; $113k at about $0.063 is roughly **1.8M** tokens. The page warns if this exceeds supply. |
| `pctSupply` | Fraction of supply (0.002 = 0.2%). Leave `null` to compute it from `tokenAmount`. |
| `cashToAddUsd` | Cash left for adds. |
| `notes` | Free text, not shown in the header. |

### `config/thesis.json`

`cheapMcapUsd`, `cheapFtvUsd`, `ftvBand`, `targetMultipleIfWorks` and `addRule` are the thesis numbers and sentence. `lastAdvisorPing` is `{ "date": "YYYY-MM-DD", "note": "…" }`; set it by hand whenever the advisor or NEAR founder pushes Rhea. `rules` holds every threshold the status and lights use:

| Rule | Default | Used by |
|---|---|---|
| `addDipPct` | 0.30 | `ADD` needs price at least 30% below `entryHigh` |
| `shareRollingOverPct` | 0.10 | Share "rolling over" = 7d share down 10%+ vs the prior 7d (relative) |
| `shareFlatPct` | 0.05 | Share "flat or down" = 7d share change of +5% or less |
| `chaseRipPct7d` | 0.25 | `CHASE` needs a 7d price gain of 25%+ |
| `chaseNearHighPct` | 0.10 | …and price within 10% of the local high |
| `localHighDays` | 30 | Window for the local high |
| `fdvRerateMinPct` | 0.30 | Light 2 trips when FDV is up 30%+ in 7d… |
| `volumeConfirmMinPct` | 0.10 | …while Rhea's ZEC $ volume is up less than 10% |
| `advisorQuietDays` | 21 | Light 3 trips this many days after `lastAdvisorPing` |

**Status** (`src/lib/signals.ts`): `ADD` = dip below entry high **and** ZEC onchain share not rolling over. `CHASE` = ripping toward or through the local high **and** share flat or down. `HOLD` = everything else, including whenever an input is unknown. Hover the chips for the inputs.

**Invalidation lights** (`src/lib/metrics.ts`): (1) 7d ZEC share rolling over while mcap is up; (2) FDV re-rating without volume; (3) days since `lastAdvisorPing`; (4) RHEA's 7d low below the prior 7d low while ZEC and NEAR hold (red), or alongside them (amber).

## Data sources and limits

All free, keyless, public endpoints. One function per source lives in `src/lib/sources.ts`; ids and fallbacks in `src/lib/ids.ts`.

| Data | Source and endpoint | In browser | Limits |
|---|---|---|---|
| RHEA / ZEC / NEAR price, 24h / 7d / 30d change, 90d history | DefiLlama coins: `coins.llama.fi/prices/current`, `/percentage`, `/chart` | yes | none hit so far |
| RHEA mcap, supply | CoinGecko `/coins/rhea-2` (+ `/market_chart` in the snapshot) | yes | Keyless CoinGecko rate-limits hard (HTTP 429/403). Falls back to DefiLlama `/mcaps` plus the fixed supply in `ids.ts`. |
| NEAR DEX volume, Rhea's NEAR share | DefiLlama `api.llama.fi/overview/dexs/near`, `/summary/dexs/rhea-dex` | yes | Daily granularity |
| ZEC pools on every chain, incl. NEAR Intents | GeckoTerminal `/networks/{net}/tokens/{token}/pools` | yes | ~30 calls/min |
| ZEC daily history (chart, 7d / 30d shares) | GeckoTerminal `/networks/{net}/pools/{pool}/ohlcv/day` | snapshot only | ~30 calls, once a day |
| CEX ZEC spot volume | CoinGecko `/coins/zcash/tickers`, fallback CoinPaprika `/coins/zec-zcash/markets` | yes | Spot only; anomalous and stale tickers dropped. About 40 exchanges; the page flags thin coverage. |
| RHEA pools (NEAR, BNB, Solana) | DexScreener `/token-pairs/v1/{chain}/{token}` | yes | 300 calls/min |
| RHEA CEX depth, 24h volume | Gate `/api/v4/spot/order_book`, `/spot/tickers`; MEXC `/api/v3/depth`, `/ticker/24hr`; CoinGecko `/coins/rhea-2/tickers?depth=true` | Gate yes, MEXC snapshot only (no CORS) | Top 100 levels of each book |
| Holders (NEAR) | NearBlocks `/v1/fts/{contract}/holders/count`, `/holders` | yes | NEAR only |
| Id resolution | CoinGecko `platforms`; GeckoTerminal `/search/pools` + `/tokens/multi` | snapshot only, once a day | Falls back to the list in `ids.ts` |

Deliberately left out: BSC and Solana holder counts (need keyed explorer APIs), X mention counts (paid API, so `lastAdvisorPing` is manual), FOMO (no public endpoint), and revenue, fees and buybacks (out of scope).

### Caveats worth knowing

- **Which ZEC counts.** Only tokens with symbol ZEC that GeckoTerminal maps to a Zcash CoinGecko id: `zec.omft.near` (NEAR), Omni-bridged ZEC on Solana, Binance-Peg ZEC on BSC. Solana has several spoof "ZEC" mints reporting $1B+ of fake liquidity; they are excluded on purpose.
- **NEAR Intents is counted as onchain.** It is the largest onchain ZEC venue, so Block B also shows Rhea's share excluding it.
- **History is rebuilt from today's pools.** The 90-day series sums the pools that carry about 90% of today's volume on each chain (all Rhea pools are always included). A venue that was big earlier but is quiet now is under-counted, which would flatter Rhea's past share, not its current one.
- **Slippage is an estimate.** DEX rows use constant-product maths on pool TVL, so concentrated pools (v3, CLMM, DLMM) are usually deeper near price than shown. Gate and MEXC rows walk the live order book.
- Numbers only. Not investment advice.
