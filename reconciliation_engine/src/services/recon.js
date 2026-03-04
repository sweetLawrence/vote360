const supabase = require('../../database/supabase');

// ──────────────────────────────────────────────
// INTEGRITY SCORE FORMULA (from architecture doc)
//
// integrity_score = (reported_income / estimated_spend) x avg_donor_trust_factor
//
// avg_donor_trust_factor = average of (1 - normalized_risk_score) across all donors
//   where: HIGH risk   = 1.0
//          MEDIUM risk = 0.5
//          LOW risk    = 0.0
//
// Risk level thresholds:
//   0.80 - 1.00 = GREEN
//   0.50 - 0.79 = AMBER
//   0.00 - 0.49 = RED
// ──────────────────────────────────────────────

const RISK_SCORE_MAP = { HIGH: 1.0, MEDIUM: 0.5, LOW: 0.0 };

function getRiskLevel(integrityScore) {
  if (integrityScore >= 0.8) return 'GREEN';
  if (integrityScore >= 0.5) return 'AMBER';
  return 'RED';
}

function calculateAvgDonorRisk(donors) {
  if (!donors || donors.length === 0) return 0.5; // neutral if no donor data yet
  const total = donors.reduce((sum, d) => {
    const score = RISK_SCORE_MAP[d.risk_score] ?? 0.5;
    return sum + score;
  }, 0);
  return total / donors.length;
}

function calculateIntegrityScore(reportedIncome, estimatedSpend, avgDonorRisk) {
  if (estimatedSpend === 0) return 1.0; // no spend recorded yet — default to clean
  const avgDonorTrustFactor = 1 - avgDonorRisk;
  const raw = (reportedIncome / estimatedSpend) * avgDonorTrustFactor;
  // Clamp between 0 and 1
  return Math.min(1, Math.max(0, Math.round(raw * 10000) / 10000));
}

// ── Fetch all raw data for a candidate from source tables ──
async function fetchCandidateData(candidateId) {
  const [physicalRes, digitalRes, donorsRes] = await Promise.all([
    supabase
      .from('physical_assets')
      .select('estimated_cost')
      .eq('candidate_id', candidateId),
    supabase
      .from('digital_spend')
      .select('spend_amount')
      .eq('candidate_id', candidateId),
    supabase
      .from('donors')
      .select('donation_amount, risk_score')
      .eq('candidate_id', candidateId),
  ]);

  if (physicalRes.error) throw new Error(`physical_assets query failed: ${physicalRes.error.message}`);
  if (digitalRes.error) throw new Error(`digital_spend query failed: ${digitalRes.error.message}`);
  if (donorsRes.error) throw new Error(`donors query failed: ${donorsRes.error.message}`);

  return {
    physicalAssets: physicalRes.data || [],
    digitalSpend: digitalRes.data || [],
    donors: donorsRes.data || [],
  };
}

// ── Core reconciliation logic ──
function reconcile({ physicalAssets, digitalSpend, donors }) {
  const totalPhysicalSpend = physicalAssets.reduce(
    (sum, a) => sum + Number(a.estimated_cost), 0
  );
  const totalDigitalSpend = digitalSpend.reduce(
    (sum, d) => sum + Number(d.spend_amount), 0
  );
  const totalReportedIncome = donors.reduce(
    (sum, d) => sum + Number(d.donation_amount), 0
  );

  const totalEstimatedSpend = totalPhysicalSpend + totalDigitalSpend;
  const spendingGap = totalEstimatedSpend - totalReportedIncome;
  const spendingGapRatio = totalReportedIncome > 0
    ? Math.round((totalEstimatedSpend / totalReportedIncome) * 100) / 100
    : null;

  const avgDonorRisk = calculateAvgDonorRisk(donors);
  const integrityScore = calculateIntegrityScore(totalReportedIncome, totalEstimatedSpend, avgDonorRisk);
  const riskLevel = getRiskLevel(integrityScore);

  return {
    total_physical_spend: totalPhysicalSpend,
    total_digital_spend: totalDigitalSpend,
    total_estimated_spend: totalEstimatedSpend,
    total_reported_income: totalReportedIncome,
    spending_gap: spendingGap,
    spending_gap_ratio: spendingGapRatio,
    avg_donor_risk: Math.round(avgDonorRisk * 10000) / 10000,
    integrity_score: integrityScore,
    risk_level: riskLevel,
    // updated_at: new Date().toISOString(),
  };
}

// ── Upsert result into reconciliation_summary ──
async function upsertSummary(candidateId, summary) {
  const { error } = await supabase
    .from('reconciliation_summary')
    .upsert(
      { candidate_id: candidateId, ...summary },
      { onConflict: 'candidate_id' }
    );

  if (error) throw new Error(`upsert to reconciliation_summary failed: ${error.message}`);
}

