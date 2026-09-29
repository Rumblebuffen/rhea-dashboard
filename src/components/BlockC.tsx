import { pct, usd } from '../lib/format';
import { SIZES, type BlockCVM, type SlipCell } from '../lib/metrics';
import { Block } from './ui';

function Slip({ c }: { c: SlipCell }) {
  if (c.value == null) return <span className="text-faint">—</span>;
  const v = c.value;
  const cls = v >= 0.03 ? 'text-down' : v >= 0.01 ? 'text-warn' : 'text-up';
  return (
    <span className={cls}>
      {c.atLeast ? '≥' : ''}
      {pct(v, v < 0.1 ? 2 : 1, false)}
    </span>
  );
}

const yes = (v: boolean) => (v ? <span className="text-up">yes</span> : <span className="text-down">no</span>);

export function BlockC({ vm, className }: { vm: BlockCVM; className?: string }) {
  const cmp = vm.compare;
  return (
    <Block tag="C" title="Where size can go on (RHEA)" meta={vm.meta} className={className}>
      {cmp && (
        <div className="mb-3 border-l-2 border-warn/70 bg-warn/5 px-2 py-1.5 text-[11px] leading-5">
          <span className="text-dim">Speaker: “Pancake printed more volume, NEAR book was deeper.” Today → </span>
          Pancake more volume: {yes(cmp.pancakeMoreVolume)} <span className="text-faint">({usd(cmp.pancakeVol)} vs {usd(cmp.nearVol)} on NEAR)</span>
          {' · '}NEAR deeper: {yes(cmp.nearDeeper)}{' '}
          <span className="text-faint">
            ({usd(cmp.nearLiq)} vs {usd(cmp.pancakeLiq)} pool TVL)
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-[11px] tabular-nums">
          <thead className="text-[10px] tracking-wider text-dim uppercase">
            <tr className="border-b border-line text-right">
              <th className="py-1 text-left font-normal">Venue</th>
              <th className="text-left font-normal">Pair</th>
              <th className="font-normal">24h vol</th>
              <th className="font-normal">Liquidity</th>
              {SIZES.map((s) => (
                <th key={s} className="font-normal">
                  Slip {usd(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vm.rows.map((r) => (
              <tr key={r.key} className="border-b border-line/60 text-right" title={r.method}>
                <td className={`py-1.5 text-left ${r.key === 'near' ? 'text-rhea' : 'text-ink'}`}>{r.venue}</td>
                {r.missing ? (
                  <td colSpan={2 + 1 + SIZES.length} className="text-left text-[10px] text-faint">
                    — {r.missing}
                  </td>
                ) : (
                  <>
                    <td className="text-left text-dim">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.detail}
                        </a>
                      ) : (
                        r.detail
                      )}
                    </td>
                    <td>{usd(r.vol24h)}</td>
                    <td>
                      {usd(r.liquidity)} <span className="text-[10px] text-faint">{r.liquidityKind}</span>
                    </td>
                    {r.slip.map((c, i) => (
                      <td key={SIZES[i]}>
                        <Slip c={c} />
                      </td>
                    ))}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-faint">
        Slippage = average fill vs mid for a market buy, before fees. DEX rows: constant-product (x·y=k) estimate from pool TVL, so
        concentrated pools (v3/CLMM/DLMM) are usually deeper near price than shown. CEX rows: walked the live order book; “≥” means the
        visible book ran out first. Hover a row for its method.
      </p>
    </Block>
  );
}
