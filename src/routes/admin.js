// src/routes/admin.js
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { customAlphabet } = require('nanoid');
const pool    = require('../db/pool');
const email   = require('../services/email');
const { requireAdmin } = require('../middleware/auth');

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

// ── POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { emailAddr, password } = req.body;
    const userRes = await pool.query(
      `SELECT id, email, password_hash, name FROM admin_users WHERE email=$1`, [emailAddr]
    );
    if (!userRes.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = userRes.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, name: user.name, email: user.email });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE true)               AS total,
        COUNT(*) FILTER (WHERE status='complete')  AS complete,
        COUNT(*) FILTER (WHERE status='partial')   AS partial,
        COUNT(*) FILTER (WHERE status='pending')   AS pending
      FROM clients
    `);
    const fileCount = await pool.query(`SELECT COUNT(*) FROM uploaded_files`);
    res.json({ ...r.rows[0], files: fileCount.rows[0].count });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/clients
router.get('/clients', requireAdmin, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
    }
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const clientsRes = await pool.query(`
      SELECT c.id, c.name, c.email, c.phone, c.regime, c.status,
             c.financial_year, c.unique_token, c.last_activity, c.created_at,
             COUNT(DISTINCT cr.id) AS answered_count,
             COUNT(DISTINCT uf.id) AS file_count
      FROM clients c
      LEFT JOIN client_responses cr ON cr.client_id = c.id
      LEFT JOIN uploaded_files uf ON uf.client_id = c.id
      ${where}
      GROUP BY c.id
      ORDER BY c.last_activity DESC NULLS LAST, c.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const totalRes = await pool.query(
      `SELECT COUNT(*) FROM clients c ${where}`, params
    );

    const itemCounts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE true)             AS total_old,
        COUNT(*) FILTER (WHERE NOT is_deduction) AS total_new
      FROM checklist_items WHERE is_active=true
    `);
    const { total_old, total_new } = itemCounts.rows[0];

    const clients = clientsRes.rows.map(c => ({
      ...c,
      total_items: c.regime === 'old' ? parseInt(total_old) : parseInt(total_new),
      completion_pct: Math.round(
        (parseInt(c.answered_count) / (c.regime === 'old' ? parseInt(total_old) : parseInt(total_new))) * 100
      ) || 0,
    }));

    res.json({ clients, total: parseInt(totalRes.rows[0].count) });
  } catch (err) {
    console.error('Get clients error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/clients  → create client + generate link
router.post('/clients', requireAdmin, async (req, res) => {
  try {
    const { name, email: clientEmail, phone, pan, regime = 'new', financial_year = '2024-25', notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const token = nanoid();
    const result = await pool.query(
      `INSERT INTO clients (name, email, phone, pan, unique_token, regime, financial_year, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, clientEmail, phone, pan, token, regime, financial_year, notes]
    );
    const client = result.rows[0];
    const portalUrl = `${process.env.FRONTEND_URL}/client/${token}`;

    if (clientEmail) {
      email.sendClientWelcome({
        clientName: name, clientEmail, portalUrl, financialYear: financial_year,
      }).catch(e => console.error('Welcome email error:', e.message));
    }

    res.json({ client, portalUrl });
  } catch (err) {
    console.error('Create client error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/clients/:id  → full client detail
router.get('/clients/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const clientRes = await pool.query(`SELECT * FROM clients WHERE id=$1`, [id]);
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Not found' });
    const client = clientRes.rows[0];

    const responsesRes = await pool.query(
      `SELECT cr.item_id, cr.status, ci.label, ci.section_key, s.label as section_label
       FROM client_responses cr
       JOIN checklist_items ci ON ci.id = cr.item_id
       JOIN sections s ON s.key = ci.section_key
       WHERE cr.client_id = $1`, [id]
    );

    const filesRes = await pool.query(
      `SELECT uf.*, ci.label as item_label
       FROM uploaded_files uf
       JOIN checklist_items ci ON ci.id = uf.item_id
       WHERE uf.client_id=$1 ORDER BY uf.uploaded_at DESC`, [id]
    );

    const itemCounts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE true)             AS total_old,
        COUNT(*) FILTER (WHERE NOT is_deduction) AS total_new
      FROM checklist_items WHERE is_active=true
    `);
    const { total_old, total_new } = itemCounts.rows[0];
    const total = client.regime === 'old' ? parseInt(total_old) : parseInt(total_new);
    const done = responsesRes.rows.length;
    client.completion_pct = Math.round((done / total) * 100) || 0;

    const portalUrl = `${process.env.FRONTEND_URL}/client/${client.unique_token}`;
    res.json({ client, responses: responsesRes.rows, files: filesRes.rows, portalUrl });
  } catch (err) {
    console.error('Get client error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/admin/clients/:id  → update client
router.patch('/clients/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email: e, phone, pan, regime, notes } = req.body;
    await pool.query(
      `UPDATE clients SET name=COALESCE($1,name), email=COALESCE($2,email),
       phone=COALESCE($3,phone), pan=COALESCE($4,pan), regime=COALESCE($5,regime),
       notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$7`,
      [name, e, phone, pan, regime, notes, id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/admin/clients/:id
router.delete('/clients/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM clients WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/clients/:id/remind  → send reminder email
router.post('/clients/:id/remind', requireAdmin, async (req, res) => {
  try {
    const clientRes = await pool.query(`SELECT * FROM clients WHERE id=$1`, [req.params.id]);
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Not found' });
    const client = clientRes.rows[0];
    if (!client.email) return res.status(400).json({ error: 'Client has no email address on file' });

    const totalRes = await pool.query(
      `SELECT COUNT(*) FROM checklist_items WHERE is_active=true AND ($1='old' OR is_deduction=false)`,
      [client.regime]
    );
    const total = parseInt(totalRes.rows[0].count);

    const doneRes = await pool.query(
      `SELECT COUNT(*) FROM client_responses WHERE client_id=$1`, [client.id]
    );
    const done = parseInt(doneRes.rows[0].count);
    const completionPct = Math.round((done / total) * 100);
    const pendingCount = total - done;

    const portalUrl = `${process.env.FRONTEND_URL}/client/${client.unique_token}`;

    await email.sendClientReminder({
      clientName: client.name,
      clientEmail: client.email,
      portalUrl,
      pendingCount,
      completionPct,
    });

    console.log('Reminder sent to', client.email);
    res.json({ ok: true, message: 'Reminder sent to ' + client.email });
  } catch (err) {
    console.error('Reminder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
