// js/app.js — Core application logic, API layer, routing
// ─────────────────────────────────────────────────────────────

const API = 'http://localhost:3000/api';
let currentUser  = null;
let alertCheckInterval = null;

// ── Utility ───────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast-msg toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function timeAgo(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400)return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function statusBadge(status) {
  const map = {
    'Pending':     'pending',
    'Verified':    'verified',
    'Assigned':    'assigned',
    'In Progress': 'inprogress',
    'Work Done':   'workdone',
    'Resolved':    'resolved',
    'Delayed':     'delayed'
  };
  const cls = map[status] || 'pending';
  return `<span class="badge badge-${cls}">${status}</span>`;
}

function categoryBadge(cat) {
  const cls = (cat || 'Other').toLowerCase().replace(/\s+/g, '');
  return `<span class="badge badge-${cls}">${cat}</span>`;
}

function priorityBadge(p) {
  return `<span class="badge badge-${(p||'').toLowerCase()}">${p}</span>`;
}

// ── API Layer ─────────────────────────────────────────────────
async function api(method, path, body) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(API + path, opts);
    const data = await res.json();
    return data;
  } catch (err) {
    toast('Network error. Is the server running?', 'error');
    console.error(err);
    return { success: false };
  }
}

// ── Auth ──────────────────────────────────────────────────────
async function login() {
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) { toast('Enter email and password', 'error'); return; }

  const res = await api('POST', '/auth/login', { email, password });
  if (!res.success) {
    toast(res.message || 'Login failed', 'error');
    return;
  }

  currentUser = res.user;
  localStorage.setItem('hostel_user', JSON.stringify(currentUser));
  startApp();
}

async function register() {
  const full_name = document.getElementById('reg-name').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-pass').value;
  const room_no   = document.getElementById('reg-room').value.trim();
  const phone     = document.getElementById('reg-phone').value.trim();

  if (!full_name || !email || !password || !room_no) {
    toast('All fields required', 'error'); return;
  }

  const res = await api('POST', '/auth/register', { full_name, email, password, room_no, phone });
  if (!res.success) { toast(res.message || 'Registration failed', 'error'); return; }

  toast('Registered! Please login.', 'success');
  showLoginForm();
}

function logout() {
  currentUser = null;
  localStorage.removeItem('hostel_user');
  clearInterval(alertCheckInterval);
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-page').style.display = 'flex';
}

// ── App Bootstrap ─────────────────────────────────────────────
function startApp() {
  document.getElementById('login-page').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';

  // Populate sidebar user info
  document.getElementById('sidebar-user-name').textContent = currentUser.full_name;
  document.getElementById('sidebar-user-role').textContent = currentUser.role;
  if (currentUser.room_no) {
    document.getElementById('sidebar-user-role').textContent =
      `${currentUser.role} · Room ${currentUser.room_no}`;
  }

  // Show/hide role-specific nav items
  document.querySelectorAll('[data-role]').forEach(el => {
    const roles = el.dataset.role.split(',');
    el.style.display = roles.includes(currentUser.role) ? '' : 'none';
  });

  // Navigate to default page based on role
  const defaultPages = { student: 'student-home', admin: 'admin-home', worker: 'worker-home' };
  navigateTo(defaultPages[currentUser.role] || 'student-home');

  // Start periodic alert check (every 5 minutes)
  checkAlerts();
  alertCheckInterval = setInterval(checkAlerts, 5 * 60 * 1000);

  // Load notifications
  if (currentUser.role === 'student') loadNotifications();
}

// ── Navigation ────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`[data-nav="${page}"]`);
  if (navEl) navEl.classList.add('active');

  // Update topbar title
  const titles = {
    'student-home':   'My Dashboard',
    'student-complaints': 'My Complaints',
    'student-alerts': 'Notifications',
    'admin-home':     'Admin Dashboard',
    'admin-complaints': 'All Complaints',
    'admin-analytics': 'Analytics',
    'admin-alerts':   'Alerts',
    'worker-home':    'My Tasks',
    'worker-alerts':  'My Alerts'
  };
  document.getElementById('topbar-title').textContent = titles[page] || 'Dashboard';

  // Load page data
  const loaders = {
    'student-home':       loadStudentDashboard,
    'student-complaints': loadStudentComplaints,
    'student-alerts':     loadNotifications,
    'admin-home':         loadAdminDashboard,
    'admin-complaints':   loadAdminComplaints,
    'admin-analytics':    loadAnalytics,
    'admin-alerts':       loadAdminAlerts,
    'worker-home':        loadWorkerDashboard,
    'worker-alerts':      () => loadAdminAlerts('worker')
  };

  loaders[page]?.();
}

