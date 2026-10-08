// routes/complaints.js — Full CRUD + Status Flow + ML Classification
const express    = require('express');
const router     = express.Router();
const db         = require('../db');
const { classifyComplaint } = require('../ml/classifier');

// ─────────────────────────────────────────────────────────────
//  HELPER: log a status change into status_history
// ─────────────────────────────────────────────────────────────
async function logStatusChange(conn, complaint_id, changed_by, old_status, new_status, note = null) {
  await conn.query(
    `INSERT INTO status_history (complaint_id, changed_by, old_status, new_status, note)
     VALUES (?, ?, ?, ?, ?)`,
    [complaint_id, changed_by, old_status, new_status,
     note || `Status changed from ${old_status} to ${new_status}`]
  );
}

// ─────────────────────────────────────────────────────────────
//  HELPER: create a notification for a user
// ─────────────────────────────────────────────────────────────
async function createNotification(conn, user_id, complaint_id, message) {
  await conn.query(
    'INSERT INTO notifications (user_id, complaint_id, message) VALUES (?, ?, ?)',
    [user_id, complaint_id, message]
  );
}

// ─────────────────────────────────────────────────────────────
//  GET /api/complaints
//  Fetch all complaints (with optional filters)
//  Query params: ?status=&category=&student_id=&worker_id=
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { status, category, student_id, worker_id, page = 1, limit = 20 } = req.query;

  try {
    let where  = ['1=1'];
    let params = [];

    if (status)     { where.push('c.status = ?');             params.push(status); }
    if (category)   { where.push('c.category = ?');           params.push(category); }
    if (student_id) { where.push('c.student_id = ?');         params.push(student_id); }
    if (worker_id)  { where.push('a.worker_id = ?');          params.push(worker_id); }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const sql = `
      SELECT
        c.complaint_id, c.description, c.category, c.priority, c.status,
        c.predicted_time, c.final_time, c.deadline,
        c.created_at, c.updated_at, c.resolved_at, c.verified_at,
        s.full_name  AS student_name, s.room_no,
        w.full_name  AS worker_name, w.user_id AS worker_id,
        a.remarks,
        CASE
          WHEN c.deadline IS NOT NULL AND NOW() > c.deadline
               AND c.status NOT IN ('Resolved') THEN 1 ELSE 0
        END AS is_overdue
      FROM complaints c
      JOIN users s ON s.user_id = c.student_id
      LEFT JOIN assignments a ON a.complaint_id = c.complaint_id AND a.is_current = 1
      LEFT JOIN users w ON w.user_id = a.worker_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), offset);

    const [rows]  = await db.query(sql, params);

    // Count for pagination
    const countSql = `
      SELECT COUNT(*) AS total
      FROM complaints c
      LEFT JOIN assignments a ON a.complaint_id = c.complaint_id AND a.is_current = 1
      WHERE ${where.join(' AND ')}
    `;
    const [countRows] = await db.query(countSql, params.slice(0, -2));

    res.json({
      success: true,
      complaints: rows,
      total:      countRows[0].total,
      page:       parseInt(page),
      limit:      parseInt(limit)
    });

  } catch (err) {
    console.error('GET /complaints error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/complaints/:id
//  Get single complaint with full history
// ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, s.full_name AS student_name, s.room_no,
              w.full_name AS worker_name, a.remarks, a.worker_id,
              a.assigned_at
       FROM complaints c
       JOIN users s ON s.user_id = c.student_id
       LEFT JOIN assignments a ON a.complaint_id = c.complaint_id AND a.is_current = 1
       LEFT JOIN users w ON w.user_id = a.worker_id
       WHERE c.complaint_id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Fetch status history
    const [history] = await db.query(
      `SELECT sh.*, u.full_name AS changed_by_name
       FROM status_history sh
       JOIN users u ON u.user_id = sh.changed_by
       WHERE sh.complaint_id = ?
       ORDER BY sh.changed_at ASC`,
      [req.params.id]
    );

    // Fetch feedback if any
    const [feedback] = await db.query(
      'SELECT * FROM feedback WHERE complaint_id = ?',
      [req.params.id]
    );

    res.json({
      success: true,
      complaint: rows[0],
      history,
      feedback: feedback[0] || null
    });

  } catch (err) {
    console.error('GET /complaints/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/complaints
//  Student submits new complaint
//  Body: { student_id, description }
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { student_id, description } = req.body;

  if (!student_id || !description) {
    return res.status(400).json({ success: false, message: 'student_id and description required' });
  }

  try {
    // ML Classification
    const ml = classifyComplaint(description);

    const [result] = await db.query(
      `INSERT INTO complaints
         (student_id, description, category, priority, status, predicted_time)
       VALUES (?, ?, ?, ?, 'Pending', ?)`,
      [student_id, description, ml.category, ml.priority, ml.predicted_time]
    );

    const complaint_id = result.insertId;

    // Log initial status
    await db.query(
      `INSERT INTO status_history (complaint_id, changed_by, old_status, new_status, note)
       VALUES (?, ?, 'N/A', 'Pending', 'Complaint submitted by student')`,
      [complaint_id, student_id]
    );

    res.status(201).json({
      success: true,
      complaint_id,
      ml_result: {
        category:       ml.category,
        priority:       ml.priority,
        predicted_time: ml.predicted_time,
        confidence:     ml.confidence
      }
    });

  } catch (err) {
    console.error('POST /complaints error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/complaints/:id/classify
//  Re-run ML on existing complaint (for UI "re-detect" button)
// ─────────────────────────────────────────────────────────────
router.patch('/:id/classify', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT description FROM complaints WHERE complaint_id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false });

    const ml = classifyComplaint(rows[0].description);
    await db.query(
      'UPDATE complaints SET category = ?, priority = ?, predicted_time = ? WHERE complaint_id = ?',
      [ml.category, ml.priority, ml.predicted_time, req.params.id]
    );

    res.json({ success: true, ml_result: ml });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/complaints/:id/verify
//  Admin (Warden) verifies complaint
//  Body: { admin_id, final_time }
//  → Status: Pending → Verified
//  → Sets verified_at, final_time, deadline
// ─────────────────────────────────────────────────────────────
router.patch('/:id/verify', async (req, res) => {
  const { admin_id, final_time } = req.body;

  if (!admin_id) {
    return res.status(400).json({ success: false, message: 'admin_id required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM complaints WHERE complaint_id = ? FOR UPDATE',
      [req.params.id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = rows[0];
    if (complaint.status !== 'Pending') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: `Cannot verify complaint in status: ${complaint.status}` });
    }

    // Calculate deadline
    const resolvedFinalTime = final_time || complaint.predicted_time || 24;
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + parseFloat(resolvedFinalTime));

    await conn.query(
      `UPDATE complaints
       SET status = 'Verified', final_time = ?, deadline = ?, verified_at = NOW()
       WHERE complaint_id = ?`,
      [resolvedFinalTime, deadline, req.params.id]
    );

    await logStatusChange(conn, req.params.id, admin_id, 'Pending', 'Verified', 'Complaint verified by warden');

    await conn.commit();
    res.json({ success: true, message: 'Complaint verified successfully' });

  } catch (err) {
    await conn.rollback();
    console.error('Verify error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/complaints/:id/assign
//  Admin assigns a verified complaint to a worker
//  Body: { admin_id, worker_id }
//  → Status: Verified → Assigned
// ─────────────────────────────────────────────────────────────
router.patch('/:id/assign', async (req, res) => {
  const { admin_id, worker_id } = req.body;

  if (!admin_id || !worker_id) {
    return res.status(400).json({ success: false, message: 'admin_id and worker_id required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM complaints WHERE complaint_id = ? FOR UPDATE',
      [req.params.id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false });
    }

    const complaint = rows[0];
    if (complaint.status !== 'Verified') {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `Complaint must be Verified before assigning. Current: ${complaint.status}`
      });
    }

    // Mark existing assignment as not current
    await conn.query(
      'UPDATE assignments SET is_current = 0 WHERE complaint_id = ?',
      [req.params.id]
    );

    // Create new assignment
    await conn.query(
      'INSERT INTO assignments (complaint_id, worker_id, assigned_by) VALUES (?, ?, ?)',
      [req.params.id, worker_id, admin_id]
    );

    // Update complaint status
    await conn.query(
      "UPDATE complaints SET status = 'Assigned' WHERE complaint_id = ?",
      [req.params.id]
    );

    await logStatusChange(conn, req.params.id, admin_id, 'Verified', 'Assigned',
      `Assigned to worker ID ${worker_id}`);

    // Notify worker via alert
    await conn.query(
      `INSERT INTO alerts (complaint_id, alert_type, target_role, message)
       VALUES (?, 'Reminder', 'worker', ?)`,
      [req.params.id, `Complaint #${req.params.id} (${complaint.category}) has been assigned to you.`]
    );

    await conn.commit();
    res.json({ success: true, message: 'Complaint assigned successfully' });

  } catch (err) {
    await conn.rollback();
    console.error('Assign error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/complaints/:id/status
//  Worker updates status: Assigned → In Progress → Work Done
//  Body: { worker_id, status, remarks }
// ─────────────────────────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  const { worker_id, status, remarks } = req.body;

  // Workers can only set these statuses
  const ALLOWED_WORKER_STATUSES = ['In Progress', 'Work Done'];

  if (!worker_id || !status) {
    return res.status(400).json({ success: false, message: 'worker_id and status required' });
  }

  if (!ALLOWED_WORKER_STATUSES.includes(status)) {
    return res.status(403).json({
      success: false,
      message: `Workers can only set: ${ALLOWED_WORKER_STATUSES.join(', ')}`
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT c.*, a.worker_id AS assigned_worker
       FROM complaints c
       LEFT JOIN assignments a ON a.complaint_id = c.complaint_id AND a.is_current = 1
       WHERE c.complaint_id = ? FOR UPDATE`,
      [req.params.id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false });
    }

    const complaint = rows[0];

    // Verify this worker is assigned
    if (parseInt(complaint.assigned_worker) !== parseInt(worker_id)) {
      await conn.rollback();
      return res.status(403).json({ success: false, message: 'You are not assigned to this complaint' });
    }

    // Validate transition
    const validTransitions = {
      'Assigned':    ['In Progress'],
      'In Progress': ['Work Done'],
      'Delayed':     ['In Progress', 'Work Done'] // allow recovery from delayed
    };

    if (!validTransitions[complaint.status]?.includes(status)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${complaint.status} to ${status}`
      });
    }

    const oldStatus = complaint.status;

    await conn.query(
      'UPDATE complaints SET status = ? WHERE complaint_id = ?',
      [status, req.params.id]
    );

    // Update remarks if provided
    if (remarks) {
      await conn.query(
        'UPDATE assignments SET remarks = ? WHERE complaint_id = ? AND is_current = 1',
        [remarks, req.params.id]
      );
    }

    await logStatusChange(conn, req.params.id, worker_id, oldStatus, status, remarks || null);

    await conn.commit();
    res.json({ success: true, message: `Status updated to ${status}` });

  } catch (err) {
    await conn.rollback();
    console.error('Status update error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/complaints/:id/resolve
//  Admin marks complaint as Resolved (FINAL)
//  Body: { admin_id }
//  → Status: Work Done → Resolved
//  → Creates student notification
// ─────────────────────────────────────────────────────────────
router.patch('/:id/resolve', async (req, res) => {
  const { admin_id } = req.body;

  if (!admin_id) {
    return res.status(400).json({ success: false, message: 'admin_id required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM complaints WHERE complaint_id = ? FOR UPDATE',
      [req.params.id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false });
    }

    const complaint = rows[0];

    if (complaint.status !== 'Work Done') {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: `Complaint must be in 'Work Done' status to resolve. Current: ${complaint.status}`
      });
    }

    await conn.query(
      "UPDATE complaints SET status = 'Resolved', resolved_at = NOW() WHERE complaint_id = ?",
      [req.params.id]
    );

    await logStatusChange(conn, req.params.id, admin_id, 'Work Done', 'Resolved',
      'Complaint verified and resolved by warden');

    // Create student notification
    await createNotification(
      conn,
      complaint.student_id,
      req.params.id,
      `Your complaint #${req.params.id} (${complaint.category}) has been resolved. Please submit your feedback.`
    );

    await conn.commit();
    res.json({ success: true, message: 'Complaint marked as Resolved' });

  } catch (err) {
    await conn.rollback();
    console.error('Resolve error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/complaints/:id
//  Admin deletes complaint (with confirmation)
//  Body: { admin_id }
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { admin_id } = req.body;

  if (!admin_id) {
    return res.status(400).json({ success: false, message: 'admin_id required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT complaint_id FROM complaints WHERE complaint_id = ?',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Cascade delete handles assignments, history, feedback, alerts, notifications
    await db.query('DELETE FROM complaints WHERE complaint_id = ?', [req.params.id]);

    res.json({ success: true, message: 'Complaint deleted successfully' });

  } catch (err) {
    console.error('DELETE /complaints/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
