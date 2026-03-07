import type { RiskLevel } from '../types';

const STROKE: Record<RiskLevel, string> = {
  GREEN: '#16a34a',
  AMBER: '#d97706',
  RED:   '#dc2626',
};

interface Props {
  score: number;        // 0.0 – 1.0
  riskLevel: RiskLevel;
  size?: number;        // svg diameter in px
  label?: string;
}

export default function ScoreMeter({ score, riskLevel, size = 120, label }: Props) {
  const r  = (size - 16) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(1, Math.max(0, score)));
  const pct = Math.round(score * 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
        {/* Fill */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={STROKE[riskLevel]}
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.7s ease' }}
        />
      </svg>
      {/* Score label sits over the SVG */}
      <div
        className="flex flex-col items-center"
        style={{ marginTop: -(size + 8) }}
      >
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: size * 0.22, color: STROKE[riskLevel] }}
        >
          {pct}%
        </span>
        {label && (
          <span className="text-xs text-gray-500 mt-0.5">{label}</span>
        )}
      </div>
      {/* Spacer so layout isn't collapsed */}
      <div style={{ height: size * 0.3 }} />
    </div>
  );
}
