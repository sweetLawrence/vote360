require('dotenv').config();
const express = require('express');
const reconciliationRoutes = require('./routes/reconciliation');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'reconciliation-engine',
    timestamp: new Date().toISOString(),
  });
});

// Internal reconcile route
app.use('/internal', reconciliationRoutes);

// Public candidate read routes
app.use('/api/v1', reconciliationRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`Reconciliation Engine running on port ${PORT}`);
});

module.exports = app;