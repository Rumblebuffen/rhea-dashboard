import { compact, pct, price, share, usd } from '../lib/format';
import type { HeaderVM } from '../lib/metrics';
import type { Trade } from '../lib/signals';
import { Block, Flag, Metric, toneOf } from './ui';

const CHIP: Record<Trade, string> = {
  ADD: 'border-up text-up bg-up/10',
  HOLD: 'border-accent text-accent bg-accent/10',
  CHASE: 'border-down text-down bg-down/10',
};

const setIn = (field: string) => `set ${field} in config/position.json`;

export function Header({ vm }: { vm: HeaderVM }) {
  const p = vm.position;
  const noPrice = vm.price == null ? vm.priceMissing : false;
  return (
    <Block tag="▲" title="Trade state" meta={vm.meta}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
          <Metric
            big
            label="RHEA price"
            value={price(vm.price)}
            sub={
              <>
                24h <span className={vm.ch24h != null && vm.ch24h < 0 ? 'text-down' : 'text-up'}>{pct(vm.ch24h)}</span> · 7d {pct(vm.ch7d)}
              </>
            }
            missing={noPrice}
          />
          <Metric
            label={`vs entry high ${price(vm.entryHigh)}`}
            value={pct(vm.vsEntry)}
            tone={toneOf(vm.vsEntry)}
            sub={vm.vsEntry == null ? undefined : vm.vsEntry >= 0 ? 'above the entry high: no drawdown' : `drawdown ${pct(vm.vsEntry)} from it`}
            missing={vm.entryHigh == null ? setIn('entryHigh') : noPrice}
          />
          <Metric
            label={`${vm.localHighDays}d local high`}
            value={price(vm.localHigh)}
            sub={`price is ${pct(vm.vsLocalHigh)} from it`}
            missing={vm.localHigh == null ? 'needs price history' : false}
          />
          <Metric
            label="Mcap"
            value={usd(vm.mcap)}
            sub={`cheap ≤ ${usd(vm.cheapMcapUsd)}${vm.target ? ` · if it works ${usd(vm.target[0])}–${usd(vm.target[1])}` : ''}`}
            missing={vm.mcap == null ? vm.marketMissing : false}
          />
          <Metric
            label="FDV (FTV)"
            value={
              <>
                {usd(vm.fdv)}
                {vm.bandFlag && <Flag>SCREEN ≠ THESIS BAND</Flag>}
              </>
            }
            tone={vm.bandFlag ? 'warn' : undefined}
            sub={`thesis band ${usd(vm.band[0])}–${usd(vm.band[1])} · cheap ≤ ${usd(vm.cheapFtvUsd)}`}
            missing={vm.fdv == null ? noPrice || 'needs price' : false}
          />
          <Metric
            label="Position"
            value={usd(p.positionUsd)}
            sub={p.valueNow != null ? `worth ${usd(p.valueNow)} at today's price` : undefined}
            missing={p.positionUsd == null && p.valueNow == null ? setIn('positionUsd') : false}
          />
          <Metric
            label="Tokens · % supply"
            value={compact(p.tokens)}
            sub={p.pctSupply != null ? `${share(p.pctSupply, 2)} of supply` : undefined}
            missing={p.tokens == null && p.pctSupply == null ? setIn('tokenAmount') : false}
          />
          <Metric
            label="Avg cost · uPnL"
            value={price(p.avgCost)}
            tone={toneOf(p.upnl)}
            sub={p.upnl != null ? `uPnL ${usd(p.upnl)} (${pct(p.upnlPct)})` : `uPnL ${pct(p.upnlPct)} per token · needs tokenAmount for $`}
            missing={p.avgCost == null ? setIn('avgCostUsd') : false}
          />
          <Metric label="Cash left to add" value={usd(p.cashToAdd)} missing={p.cashToAdd == null ? setIn('cashToAddUsd') : false} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-[10px] tracking-wider text-dim uppercase">Status</div>
          <div className="flex gap-1.5" title={vm.trade.why}>
            {(['ADD', 'HOLD', 'CHASE'] as const).map((s) => (
              <span
                key={s}
                className={`flex-1 border py-1.5 text-center text-sm font-semibold tracking-[0.2em] ${vm.trade.status === s ? CHIP[s] : 'border-line text-faint'}`}
              >
                {s}
              </span>
            ))}
          </div>
          <p className="text-[11px] leading-4 text-dim">{vm.addRule}</p>
        </div>
      </div>
      {p.warnings.map((w) => (
        <p key={w} className="mt-3 text-[11px] text-warn">
          {w}
        </p>
      ))}
    </Block>
  );
}
