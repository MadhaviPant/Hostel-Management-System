// server.js — Express Entry Point
const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ───────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/alerts',     require('./routes/alerts'));

// ML classify endpoint (standalone for real-time UI feedback)
const { classifyComplaint } = require('./ml/classifier');
app.post('/api/ml/classify', (req, res) => {
  const { description } = req.body;
  if (!description) {
    return res.status(400).json({ success: false, message: 'description required' });
  }
  const result = classifyComplaint(description);
  res.json({ success: true, ...result });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Catch-all: serve frontend index
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hostel CMS running at http://localhost:${PORT}`);
  console.log(`API Base: http://localhost:${PORT}/api`);
});
const axios = require('axios');

app.post('/api/ml/predict', async (req, res) => {
  try {
    const response = await axios.post('http://127.0.0.1:5000/predict', {
      text: req.body.description
    });

    res.json(response.data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ML server error' });
  }
});