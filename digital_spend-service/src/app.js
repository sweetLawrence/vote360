require('dotenv').config();
const express = require('express');
const digitalRoutes = require('./routes/digital');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'digital-spend-service', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/v1/digital', digitalRoutes);

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`Digital Spend Service running on port ${PORT}`);
});
