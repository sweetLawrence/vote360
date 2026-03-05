// require('dotenv').config();

// // ──────────────────────────────────────────────
// // VoteTrace360 — Demo Simulator
// //
// // Simulates real-world ad spend pulls and donor
// // filing arrivals during the hackathon demo.
// //
// // Run with: node simulator.js
// //
// // What it does:
// //   - Every 2 minutes, alternates between posting
// //     a new digital spend record and a new donor record
// //   - Targets random candidates each cycle
// //   - Occasionally injects suspicious/dark money records
// //     for dramatic live score changes
// // ──────────────────────────────────────────────

// const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// // ── Config ──
// const DIGITAL_URL = process.env.DIGITAL_SERVICE_URL || 'http://localhost:3002';
// const DONOR_URL   = process.env.DONOR_SERVICE_URL   || 'http://localhost:3003';
// const ADMIN_KEY   = process.env.ADMIN_KEY            || 'your-admin-key-here';

// const MAX_INTERVAL_MS = 2 * 60 * 1000; // up to 2 minutes

// // function randomInterval() {
//   return Math.floor(Math.random() * MAX_INTERVAL_MS);
// // }


// // const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// // All 10 candidate IDs
// const CANDIDATE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// // ── Digital Spend Data Pools ──
// const PLATFORMS = ['meta', 'google', 'x'];

// const CLEAN_AD_SPENDS = [
//   { platform: 'meta',   spend_amount: 85000,  label: 'Facebook awareness campaign' },
//   { platform: 'google', spend_amount: 62000,  label: 'Google search ads' },
//   { platform: 'x',      spend_amount: 35000,  label: 'X promoted tweets' },
//   { platform: 'meta',   spend_amount: 120000, label: 'Instagram stories campaign' },
//   { platform: 'google', spend_amount: 95000,  label: 'YouTube pre-roll ads' },
//   { platform: 'meta',   spend_amount: 54000,  label: 'Facebook page promotion' },
// ];

// const SUSPICIOUS_AD_SPENDS = [
//   { platform: 'meta',   spend_amount: 850000,  label: 'Mass Facebook push' },
//   { platform: 'google', spend_amount: 620000,  label: 'Google display blitz' },
//   { platform: 'meta',   spend_amount: 1200000, label: 'Instagram saturation campaign' },
//   { platform: 'x',      spend_amount: 980000,  label: 'X trending campaign' },
// ];

// // ── Donor Data Pools ──
// const CLEAN_DONORS = [
//   { donor_name: 'Equity Bank Foundation',     donation_amount: 500000,  registration_date: '2010-03-15', donor_type: 'company' },
//   { donor_name: 'Safaricom PLC',              donation_amount: 750000,  registration_date: '2003-06-01', donor_type: 'company' },
//   { donor_name: 'Mr. David Kamau',            donation_amount: 50000,   registration_date: null,         donor_type: 'individual' },
//   { donor_name: 'Ms. Amina Odhiambo',         donation_amount: 75000,   registration_date: null,         donor_type: 'individual' },
//   { donor_name: 'Kenya Commercial Bank',      donation_amount: 1000000, registration_date: '1996-04-10', donor_type: 'company' },
//   { donor_name: 'Unga Group Ltd',             donation_amount: 300000,  registration_date: '1988-11-22', donor_type: 'company' },
//   { donor_name: 'Mr. Peter Njoroge',          donation_amount: 100000,  registration_date: null,         donor_type: 'individual' },
//   { donor_name: 'Bamburi Cement Ltd',         donation_amount: 450000,  registration_date: '1991-07-30', donor_type: 'company' },
// ];

// const SUSPICIOUS_DONORS = [
//   { donor_name: 'Savanna Capital Ltd',        donation_amount: 2500000, registration_date: '2024-11-01', donor_type: 'company' }, // < 90 days
//   { donor_name: 'Rift Ventures Ltd',          donation_amount: 3000000, registration_date: '2024-12-15', donor_type: 'company' }, // < 90 days
//   { donor_name: 'Coastal Enterprises Co',     donation_amount: 1800000, registration_date: null,         donor_type: 'company' }, // unverifiable
//   { donor_name: 'Highland Investments Ltd',   donation_amount: 4500000, registration_date: '2025-01-10', donor_type: 'company' }, // < 90 days
//   { donor_name: 'Nairobi Futures Ltd',        donation_amount: 2000000, registration_date: null,         donor_type: 'company' }, // unverifiable
//   { donor_name: 'Valley Holdings Ltd',        donation_amount: 3500000, registration_date: '2024-10-20', donor_type: 'company' }, // < 90 days
// ];

