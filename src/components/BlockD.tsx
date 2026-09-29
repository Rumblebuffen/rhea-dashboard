import { compact, int, share } from '../lib/format';
import type { BlockDVM } from '../lib/metrics';
import { Block, Metric } from './ui';

export function BlockD({ vm, className }: { vm: BlockDVM; className?: string }) {
  const h = vm.holders;
  const adv = vm.advisor;
  return (
    <Block tag="D" title="Overlooked / distribution" meta={vm.meta} className={className}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="grid grid-cols-3 gap-4">
            <Metric label="Holders · NEAR" value={int(h?.count)} sub={h?.contract} missing={!h ? vm.holdersMissing : false} />
            <Metric label="Top-10 % of supply" value={share(h?.top10Pct)} sub="all accounts" missing={!h ? vm.holdersMissing : false} />
            <Metric
              label="Top-10 % excl. labelled"
              value={share(h?.top10UnlabelledPct)}
              sub="without protocol / DAO / DEX accounts"
              missing={!h ? vm.holdersMissing : false}
            />
          </div>
          {h && (
            <table className="mt-3 w-full text-[11px] tabular-nums">
              <tbody>
                {h.rows.map((r) => (
                  <tr key={r.account} className="border-b border-line/60">
                    <td className="max-w-0 truncate py-1 pr-2 text-ink" title={r.account}>
                      {r.account}
                    </td>
                    <td className="pr-2 text-dim">{r.label}</td>
                    <td className="text-right">{compact(r.amount)}</td>
                    <td className="w-14 text-right text-dim">{share(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[10px] leading-4 text-faint">
            BSC and Solana holder counts: — not fetched. Free public explorers need an API key there (BscScan, Helius), and this dashboard
            uses keyless sources only.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          <Metric
            label="Last advisor / NEAR push (manual)"
            value={adv.date ? `${adv.daysSince}d ago` : undefined}
            sub={adv.date ? `${adv.date}${adv.note ? ` · ${adv.note}` : ''}` : undefined}
            missing={adv.date ? false : 'not set: add lastAdvisorPing.date (YYYY-MM-DD) and a note in config/thesis.json'}
          />
          <Metric
            label="@NEARProtocol / Rhea / Illia mentions · 7d"
            missing="not fetched: X/Twitter counts need the paid X API, so lastAdvisorPing above is the manual stand-in"
          />
          <p className="text-[10px] leading-4 text-faint">Advisor / NEAR-founder attachment is a qualitative risk flag, tracked by date only.</p>
        </div>
      </div>
    </Block>
  );
}
