import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { CandidateListItem, RiskLevel } from '../types';
import RiskBadge from '../components/RiskBadge';
import LoadingSpinner from '../components/LoadingSpinner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatKES(n: number): string {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString()}`;
}

function ScoreBar({ score, level }: { score: number; level: RiskLevel }) {
  const pct  = Math.round(score * 100);
  const colors: Record<RiskLevel, string> = {
    GREEN: 'bg-green-500',
    AMBER: 'bg-amber-500',
    RED:   'bg-red-500',
  };
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Integrity Score</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colors[level]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Summary stats bar ────────────────────────────────────────────────────────

function SummaryBar({ candidates }: { candidates: CandidateListItem[] }) {
  const totalSpend = candidates.reduce((s, c) => s + (c.financial_summary?.total_estimated_spend ?? 0), 0);
  const highRisk   = candidates.filter(c => c.integrity?.risk_level === 'RED').length;
  const tracked    = candidates.length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {[
        { label: 'Candidates Tracked', value: tracked.toString(),       icon: '🏛️', color: 'text-blue-700'  },
        { label: 'Total Est. Spend',   value: formatKES(totalSpend),    icon: '💰', color: 'text-gray-800'  },
        { label: 'High Risk Flagged',  value: highRisk.toString(),      icon: '🚨', color: 'text-red-700'   },
        { label: 'Transparent',        value: (candidates.filter(c => c.integrity?.risk_level === 'GREEN').length).toString(), icon: '✅', color: 'text-green-700' },
      ].map(s => (
        <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-2xl mb-1">{s.icon}</p>
          <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────────────────────

function CandidateCard({ c }: { c: CandidateListItem }) {
  const fs = c.financial_summary ?? {};
  const ig = c.integrity ?? {};

  return (
    <Link
      to={`/candidate/${c.id}`}
      className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col"
    >
      {/* Risk colour strip */}
      <div className={`h-1.5 rounded-t-xl ${
        ig.risk_level === 'GREEN' ? 'bg-green-500' :
        ig.risk_level === 'RED'   ? 'bg-red-500'   : 'bg-amber-500'
      }`} />

      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 truncate">{c.name}</h2>
            <p className="text-xs text-gray-500 truncate">{c.party} · {c.position}</p>
            <p className="text-xs text-gray-400 truncate">{c.constituency}</p>
          </div>
          <RiskBadge level={ig.risk_level ?? 'AMBER'} size="sm" />
        </div>

        {/* Score bar */}
        <ScoreBar score={ig.score ?? 0} level={ig.risk_level ?? 'AMBER'} />

        {/* Financials */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400">Est. Spend</p>
            <p className="font-semibold text-gray-800">{formatKES(fs.total_estimated_spend ?? 0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400">Declared Income</p>
            <p className="font-semibold text-gray-800">{formatKES(fs.total_reported_income ?? 0)}</p>
          </div>
        </div>

        {/* Spending gap alert */}
        {(fs.spending_gap ?? 0) > 0 && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-xs">
            <span>⚠️</span>
            <span>Unexplained gap: <strong>{formatKES(fs.spending_gap)}</strong></span>
          </div>
        )}

        <p className="text-xs text-gray-300 mt-auto pt-1">View full analysis →</p>
      </div>
    </Link>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

const RISK_FILTERS: Array<{ label: string; value: RiskLevel | 'ALL' }> = [
  { label: 'All',            value: 'ALL'   },
  { label: '🚨 High Risk',   value: 'RED'   },
  { label: '⚠️ Review',     value: 'AMBER' },
  { label: '✅ Transparent', value: 'GREEN' },
];

export default function Dashboard() {
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState<RiskLevel | 'ALL'>('ALL');

  useEffect(() => {
    api.getCandidates()
      .then(setCandidates)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    return candidates
      .filter(c => filter === 'ALL' || c.integrity?.risk_level === filter)
      .filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
                              c.party?.toLowerCase().includes(search.toLowerCase()) ||
                              c.constituency?.toLowerCase().includes(search.toLowerCase()));
  }, [candidates, filter, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
          Campaign Spending Transparency
        </h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Community-sourced tracking of billboards, rallies, digital ads and donor declarations
          for Kenya's political candidates. Sorted by integrity score — most suspicious first.
        </p>
      </div>

      {loading && <LoadingSpinner text="Fetching candidate data..." />}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center">
          <p className="font-semibold">Could not load candidate data</p>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-xs text-red-400 mt-2">Make sure the API is running and accessible.</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <SummaryBar candidates={candidates} />

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              placeholder="Search by name, party or constituency..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div className="flex gap-2 flex-wrap">
              {RISK_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    filter === f.value
                      ? 'bg-brand-navy text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p>No candidates match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {visible.map(c => <CandidateCard key={c.id} c={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
