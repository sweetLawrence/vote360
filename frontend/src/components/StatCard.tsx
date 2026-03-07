interface Props {
  label: string;
  value: string;
  sub?: string;
  accent?: 'default' | 'green' | 'red' | 'amber' | 'blue';
  icon?: string;
}

const ACCENT_CLASSES = {
  default: 'border-gray-200',
  green:   'border-green-400',
  red:     'border-red-400',
  amber:   'border-amber-400',
  blue:    'border-blue-400',
};

const VALUE_CLASSES = {
  default: 'text-gray-900',
  green:   'text-green-700',
  red:     'text-red-700',
  amber:   'text-amber-700',
  blue:    'text-blue-700',
};

export default function StatCard({ label, value, sub, accent = 'default', icon }: Props) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${ACCENT_CLASSES[accent]} shadow-sm p-5`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${VALUE_CLASSES[accent]}`}>
        {icon && <span className="mr-1">{icon}</span>}
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
