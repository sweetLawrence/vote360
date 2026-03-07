import type { RiskLevel } from '../types';

const CONFIG: Record<RiskLevel, { label: string; classes: string; dot: string }> = {
  GREEN: { label: 'Transparent',          classes: 'bg-green-100 text-green-800 border-green-200',  dot: 'bg-risk-green' },
  AMBER: { label: 'Requires Review',      classes: 'bg-amber-100 text-amber-800 border-amber-200',  dot: 'bg-risk-amber' },
  RED:   { label: 'High Risk',            classes: 'bg-red-100   text-red-800   border-red-200',    dot: 'bg-risk-red'   },
};

interface Props {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
}

export default function RiskBadge({ level, size = 'md' }: Props) {
  const cfg = CONFIG[level] ?? CONFIG.AMBER;
  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm font-semibold' : 'text-xs font-medium';
  const padding  = size === 'sm' ? 'px-2 py-0.5' : size === 'lg' ? 'px-4 py-1.5' : 'px-2.5 py-1';
  const dotSize  = size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${cfg.classes} ${textSize} ${padding}`}>
      <span className={`rounded-full animate-pulse ${cfg.dot} ${dotSize}`} />
      {cfg.label}
    </span>
  );
}
