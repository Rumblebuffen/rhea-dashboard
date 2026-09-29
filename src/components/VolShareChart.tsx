import { useEffect, useRef } from 'react';
import { ColorType, createChart, HistogramSeries, LineSeries, type UTCTimestamp } from 'lightweight-charts';
import { usd } from '../lib/format';

export function VolShareChart({ days, vol, share }: { days: number[]; vol: number[]; share: (number | null)[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8a97a4',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 10,
      },
      grid: { vertLines: { color: '#131b23' }, horzLines: { color: '#131b23' } },
      leftPriceScale: { visible: true, borderColor: '#1d2731' },
      rightPriceScale: { visible: true, borderColor: '#1d2731' },
      timeScale: { borderColor: '#1d2731' },
      handleScroll: false,
      handleScale: false,
    });
    const bars = chart.addSeries(HistogramSeries, {
      priceScaleId: 'left',
      color: '#1f7a82',
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'custom', minMove: 1, formatter: (v: number) => usd(v) },
    });
    const line = chart.addSeries(LineSeries, {
      priceScaleId: 'right',
      color: '#e3b341',
      lineWidth: 2,
      priceLineVisible: false,
      priceFormat: { type: 'custom', minMove: 0.1, formatter: (v: number) => `${v.toFixed(0)}%` },
    });
    bars.setData(days.map((d, i) => ({ time: d as UTCTimestamp, value: vol[i] })));
    line.setData(days.flatMap((d, i) => (share[i] == null ? [] : [{ time: d as UTCTimestamp, value: share[i]! * 100 }])));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [days, vol, share]);

  return <div ref={el} className="h-[240px] w-full" />;
}
