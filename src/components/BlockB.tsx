import { pct, pp, share, usd } from '../lib/format';
import type { BlockBVM, Trend, VenueRow } from '../lib/metrics';
import { Block, Metric } from './ui';
import { VolShareChart } from './VolShareChart';

function Delta({ t }: { t: Trend }) {
  if (t.pp == null) return <span className="text-faint">—</span>;
  const cls = t.pp < 0 ? 'text-down' : t.pp > 0 ? 'text-up' : 'text-dim';
  return (
    <span className={cls}>
      {pp(t.pp)}
      <span className="text-faint"> ({pct(t.change, 0)})</span>
    </span>
  );
}

function ShareTable({ vm }: { vm: BlockBVM }) {
  if (!vm.trends.length) return <p className="mt-3 text-[11px] text-faint">Share history unavailable: {vm.historyNote}</p>;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-[11px] tabular-nums">
        <thead className="text-[10px] tracking-wider text-dim uppercase">
          <tr className="border-b border-line text-right">
            <th className="py-1 text-left font-normal">Rhea share of…</th>
            <th className="font-normal">24h</th>
            <th className="font-normal">7d</th>
            <th className="font-normal">prior 7d</th>
            <th className="font-normal">Δ 7d</th>
            <th className="font-normal">30d</th>
            <th className="font-normal">prior 30d</th>
            <th className="font-normal">Δ 30d</th>
          </tr>
        </thead>
        <tbody>
          {vm.trends.map((r) => (
            <tr key={r.label} className="border-b border-line/60 text-right">
              <td className="py-1 text-left text-ink">
                {r.label} <span className="text-faint">· {r.source}</span>
              </td>
              <td>{share(r.now24h)}</td>
              <td className="text-rhea">{share(r.t7.now)}</td>
              <td className="text-dim">{share(r.t7.prev)}</td>
              <td>
                <Delta t={r.t7} />
              </td>
              <td className="text-rhea">{share(r.t30.now)}</td>
              <td className="text-dim">{share(r.t30.prev)}</td>
              <td>
                <Delta t={r.t30} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VenueList({ venues }: { venues: VenueRow[] }) {
  const onchain = venues.filter((v) => v.onchain);
  const top = onchain.slice(0, 8);
  const rheaIdx = onchain.findIndex((v) => v.isRhea);
  const rows = rheaIdx >= 8 ? [...top, onchain[rheaIdx]] : top;
  const max = onchain[0]?.vol24h || 1;
  const cexTop = venues.filter((v) => !v.onchain).slice(0, 3);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[10px] tracking-wider text-dim uppercase">Onchain ZEC venues · 24h</div>
      <ol className="space-y-1">
        {rows.map((v) => (
          <li key={v.name} className="text-[11px]">
            <div className="flex justify-between gap-2">
              <span className={`truncate ${v.isRhea ? 'text-rhea' : 'text-ink'}`}>
                {onchain.indexOf(v) + 1}. {v.name}
              </span>
              <span className="tabular-nums text-dim">{usd(v.vol24h)}</span>
            </div>
            <div className="mt-0.5 h-1 bg-raise">
              <div className={`h-1 ${v.isRhea ? 'bg-rhea' : 'bg-faint'}`} style={{ width: `${(v.vol24h / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {cexTop.length > 0 && (
        <p className="mt-2 text-[10px] leading-4 text-faint">CEX leaders: {cexTop.map((v) => `${v.name} ${usd(v.vol24h)}`).join(' · ')}</p>
      )}
    </div>
  );
}

export function BlockB({ vm, className }: { vm: BlockBVM; className?: string }) {
  return (
    <Block tag="B" title="ZEC venue share — the only fundamental" meta={vm.meta} className={className}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        <Metric
          label="Rhea $ vol on ZEC pairs · 24h"
          value={usd(vm.rheaZec24h)}
          tone="rhea"
          sub={`${vm.rheaZecPools} active Rhea ZEC pools`}
          missing={vm.rheaZec24h == null ? vm.poolsMissing : false}
        />
        <Metric
          label="Share of all ZEC onchain vol · 24h"
          value={share(vm.share24h)}
          sub={`of ${usd(vm.onchain24h)} · ${share(vm.shareAmm24h)} excl. NEAR Intents (${usd(vm.intents24h)})`}
          missing={vm.share24h == null ? vm.poolsMissing : false}
        />
        <Metric
          label="Rhea ZEC vol vs CEX ZEC spot"
          value={share(vm.rheaVsCex, 2)}
          sub={`of ${usd(vm.cexTotal)} across ${vm.cexCount} exchanges (${vm.cexMethod})${vm.cexThin ? ' · CEX coverage thin' : ''}`}
          missing={vm.rheaVsCex == null ? vm.cexMissing : false}
        />
        <Metric
          label="Rhea ZEC vol vs Solana DEX ZEC"
          value={share(vm.rheaVsSolana)}
          sub={`Solana ZEC pools (Omni-bridged ZEC) ${usd(vm.solana24h)}`}
          missing={vm.rheaVsSolana == null ? (vm.solana24h === 0 || vm.solana24h == null ? 'unavailable: no verified Solana ZEC pools returned' : vm.poolsMissing) : false}
        />
        <Metric
          label="Rhea $ vol on NEAR · 24h"
          value={usd(vm.rheaNear24h)}
          sub={`${share(vm.nearShare24h)} of NEAR DEX volume (${usd(vm.nearTotal24h)})`}
          missing={vm.rheaNear24h == null ? vm.nearMissing : false}
        />
        <Metric
          label="ZEC venue rank · 24h"
          value={vm.rankOverall ? `#${vm.rankOverall} of ${vm.venues.length}` : undefined}
          sub={
            vm.rankOnchain ? (
              <>
                #{vm.rankOnchain} of {vm.onchainCount} onchain ·{' '}
                {vm.isTopOnchain ? (
                  <span className="text-up">highest decentralized venue</span>
                ) : (
                  <span className="text-warn">not the top decentralized venue (#1 {vm.topOnchain?.name})</span>
                )}
              </>
            ) : undefined
          }
          missing={vm.rankOverall == null ? vm.poolsMissing : false}
        />
      </div>

      <ShareTable vm={vm} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap gap-x-4 text-[10px] tracking-wider text-dim uppercase">
            <span>
              <span className="text-rhea">■</span> Rhea ZEC $ vol / day (left)
            </span>
            <span>
              <span className="text-warn">━</span> Rhea share of ZEC onchain vol (right)
            </span>
          </div>
          {vm.chart ? (
            <VolShareChart days={vm.chart.days} vol={vm.chart.vol} share={vm.chart.share} />
          ) : (
            <p className="py-10 text-center text-[11px] text-faint">No chart: daily history is unavailable, and no series is better than a made-up one.</p>
          )}
        </div>
        <VenueList venues={vm.venues} />
      </div>
      <p className="mt-2 text-[10px] leading-4 text-faint">{vm.historyNote}</p>
    </Block>
  );
}
