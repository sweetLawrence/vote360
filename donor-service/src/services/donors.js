// const { parse } = require('csv-parse/sync');
// const supabase = require('../../database/supabase');

// // ──────────────────────────────────────────────
// // RISK SCORING ENGINE
// // Rules straight from the architecture doc.
// // Each rule is isolated so they're easy to audit,
// // adjust, or extend after the hackathon.
// // ──────────────────────────────────────────────

// function calculateCompanyAgeDays(registrationDate, donationDate) {
//   if (!registrationDate) return null;
//   const reg = new Date(registrationDate);
//   const don = donationDate ? new Date(donationDate) : new Date();
//   if (isNaN(reg.getTime())) return null;
//   return Math.floor((don - reg) / (1000 * 60 * 60 * 24));
// }

// // Returns { risk_score: 'LOW'|'MEDIUM'|'HIGH', risk_factors: [...] }
// function scoreRisk({ companyAgeDays, donationAmount, totalReportedIncome, donorType }) {
//   const factors = [];
//   let highCount = 0;
//   let mediumCount = 0;

//   // Rule 1: Company registered < 90 days before donation
//   if (companyAgeDays !== null && companyAgeDays < 90) {
//     factors.push('Company registered < 90 days before donation');
//     highCount++;
//   }

//   // Rule 2: No registration date + not an individual = unverifiable entity
//   if (companyAgeDays === null && donorType !== 'individual') {
//     factors.push('No company record found in Registrar of Companies');
//     highCount++;
//   }

//   // Rule 3: Single donor contributes > 40% of total reported income
//   if (totalReportedIncome > 0) {
//     const pct = (donationAmount / totalReportedIncome) * 100;
//     if (pct > 40) {
//       factors.push(`Donor contributes ${pct.toFixed(1)}% of total reported income (> 40% threshold)`);
//       mediumCount++;
//     }
//   }

//   // Determine final risk level
//   let riskScore = 'LOW';
//   if (highCount > 0) riskScore = 'HIGH';
//   else if (mediumCount > 0) riskScore = 'MEDIUM';

//   return { risk_score: riskScore, risk_factors: factors };
// }

// // ── Trigger Reconciliation Engine ──
// async function triggerReconciliation(candidateId) {
//   const reconUrl = process.env.RECONCILIATION_URL;
//   if (!reconUrl) {
//     console.warn('RECONCILIATION_URL not set — skipping reconciliation trigger');
//     return;
//   }
//   try {
//     const fetch = (await import('node-fetch')).default;
//     const res = await fetch(`${reconUrl}/${candidateId}`, { method: 'POST' });
//     if (!res.ok) {
//       console.error(`Reconciliation trigger failed for candidate ${candidateId}: ${res.status}`);
//     } else {
//       console.log(`Reconciliation triggered for candidate ${candidateId}`);
//     }
//   } catch (err) {
//     console.error(`Reconciliation trigger error: ${err.message}`);
//   }
// }

// // ── Validate candidate exists ──
// async function candidateExists(candidateId) {
//   const { data, error } = await supabase
//     .from('candidates')
//     .select('id')
//     .eq('id', candidateId)
//     .single();
//   return !error && !!data;
// }

// // ── Parse CSV buffer ──
// function parseCSV(buffer) {
//   const records = parse(buffer, {
//     columns: true,
//     skip_empty_lines: true,
//     trim: true,
//   });
//   if (!records || records.length === 0) {
//     throw new Error('CSV is empty or could not be parsed');
//   }
//   return records;
// }

// // ── Build and validate a single donor row ──
// // Expected CSV columns:
// //   candidate_id, donor_name, donation_amount, registration_date (optional),
// //   donor_type (optional — defaults to "company"), donation_date (optional)
// function buildRow(raw, totalReportedIncome) {
//   const errors = [];

//   const candidateId = raw.candidate_id || raw.candidateId;
//   if (!candidateId) errors.push('candidate_id is required');

//   const donorName = raw.donor_name || raw.donorName;
//   if (!donorName) errors.push('donor_name is required');

//   const donationAmount = Number(raw.donation_amount || raw.donationAmount);
//   if (!donationAmount || isNaN(donationAmount) || donationAmount <= 0) {
//     errors.push('donation_amount must be a positive number');
//   }

