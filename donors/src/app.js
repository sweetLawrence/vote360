require('dotenv').config();
const express = require('express');
const donorRoutes = require('./routes/donors');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'donor-risk-service', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/v1/donors', donorRoutes);

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
  console.log(`Donor & Risk Service running on port ${PORT}`);
});

module.exports = app;