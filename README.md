# 🏠 Smart Hostel Complaint Management System

A full-stack web application for managing hostel complaints with ML-based classification, role-based dashboards, and a real-world status workflow.

---

## 📁 Folder Structure

```
hostel_cms/
├── backend/
│   ├── server.js              # Express entry point
│   ├── db.js                  # MySQL connection pool
│   ├── package.json
│   ├── .env.example           # Copy to .env and configure
│   ├── ml/
│   │   └── classifier.js      # Keyword-based ML classifier
│   └── routes/
│       ├── auth.js            # Login, register, workers list
│       ├── complaints.js      # Full CRUD + status flow
│       └── alerts.js          # Alerts, notifications, feedback, analytics
├── frontend/
│   ├── index.html             # Single-page application
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js             # All frontend logic
└── hostel_cms_schema.sql      # MySQL schema (from previous step)
```

---

## ⚙️ Prerequisites

- Node.js v18+ ([nodejs.org](https://nodejs.org))
- MySQL 8.0+ (running locally)
- A browser (Chrome/Firefox recommended)

---

## 🚀 Steps to Run Locally

### Step 1: Set up the Database

```sql
-- In MySQL Workbench or terminal:
mysql -u root -p < hostel_cms_schema.sql
```

This creates the `hostel_cms` database with all tables, triggers, stored procedures, views, and sample data.

### Step 2: Configure Backend

```bash
cd backend

# Copy environment file
cp .env.example .env

# Edit .env with your MySQL credentials:
# DB_HOST=localhost
# DB_USER=root
# DB_PASSWORD=your_password
# DB_NAME=hostel_cms
# PORT=3000
```

### Step 3: Install Dependencies & Start Backend

```bash
cd backend
npm install
npm start
```

You should see:
```
✅ MySQL connected successfully
🚀 Hostel CMS running at http://localhost:3000
```

### Step 4: Open Frontend

Just open your browser and go to:
```
http://localhost:3000
```

The Express server serves the frontend automatically.

---

## 🔐 Demo Login Credentials

| Role    | Email                        | Password    |
|---------|------------------------------|-------------|
| Admin   | warden@hostel.edu            | password123 |
| Worker  | suresh.worker@hostel.edu     | password123 |
| Worker  | ravi.worker@hostel.edu       | password123 |
| Student | ankit@student.edu            | password123 |
| Student | neha@student.edu             | password123 |

---

## 🔄 Status Flow

```
Student submits → Pending
       ↓
Warden verifies → Verified  (sets deadline)
       ↓
Warden assigns worker → Assigned
       ↓
Worker starts → In Progress
       ↓
Worker finishes → Work Done
       ↓
Warden confirms → Resolved  (student notified)
```

**Rules:**
- Worker can ONLY set: In Progress, Work Done
- ONLY Admin can mark: Resolved
- Deadline crossed → auto-Delayed (via trigger + API)

---

## 🤖 ML Classification

**Input:** Complaint description text

**Process:**
1. Tokenize text → lowercase words
2. Score each category using weighted keyword dictionary
3. Pick category with highest score
4. Determine priority using rule-based keyword matching
5. Predict resolution time using category+priority matrix

**Output:** `{ category, priority, predicted_time, confidence }`

**Categories:** Electrical, Plumbing, WiFi, Housekeeping, Other

**Priority:** High, Medium, Low

**Test Examples:**
- "fan not working" → Electrical, High, 4hrs
- "water leakage from bathroom tap" → Plumbing, High, 4hrs
- "wifi is very slow cannot attend class" → WiFi, Medium, 12hrs
- "room not cleaned for 3 days" → Housekeeping, Low, 12hrs

---

## 📡 API Reference

### Auth
| Method | Endpoint             | Description          |
|--------|---------------------|----------------------|
| POST   | /api/auth/login     | Login                |
| POST   | /api/auth/register  | Student registration |
| GET    | /api/auth/workers   | List all workers     |

### Complaints
| Method | Endpoint                          | Description            |
|--------|----------------------------------|------------------------|
| GET    | /api/complaints                  | List (with filters)    |
| GET    | /api/complaints/:id              | Single complaint       |
| POST   | /api/complaints                  | Submit complaint       |
| PATCH  | /api/complaints/:id/verify       | Warden verify          |
| PATCH  | /api/complaints/:id/assign       | Assign worker          |
| PATCH  | /api/complaints/:id/status       | Worker status update   |
| PATCH  | /api/complaints/:id/resolve      | Admin resolve          |
| DELETE | /api/complaints/:id              | Admin delete           |

### Alerts & Analytics
| Method | Endpoint                             | Description              |
|--------|-------------------------------------|--------------------------|
| GET    | /api/alerts                         | List alerts              |
| POST   | /api/alerts/check-deadlines         | Trigger deadline check   |
| GET    | /api/alerts/notifications/:user_id  | Student notifications    |
| POST   | /api/alerts/feedback                | Submit feedback          |
| GET    | /api/alerts/analytics/summary       | Analytics data           |

### ML
| Method | Endpoint          | Description           |
|--------|------------------|-----------------------|
| POST   | /api/ml/classify | Classify description  |

---

## 🗄️ Key Database Features (for viva)

### Triggers (4)
1. `trg_auto_delayed` — Auto-marks overdue complaints as Delayed
2. `trg_log_status_change` — Auto-logs every status change to history
3. `trg_set_resolved_at` — Auto-stamps resolved_at timestamp
4. `trg_student_notification_on_resolve` — Auto-notifies student on resolution

### Stored Procedures with Cursors (2)
- `CALL sp_worker_performance()` — Iterates workers, computes metrics
- `CALL sp_avg_resolution_by_category()` — Iterates categories, computes avg time

### Views (2)
- `vw_complaint_summary` — Joined complaint data for dashboards
- `vw_delayed_complaints` — Live view of overdue complaints

### Normalization
- All tables in **3NF**: no transitive dependencies, no redundancy
- Separate tables for users, complaints, assignments, history, feedback, alerts, notifications
- Proper FK constraints with CASCADE rules

---

## 🎓 DBMS Concepts Demonstrated

| Concept              | Where                                |
|---------------------|--------------------------------------|
| CREATE TABLE         | hostel_cms_schema.sql                |
| Primary & Foreign Keys| All 7 tables                        |
| NOT NULL + CHECK     | rating CHECK (1–5), all required cols|
| INDEX                | status, category, priority, deadline |
| INSERT (CRUD)        | POST /api/complaints                 |
| SELECT + JOIN        | GET /api/complaints (multi-join)     |
| UPDATE (CRUD)        | PATCH /api/complaints/:id/*          |
| DELETE (CRUD)        | DELETE /api/complaints/:id           |
| GROUP BY + AVG       | Analytics endpoint                   |
| TRIGGER              | 4 triggers in schema                 |
| CURSOR               | 2 stored procedures                  |
| TRANSACTION          | All multi-step operations            |
| VIEW                 | vw_complaint_summary, vw_delayed     |
| Normalization (3NF)  | Schema design                        |
| ML Classification    | ml/classifier.js                     |