//   if (errors.length > 0) {
//     throw new Error(`Row validation failed: ${errors.join('; ')}`);
//   }

//   const registrationDate = raw.registration_date || raw.registrationDate || null;
//   const donationDate = raw.donation_date || raw.donationDate || null;
//   const donorType = (raw.donor_type || raw.donorType || 'company').toLowerCase().trim();

//   const companyAgeDays = calculateCompanyAgeDays(registrationDate, donationDate);
//   const donationPct = totalReportedIncome > 0
//     ? Math.round((donationAmount / totalReportedIncome) * 10000) / 100
//     : 0;

//   const { risk_score, risk_factors } = scoreRisk({
//     companyAgeDays,
//     donationAmount,
//     totalReportedIncome,
//     donorType,
//   });

//   return {
//     candidate_id: Number(candidateId),
//     donor_name: donorName,
//     donation_amount: donationAmount,
//     registration_date: registrationDate || null,
//     company_age_days: companyAgeDays,
//     risk_score,
//     // risk_factors: JSON.stringify(risk_factors), // store as JSON string in DB
//     donation_percentage: donationPct,
//     created_at: new Date().toISOString(),
//   };
// }

// // ── Main import function ──
// async function importDonors(fileBuffer) {
//   // 1. Parse CSV
//   const rawRows = parseCSV(fileBuffer);

 
//   const totalReportedIncome = rawRows.reduce((sum, r) => {
//     const amount = Number(r.donation_amount || r.donationAmount || 0);
//     return sum + (isNaN(amount) ? 0 : amount);
//   }, 0);

//   // 3. Build and validate all rows
//   const rows = [];
//   const rowErrors = [];

//   for (let i = 0; i < rawRows.length; i++) {
//     try {
//       const row = buildRow(rawRows[i], totalReportedIncome);
//       rows.push(row);
//     } catch (err) {
//       rowErrors.push({ row: i + 2, error: err.message });
//     }
//   }

//   if (rowErrors.length > 0) {
//     return { success: false, message: 'CSV validation failed', errors: rowErrors };
//   }

//   // 4. Validate candidate IDs
//   const candidateIds = [...new Set(rows.map(r => r.candidate_id))];
//   for (const id of candidateIds) {
//     const exists = await candidateExists(id);
//     if (!exists) {
//       return { success: false, message: `Candidate with id ${id} does not exist` };
//     }
//   }

//   // 5. Bulk insert into donors table
//   const { data, error } = await supabase
//     .from('donors')
//     .insert(rows)
//     .select();

//   if (error) {
//     console.error('Supabase insert error:', error);
//     return { success: false, message: 'Database insert failed', detail: error.message };
//   }

//   // 6. Trigger reconciliation for each affected candidate
//   for (const id of candidateIds) {
//     await triggerReconciliation(id);
//   }

//   // 7. Build a summary of risk findings to return
//   const riskSummary = {
//     total: rows.length,
//     high: rows.filter(r => r.risk_score === 'HIGH').length,
//     medium: rows.filter(r => r.risk_score === 'MEDIUM').length,
//     low: rows.filter(r => r.risk_score === 'LOW').length,
//   };

//   return {
//     success: true,
//     message: `Successfully imported ${rows.length} donor records`,
//     rows_imported: rows.length,
//     candidates_affected: candidateIds,
//     risk_summary: riskSummary,
//   };
// }

// // ── GET handler — fetch donors for a candidate ──
// async function getDonors(candidateId) {
//   const { data, error } = await supabase
//     .from('donors')
//     .select('*')
//     .eq('candidate_id', candidateId)
//     .order('donation_amount', { ascending: false });

//   if (error) throw new Error(error.message);

//   if (!data || data.length === 0) {
//     return {
//       candidate_id: Number(candidateId),
//       total_reported_income: 0,
//       donor_count: 0,
//       risk_summary: { high: 0, medium: 0, low: 0, high_risk_percentage: 0 },
//       red_flags: { briefcase_companies: 0, unverifiable_entities: 0 },
//       donors: [],
//     };
//   }

//   const totalIncome = data.reduce((sum, d) => sum + Number(d.donation_amount), 0);
//   const high = data.filter(d => d.risk_score === 'HIGH').length;
//   const medium = data.filter(d => d.risk_score === 'MEDIUM').length;
//   const low = data.filter(d => d.risk_score === 'LOW').length;

