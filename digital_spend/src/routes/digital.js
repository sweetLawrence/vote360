const express = require('express');
const multer = require('multer');
const { importDigitalSpend, getDigitalSpend } = require('../services/digitalSpend');

const router = express.Router();

// Multer — store file in memory so we can pass the buffer directly to the parser
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// ── Auth middleware — checks x-admin-key header ──
// function requireAdminKey(req, res, next) {
//   const key = req.headers['x-admin-key'];
//   if (!key || key !== process.env.ADMIN_KEY) {
//     return res.status(401).json({ error: 'Unauthorized — missing or invalid x-admin-key' });
//   }
//   next();
// }

// ──────────────────────────────────────────────
// POST /api/v1/digital/import
// Accepts a CSV file upload and imports digital spend records
// Requires: x-admin-key header
// ──────────────────────────────────────────────
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded — attach a CSV as form-data field "file"' });
    }

    const result = await importDigitalSpend(req.file.buffer);

    if (!result.success) {
      return res.status(422).json(result);
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error('POST /digital/import error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/v1/digital/:candidateId
// Returns aggregated digital spend for a candidate
// Public — no auth required
// ──────────────────────────────────────────────
router.get('/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;

    if (!candidateId || isNaN(Number(candidateId))) {
      return res.status(400).json({ error: 'candidateId must be a number' });
    }

    const data = await getDigitalSpend(candidateId);
    return res.status(200).json(data);
  } catch (err) {
    console.error('GET /digital/:candidateId error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

module.exports = router;