// // ── Helpers ──
// function randomFrom(arr) {
//   return arr[Math.floor(Math.random() * arr.length)];
// }

// function randomCandidateId() {
//   return randomFrom(CANDIDATE_IDS);
// }

// // 30% chance of injecting a suspicious record — keeps the demo dramatic
// function shouldInjectSuspicious() {
//   return Math.random() < 0.3;
// }

// function getPeriodDates() {
//   const now = new Date();
//   const start = new Date(now);
//   start.setDate(start.getDate() - 7);
//   return {
//     period_start: start.toISOString().split('T')[0],
//     period_end: now.toISOString().split('T')[0],
//   };
// }

// function formatKES(amount) {
//   return `KES ${Number(amount).toLocaleString()}`;
// }

// // ── Post a digital spend record ──
// async function postDigitalSpend() {
//   const candidateId = randomCandidateId();
//   const suspicious = shouldInjectSuspicious();
//   const pool = suspicious ? SUSPICIOUS_AD_SPENDS : CLEAN_AD_SPENDS;
//   const record = randomFrom(pool);
//   const { period_start, period_end } = getPeriodDates();

//   const body = {
//     candidate_id: candidateId,
//     platform: record.platform,
//     spend_amount: record.spend_amount,
//     period_start,
//     period_end,
//   };

//   try {
//     const res = await fetch(`${DIGITAL_URL}/api/v1/digital/record`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'x-admin-key': ADMIN_KEY,
//       },
//       body: JSON.stringify(body),
//     });

//     const data = await res.json();

//     if (res.ok) {
//       console.log(`✅ [DIGITAL] Candidate ${candidateId} | ${record.platform.toUpperCase()} | ${formatKES(record.spend_amount)} ${suspicious ? '⚠️  SUSPICIOUS' : '✓ clean'}`);
//     } else {
//       console.error(`❌ [DIGITAL] Failed for candidate ${candidateId}:`, data.message || data.error);
//     }
//   } catch (err) {
//     console.error(`❌ [DIGITAL] Network error:`, err.message);
//   }
// }

// // ── Post a donor record ──
// async function postDonor() {
//   const candidateId = randomCandidateId();
//   const suspicious = shouldInjectSuspicious();
//   const pool = suspicious ? SUSPICIOUS_DONORS : CLEAN_DONORS;
//   const record = randomFrom(pool);

//   const body = {
//     candidate_id: candidateId,
//     donor_name: record.donor_name,
//     donation_amount: record.donation_amount,
//     registration_date: record.registration_date,
//     donor_type: record.donor_type,
//     donation_date: new Date().toISOString().split('T')[0],
//   };

//   try {
//     const res = await fetch(`${DONOR_URL}/api/v1/donors/record`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'x-admin-key': ADMIN_KEY,
//       },
//       body: JSON.stringify(body),
//     });

//     const data = await res.json();

//     if (res.ok) {
//       const risk = data.record?.risk_score || '?';
//       const riskIcon = risk === 'HIGH' ? '🔴' : risk === 'MEDIUM' ? '🟡' : '🟢';
//       console.log(`✅ [DONOR]   Candidate ${candidateId} | ${record.donor_name} | ${formatKES(record.donation_amount)} | ${riskIcon} ${risk} ${suspicious ? '⚠️  SUSPICIOUS' : ''}`);
//     } else {
//       console.error(`❌ [DONOR]   Failed for candidate ${candidateId}:`, data.message || data.error);
//     }
//   } catch (err) {
//     console.error(`❌ [DONOR]   Network error:`, err.message);
//   }
// }

// // ── Main loop ──
// // Alternates between digital spend and donor every 2 minutes
// let cycle = 0;

// async function runCycle() {
//   cycle++;
//   const type = cycle % 2 === 0 ? 'donor' : 'digital';

//   console.log(`\n[${new Date().toLocaleTimeString()}] ── Cycle ${cycle} (${type.toUpperCase()}) ──`);

//   if (type === 'digital') {
//     await postDigitalSpend();
//   } else {
//     await postDonor();
//   }
// }