//   // Briefcase companies: registered < 90 days
//   const briefcaseCompanies = data.filter(
//     d => d.company_age_days !== null && d.company_age_days < 90
//   ).length;

//   // Unverifiable: no registration date and not an individual
//   const unverifiable = data.filter(
//     d => d.company_age_days === null && d.registration_date === null
//   ).length;

//   // Concentration risk
//   const topDonor = data[0]; // already sorted desc
//   const top3Total = data.slice(0, 3).reduce((s, d) => s + Number(d.donation_amount), 0);

//   return {
//     candidate_id: Number(candidateId),
//     total_reported_income: totalIncome,
//     donor_count: data.length,
//     risk_summary: {
//       high,
//       medium,
//       low,
//       high_risk_percentage: Math.round((high / data.length) * 1000) / 10,
//     },
//     red_flags: {
//       briefcase_companies: briefcaseCompanies,
//       unverifiable_entities: unverifiable,
//       concentration_risk: {
//         top_donor_percentage: totalIncome > 0
//           ? Math.round((Number(topDonor.donation_amount) / totalIncome) * 1000) / 10
//           : 0,
//         top_3_donors_percentage: totalIncome > 0
//           ? Math.round((top3Total / totalIncome) * 1000) / 10
//           : 0,
//       },
//     },
//     donors: data.map(d => ({
//       ...d,
//       risk_factors: (() => {
//         try { return JSON.parse(d.risk_factors || '[]'); }
//         catch { return []; }
//       })(),
//     })),
//   };
// }

// module.exports = { importDonors, getDonors };





















const { parse } = require('csv-parse/sync');
const supabase = require('../../database/supabase');

// ──────────────────────────────────────────────
// RISK SCORING ENGINE
// Rules straight from the architecture doc.
// Each rule is isolated so they're easy to audit,
// adjust, or extend after the hackathon.
// ──────────────────────────────────────────────

function calculateCompanyAgeDays(registrationDate, donationDate) {
  if (!registrationDate) return null;
  const reg = new Date(registrationDate);
  const don = donationDate ? new Date(donationDate) : new Date();
  if (isNaN(reg.getTime())) return null;
  return Math.floor((don - reg) / (1000 * 60 * 60 * 24));
}

// Returns { risk_score: 'LOW'|'MEDIUM'|'HIGH', risk_factors: [...] }
function scoreRisk({ companyAgeDays, donationAmount, totalReportedIncome, donorType }) {
  const factors = [];
  let highCount = 0;
  let mediumCount = 0;

  // Rule 1: Company registered < 90 days before donation
  if (companyAgeDays !== null && companyAgeDays < 90) {
    factors.push('Company registered < 90 days before donation');
    highCount++;
  }

  // Rule 2: No registration date + not an individual = unverifiable entity
  if (companyAgeDays === null && donorType !== 'individual') {
    factors.push('No company record found in Registrar of Companies');
    highCount++;
  }

  // Rule 3: Single donor contributes > 40% of total reported income
  if (totalReportedIncome > 0) {
    const pct = (donationAmount / totalReportedIncome) * 100;
    if (pct > 40) {
      factors.push(`Donor contributes ${pct.toFixed(1)}% of total reported income (> 40% threshold)`);
      mediumCount++;
    }
  }

  // Determine final risk level
  let riskScore = 'LOW';
  if (highCount > 0) riskScore = 'HIGH';
  else if (mediumCount > 0) riskScore = 'MEDIUM';

  return { risk_score: riskScore, risk_factors: factors };
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
    console.error(`Reconciliation trigger error: ${err.message}`);
  }
}

// ── Validate candidate exists ──
async function candidateExists(candidateId) {
  const { data, error } = await supabase
    .from('candidates')
    .select('id')
    .eq('id', candidateId)
    .single();
  return !error && !!data;
}

// ── Parse CSV buffer ──
function parseCSV(buffer) {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  if (!records || records.length === 0) {
    throw new Error('CSV is empty or could not be parsed');
  }
  return records;
}

