require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./models/database');
const routes = require('./routes');

const app = express();
const PORT = parseInt(process.env.PORT || '3010', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'admin-backend', time: new Date().toISOString() });
});

// Admin frontend — serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Init DB & start
initDatabase();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Admin Backend] Running on http://localhost:${PORT}`);
  console.log(`[Admin Backend] Admin panel: http://localhost:${PORT}`);
  console.log(`[Admin Backend] Default login: admin / admin123`);
});