// ── Login UI Toggling ─────────────────────────────────────────
function showRegisterForm() {
  document.getElementById('login-form-wrap').style.display = 'none';
  document.getElementById('register-form-wrap').style.display = 'block';
}

function showLoginForm() {
  document.getElementById('login-form-wrap').style.display = 'block';
  document.getElementById('register-form-wrap').style.display = 'none';
}

// ── ML Classify on-the-fly ────────────────────────────────────
let classifyTimeout;
async function onDescriptionInput(val) {
  clearTimeout(classifyTimeout);
  if (val.trim().length < 10) {
    document.getElementById('ml-result').style.display = 'none';
    return;
  }
  classifyTimeout = setTimeout(async () => {
    const res = await api('POST', '/ml/classify', { description: val });
    if (res.success) {
      document.getElementById('ml-category').textContent = res.category;
      document.getElementById('ml-priority').textContent = res.priority;
      document.getElementById('ml-time').textContent     = res.predicted_time + ' hrs';
      document.getElementById('ml-conf').textContent     = res.confidence + '%';
      document.getElementById('ml-result').style.display = 'flex';
    }
  }, 400);
}
function predictCategory(text) {
  fetch('/api/ml/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: text })
  })
  .then(res => res.json())
  .then(data => {
    console.log("ML Prediction:", data.category);

    // 👇 THIS IS IMPORTANT
    document.getElementById("category").value = data.category;
  })
  .catch(err => console.error(err));
}
// ── Submit Complaint ──────────────────────────────────────────
async function submitComplaint() {
  const description = document.getElementById('complaint-desc').value.trim();
  if (!description || description.length < 10) {
    toast('Please describe the issue in detail (min 10 chars)', 'error');
    return;
  }

  const res = await api('POST', '/complaints', {
    student_id:  currentUser.user_id,
    description
  });

  if (!res.success) { toast('Failed to submit complaint', 'error'); return; }

  toast(`Complaint submitted! Category: ${res.ml_result.category} | Priority: ${res.ml_result.priority}`, 'success');
  document.getElementById('complaint-desc').value = '';
  document.getElementById('ml-result').style.display = 'none';
  loadStudentComplaints();
  loadStudentDashboard();
}