// // ── Start ──
// console.log('');
// console.log('╔══════════════════════════════════════════╗');
// console.log('║   VoteTrace360 — Demo Simulator          ║');
// console.log('║   Firing every 2 minutes                 ║');
// console.log('║   Press Ctrl+C to stop                   ║');
// console.log('╚══════════════════════════════════════════╝');
// console.log('');
// console.log(`Digital Service → ${DIGITAL_URL}`);
// console.log(`Donor Service   → ${DONOR_URL}`);
// console.log('');

// // Run immediately on start so you don't wait 2 minutes
// runCycle();

// // Then repeat every 2 minutes
// setInterval(runCycle, INTERVAL_MS);






















require('dotenv').config();

// ──────────────────────────────────────────────
// VoteTrace360 — Demo Simulator
//
// Simulates real-world ad spend pulls and donor
// filing arrivals during the hackathon demo.
//
// Run with: node simulator.js
//
// What it does:
//   - Every 2 minutes, alternates between posting
//     a new digital spend record and a new donor record
//   - Targets random candidates each cycle
//   - Occasionally injects suspicious/dark money records
//     for dramatic live score changes
// ──────────────────────────────────────────────

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// ── Config ──
const DIGITAL_URL = process.env.DIGITAL_SERVICE_URL || 'http://localhost:3002';
const DONOR_URL   = process.env.DONOR_SERVICE_URL   || 'http://localhost:3003';
const ADMIN_KEY   = process.env.ADMIN_KEY            || 'your-admin-key-here';


const MAX_INTERVAL_MS = 1 * 60 * 1000; // up to 2 minutes

function randomInterval() {
  return Math.floor(Math.random() * MAX_INTERVAL_MS);
}

// All 10 candidate IDs
const CANDIDATE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── Digital Spend Data Pools ──
const PLATFORMS = ['meta', 'google', 'x'];

const CLEAN_AD_SPENDS = [
  { platform: 'meta',   spend_amount: 85000,  label: 'Facebook awareness campaign' },
  { platform: 'google', spend_amount: 62000,  label: 'Google search ads' },
  { platform: 'x',      spend_amount: 35000,  label: 'X promoted tweets' },
  { platform: 'meta',   spend_amount: 120000, label: 'Instagram stories campaign' },
  { platform: 'google', spend_amount: 95000,  label: 'YouTube pre-roll ads' },
  { platform: 'meta',   spend_amount: 54000,  label: 'Facebook page promotion' },
];

const SUSPICIOUS_AD_SPENDS = [
  { platform: 'meta',   spend_amount: 850000,  label: 'Mass Facebook push' },
  { platform: 'google', spend_amount: 620000,  label: 'Google display blitz' },
  { platform: 'meta',   spend_amount: 1200000, label: 'Instagram saturation campaign' },
  { platform: 'x',      spend_amount: 980000,  label: 'X trending campaign' },
];

// ── Donor Data Pools ──
const CLEAN_DONORS = [
  { donor_name: 'Equity Bank Foundation',     donation_amount: 500000,  registration_date: '2010-03-15', donor_type: 'company' },
  { donor_name: 'Safaricom PLC',              donation_amount: 750000,  registration_date: '2003-06-01', donor_type: 'company' },
  { donor_name: 'Mr. David Kamau',            donation_amount: 50000,   registration_date: null,         donor_type: 'individual' },
  { donor_name: 'Ms. Amina Odhiambo',         donation_amount: 75000,   registration_date: null,         donor_type: 'individual' },
  { donor_name: 'Kenya Commercial Bank',      donation_amount: 1000000, registration_date: '1996-04-10', donor_type: 'company' },
  { donor_name: 'Unga Group Ltd',             donation_amount: 300000,  registration_date: '1988-11-22', donor_type: 'company' },
  { donor_name: 'Mr. Peter Njoroge',          donation_amount: 100000,  registration_date: null,         donor_type: 'individual' },
  { donor_name: 'Bamburi Cement Ltd',         donation_amount: 450000,  registration_date: '1991-07-30', donor_type: 'company' },
];

const SUSPICIOUS_DONORS = [
  { donor_name: 'Savanna Capital Ltd',        donation_amount: 2500000, registration_date: '2024-11-01', donor_type: 'company' }, // < 90 days
  { donor_name: 'Rift Ventures Ltd',          donation_amount: 3000000, registration_date: '2024-12-15', donor_type: 'company' }, // < 90 days
  { donor_name: 'Coastal Enterprises Co',     donation_amount: 1800000, registration_date: null,         donor_type: 'company' }, // unverifiable
  { donor_name: 'Highland Investments Ltd',   donation_amount: 4500000, registration_date: '2025-01-10', donor_type: 'company' }, // < 90 days
  { donor_name: 'Nairobi Futures Ltd',        donation_amount: 2000000, registration_date: null,         donor_type: 'company' }, // unverifiable
  { donor_name: 'Valley Holdings Ltd',        donation_amount: 3500000, registration_date: '2024-10-20', donor_type: 'company' }, // < 90 days
];

