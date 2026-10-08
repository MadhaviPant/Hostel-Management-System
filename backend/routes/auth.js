// routes/auth.js — Login & session simulation (no JWT, session-based for simplicity)
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { success, user: { user_id, full_name, role, room_no, email } }
 *
 * Note: For a mini-project, we return user data directly.
 * Frontend stores it in localStorage and sends user_id in headers.
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];

    // For demo: accept plain password 'password123' or bcrypt hash match
    let valid = false;
    if (user.password_hash.startsWith('$2b$')) {
      valid = await bcrypt.compare(password, user.password_hash);
    } else {
      // Fallback for demo plain-text passwords
      valid = (password === user.password_hash || password === 'password123');
    }

    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    res.json({
      success: true,
      user: {
        user_id:   user.user_id,
        full_name: user.full_name,
        email:     user.email,
        role:      user.role,
        room_no:   user.room_no
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/auth/register
 * Body: { full_name, email, password, role, room_no, phone }
 * Allows students to self-register.
 */
router.post('/register', async (req, res) => {
  const { full_name, email, password, room_no, phone } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password required' });
  }

  try {
    const [existing] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'INSERT INTO users (full_name, email, password_hash, role, room_no, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [full_name, email, hash, 'student', room_no || null, phone || null]
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user_id: result.insertId
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/auth/workers
 * Returns list of workers (for admin dropdown)
 */
router.get('/workers', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT user_id, full_name, phone FROM users WHERE role = ? AND is_active = 1',
      ['worker']
    );
    res.json({ success: true, workers: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
