import { useEffect, useMemo, useState } from 'react';
import { BlockA } from './components/BlockA';
import { BlockB } from './components/BlockB';
import { BlockC } from './components/BlockC';
import { BlockD } from './components/BlockD';
import { BlockE } from './components/BlockE';
import { Header } from './components/Header';
import { position, thesis } from './lib/config';
import { ago, utcTime } from './lib/format';
import { errMsg } from './lib/http';
import { LINKS } from './lib/ids';
import { buildView } from './lib/metrics';
import { loadDashboard, type Loaded } from './lib/status';

const REFRESH_MS = 5 * 60_000;

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      loadDashboard().then(
        (d) => {
          if (!alive) return;
          setLoaded(d);
          setError(null);
        },
        (e: unknown) => alive && setError(errMsg(e)),
      );
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const clock = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      alive = false;
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, []);

  const view = useMemo(() => (loaded ? buildView(loaded, position, thesis) : null), [loaded]);

  return (
    <div className="mx-auto max-w-[1520px] space-y-3 px-3 py-3 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-2.5">
        <div>
          <h1 className="text-xl tracking-wide text-ink">Rhea Finance</h1>
          <p className="text-[11px] text-dim">RIA / Rea — NEAR DEX + lending (ZEC venue)</p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <a href={LINKS.site} target="_blank" rel="noreferrer">
            rhea.finance
          </a>
          <a href={LINKS.dex} target="_blank" rel="noreferrer">
            dex.rhea.finance
          </a>
          <a href={LINKS.zecPool} target="_blank" rel="noreferrer">
            ZEC/wNEAR pool (refv1-6065)
          </a>
        </nav>
        <div className="text-[10px] text-dim tabular-nums">
          {view?.snapshotAt ? `snapshot ${utcTime(view.snapshotAt)} · ${ago(view.snapshotAt)}` : 'no snapshot yet: live APIs only'} · refreshes every 5 min
        </div>
      </header>

      {error && <p className="border border-down/50 px-3 py-2 text-[11px] text-down">Could not load data: {error}</p>}

      {!view ? (
        <p className="py-24 text-center text-[11px] text-dim">Loading public data…</p>
      ) : (
        <>
          <Header vm={view.header} />
          <div className="grid gap-3 lg:grid-cols-12">
            <BlockB vm={view.b} className="lg:col-span-8" />
            <BlockA vm={view.a} className="lg:col-span-4" />
            <BlockC vm={view.c} className="lg:col-span-8" />
            <BlockE vm={view.e} className="lg:col-span-4" />
            <BlockD vm={view.d} className="lg:col-span-12" />
          </div>
        </>
      )}

      <footer className="border-t border-line pt-2 pb-6 text-[10px] leading-4 text-faint">
        One trade, public data only: DefiLlama, CoinGecko, CoinPaprika, GeckoTerminal, DexScreener, Gate, MEXC, NearBlocks. Numbers and the
        add rule only; not investment advice. Position and thesis inputs live in{' '}
        <a href={`${LINKS.repo}/tree/main/config`} target="_blank" rel="noreferrer">
          config/
        </a>{' '}
        · <a href={LINKS.repo}>source</a>
      </footer>
    </div>
  );
}