// ── Helpers ──
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomCandidateId() {
  return randomFrom(CANDIDATE_IDS);
}

// 30% chance of injecting a suspicious record — keeps the demo dramatic
function shouldInjectSuspicious() {
  return Math.random() < 0.3;
}

function getPeriodDates() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return {
    period_start: start.toISOString().split('T')[0],
    period_end: now.toISOString().split('T')[0],
  };
}

function formatKES(amount) {
  return `KES ${Number(amount).toLocaleString()}`;
}

// ── Post a digital spend record ──
async function postDigitalSpend() {
  const candidateId = randomCandidateId();
  const suspicious = shouldInjectSuspicious();
  const pool = suspicious ? SUSPICIOUS_AD_SPENDS : CLEAN_AD_SPENDS;
  const record = randomFrom(pool);
  const { period_start, period_end } = getPeriodDates();

  const body = {
    candidate_id: candidateId,
    platform: record.platform,
    spend_amount: record.spend_amount,
    period_start,
    period_end,
  };

  try {
    const res = await fetch(`${DIGITAL_URL}/api/v1/digital/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      console.log(`✅ [DIGITAL] Candidate ${candidateId} | ${record.platform.toUpperCase()} | ${formatKES(record.spend_amount)} ${suspicious ? '⚠️  SUSPICIOUS' : '✓ clean'}`);
    } else {
      console.error(`❌ [DIGITAL] Failed for candidate ${candidateId}:`, data.message || data.error);
    }
  } catch (err) {
    console.error(`❌ [DIGITAL] Network error:`, err.message);
  }
}

// ── Post a donor record ──
async function postDonor() {
  const candidateId = randomCandidateId();
  const suspicious = shouldInjectSuspicious();
  const pool = suspicious ? SUSPICIOUS_DONORS : CLEAN_DONORS;
  const record = randomFrom(pool);

  const body = {
    candidate_id: candidateId,
    donor_name: record.donor_name,
    donation_amount: record.donation_amount,
    registration_date: record.registration_date,
    donor_type: record.donor_type,
    donation_date: new Date().toISOString().split('T')[0],
  };

  try {
    const res = await fetch(`${DONOR_URL}/api/v1/donors/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      const risk = data.record?.risk_score || '?';
      const riskIcon = risk === 'HIGH' ? '🔴' : risk === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`✅ [DONOR]   Candidate ${candidateId} | ${record.donor_name} | ${formatKES(record.donation_amount)} | ${riskIcon} ${risk} ${suspicious ? '⚠️  SUSPICIOUS' : ''}`);
    } else {
      console.error(`❌ [DONOR]   Failed for candidate ${candidateId}:`, data.message || data.error);
    }
  } catch (err) {
    console.error(`❌ [DONOR]   Network error:`, err.message);
  }
}

// ── Main loop ──
// Alternates between digital spend and donor every 2 minutes
let cycle = 0;

async function runCycle() {
  cycle++;
  const type = cycle % 2 === 0 ? 'donor' : 'digital';

  console.log(`\n[${new Date().toLocaleTimeString()}] ── Cycle ${cycle} (${type.toUpperCase()}) ──`);

  if (type === 'digital') {
    await postDigitalSpend();
  } else {
    await postDonor();
  }
}

// ── Start ──
console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   VoteTrace360 — Demo Simulator          ║');
console.log('║   Firing every 2 minutes                 ║');
console.log('║   Press Ctrl+C to stop                   ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');
console.log(`Digital Service → ${DIGITAL_URL}`);
console.log(`Donor Service   → ${DONOR_URL}`);
console.log('');

// Run immediately on start so you don't wait
runCycle();

// Then schedule next cycle with a fresh random interval each time
function scheduleNext() {
  const delay = randomInterval();
  const seconds = Math.round(delay / 1000);
  console.log(`   ⏱  Next cycle in ${seconds}s`);
  setTimeout(async () => {
    await runCycle();
    scheduleNext();
  }, delay);
}

scheduleNext();