// ── Main reconcile function — called by the route ──
async function reconcileCandidate(candidateId) {
  console.log(`[Reconciliation] Starting for candidate ${candidateId}`);

  // 1. Verify candidate exists
  const { data: candidate, error: candError } = await supabase
    .from('candidates')
    .select('id, name')
    .eq('id', candidateId)
    .single();

  if (candError || !candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  // 2. Fetch raw data from all 3 source tables
  const { physicalAssets, digitalSpend, donors } = await fetchCandidateData(candidateId);

  console.log(`[Reconciliation] Candidate: ${candidate.name}`);
  console.log(`  Physical assets: ${physicalAssets.length} records`);
  console.log(`  Digital spend:   ${digitalSpend.length} records`);
  console.log(`  Donors:          ${donors.length} records`);

  // 3. Run the reconciliation calculations
  const summary = reconcile({ physicalAssets, digitalSpend, donors });

  console.log(`  Integrity score: ${summary.integrity_score} (${summary.risk_level})`);
  console.log(`  Spending gap:    KES ${summary.spending_gap.toLocaleString()}`);

  // 4. Upsert into reconciliation_summary
  await upsertSummary(candidateId, summary);

  console.log(`[Reconciliation] Complete for candidate ${candidateId}`);

  return { candidate_id: candidateId, candidate_name: candidate.name, ...summary };
}

// ── GET /api/v1/candidates — list all candidates with summary ──
async function getAllCandidates() {
  const { data, error } = await supabase  
//   updated_at, line 172
    .from('reconciliation_summary')
    .select(`
      candidate_id,
      total_physical_spend,
      total_digital_spend,
      total_estimated_spend,
      total_reported_income,
      spending_gap,
      spending_gap_ratio,
      integrity_score,
      risk_level,
      
      candidates (
        id,
        name,
        party,
        position,
        constituency
      )
    `)
    .order('integrity_score', { ascending: true }); // most suspicious first

  if (error) throw new Error(error.message);

  if (!data || data.length === 0) return [];

  return data.map(row => ({
    id: row.candidate_id,
    name: row.candidates?.name,
    party: row.candidates?.party,
    position: row.candidates?.position,
    constituency: row.candidates?.constituency,
    integrity: {
      score: row.integrity_score,
      risk_level: row.risk_level,
      risk_label: getRiskLabel(row.risk_level),
    },
    financial_summary: {
      total_physical_spend: row.total_physical_spend,
      total_digital_spend: row.total_digital_spend,
      total_estimated_spend: row.total_estimated_spend,
      total_reported_income: row.total_reported_income,
      spending_gap: row.spending_gap,
      spending_gap_ratio: row.spending_gap_ratio,
    },
    updated_at: row.updated_at,
  }));
}

// ── GET /api/v1/candidates/:id/summary — full summary for one candidate ──
async function getCandidateSummary(candidateId) {
  const { data: summary, error: sumErr } = await supabase
    .from('reconciliation_summary')
    .select('*')
    .eq('candidate_id', candidateId)
    .single();

  if (sumErr || !summary) {
    throw new Error(`No summary found for candidate ${candidateId} — has reconciliation run yet?`);
  }

  const { data: candidate, error: candErr } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .single();

  if (candErr || !candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  const unreportedPct = summary.total_estimated_spend > 0
    ? Math.round(((summary.spending_gap) / summary.total_estimated_spend) * 10000) / 100
    : 0;

  return {
    candidate: {
      id: candidate.id,
      name: candidate.name,
      party: candidate.party,
      position: candidate.position,
      constituency: candidate.constituency,
    },
    integrity: {
      score: summary.integrity_score,
      risk_level: summary.risk_level,
      classification: getRiskLabel(summary.risk_level),
    },
    financial_summary: {
      total_physical_spend: summary.total_physical_spend,
      total_digital_spend: summary.total_digital_spend,
      total_estimated_spend: summary.total_estimated_spend,
      total_reported_income: summary.total_reported_income,
      spending_gap: summary.spending_gap,
      spending_gap_ratio: summary.spending_gap_ratio,
      unreported_percentage: unreportedPct,
    },
    donor_risk: {
      avg_donor_risk: summary.avg_donor_risk,
    },
    updated_at: summary.updated_at,
  };
}

function getRiskLabel(riskLevel) {
  const labels = {
    GREEN: 'Transparent',
    AMBER: 'Requires Review',
    RED: 'High Risk / Dark Money Signal',
  };
  return labels[riskLevel] || 'Unknown';
}

module.exports = { reconcileCandidate, getAllCandidates, getCandidateSummary };