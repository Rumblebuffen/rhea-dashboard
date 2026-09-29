import type { BlockEVM } from '../lib/metrics';
import { Block, Dot } from './ui';

export function BlockE({ vm, className }: { vm: BlockEVM; className?: string }) {
  return (
    <Block tag="E" title="Invalidation" meta={vm.meta} className={className}>
      <ol className="space-y-3">
        {vm.lights.map((x, i) => (
          <li key={x.title} className="flex gap-2.5">
            <Dot color={x.color} />
            <div className="min-w-0">
              <div className="text-[11px] text-ink">
                {i + 1}. {x.title}
              </div>
              <div className="text-sm tabular-nums text-ink">{x.value}</div>
              <div className="text-[10px] leading-4 text-faint">{x.detail}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[10px] leading-4 text-faint">Green = holding · amber = watch · red = tripped · grey = not enough data.</p>
    </Block>
  );
}
