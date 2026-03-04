const express = require('express');
const { reconcileCandidate, getAllCandidates, getCandidateSummary } = require('../services/recon');

const router = express.Router();

// ── Internal network auth middleware ──
// NGINX blocks /internal/* from the public internet entirely.
// This middleware is a second layer — checks a shared internal secret
// so that even if NGINX is misconfigured, random callers can't trigger reconciliation.
// function requireInternalKey(req, res, next) {
//   const key = req.headers['x-internal-key'];
//   if (!key || key !== process.env.INTERNAL_KEY) {
//     return res.status(401).json({ error: 'Unauthorized — internal endpoint' });
//   }
//   next();
// }

// ──────────────────────────────────────────────
// POST /internal/reconcile/:candidateId
// Triggered by Digital, Donor, or Physical services after a write
// Internal network only — blocked by NGINX for external traffic
// ──────────────────────────────────────────────
router.post('/reconcile/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;

    if (!candidateId || isNaN(Number(candidateId))) {
      return res.status(400).json({ error: 'candidateId must be a number' });
    }

    const result = await reconcileCandidate(Number(candidateId));
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('POST /internal/reconcile error:', err);
    return res.status(500).json({ error: 'Reconciliation failed', detail: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/v1/candidates
// List all candidates with their latest integrity summary
// Public — no auth required
// ──────────────────────────────────────────────
router.get('/candidates', async (req, res) => {
  try {
    const data = await getAllCandidates();
    return res.status(200).json(data);
  } catch (err) {
    console.error('GET /candidates error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/v1/candidates/:id/summary
// Full integrity breakdown for one candidate
// Public — no auth required
// ──────────────────────────────────────────────
router.get('/candidates/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'id must be a number' });
    }

    const data = await getCandidateSummary(Number(id));
    return res.status(200).json(data);
  } catch (err) {
    console.error('GET /candidates/:id/summary error:', err);
    // Distinguish between not found and server error
    if (err.message.includes('not found') || err.message.includes('No summary')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

module.exports = router;