// ── Build and validate a single donor row ──
// Expected CSV columns:
//   candidate_id, donor_name, donation_amount, registration_date (optional),
//   donor_type (optional — defaults to "company"), donation_date (optional)
function buildRow(raw, totalReportedIncome) {
  const errors = [];

  const candidateId = raw.candidate_id || raw.candidateId;
  if (!candidateId) errors.push('candidate_id is required');

  const donorName = raw.donor_name || raw.donorName;
  if (!donorName) errors.push('donor_name is required');

  const donationAmount = Number(raw.donation_amount || raw.donationAmount);
  if (!donationAmount || isNaN(donationAmount) || donationAmount <= 0) {
    errors.push('donation_amount must be a positive number');
  }

  if (errors.length > 0) {
    throw new Error(`Row validation failed: ${errors.join('; ')}`);
  }

  const registrationDate = raw.registration_date || raw.registrationDate || null;
  const donationDate = raw.donation_date || raw.donationDate || null;
  const donorType = (raw.donor_type || raw.donorType || 'company').toLowerCase().trim();

  const companyAgeDays = calculateCompanyAgeDays(registrationDate, donationDate);
  const donationPct = totalReportedIncome > 0
    ? Math.round((donationAmount / totalReportedIncome) * 10000) / 100
    : 0;

  const { risk_score, risk_factors } = scoreRisk({
    companyAgeDays,
    donationAmount,
    totalReportedIncome,
    donorType,
  });

  return {
    candidate_id: Number(candidateId),
    donor_name: donorName,
    donation_amount: donationAmount,
    registration_date: registrationDate || null,
    company_age_days: companyAgeDays,
    risk_score,
    // risk_factors: JSON.stringify(risk_factors)  , // store as JSON string in DB
    donation_percentage: donationPct,
    created_at: new Date().toISOString(),
  };
}

