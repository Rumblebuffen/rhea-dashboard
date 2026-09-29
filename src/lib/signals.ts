import type { Rules } from './config';
import { pct } from './format';

export type Trade = 'ADD' | 'HOLD' | 'CHASE';

export interface TradeInputs {
  price: number | null;
  entryHigh: number | null;
  localHigh: number | null;
  ch7d: number | null;
  /** Relative 7d change in Rhea's share of ZEC onchain volume vs the prior 7 days. */
  share7Change: number | null;
}

export interface TradeStatus {
  status: Trade;
  why: string;
}

const yn = (v: boolean | null) => (v == null ? 'unknown' : v ? 'yes' : 'no');

/**
 * ADD   price is at least `addDipPct` below entryHigh AND ZEC onchain share is not rolling over.
 * CHASE price is ripping (7d >= chaseRipPct7d) to within chaseNearHighPct of the local high
 *       AND share is flat or down (7d change <= shareFlatPct).
 * HOLD  everything else, including whenever an input is unknown.
 */
export function tradeStatus(i: TradeInputs, r: Rules): TradeStatus {
  const dip = i.price != null && i.entryHigh ? i.price <= i.entryHigh * (1 - r.addDipPct) : null;
  const shareHolds = i.share7Change == null ? null : i.share7Change > -r.shareRollingOverPct;
  const shareFlatOrDown = i.share7Change == null ? null : i.share7Change <= r.shareFlatPct;
  const ripping =
    i.price != null && i.localHigh && i.ch7d != null ? i.ch7d >= r.chaseRipPct7d && i.price >= i.localHigh * (1 - r.chaseNearHighPct) : null;

  const why = [
    `dip ≥${pct(r.addDipPct, 0, false)} below entry high: ${yn(dip)}${i.price != null && i.entryHigh ? ` (${pct(i.price / i.entryHigh - 1)})` : ''}`,
    `ZEC share 7d change: ${pct(i.share7Change)}${shareHolds === false ? ' (rolling over)' : ''}`,
    `ripping to local high: ${yn(ripping)}${i.ch7d != null ? ` (7d ${pct(i.ch7d)}${i.price != null && i.localHigh ? `, ${pct(i.price / i.localHigh - 1)} vs high` : ''})` : ''}`,
  ].join(' · ');

  if (dip && shareHolds) return { status: 'ADD', why };
  if (ripping && shareFlatOrDown) return { status: 'CHASE', why };
  return { status: 'HOLD', why };
}
