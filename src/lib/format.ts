export const DASH = '—';
const MINUS = '−';

const bad = (v: number | null | undefined): v is null | undefined => v == null || !Number.isFinite(v);

export function usd(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  const a = Math.abs(v);
  const s = v < 0 ? MINUS : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `${s}$${a.toFixed(0)}`;
}

export function price(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(3)}`;
  return v >= 0.01 ? `$${v.toFixed(4)}` : `$${v.toPrecision(3)}`;
}

export function pct(v: number | null | undefined, digits = 1, signed = true): string {
  if (bad(v)) return DASH;
  const x = v * 100;
  const s = x < 0 ? MINUS : signed && x > 0 ? '+' : '';
  return `${s}${Math.abs(x).toFixed(digits)}%`;
}

export const share = (v: number | null | undefined, digits = 1) => pct(v, digits, false);

export function pp(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  const x = v * 100;
  return `${x < 0 ? MINUS : x > 0 ? '+' : ''}${Math.abs(x).toFixed(1)}pp`;
}

export function int(v: number | null | undefined): string {
  return bad(v) ? DASH : Math.round(v).toLocaleString('en-US');
}

export function compact(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
}

export function ago(ms: number | null | undefined): string {
  if (bad(ms)) return DASH;
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function utcTime(ms: number | null | undefined): string {
  if (bad(ms)) return DASH;
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`;
}

export function utcDay(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
