import positionJson from '../../config/position.json';
import thesisJson from '../../config/thesis.json';

export interface PositionConfig {
  entryHigh: number | null;
  avgCostUsd: number | null;
  positionUsd: number | null;
  tokenAmount: number | null;
  /** Fraction of total supply, e.g. 0.002 = 0.2%. Computed from tokenAmount when left null. */
  pctSupply: number | null;
  cashToAddUsd: number | null;
  notes?: string;
}

export interface Rules {
  addDipPct: number;
  shareRollingOverPct: number;
  shareFlatPct: number;
  chaseRipPct7d: number;
  chaseNearHighPct: number;
  localHighDays: number;
  fdvRerateMinPct: number;
  volumeConfirmMinPct: number;
  advisorQuietDays: number;
}

export interface ThesisConfig {
  cheapMcapUsd: number;
  cheapFtvUsd: number;
  ftvBand: [number, number];
  targetMultipleIfWorks: [number, number];
  addRule: string;
  lastAdvisorPing: { date: string | null; note: string };
  rules: Rules;
}

/** Config values edited by hand on GitHub may arrive as strings; anything unusable becomes null. */
export function cfgNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export const position = positionJson as unknown as PositionConfig;
export const thesis = thesisJson as unknown as ThesisConfig;
