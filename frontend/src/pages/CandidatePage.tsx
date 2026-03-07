import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api } from '../api/client';
import type {
  CandidateSummary, DigitalSpendResponse,
  DonorsResponse, PhysicalAssetsResponse, RiskLevel,
} from '../types';
import RiskBadge from '../components/RiskBadge';
import ScoreMeter from '../components/ScoreMeter';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatKES(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `KES ${(n / 1_000).toFixed(1)}K`;
  return `KES ${n.toLocaleString()}`;
}

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—';
  return n.toFixed(digits);
}

const PLATFORM_COLORS: Record<string, string> = {
  meta:   '#1877f2',
  google: '#ea4335',
  x:      '#000000',
};
const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta (Facebook/Instagram)',
  google: 'Google Ads',
  x: 'X (Twitter)',
};

const DONOR_RISK_COLORS: Record<string, string> = {
  HIGH:   '#dc2626',
  MEDIUM: '#d97706',
  LOW:    '#16a34a',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SpendComparison({ physical, digital, income }: { physical: number; digital: number; income: number }) {
  const estimated = physical + digital;
  const gap = estimated - income;
  const maxVal = Math.max(estimated, income, 1);

  return (
    <div className="space-y-3">
      {[
        { label: 'Physical Assets',   value: physical, color: 'bg-blue-500'  },
        { label: 'Digital Ads',       value: digital,  color: 'bg-purple-500' },
        { label: 'Declared Income',   value: income,   color: 'bg-green-500'  },
      ].map(row => (
        <div key={row.label}>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{row.label}</span>
            <span className="font-medium">{formatKES(row.value)}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${row.color} rounded-full transition-all duration-700`}
              style={{ width: `${Math.min(100, (row.value / maxVal) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      {gap > 0 && (
        <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700">
            ⚠️ Unexplained spending gap: {formatKES(gap)}
          </p>
          <p className="text-xs text-red-500 mt-1">
            Estimated spend exceeds declared income by {fmt((gap / Math.max(estimated, 1)) * 100)}%.
            This may indicate undisclosed funding sources.
          </p>
        </div>
      )}
    </div>
  );
}

function DigitalChart({ data }: { data: DigitalSpendResponse }) {
  const chartData = Object.entries(data.platforms ?? {}).map(([platform, amount]) => ({
    name: platform.charAt(0).toUpperCase() + platform.slice(1),
    amount,
    fill: PLATFORM_COLORS[platform] ?? '#6b7280',
    label: PLATFORM_LABELS[platform] ?? platform,
  }));

  if (chartData.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-8">No digital spend recorded.</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => [formatKES(value), 'Spend']}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 space-y-1">
        {chartData.map(d => (
          <div key={d.name} className="flex justify-between text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.fill }} />
              {d.label}
            </span>
            <span className="font-medium">{formatKES(d.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonorRiskChart({ data }: { data: DonorsResponse }) {
  const summary = data.risk_summary ?? {};
  const chartData = ['HIGH', 'MEDIUM', 'LOW']
    .filter(k => (summary[k] ?? 0) > 0)
    .map(k => ({ name: k, value: summary[k], fill: DONOR_RISK_COLORS[k] }));

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (chartData.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-8">No donor data recorded.</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={chartData} dataKey="value" nameKey="name"
            cx="50%" cy="50%" innerRadius={50} outerRadius={80}
            paddingAngle={3}
          >
            {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Pie>
          <Legend
            formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
          />
          <Tooltip formatter={(v: number) => [`${v} donors (${Math.round(v / total * 100)}%)`, '']} />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {[
          { key: 'HIGH',   label: '🚨 High Risk',    color: 'text-red-600'   },
          { key: 'MEDIUM', label: '⚠️ Medium',       color: 'text-amber-600' },
          { key: 'LOW',    label: '✅ Low Risk',     color: 'text-green-600' },
        ].map(r => (
          <div key={r.key} className="text-center bg-gray-50 rounded-lg p-2">
            <p className={`text-lg font-bold ${r.color}`}>{summary[r.key] ?? 0}</p>
            <p className="text-xs text-gray-400">{r.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const ASSET_ICONS: Record<string, string> = {
  billboard: '🪧',
  rally:     '📢',
  chopper:   '🚁',
  convoy:    '🚗',
};

function PhysicalAssetCard({ asset }: { asset: import('../types').PhysicalAsset }) {
  const confidence = asset.confidence_score;
  const confLabel  = confidence == null ? null
    : confidence >= 0.8 ? { text: `${Math.round(confidence * 100)}% confidence`, color: 'text-green-600' }
    : confidence >= 0.6 ? { text: `${Math.round(confidence * 100)}% confidence`, color: 'text-amber-600' }
    : { text: `${Math.round(confidence * 100)}% confidence`, color: 'text-red-600' };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Image */}
      {asset.image_url ? (
        <img
          src={asset.image_url}
          alt={asset.asset_type}
          className="w-full h-36 object-cover bg-gray-100"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-36 bg-gray-100 flex items-center justify-center text-4xl">
          {ASSET_ICONS[asset.asset_type] ?? '📷'}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800 capitalize flex items-center gap-1">
            {ASSET_ICONS[asset.asset_type]} {asset.asset_type}
          </span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{asset.region}</span>
        </div>
        <p className="text-lg font-bold text-gray-900">{formatKES(asset.estimated_cost)}</p>
        {confLabel && (
          <p className={`text-xs mt-0.5 ${confLabel.color}`}>🎯 {confLabel.text}</p>
        )}
        {asset.ai_analysis?.reasoning && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{asset.ai_analysis.reasoning}</p>
        )}
        {asset.ai_analysis?.crowd_estimate && (
          <p className="text-xs text-gray-500 mt-1">👥 ~{asset.ai_analysis.crowd_estimate.toLocaleString()} people</p>
        )}
        <p className="text-xs text-gray-300 mt-2">
          {new Date(asset.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}

function DonorRow({ donor }: { donor: import('../types').Donor }) {
  const riskColors: Record<string, string> = {
    HIGH:   'bg-red-100   text-red-700',
    MEDIUM: 'bg-amber-100 text-amber-700',
    LOW:    'bg-green-100 text-green-700',
  };
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-800">{donor.donor_name}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatKES(donor.donation_amount)}</td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${riskColors[donor.risk_score] ?? ''}`}>
          {donor.risk_score}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{fmt(donor.donation_percentage)}%</td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {donor.company_age_days != null ? `${donor.company_age_days}d old` : '—'}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CandidatePage() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);

  const [summary,  setSummary]  = useState<CandidateSummary | null>(null);
  const [digital,  setDigital]  = useState<DigitalSpendResponse | null>(null);
  const [donors,   setDonors]   = useState<DonorsResponse | null>(null);
  const [physical, setPhysical] = useState<PhysicalAssetsResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!numId) return;
    setLoading(true);
    Promise.allSettled([
      api.getCandidateSummary(numId).then(setSummary),
      api.getDigitalSpend(numId).then(setDigital),
      api.getDonors(numId).then(setDonors),
      api.getPhysicalAssets(numId).then(setPhysical),
    ])
      .then(results => {
        const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (firstError && !summary) setError(firstError.reason?.message ?? 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [numId]);

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-10"><LoadingSpinner text="Loading candidate data..." /></div>;

  if (error && !summary) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link to="/" className="text-blue-600 text-sm hover:underline">← Back to Dashboard</Link>
        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-8 text-center text-red-700">
          <p className="font-semibold text-lg">Candidate not found</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const cand = summary?.candidate;
  const ig   = summary?.integrity;
  const fs   = summary?.financial_summary;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

      {/* Back */}
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        ← All Candidates
      </Link>

      {/* ── Hero ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className={`h-2 ${ig?.risk_level === 'GREEN' ? 'bg-green-500' : ig?.risk_level === 'RED' ? 'bg-red-500' : 'bg-amber-500'}`} />
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          {/* Score meter */}
          <div className="shrink-0">
            <ScoreMeter
              score={ig?.score ?? 0}
              riskLevel={(ig?.risk_level ?? 'AMBER') as RiskLevel}
              size={140}
              label="Integrity"
            />
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{cand?.name}</h1>
            <p className="text-gray-500 mt-1">{cand?.party} · {cand?.position}</p>
            <p className="text-gray-400 text-sm">{cand?.constituency}</p>
            <div className="mt-3">
              <RiskBadge level={(ig?.risk_level ?? 'AMBER') as RiskLevel} size="lg" />
            </div>
            {ig?.classification && (
              <p className="text-xs text-gray-400 mt-2 italic">Classification: {ig.classification}</p>
            )}
          </div>
          {/* Quick stats */}
          <div className="flex flex-col gap-2 text-sm shrink-0 bg-gray-50 rounded-xl p-4 min-w-[180px]">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Financial Overview</p>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Est. Spend</span>
              <span className="font-semibold text-gray-800">{formatKES(fs?.total_estimated_spend)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Declared</span>
              <span className="font-semibold text-green-700">{formatKES(fs?.total_reported_income)}</span>
            </div>
            {(fs?.spending_gap ?? 0) > 0 && (
              <div className="flex justify-between gap-4 border-t pt-2 mt-1">
                <span className="text-red-600 font-medium">Gap</span>
                <span className="font-bold text-red-600">{formatKES(fs?.spending_gap)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Physical Spend"  value={formatKES(fs?.total_physical_spend)}  accent="blue"  icon="🪧" />
        <StatCard label="Digital Ads"     value={formatKES(fs?.total_digital_spend)}   accent="blue"  icon="📱" />
        <StatCard label="Donor Income"    value={formatKES(fs?.total_reported_income)} accent="green" icon="💚" />
        <StatCard
          label="Spending Gap"
          value={formatKES(fs?.spending_gap)}
          accent={(fs?.spending_gap ?? 0) > 0 ? 'red' : 'green'}
          icon={(fs?.spending_gap ?? 0) > 0 ? '🚨' : '✅'}
          sub={fs?.spending_gap_ratio != null ? `${fs.spending_gap_ratio}× ratio` : undefined}
        />
      </div>

      {/* ── Spend breakdown + charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spend comparison bars */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:col-span-1">
          <h2 className="font-bold text-gray-800 mb-4">Spending vs Income</h2>
          <SpendComparison
            physical={fs?.total_physical_spend ?? 0}
            digital={fs?.total_digital_spend ?? 0}
            income={fs?.total_reported_income ?? 0}
          />
        </div>

        {/* Digital spend chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-bold text-gray-800 mb-1">Digital Ad Spend</h2>
          <p className="text-xs text-gray-400 mb-4">By platform · total {formatKES(digital?.total_spend)}</p>
          {digital ? <DigitalChart data={digital} /> : <p className="text-gray-400 text-sm text-center py-8">No digital data.</p>}
        </div>

        {/* Donor risk chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-bold text-gray-800 mb-1">Donor Risk Distribution</h2>
          <p className="text-xs text-gray-400 mb-4">
            Avg risk score: {summary?.donor_risk?.avg_donor_risk != null ? fmt(summary.donor_risk.avg_donor_risk * 100, 0) + '%' : '—'}
          </p>
          {donors ? <DonorRiskChart data={donors} /> : <p className="text-gray-400 text-sm text-center py-8">No donor data.</p>}
        </div>
      </div>

      {/* ── Physical assets ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-gray-800">Physical Campaign Assets</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {physical?.asset_count ?? 0} assets · {formatKES(physical?.total_estimated_spend)} total
            </p>
          </div>
        </div>
        {(physical?.assets?.length ?? 0) === 0 ? (
          <p className="text-gray-400 text-sm text-center py-10">No physical assets reported yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {physical!.assets.map(a => <PhysicalAssetCard key={a.id} asset={a} />)}
          </div>
        )}
      </div>

      {/* ── Donors table ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-gray-800 mb-5">Donor Declarations</h2>
        {(donors?.donors?.length ?? 0) === 0 ? (
          <p className="text-gray-400 text-sm text-center py-10">No donor data recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Donor</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">% of Income</th>
                  <th className="px-4 py-3">Company Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {donors!.donors.map(d => <DonorRow key={d.id} donor={d} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Updated at */}
      {summary?.updated_at && (
        <p className="text-center text-xs text-gray-300">
          Last reconciled: {new Date(summary.updated_at).toLocaleString('en-KE')}
        </p>
      )}
    </div>
  );
}