// ── Main import function ──
async function importDonors(fileBuffer) {
  // 1. Parse CSV
  const rawRows = parseCSV(fileBuffer);

  // 2. Calculate total reported income for this batch (needed for concentration rule)
  const totalReportedIncome = rawRows.reduce((sum, r) => {
    const amount = Number(r.donation_amount || r.donationAmount || 0);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  // 3. Build and validate all rows
  const rows = [];
  const rowErrors = [];

  for (let i = 0; i < rawRows.length; i++) {
    try {
      const row = buildRow(rawRows[i], totalReportedIncome);
      rows.push(row);
    } catch (err) {
      rowErrors.push({ row: i + 2, error: err.message });
    }
  }

  if (rowErrors.length > 0) {
    return { success: false, message: 'CSV validation failed', errors: rowErrors };
  }

  // 4. Validate candidate IDs
  const candidateIds = [...new Set(rows.map(r => r.candidate_id))];
  for (const id of candidateIds) {
    const exists = await candidateExists(id);
    if (!exists) {
      return { success: false, message: `Candidate with id ${id} does not exist` };
    }
  }

  // 5. Bulk insert into donors table
  const { data, error } = await supabase
    .from('donors')
    .insert(rows)
    .select();

  if (error) {
    console.error('Supabase insert error:', error);
    return { success: false, message: 'Database insert failed', detail: error.message };
  }

  // 6. Trigger reconciliation for each affected candidate
  for (const id of candidateIds) {
    await triggerReconciliation(id);
  }

  // 7. Build a summary of risk findings to return
  const riskSummary = {
    total: rows.length,
    high: rows.filter(r => r.risk_score === 'HIGH').length,
    medium: rows.filter(r => r.risk_score === 'MEDIUM').length,
    low: rows.filter(r => r.risk_score === 'LOW').length,
  };

  return {
    success: true,
    message: `Successfully imported ${rows.length} donor records`,
    rows_imported: rows.length,
    candidates_affected: candidateIds,
    risk_summary: riskSummary,
  };
}

// ── GET handler — fetch donors for a candidate ──
async function getDonors(candidateId) {
  const { data, error } = await supabase
    .from('donors')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('donation_amount', { ascending: false });

  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    return {
      candidate_id: Number(candidateId),
      total_reported_income: 0,
      donor_count: 0,
      risk_summary: { high: 0, medium: 0, low: 0, high_risk_percentage: 0 },
      red_flags: { briefcase_companies: 0, unverifiable_entities: 0 },
      donors: [],
    };
  }

  const totalIncome = data.reduce((sum, d) => sum + Number(d.donation_amount), 0);
  const high = data.filter(d => d.risk_score === 'HIGH').length;
  const medium = data.filter(d => d.risk_score === 'MEDIUM').length;
  const low = data.filter(d => d.risk_score === 'LOW').length;

  // Briefcase companies: registered < 90 days
  const briefcaseCompanies = data.filter(
    d => d.company_age_days !== null && d.company_age_days < 90
  ).length;

  // Unverifiable: no registration date and not an individual
  const unverifiable = data.filter(
    d => d.company_age_days === null && d.registration_date === null
  ).length;

  // Concentration risk
  const topDonor = data[0]; // already sorted desc
  const top3Total = data.slice(0, 3).reduce((s, d) => s + Number(d.donation_amount), 0);

  return {
    candidate_id: Number(candidateId),
    total_reported_income: totalIncome,
    donor_count: data.length,
    risk_summary: {
      high,
      medium,
      low,
      high_risk_percentage: Math.round((high / data.length) * 1000) / 10,
    },
    red_flags: {
      briefcase_companies: briefcaseCompanies,
      unverifiable_entities: unverifiable,
      concentration_risk: {
        top_donor_percentage: totalIncome > 0
          ? Math.round((Number(topDonor.donation_amount) / totalIncome) * 1000) / 10
          : 0,
        top_3_donors_percentage: totalIncome > 0
          ? Math.round((top3Total / totalIncome) * 1000) / 10
          : 0,
      },
    },
    donors: data.map(d => ({
      ...d,
      risk_factors: (() => {
        try { return JSON.parse(d.risk_factors || '[]'); }
        catch { return []; }
      })(),
    })),
  };
}



// ── Add a single donor record ──
// Called by POST /api/v1/donors/record
// Risk is scored in real time against existing donors for that candidate
async function addDonorRecord(body) {
  const errors = [];

  const candidateId = Number(body.candidate_id || body.candidateId);
  if (!candidateId || isNaN(candidateId)) errors.push('candidate_id is required and must be a number');

  const donorName = (body.donor_name || body.donorName || '').trim();
  if (!donorName) errors.push('donor_name is required');

  const donationAmount = Number(body.donation_amount || body.donationAmount);
  if (!donationAmount || isNaN(donationAmount) || donationAmount <= 0) {
    errors.push('donation_amount must be a positive number');
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed', errors };
  }

  // Verify candidate exists
  const exists = await candidateExists(candidateId);
  if (!exists) {
    return { success: false, message: `Candidate with id ${candidateId} does not exist` };
  }

  // Fetch existing donors for this candidate to calculate concentration risk accurately
  const { data: existingDonors } = await supabase
    .from('donors')
    .select('donation_amount')
    .eq('candidate_id', candidateId);

  const existingTotal = (existingDonors || []).reduce(
    (sum, d) => sum + Number(d.donation_amount), 0
  );
  const totalReportedIncome = existingTotal + donationAmount;

  const registrationDate = body.registration_date || body.registrationDate || null;
  const donationDate = body.donation_date || body.donationDate || null;
  const donorType = (body.donor_type || body.donorType || 'company').toLowerCase().trim();

  const companyAgeDays = calculateCompanyAgeDays(registrationDate, donationDate);
  const donationPct = Math.round((donationAmount / totalReportedIncome) * 10000) / 100;

  const { risk_score, risk_factors } = scoreRisk({
    companyAgeDays,
    donationAmount,
    totalReportedIncome,
    donorType,
  });

  const row = {
    candidate_id: candidateId,
    donor_name: donorName,
    donation_amount: donationAmount,
    registration_date: registrationDate || null,
    company_age_days: companyAgeDays,
    risk_score,
    // risk_factors: JSON.stringify(risk_factors),
    donation_percentage: donationPct,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('donors')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    return { success: false, message: 'Database insert failed', detail: error.message };
  }

  // Trigger reconciliation so integrity score updates immediately
  await triggerReconciliation(candidateId);

  return {
    success: true,
    message: 'Donor record added and reconciliation triggered',
    record: {
      ...data,
      // risk_factors, // return as array not JSON string
    },
  };
}

module.exports = { importDonors, getDonors, addDonorRecord };