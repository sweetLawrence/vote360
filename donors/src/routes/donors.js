const express = require('express');
const multer = require('multer');
const { importDonors, getDonors } = require('../services/donors');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const isCSV = file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
    if (isCSV) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// function requireAdminKey(req, res, next) {
//   const key = req.headers['x-admin-key'];
//   if (!key || key !== process.env.ADMIN_KEY) {
//     return res.status(401).json({ error: 'Unauthorized — missing or invalid x-admin-key' });
//   }
//   next();
// }

// ──────────────────────────────────────────────
// POST /api/v1/donors/upload
// Accepts a CSV of donor declarations, scores risk, inserts to DB
// Requires: x-admin-key header
// Body: form-data, field "file" = CSV
// ──────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded — attach a CSV as form-data field "file"',
      });
    }

    const result = await importDonors(req.file.buffer);

    if (!result.success) {
      return res.status(422).json(result);
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error('POST /donors/upload error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/v1/donors/:candidateId
// Returns donor list with risk scores for a candidate
// Public — no auth required
// ──────────────────────────────────────────────
router.get('/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;

    if (!candidateId || isNaN(Number(candidateId))) {
      return res.status(400).json({ error: 'candidateId must be a number' });
    }

    const data = await getDonors(candidateId);
    return res.status(200).json(data);
  } catch (err) {
    console.error('GET /donors/:candidateId error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

module.exports = router;