// ─────────────────────────────────────────────────────────────
//  STUDENT
// ─────────────────────────────────────────────────────────────
async function loadStudentDashboard() {
  const res = await api('GET', `/complaints?student_id=${currentUser.user_id}&limit=100`);
  if (!res.success) return;

  const complaints = res.complaints;
  const counts = { total: complaints.length, resolved: 0, pending: 0, delayed: 0 };
  complaints.forEach(c => {
    if (c.status === 'Resolved') counts.resolved++;
    if (c.status === 'Pending')  counts.pending++;
    if (c.status === 'Delayed')  counts.delayed++;
  });

  document.getElementById('s-total').textContent    = counts.total;
  document.getElementById('s-resolved').textContent = counts.resolved;
  document.getElementById('s-pending').textContent  = counts.pending;
  document.getElementById('s-delayed').textContent  = counts.delayed;

  // Recent complaints
  const tbody = document.getElementById('s-recent-tbody');
  if (complaints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📋</div><p>No complaints yet</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = complaints.slice(0, 5).map(c => `
    <tr class="${c.is_overdue ? 'overdue-row' : ''}">
      <td class="text-mono">#${c.complaint_id}</td>
      <td>${categoryBadge(c.category)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${c.description}">${c.description}</td>
      <td>${statusBadge(c.status)}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td class="text-muted">${timeAgo(c.created_at)}</td>
    </tr>
  `).join('');
}

async function loadStudentComplaints() {
  const res = await api('GET', `/complaints?student_id=${currentUser.user_id}&limit=50`);
  if (!res.success) return;

  renderStudentComplaintsTable(res.complaints);
}

function renderStudentComplaintsTable(complaints) {
  const tbody = document.getElementById('s-complaints-tbody');
  if (complaints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><p>No complaints found</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = complaints.map(c => `
    <tr class="${c.is_overdue ? 'overdue-row' : ''}">
      <td class="text-mono">#${c.complaint_id}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${c.description}">${c.description}</td>
      <td>${categoryBadge(c.category)}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${statusBadge(c.status)}</td>
      <td class="text-muted">${formatDate(c.created_at)}</td>
      <td>
        ${c.status === 'Resolved' ? `<button class="btn btn-sm btn-secondary" onclick="openFeedbackModal(${c.complaint_id})">⭐ Feedback</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function loadNotifications() {
  const res = await api('GET', `/alerts/notifications/${currentUser.user_id}`);
  if (!res.success) return;

  const container = document.getElementById('notif-container');
  const unread    = res.notifications.filter(n => !n.is_read).length;

  // Update badge
  const dot = document.getElementById('notif-dot');
  if (dot) dot.classList.toggle('active', unread > 0);

  if (res.notifications.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><p>No notifications yet</p></div>`;
    return;
  }

  container.innerHTML = res.notifications.map(n => `
    <div class="alert-item notif ${n.is_read ? 'read' : ''}" onclick="markNotifRead(${n.notif_id}, this)">
      <div class="alert-icon">🔔</div>
      <div class="alert-text">
        <div class="alert-msg">${n.message}</div>
        <div class="alert-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>
  `).join('');
}

async function markNotifRead(id, el) {
  await api('PATCH', `/alerts/notifications/${id}/read`);
  el.classList.add('read');
  loadNotifications();
}

// ── Feedback Modal ────────────────────────────────────────────
function openFeedbackModal(complaint_id) {
  document.getElementById('feedback-complaint-id').value = complaint_id;
  document.getElementById('feedback-rating').value = '';
  document.getElementById('feedback-comment').value = '';
  document.getElementById('modal-feedback').classList.add('open');
}

async function submitFeedback() {
  const complaint_id = document.getElementById('feedback-complaint-id').value;
  const rating       = parseInt(document.getElementById('feedback-rating').value);
  const comment      = document.getElementById('feedback-comment').value;

  if (!rating || rating < 1 || rating > 5) { toast('Please select a rating (1–5)', 'error'); return; }

  const res = await api('POST', '/alerts/feedback', {
    complaint_id, student_id: currentUser.user_id, rating, comment
  });

  if (!res.success) { toast(res.message || 'Error submitting feedback', 'error'); return; }
  toast('Feedback submitted! Thank you.', 'success');
  closeModal('modal-feedback');
  loadStudentComplaints();
}

// ─────────────────────────────────────────────────────────────
//  ADMIN
// ─────────────────────────────────────────────────────────────
async function loadAdminDashboard() {
  const [complaints, analytics] = await Promise.all([
    api('GET', '/complaints?limit=100'),
    api('GET', '/alerts/analytics/summary')
  ]);

  if (complaints.success) {
    const c = complaints.complaints;
    const counts = { total: c.length, pending: 0, verified: 0, delayed: 0, resolved: 0 };
    c.forEach(x => {
      if (x.status === 'Pending')  counts.pending++;
      if (x.status === 'Verified') counts.verified++;
      if (x.status === 'Delayed')  counts.delayed++;
      if (x.status === 'Resolved') counts.resolved++;
    });

    document.getElementById('a-total').textContent    = counts.total;
    document.getElementById('a-pending').textContent  = counts.pending;
    document.getElementById('a-verified').textContent = counts.verified;
    document.getElementById('a-delayed').textContent  = counts.delayed;
    document.getElementById('a-resolved').textContent = counts.resolved;

    // Recent table
    const tbody = document.getElementById('a-recent-tbody');
    tbody.innerHTML = c.slice(0, 8).map(x => adminComplaintRow(x, true)).join('') ||
      `<tr><td colspan="7"><div class="empty-state"><p>No complaints</p></div></td></tr>`;
  }
}

async function loadAdminComplaints() {
  const status   = document.getElementById('filter-status')?.value   || '';
  const category = document.getElementById('filter-category')?.value || '';
  const search   = document.getElementById('filter-search')?.value   || '';

  let url = '/complaints?limit=50';
  if (status)   url += `&status=${encodeURIComponent(status)}`;
  if (category) url += `&category=${encodeURIComponent(category)}`;

  const res = await api('GET', url);
  if (!res.success) return;

  let complaints = res.complaints;
  if (search) {
    const q = search.toLowerCase();
    complaints = complaints.filter(c =>
      c.description.toLowerCase().includes(q) ||
      c.student_name?.toLowerCase().includes(q) ||
      (c.room_no || '').toLowerCase().includes(q) ||
      String(c.complaint_id).includes(q)
    );
  }

  const tbody = document.getElementById('a-complaints-tbody');
  tbody.innerHTML = complaints.length === 0
    ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🔍</div><p>No complaints found</p></div></td></tr>`
    : complaints.map(c => adminComplaintRow(c, false)).join('');
}

function adminComplaintRow(c, compact) {
  const deadline  = c.deadline ? `<span class="text-mono" style="font-size:11px">${formatDate(c.deadline)}</span>` : '—';
  const actionBtns = compact ? '' : `
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${c.status === 'Pending' ? `<button class="btn btn-sm btn-primary" onclick="openVerifyModal(${c.complaint_id}, ${c.predicted_time || 12})">✅ Verify</button>` : ''}
      ${c.status === 'Verified' ? `<button class="btn btn-sm btn-warning" onclick="openAssignModal(${c.complaint_id})">👷 Assign</button>` : ''}
      ${c.status === 'Work Done' ? `<button class="btn btn-sm btn-success" onclick="resolveComplaint(${c.complaint_id})">✔ Resolve</button>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="openDetailModal(${c.complaint_id})">👁</button>
      <button class="btn btn-sm btn-danger" onclick="deleteComplaint(${c.complaint_id})">🗑</button>
    </div>
  `;

  return `
    <tr class="${c.is_overdue ? 'overdue-row' : ''}">
      <td class="text-mono">#${c.complaint_id}</td>
      <td>
        <div class="fw-600">${c.student_name}</div>
        <div class="text-muted">Room ${c.room_no || '—'}</div>
      </td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${c.description}">${c.description}</td>
      <td>${categoryBadge(c.category)}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${statusBadge(c.status)}</td>
      ${compact ? `<td class="text-muted">${timeAgo(c.created_at)}</td>` : `<td>${deadline}</td>`}
      ${compact ? '' : `<td>${actionBtns}</td>`}
    </tr>
  `;
}

// ── Verify Modal ──────────────────────────────────────────────
function openVerifyModal(complaint_id, predicted) {
  document.getElementById('verify-complaint-id').value = complaint_id;
  document.getElementById('verify-final-time').value   = predicted || 12;
  document.getElementById('modal-verify').classList.add('open');
}

async function verifyComplaint() {
  const complaint_id = document.getElementById('verify-complaint-id').value;
  const final_time   = document.getElementById('verify-final-time').value;

  const res = await api('PATCH', `/complaints/${complaint_id}/verify`, {
    admin_id: currentUser.user_id,
    final_time: parseFloat(final_time) || 12
  });

  if (!res.success) { toast(res.message || 'Error', 'error'); return; }
  toast('Complaint verified successfully', 'success');
  closeModal('modal-verify');
  loadAdminComplaints();
  loadAdminDashboard();
}

// ── Assign Modal ──────────────────────────────────────────────
async function openAssignModal(complaint_id) {
  document.getElementById('assign-complaint-id').value = complaint_id;

  // Load workers
  const res = await api('GET', '/auth/workers');
  const select = document.getElementById('assign-worker-select');
  if (res.success) {
    select.innerHTML = `<option value="">— Select Worker —</option>` +
      res.workers.map(w => `<option value="${w.user_id}">${w.full_name}</option>`).join('');
  }

  document.getElementById('modal-assign').classList.add('open');
}

async function assignWorker() {
  const complaint_id = document.getElementById('assign-complaint-id').value;
  const worker_id    = document.getElementById('assign-worker-select').value;

  if (!worker_id) { toast('Please select a worker', 'error'); return; }

  const res = await api('PATCH', `/complaints/${complaint_id}/assign`, {
    admin_id: currentUser.user_id,
    worker_id: parseInt(worker_id)
  });

  if (!res.success) { toast(res.message || 'Error', 'error'); return; }
  toast('Worker assigned successfully', 'success');
  closeModal('modal-assign');
  loadAdminComplaints();
  loadAdminDashboard();
}

async function resolveComplaint(complaint_id) {
  if (!confirm('Mark this complaint as Resolved?')) return;

  const res = await api('PATCH', `/complaints/${complaint_id}/resolve`, {
    admin_id: currentUser.user_id
  });

  if (!res.success) { toast(res.message || 'Error', 'error'); return; }
  toast('Complaint resolved!', 'success');
  loadAdminComplaints();
  loadAdminDashboard();
}

async function deleteComplaint(complaint_id) {
  if (!confirm(`Delete complaint #${complaint_id}? This cannot be undone.`)) return;

  const res = await api('DELETE', `/complaints/${complaint_id}`, {
    admin_id: currentUser.user_id
  });

  if (!res.success) { toast(res.message || 'Error', 'error'); return; }
  toast('Complaint deleted', 'info');
  loadAdminComplaints();
  loadAdminDashboard();
}

// ── Detail Modal ──────────────────────────────────────────────
async function openDetailModal(complaint_id) {
  const res = await api('GET', `/complaints/${complaint_id}`);
  if (!res.success) return;

  const c  = res.complaint;
  const el = document.getElementById('modal-detail-body');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><div class="text-muted" style="font-size:11px;font-weight:700;text-transform:uppercase">Student</div><div class="fw-600">${c.student_name}</div><div class="text-muted">Room ${c.room_no || '—'}</div></div>
      <div><div class="text-muted" style="font-size:11px;font-weight:700;text-transform:uppercase">Status</div>${statusBadge(c.status)}</div>
      <div><div class="text-muted" style="font-size:11px;font-weight:700;text-transform:uppercase">Category</div>${categoryBadge(c.category)}</div>
      <div><div class="text-muted" style="font-size:11px;font-weight:700;text-transform:uppercase">Priority</div>${priorityBadge(c.priority)}</div>
      <div><div class="text-muted" style="font-size:11px;font-weight:700;text-transform:uppercase">Predicted Time</div>${c.predicted_time || '—'} hrs</div>
      <div><div class="text-muted" style="font-size:11px;font-weight:700;text-transform:uppercase">Final Time</div>${c.final_time || '—'} hrs</div>
      <div><div class="text-muted" style="font-size:11px;font-weight:700;text-transform:uppercase">Deadline</div>${formatDate(c.deadline)}</div>
      <div><div class="text-muted" style="font-size:11px;font-weight:700;text-transform:uppercase">Resolved At</div>${formatDate(c.resolved_at)}</div>
    </div>
    <div class="form-group-light">
      <label>Description</label>
      <div style="padding:10px;background:#F8FAFC;border-radius:6px;font-size:13px">${c.description}</div>
    </div>
    ${c.worker_name ? `<div class="form-group-light"><label>Assigned Worker</label><div class="fw-600">${c.worker_name}</div></div>` : ''}
    ${c.remarks     ? `<div class="form-group-light"><label>Worker Remarks</label><div style="padding:10px;background:#F8FAFC;border-radius:6px;font-size:13px">${c.remarks}</div></div>` : ''}
    <hr class="divider">
    <div class="fw-600" style="margin-bottom:10px">Status History</div>
    ${res.history.map(h => `
      <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:5px;flex-shrink:0"></div>
        <div>
          <div style="font-size:12px">${h.old_status} → <strong>${h.new_status}</strong> <span class="text-muted">by ${h.changed_by_name}</span></div>
          <div class="text-muted" style="font-size:11px">${formatDate(h.changed_at)}</div>
          ${h.note ? `<div style="font-size:11px;color:#64748B">${h.note}</div>` : ''}
        </div>
      </div>
    `).join('') || '<div class="text-muted">No history</div>'}
    ${res.feedback ? `
      <hr class="divider">
      <div class="fw-600" style="margin-bottom:8px">Student Feedback</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:20px">${'⭐'.repeat(res.feedback.rating)}</span>
        <span class="text-muted">${res.feedback.rating}/5</span>
      </div>
      ${res.feedback.comment ? `<div style="margin-top:6px;font-size:13px;font-style:italic">"${res.feedback.comment}"</div>` : ''}
    ` : ''}
  `;

  document.getElementById('modal-detail').classList.add('open');
}

// ─────────────────────────────────────────────────────────────
//  WORKER
// ─────────────────────────────────────────────────────────────
async function loadWorkerDashboard() {
  const res = await api('GET', `/complaints?worker_id=${currentUser.user_id}&limit=50`);
  if (!res.success) return;

  const complaints = res.complaints;
  let inProgress = 0, workDone = 0, resolved = 0, delayed = 0;
  complaints.forEach(c => {
    if (c.status === 'In Progress') inProgress++;
    if (c.status === 'Work Done')   workDone++;
    if (c.status === 'Resolved')    resolved++;
    if (c.status === 'Delayed')     delayed++;
  });

  document.getElementById('w-assigned').textContent   = complaints.length;
  document.getElementById('w-inprogress').textContent = inProgress;
  document.getElementById('w-workdone').textContent   = workDone;
  document.getElementById('w-resolved').textContent   = resolved;

  const tbody = document.getElementById('w-tasks-tbody');
  if (complaints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">✅</div><p>No tasks assigned yet</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = complaints.map(c => `
    <tr class="${c.is_overdue ? 'overdue-row' : ''}">
      <td class="text-mono">#${c.complaint_id}</td>
      <td>
        <div>${c.student_name}</div>
        <div class="text-muted">Room ${c.room_no || '—'}</div>
      </td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${c.description}">${c.description}</td>
      <td>${categoryBadge(c.category)}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${statusBadge(c.status)}</td>
      <td style="min-width:90px">
        ${c.is_overdue ? '<span class="badge badge-delayed">⚠ Overdue</span>' :
          (c.deadline ? `<span class="text-mono" style="font-size:11px">${formatDate(c.deadline)}</span>` : '—')}
      </td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${c.status === 'Assigned' || c.status === 'Delayed' ?
            `<button class="btn btn-sm btn-primary" onclick="updateWorkerStatus(${c.complaint_id}, 'In Progress')">▶ Start</button>` : ''}
          ${c.status === 'In Progress' ?
            `<button class="btn btn-sm btn-success" onclick="openRemarksModal(${c.complaint_id})">✅ Done</button>` : ''}
          ${(c.status === 'Resolved' || c.status === 'Work Done') ?
            `<span class="text-muted" style="font-size:12px">Awaiting warden</span>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function openRemarksModal(complaint_id) {
  document.getElementById('remarks-complaint-id').value = complaint_id;
  document.getElementById('remarks-text').value = '';
  document.getElementById('modal-remarks').classList.add('open');
}

async function submitWorkDone() {
  const complaint_id = document.getElementById('remarks-complaint-id').value;
  const remarks      = document.getElementById('remarks-text').value.trim();

  const res = await api('PATCH', `/complaints/${complaint_id}/status`, {
    worker_id: currentUser.user_id,
    status:    'Work Done',
    remarks:   remarks || 'Work completed.'
  });

  if (!res.success) { toast(res.message || 'Error', 'error'); return; }
  toast('Marked as Work Done! Awaiting warden verification.', 'success');
  closeModal('modal-remarks');
  loadWorkerDashboard();
}

async function updateWorkerStatus(complaint_id, status) {
  const res = await api('PATCH', `/complaints/${complaint_id}/status`, {
    worker_id: currentUser.user_id,
    status
  });

  if (!res.success) { toast(res.message || 'Error', 'error'); return; }
  toast(`Status updated to ${status}`, 'success');
  loadWorkerDashboard();
}

// ─────────────────────────────────────────────────────────────
//  ALERTS
// ─────────────────────────────────────────────────────────────
async function checkAlerts() {
  await api('POST', '/alerts/check-deadlines');
  loadAlertBadge();
}

async function loadAlertBadge() {
  const role = currentUser?.role;
  if (!role) return;
  const res  = await api('GET', `/alerts?role=${role}&unread=1`);
  if (!res.success) return;
  const cnt  = res.alerts.length;
  const badge = document.getElementById('alert-badge');
  if (badge) badge.textContent = cnt > 0 ? cnt : '';
}

async function loadAdminAlerts(forceRole) {
  const role = forceRole || currentUser.role;
  const res  = await api('GET', `/alerts?role=${role}`);
  if (!res.success) return;

  const container = document.getElementById(role === 'worker' ? 'worker-alerts-container' : 'admin-alerts-container');
  if (!container) return;

  if (res.alerts.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔕</div><p>No alerts</p></div>`;
    return;
  }

  container.innerHTML = res.alerts.map(a => `
    <div class="alert-item ${a.alert_type === 'Delay' ? 'delay' : 'reminder'} ${a.is_read ? 'read' : ''}"
         onclick="markAlertRead(${a.alert_id}, this)">
      <div class="alert-icon">${a.alert_type === 'Delay' ? '🚨' : '⏰'}</div>
      <div class="alert-text">
        <div class="alert-msg">${a.message}</div>
        <div class="alert-time">
          Room ${a.room_no} · ${a.student_name} · ${categoryBadge(a.category)} · ${timeAgo(a.created_at)}
        </div>
      </div>
      ${!a.is_read ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();markAlertRead(${a.alert_id},this.closest('.alert-item'))">✓</button>` : ''}
    </div>
  `).join('');
}

async function markAlertRead(id, el) {
  await api('PATCH', `/alerts/${id}/read`);
  el.classList.add('read');
  loadAlertBadge();
}

// ─────────────────────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────────────────────
let chartInstances = {};

async function loadAnalytics() {
  const res = await api('GET', '/alerts/analytics/summary');
  if (!res.success) return;
  const d   = res.data;

  // KPI cards
  document.getElementById('an-total').textContent    = d.totals.total || 0;
  document.getElementById('an-resolved').textContent = d.totals.resolved || 0;
  document.getElementById('an-delayed').textContent  = d.totals.delayed || 0;
  document.getElementById('an-avg-hrs').textContent  = (d.avgResolutionHours || 0) + 'h';
  document.getElementById('an-avg-rating').textContent =
    d.avgFeedback?.avg_rating ? d.avgFeedback.avg_rating + '/5' : '—';

  // Destroy previous charts
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};

  // Category bar chart
  const catCtx = document.getElementById('chart-category').getContext('2d');
  chartInstances.cat = new Chart(catCtx, {
    type: 'bar',
    data: {
      labels: d.byCategory.map(x => x.category),
      datasets: [{
        label: 'Complaints',
        data:  d.byCategory.map(x => x.count),
        backgroundColor: ['#3B82F6','#06B6D4','#8B5CF6','#10B981','#94A3B8'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });

  // Status pie chart
  const statusCtx = document.getElementById('chart-status').getContext('2d');
  const statusColors = {
    'Pending': '#94A3B8', 'Verified': '#8B5CF6', 'Assigned': '#F59E0B',
    'In Progress': '#3B82F6', 'Work Done': '#06B6D4', 'Resolved': '#10B981', 'Delayed': '#EF4444'
  };
  chartInstances.status = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: d.byStatus.map(x => x.status),
      datasets: [{
        data:            d.byStatus.map(x => x.count),
        backgroundColor: d.byStatus.map(x => statusColors[x.status] || '#94A3B8'),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } }
    }
  });

  // Trend line chart
  const trendCtx = document.getElementById('chart-trend').getContext('2d');
  chartInstances.trend = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: d.byMonth.map(x => x.month),
      datasets: [{
        label: 'Complaints',
        data:  d.byMonth.map(x => x.count),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59,130,246,.08)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#3B82F6',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });

  // Worker performance table
  const tbody = document.getElementById('worker-perf-tbody');
  tbody.innerHTML = d.workerPerformance.map(w => `
    <tr>
      <td class="fw-600">${w.worker_name}</td>
      <td>${w.total_assigned || 0}</td>
      <td>${w.resolved || 0}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;background:#E2E8F0;border-radius:10px;height:6px">
            <div style="width:${w.total_assigned > 0 ? Math.round((w.resolved/w.total_assigned)*100) : 0}%;background:#10B981;height:100%;border-radius:10px"></div>
          </div>
          <span style="font-size:12px">${w.total_assigned > 0 ? Math.round((w.resolved/w.total_assigned)*100) : 0}%</span>
        </div>
      </td>
      <td>${w.avg_rating ? '⭐ ' + w.avg_rating : '—'}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="text-muted">No data</td></tr>';
}

// ── Modal utilities ────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('hostel_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    startApp();
  }

  // Enter key on login
  document.getElementById('password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
});
