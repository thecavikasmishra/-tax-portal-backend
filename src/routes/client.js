// src/routes/client.js
const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const pool    = require('../db/pool');
const drive   = require('../services/googleDrive');
const email   = require('../services/email');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter(req, file, cb) {
    const allowed = [
      'application/pdf',
      'image/jpeg','image/png','image/jpg',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

// ── GET /api/client/:token  → load client + all checklist items + saved responses
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const clientRes = await pool.query(
      `SELECT id, name, email, phone, regime, status, financial_year, notes
       FROM clients WHERE unique_token = $1`, [token]
    );
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Client not found' });
    const client = clientRes.rows[0];

    // All sections + items
    const itemsRes = await pool.query(
      `SELECT ci.id, ci.section_key, ci.label, ci.description,
              ci.is_deduction, ci.allows_multi, ci.sort_order,
              s.label as section_label, s.icon as section_icon, s.sort_order as section_order
       FROM checklist_items ci
       JOIN sections s ON s.key = ci.section_key
       WHERE ci.is_active = true
       ORDER BY s.sort_order, ci.sort_order`
    );

    // Saved responses for this client
    const responsesRes = await pool.query(
      `SELECT item_id, status FROM client_responses WHERE client_id = $1`, [client.id]
    );
    const responses = {};
    responsesRes.rows.forEach(r => { responses[r.item_id] = r.status; });

    // Uploaded files
    const filesRes = await pool.query(
      `SELECT item_id, original_name, drive_url, size_bytes, uploaded_at
       FROM uploaded_files WHERE client_id = $1 ORDER BY uploaded_at DESC`, [client.id]
    );
    const files = {};
    filesRes.rows.forEach(f => {
      if (!files[f.item_id]) files[f.item_id] = [];
      files[f.item_id].push(f);
    });

    res.json({ client, items: itemsRes.rows, responses, files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/client/:token/regime  → update tax regime
router.patch('/:token/regime', async (req, res) => {
  try {
    const { token } = req.params;
    const { regime } = req.body;
    if (!['old','new'].includes(regime)) return res.status(400).json({ error: 'Invalid regime' });

    await pool.query(
      `UPDATE clients SET regime=$1, updated_at=NOW() WHERE unique_token=$2`, [regime, token]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/client/:token/response  → save one item response
router.post('/:token/response', async (req, res) => {
  try {
    const { token } = req.params;
    const { item_id, status } = req.body;
    if (!['yes','pending','na'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const clientRes = await pool.query(`SELECT id FROM clients WHERE unique_token=$1`, [token]);
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Client not found' });
    const clientId = clientRes.rows[0].id;

    await pool.query(
      `INSERT INTO client_responses (client_id, item_id, status)
       VALUES ($1,$2,$3)
       ON CONFLICT (client_id, item_id) DO UPDATE SET status=$3, updated_at=NOW()`,
      [clientId, item_id, status]
    );

    // Update client activity + recalculate status
    await recalcClientStatus(clientId, token);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/client/:token/upload  → upload file to Google Drive
router.post('/:token/upload', upload.array('files', 20), async (req, res) => {
  try {
    const { token } = req.params;
    const { item_id } = req.body;

    const clientRes = await pool.query(
      `SELECT c.id, c.name, c.drive_folder_id FROM clients c WHERE c.unique_token=$1`, [token]
    );
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Client not found' });
    const client = clientRes.rows[0];

    // Get item label for subfolder name
    const itemRes = await pool.query(`SELECT label FROM checklist_items WHERE id=$1`, [item_id]);
    const itemLabel = itemRes.rows[0]?.label || 'General';

    // Get/create Google Drive folder for this client
    let folderId = client.drive_folder_id;
    if (!folderId) {
      folderId = await drive.getOrCreateClientFolder(client.name);
      await pool.query(`UPDATE clients SET drive_folder_id=$1 WHERE id=$2`, [folderId, client.id]);
    }

    const uploaded = [];
    for (const file of req.files) {
      const { driveFileId, driveUrl, driveFolderName } = await drive.uploadFile(
        folderId, itemLabel, file.buffer, file.originalname, file.mimetype
      );

      await pool.query(
        `INSERT INTO uploaded_files (client_id, item_id, original_name, drive_file_id, drive_url, drive_folder, size_bytes, mime_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [client.id, item_id, file.originalname, driveFileId, driveUrl, driveFolderName, file.size, file.mimetype]
      );

      // Auto-mark item as 'yes' when file is uploaded
      await pool.query(
        `INSERT INTO client_responses (client_id, item_id, status)
         VALUES ($1,$2,'yes') ON CONFLICT (client_id, item_id) DO UPDATE SET status='yes', updated_at=NOW()`,
        [client.id, item_id]
      );

      uploaded.push({ name: file.originalname, driveUrl, size: file.size });
    }

    await recalcClientStatus(client.id, token);

    // Notify admin
    const dashUrl = `${process.env.FRONTEND_URL}/admin/clients/${client.id}`;
    email.sendAdminNotification({
      clientName: client.name, action: 'upload',
      fileCount: req.files.length, dashboardUrl: dashUrl,
    }).catch(console.error);

    res.json({ ok: true, files: uploaded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ── POST /api/client/:token/submit  → final submission
router.post('/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    const { client_name } = req.body;

    const clientRes = await pool.query(
      `UPDATE clients SET name=COALESCE($1,name), status='complete', updated_at=NOW()
       WHERE unique_token=$2 RETURNING id, name, email`,
      [client_name, token]
    );
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Client not found' });
    const client = clientRes.rows[0];

    const dashUrl = `${process.env.FRONTEND_URL}/admin/clients/${client.id}`;
    email.sendAdminNotification({
      clientName: client.name, clientEmail: client.email,
      action: 'submit', dashboardUrl: dashUrl,
    }).catch(console.error);

    res.json({ ok: true, message: 'Submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helper: recalculate and update client status
async function recalcClientStatus(clientId, token) {
  const client2 = await pool.query(`SELECT regime FROM clients WHERE id=$1`, [clientId]);
  const regime = client2.rows[0]?.regime || 'new';

  const totalRes = await pool.query(
    `SELECT COUNT(*) FROM checklist_items WHERE is_active=true
     AND ($1='old' OR is_deduction=false)`, [regime]
  );
  const total = parseInt(totalRes.rows[0].count);

  const doneRes = await pool.query(
    `SELECT COUNT(*) FROM client_responses WHERE client_id=$1`, [clientId]
  );
  const done = parseInt(doneRes.rows[0].count);

  const newStatus = done === 0 ? 'pending' : done >= total ? 'complete' : 'partial';
  await pool.query(
    `UPDATE clients SET status=$1, last_activity=NOW(), updated_at=NOW() WHERE id=$2`,
    [newStatus, clientId]
  );
}

module.exports = router;
