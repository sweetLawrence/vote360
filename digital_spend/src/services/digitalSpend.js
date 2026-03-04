const { parse } = require('csv-parse/sync');
const supabase = require('../../database/supabase');

// ── Normalize spend range string or numbers to a midpoint ──
// Handles: "100000-200000", "KES 100K-200K", or raw numbers
function normalizeMidpoint(low, high, rawRange) {
  // If we already have clean low/high numbers, just midpoint them
  if (low && high && !isNaN(Number(low)) && !isNaN(Number(high))) {
    return Math.round((Number(low) + Number(high)) / 2);
  }

  // Try to parse a range string like "100000-200000" or "KES 100K-200K"
  if (rawRange) {
    const cleaned = rawRange
      .replace(/KES/gi, '')
      .replace(/,/g, '')
      .trim();

    // Handle K/M suffixes
    const parseValue = (str) => {
      str = str.trim();
      if (str.endsWith('M') || str.endsWith('m')) return parseFloat(str) * 1000000;
      if (str.endsWith('K') || str.endsWith('k')) return parseFloat(str) * 1000;
      return parseFloat(str);
    };

    const parts = cleaned.split('-');
    if (parts.length === 2) {
      const lo = parseValue(parts[0]);
      const hi = parseValue(parts[1]);
      if (!isNaN(lo) && !isNaN(hi)) return Math.round((lo + hi) / 2);
    }
  }

  // If spend_amount is directly provided, use it
  return null;
}

// ── Validate that a candidate exists ──
async function candidateExists(candidateId) {
  const { data, error } = await supabase
    .from('candidates')
    .select('id')
    .eq('id', candidateId)
    .single();
  return !error && !!data;
}

// ── Trigger Reconciliation Engine ──
async function triggerReconciliation(candidateId) {
  const reconUrl = process.env.RECONCILIATION_URL;
  if (!reconUrl) {
    console.warn('RECONCILIATION_URL not set — skipping reconciliation trigger');
    return;
  }
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`${reconUrl}/${candidateId}`, { method: 'POST' });
    if (!res.ok) {
      console.error(`Reconciliation trigger failed for candidate ${candidateId}: ${res.status}`);
    } else {
      console.log(`Reconciliation triggered for candidate ${candidateId}`);
    }
  } catch (err) {
    // Non-fatal — log and continue. Don't let a recon failure break the import.
    console.error(`Reconciliation trigger error: ${err.message}`);
  }
}

// ── Parse and validate a CSV buffer ──
// Expected CSV columns (flexible — see notes below):
//   candidate_id, platform, spend_amount OR spend_range_low+spend_range_high OR spend_range
//   period_start, period_end
// Optional: spend_range_low, spend_range_high
function parseCSV(buffer) {
  const records = parse(buffer, {
    columns: true,           // first row = headers
    skip_empty_lines: true,
    trim: true,
  });

  if (!records || records.length === 0) {
    throw new Error('CSV is empty or could not be parsed');
  }

  return records;
}

// ── Build a normalized DB row from a raw CSV row ──
function buildRow(raw) {
  const errors = [];

  const candidateId = raw.candidate_id || raw.candidateId;
  if (!candidateId) errors.push('candidate_id is required');

  const platform = (raw.platform || '').toLowerCase().trim();
  if (!['meta', 'google', 'x'].includes(platform)) {
    errors.push(`platform must be one of: meta, google, x — got "${platform}"`);
  }

  // Resolve spend_amount
  let spendAmount = null;
  const low = raw.spend_range_low || raw.spendRangeLow;
  const high = raw.spend_range_high || raw.spendRangeHigh;
  const rangeStr = raw.spend_range || raw.spendRange;
  const directAmount = raw.spend_amount || raw.spendAmount;

  if (directAmount && !isNaN(Number(directAmount))) {
    spendAmount = Number(directAmount);
  } else {
    spendAmount = normalizeMidpoint(low, high, rangeStr);
  }

  if (!spendAmount || spendAmount <= 0) {
    errors.push('Could not resolve a valid spend_amount — provide spend_amount, spend_range_low+high, or spend_range');
  }

  const periodStart = raw.period_start || raw.periodStart;
  const periodEnd = raw.period_end || raw.periodEnd;
  if (!periodStart) errors.push('period_start is required');
  if (!periodEnd) errors.push('period_end is required');

  if (errors.length > 0) {
    throw new Error(`Row validation failed: ${errors.join('; ')}`);
  }

  return {
    candidate_id: Number(candidateId),
    platform,
    spend_amount: spendAmount,
    spend_range_low: low ? Number(low) : null,
    spend_range_high: high ? Number(high) : null,
    period_start: periodStart,
    period_end: periodEnd,
    created_at: new Date().toISOString(),
  };
}

// ── Main import function ──
// Called by the POST /api/v1/digital/import route
async function importDigitalSpend(fileBuffer) {
  // 1. Parse CSV
  const rawRows = parseCSV(fileBuffer);

  // 2. Build and validate all rows before touching the DB
  const rows = [];
  const rowErrors = [];

  for (let i = 0; i < rawRows.length; i++) {
    try {
      const row = buildRow(rawRows[i]);
      rows.push(row);
    } catch (err) {
      rowErrors.push({ row: i + 2, error: err.message }); // +2 for header + 1-index
    }
  }

  if (rowErrors.length > 0) {
    return {
      success: false,
      message: 'CSV validation failed',
      errors: rowErrors,
    };
  }

  // 3. Validate all candidate IDs exist
  const candidateIds = [...new Set(rows.map(r => r.candidate_id))];
  for (const id of candidateIds) {
    const exists = await candidateExists(id);
    if (!exists) {
      return {
        success: false,
        message: `Candidate with id ${id} does not exist in the database`,
      };
    }
  }

  // 4. Bulk insert into digital_spend
  const { data, error } = await supabase
    .from('digital_spend')
    .insert(rows)
    .select();

  if (error) {
    console.error('Supabase insert error:', error);
    return {
      success: false,
      message: 'Database insert failed',
      detail: error.message,
    };
  }

  // 5. Trigger reconciliation for each affected candidate
  for (const id of candidateIds) {
    await triggerReconciliation(id);
  }

  return {
    success: true,
    message: `Successfully imported ${rows.length} digital spend records`,
    rows_imported: rows.length,
    candidates_affected: candidateIds,
  };
}

// ── GET handler — fetch aggregated digital spend for a candidate ──
async function getDigitalSpend(candidateId) {
  const { data, error } = await supabase
    .from('digital_spend')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('period_start', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return {
      candidate_id: candidateId,
      total_digital_spend: 0,
      platform_breakdown: [],
      records: [],
    };
  }

  // Aggregate by platform
  const platformMap = {};
  let total = 0;

  for (const record of data) {
    const p = record.platform;
    if (!platformMap[p]) {
      platformMap[p] = { platform: p, spend_amount: 0, campaign_count: 0, period_start: record.period_start, period_end: record.period_end };
    }
    platformMap[p].spend_amount += Number(record.spend_amount);
    platformMap[p].campaign_count += 1;
    total += Number(record.spend_amount);
  }

  // Add percentages
  const platformBreakdown = Object.values(platformMap).map(p => ({
    ...p,
    percentage: total > 0 ? Math.round((p.spend_amount / total) * 100 * 10) / 10 : 0,
  }));

  return {
    candidate_id: Number(candidateId),
    total_digital_spend: total,
    platform_breakdown: platformBreakdown,
    records: data,
  };
}

module.exports = { importDigitalSpend, getDigitalSpend };