// src/index.js
require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const cron         = require('node-cron');
const pool         = require('./db/pool');
const emailService = require('./services/email');

const clientRoutes = require('./routes/client');
const adminRoutes  = require('./routes/admin');

app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'https://tax-portal-frontend-three.vercel.app',
    'https://tax-portal-frontend-git-main-the-ca.vercel.app',
    'http://localhost:3000',
  ],
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many uploads' } });
app.use('/api/', limiter);
app.use('/api/client/:token/upload', uploadLimiter);

// ── Routes
app.use('/api/client', clientRoutes);
app.use('/api/admin',  adminRoutes);

// Health check
app.get('/health', (req, res) => res.json({ ok: true, timestamp: new Date() }));

// ── Cron: daily reminder at 9 AM for stale clients (partial, no activity > 3 days)
cron.schedule('0 9 * * *', async () => {
  try {
    console.log('[CRON] Running daily reminder job...');
    const staleClients = await pool.query(`
      SELECT c.id, c.name, c.email, c.regime, c.unique_token,
             COUNT(cr.id) AS answered
      FROM clients c
      LEFT JOIN client_responses cr ON cr.client_id = c.id
      WHERE c.status = 'partial'
        AND c.email IS NOT NULL
        AND (c.last_activity IS NULL OR c.last_activity < NOW() - INTERVAL '3 days')
      GROUP BY c.id
    `);

    for (const client of staleClients.rows) {
      const portalUrl = `${process.env.FRONTEND_URL}/client/${client.unique_token}`;
      const itemCountRes = await pool.query(
        `SELECT COUNT(*) FROM checklist_items WHERE is_active=true AND ($1='old' OR is_deduction=false)`,
        [client.regime]
      );
      const total = parseInt(itemCountRes.rows[0].count);
      const done  = parseInt(client.answered);
      const pct   = Math.round((done / total) * 100);
      const pending = total - done;

      await emailService.sendClientReminder({
        clientName: client.name, clientEmail: client.email,
        portalUrl, pendingCount: pending, completionPct: pct,
      });
      console.log(`[CRON] Reminder sent to ${client.name}`);
    }
  } catch (err) {
    console.error('[CRON] Error:', err.message);
  }
}, { timezone: 'Asia/Kolkata' });

// ── Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max 50 MB)' });
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 Tax Portal API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
