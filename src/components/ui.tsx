import type { ReactNode } from 'react';
import { ago, utcTime } from '../lib/format';
import type { BlockMeta, LightColor } from '../lib/metrics';
import type { Status } from '../lib/status';

const STATUS_CLASS: Record<Status, string> = {
  live: 'text-up border-up/50',
  snapshot: 'text-accent border-accent/50',
  stale: 'text-warn border-warn/50',
  missing: 'text-down border-down/50',
};

export function Stamp({ meta }: { meta: BlockMeta }) {
  const title = [`Sources: ${meta.sources.join(', ')}`, ...meta.problems].join('\n');
  return (
    <div className="flex shrink-0 items-center gap-2 text-[10px] text-dim" title={title}>
      <span className="tabular-nums">{meta.updatedAt ? `upd ${utcTime(meta.updatedAt)} · ${ago(meta.updatedAt)}` : 'no data'}</span>
      <span className={`border px-1 leading-4 tracking-wider uppercase ${STATUS_CLASS[meta.status]}`}>{meta.status}</span>
    </div>
  );
}

export function Block({
  tag,
  title,
  meta,
  className = '',
  children,
}: {
  tag: string;
  title: string;
  meta: BlockMeta;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col border border-line bg-panel ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-1.5">
        <h2 className="text-[11px] tracking-wider text-dim uppercase">
          <span className="text-rhea">{tag}</span> · {title}
        </h2>
        <Stamp meta={meta} />
      </header>
      <div className="flex-1 p-3">{children}</div>
      {meta.problems.length > 0 && (
        <footer className="border-t border-line px-3 py-1.5 text-[10px] leading-4 break-words text-faint">
          {meta.problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </footer>
      )}
    </section>
  );
}

type Tone = 'up' | 'down' | 'warn' | 'rhea';
const TONE: Record<Tone, string> = { up: 'text-up', down: 'text-down', warn: 'text-warn', rhea: 'text-rhea' };

export const toneOf = (v: number | null | undefined): Tone | undefined => (v == null || v === 0 ? undefined : v > 0 ? 'up' : 'down');

export function Metric({
  label,
  value,
  sub,
  tone,
  missing,
  big = false,
}: {
  label: string;
  value?: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  missing?: string | false | null;
  big?: boolean;
}) {
  const size = big ? 'text-2xl' : 'text-base';
  return (
    <div className="min-w-0">
      <div className="text-[10px] tracking-wider text-dim uppercase">{label}</div>
      {missing ? (
        <>
          <div className={`${size} text-faint`}>—</div>
          <div className="text-[10px] leading-4 break-words text-faint">{missing}</div>
        </>
      ) : (
        <>
          <div className={`${size} leading-tight tabular-nums ${tone ? TONE[tone] : 'text-ink'}`}>{value}</div>
          {sub && <div className="mt-0.5 text-[11px] leading-4 text-dim">{sub}</div>}
        </>
      )}
    </div>
  );
}

const DOT: Record<LightColor, string> = { green: 'bg-up', amber: 'bg-warn', red: 'bg-down', grey: 'bg-faint' };

export function Dot({ color }: { color: LightColor }) {
  return <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[color]}`} aria-label={color} />;
}

export function Flag({ children }: { children: ReactNode }) {
  return <span className="ml-1.5 border border-warn/60 bg-warn/10 px-1 align-middle text-[10px] tracking-wider text-warn">{children}</span>;
}
