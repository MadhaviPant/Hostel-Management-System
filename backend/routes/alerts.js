// routes/alerts.js — Alerts, Notifications, Feedback, Analytics
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─────────────────────────────────────────────────────────────
//  GET /api/alerts
//  Fetch all alerts (optionally filtered by role and read status)
//  Query: ?role=worker|admin&unread=1
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { role, unread } = req.query;

  try {
    let where  = ['1=1'];
    let params = [];

    if (role === 'worker') {
      where.push("(a.target_role = 'worker' OR a.target_role = 'both')");
    } else if (role === 'admin') {
      where.push("(a.target_role = 'admin' OR a.target_role = 'both')");
    }

    if (unread === '1') {
      where.push('a.is_read = 0');
    }

    const [rows] = await db.query(
      `SELECT a.*, c.category, c.priority, c.status, c.deadline,
              s.full_name AS student_name, s.room_no
       FROM alerts a
       JOIN complaints c ON c.complaint_id = a.complaint_id
       JOIN users s ON s.user_id = c.student_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT 100`,
      params
    );

    res.json({ success: true, alerts: rows });
  } catch (err) {
    console.error('GET /alerts error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/alerts/check-deadlines
//  Called periodically by frontend (every 5 min) to auto-generate
//  Reminder and Delay alerts based on current time vs deadlines
// ─────────────────────────────────────────────────────────────
router.post('/check-deadlines', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Find complaints where deadline is within next 2 hours (Reminder)
    const [reminders] = await conn.query(
      `SELECT c.complaint_id, c.category, c.deadline
       FROM complaints c
       WHERE c.status NOT IN ('Resolved', 'Work Done')
         AND c.deadline IS NOT NULL
         AND NOW() < c.deadline
         AND TIMESTAMPDIFF(MINUTE, NOW(), c.deadline) <= 120
         AND c.complaint_id NOT IN (
           SELECT complaint_id FROM alerts
           WHERE alert_type = 'Reminder'
             AND created_at > DATE_SUB(NOW(), INTERVAL 3 HOUR)
         )`
    );

    for (const r of reminders) {
      const minutesLeft = Math.round(
        (new Date(r.deadline) - new Date()) / 60000
      );
      await conn.query(
        `INSERT INTO alerts (complaint_id, alert_type, target_role, message) VALUES (?, 'Reminder', 'worker', ?)`,
        [r.complaint_id, `⏰ Reminder: Complaint #${r.complaint_id} (${r.category}) deadline in ${minutesLeft} minutes.`]
      );
    }

    // Find overdue complaints that haven't been marked Delayed yet
    const [overdue] = await conn.query(
      `SELECT c.complaint_id, c.category, c.student_id
       FROM complaints c
       WHERE c.status NOT IN ('Resolved', 'Delayed')
         AND c.deadline IS NOT NULL
         AND NOW() > c.deadline
         AND c.complaint_id NOT IN (
           SELECT complaint_id FROM alerts
           WHERE alert_type = 'Delay'
             AND created_at > DATE_SUB(NOW(), INTERVAL 6 HOUR)
         )`
    );

    for (const o of overdue) {
      // Update status to Delayed
      await conn.query(
        "UPDATE complaints SET status = 'Delayed' WHERE complaint_id = ?",
        [o.complaint_id]
      );

      // Insert delay alert for both worker and admin
      await conn.query(
        `INSERT INTO alerts (complaint_id, alert_type, target_role, message) VALUES (?, 'Delay', 'both', ?)`,
        [o.complaint_id, `🚨 DELAY: Complaint #${o.complaint_id} (${o.category}) has crossed its deadline!`]
      );

      // Log status change
      await conn.query(
        `INSERT INTO status_history (complaint_id, changed_by, old_status, new_status, note)
         SELECT ?, student_id, status, 'Delayed', 'Auto-delayed: deadline exceeded'
         FROM complaints WHERE complaint_id = ?`,
        [o.complaint_id, o.complaint_id]
      );
    }

    await conn.commit();
    res.json({
      success: true,
      reminders_created: reminders.length,
      delayed_complaints: overdue.length
    });

  } catch (err) {
    await conn.rollback();
    console.error('check-deadlines error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/alerts/:id/read
//  Mark an alert as read
// ─────────────────────────────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    await db.query('UPDATE alerts SET is_read = 1 WHERE alert_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/alerts/notifications/:user_id
//  Student notifications (resolved complaint, etc.)
// ─────────────────────────────────────────────────────────────
router.get('/notifications/:user_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT n.*, c.category, c.status
       FROM notifications n
       JOIN complaints c ON c.complaint_id = n.complaint_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.params.user_id]
    );
    res.json({ success: true, notifications: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/alerts/notifications/:id/read
// ─────────────────────────────────────────────────────────────
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE notif_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/alerts/feedback
//  Student submits feedback for resolved complaint
//  Body: { complaint_id, student_id, rating, comment }
// ─────────────────────────────────────────────────────────────
router.post('/feedback', async (req, res) => {
  const { complaint_id, student_id, rating, comment } = req.body;

  if (!complaint_id || !student_id || !rating) {
    return res.status(400).json({ success: false, message: 'complaint_id, student_id, rating required' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
  }

  try {
    // Verify complaint is resolved and belongs to student
    const [rows] = await db.query(
      "SELECT complaint_id FROM complaints WHERE complaint_id = ? AND student_id = ? AND status = 'Resolved'",
      [complaint_id, student_id]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Complaint not found or not yet resolved'
      });
    }

    await db.query(
      'INSERT INTO feedback (complaint_id, student_id, rating, comment) VALUES (?, ?, ?, ?)',
      [complaint_id, student_id, rating, comment || null]
    );

    res.status(201).json({ success: true, message: 'Feedback submitted successfully' });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Feedback already submitted' });
    }
    console.error('Feedback error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/alerts/analytics/summary
//  Returns all data needed for analytics dashboard
// ─────────────────────────────────────────────────────────────
router.get('/analytics/summary', async (req, res) => {
  try {
    // Complaints by status
    const [byStatus] = await db.query(
      'SELECT status, COUNT(*) AS count FROM complaints GROUP BY status'
    );

    // Complaints by category
    const [byCategory] = await db.query(
      'SELECT category, COUNT(*) AS count FROM complaints GROUP BY category'
    );

    // Complaints by month (last 6 months)
    const [byMonth] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM complaints
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY month
       ORDER BY month ASC`
    );

    // Average resolution time (hours)
const [avgResolution] = await db.query(`
  SELECT 
    ROUND(
      AVG(
        CASE 
          WHEN resolved_at IS NOT NULL 
          THEN ABS(TIMESTAMPDIFF(MINUTE, created_at, resolved_at)) / 60
          ELSE NULL
        END
      ), 2
    ) AS avg_hours
  FROM complaints
  WHERE status = 'RESOLVED'
`);

    // Total counts
 const [totals] = await db.query(`
  SELECT 
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved,
    SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN UPPER(status) = 'DELAYED' THEN 1 ELSE 0 END) AS delayed_count,
    SUM(CASE WHEN status = 'IN PROGRESS' THEN 1 ELSE 0 END) AS in_progress
  FROM complaints
`);

    // Worker performance
    const [workerPerf] = await db.query(
      `SELECT u.full_name AS worker_name,
              COUNT(DISTINCT a.complaint_id) AS total_assigned,
              SUM(c.status = 'Resolved') AS resolved,
              ROUND(AVG(f.rating), 2) AS avg_rating
       FROM users u
       LEFT JOIN assignments a ON a.worker_id = u.user_id AND a.is_current = 1
       LEFT JOIN complaints c  ON c.complaint_id = a.complaint_id
       LEFT JOIN feedback f    ON f.complaint_id = c.complaint_id
       WHERE u.role = 'worker'
       GROUP BY u.user_id, u.full_name`
    );

    // Average feedback rating
    const [avgFeedback] = await db.query(
      'SELECT ROUND(AVG(rating), 2) AS avg_rating, COUNT(*) AS total FROM feedback'
    );

    res.json({
      success: true,
      data: {
        byStatus,
        byCategory,
        byMonth,
        avgResolutionHours: avgResolution[0]?.avg_hours || 0,
        totals: totals[0],
        workerPerformance: workerPerf,
        avgFeedback: avgFeedback[0]
      }
    });

  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
