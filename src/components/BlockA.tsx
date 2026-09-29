import { pct, price } from '../lib/format';
import type { BlockAVM } from '../lib/metrics';
import { Block, Metric, toneOf } from './ui';

// log scale so a +800% move and a −6% move both stay readable
const scaled = (v: number, max: number) => (Math.log1p(Math.abs(v)) / Math.log1p(max)) * 50;

function Bar({ v, max }: { v: number | null; max: number }) {
  if (v == null) return <div className="text-[11px] text-faint">—</div>;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-3 flex-1 bg-raise">
        <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <div className={`absolute inset-y-0 ${v >= 0 ? 'left-1/2 bg-up/70' : 'right-1/2 bg-down/70'}`} style={{ width: `${scaled(v, max)}%` }} />
      </div>
      <span className={`w-16 text-right text-[11px] tabular-nums ${v >= 0 ? 'text-up' : 'text-down'}`}>{pct(v, 0)}</span>
    </div>
  );
}

export function BlockA({ vm, className }: { vm: BlockAVM; className?: string }) {
  const all = vm.bars.flatMap((b) => [b.d7, b.d30]).filter((v): v is number => v != null);
  const max = Math.max(0.1, ...all.map(Math.abs));
  return (
    <Block tag="A" title="Ecosystem beta" meta={vm.meta} className={className}>
      <div className="grid grid-cols-2 gap-4">
        {vm.coins.length
          ? vm.coins.map((c) => (
              <Metric
                key={c.label}
                label={`${c.label} price`}
                value={price(c.price)}
                sub={
                  <>
                    7d <span className={toneOf(c.ch7d) === 'down' ? 'text-down' : 'text-up'}>{pct(c.ch7d)}</span> · 30d{' '}
                    <span className={toneOf(c.ch30d) === 'down' ? 'text-down' : 'text-up'}>{pct(c.ch30d)}</span>
                  </>
                }
              />
            ))
          : ['ZEC', 'NEAR'].map((l) => <Metric key={l} label={`${l} price`} missing={vm.pricesMissing} />)}
      </div>
      <div className="mt-4">
        <div className="mb-1.5 grid grid-cols-[6.5rem_1fr_1fr] gap-2 text-[10px] tracking-wider text-dim uppercase">
          <span>Relative strength</span>
          <span>7d</span>
          <span>30d</span>
        </div>
        <div className="space-y-1.5">
          {vm.bars.map((b) => (
            <div key={b.label} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-2">
              <span className={`truncate text-[11px] ${b.label === 'RHEA' ? 'text-rhea' : 'text-ink'}`}>{b.label}</span>
              <Bar v={b.d7} max={max} />
              <Bar v={b.d30} max={max} />
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-faint">Bars on a log scale. NEAR DEX $ vol is the onchain-beta proxy (DefiLlama), complete days only.</p>
      </div>
      <p className="mt-3 border-l-2 border-rhea/60 pl-2 text-[11px] leading-4 text-dim">
        Volume and future fees print in dollars, so N× ZEC or NEAR ≈ N× dollar volume.
      </p>
    </Block>
  );
}
