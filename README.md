# 🏠 Smart Hostel Complaint Management System

A full-stack web application that digitizes hostel complaint management by providing **role-based dashboards, automated complaint classification, priority prediction, complaint tracking, deadline monitoring, and analytics**.

The system manages the complete complaint lifecycle — from submission by a student to verification, worker assignment, progress tracking, and final resolution.

---

## 🚀 Why This Project?

Traditional hostel complaint management often relies on registers, verbal communication, and manual follow-ups, making it difficult to track unresolved complaints and monitor response times.

This project provides a centralized system where students, wardens, and maintenance workers interact through clearly defined roles and workflows.

---

## ✨ Key Features

### 👨‍🎓 Student

- Register and log in
- Submit complaints
- Automatic category and priority detection
- Track complaint status
- View complaint history
- Receive resolution notifications
- Submit feedback and ratings

### 👨‍💼 Admin / Warden

- View and filter complaints
- Verify complaints
- Set resolution deadlines
- Assign workers
- Monitor complaint progress
- Resolve completed complaints
- Monitor delayed complaints
- View analytics

### 🧑‍🔧 Worker

- View assigned complaints
- View complaint details
- Update work progress
- Mark complaints as `In Progress`
- Mark completed work as `Work Done`

---

## 🤖 Intelligent Complaint Classification

When a student submits a complaint, the system analyzes its description and automatically determines:

**Category → Priority → Predicted Resolution Time**

```text
Complaint Description
        ↓
Text Processing
        ↓
Weighted Keyword Matching
        ↓
Category Prediction
        ↓
Priority Detection
        ↓
Resolution Time Prediction
```

### Example

| Complaint | Category | Priority | ETA |
|---|---|---|---|
| Fan not working | Electrical | High | 4 hrs |
| Bathroom tap leaking | Plumbing | High | 4 hrs |
| WiFi is very slow | WiFi | Medium | 12 hrs |
| Room not cleaned | Housekeeping | Low | 12 hrs |

> **Implementation note:** The current version uses a rule-based weighted keyword classifier. It is designed so that the classification component can later be replaced with a trained NLP model.

---

## 🔄 Complaint Workflow

```text
Student
   │
   ▼
Submit Complaint
   │
   ▼
Pending
   │
   ▼
Warden Verification
   │
   ▼
Verified
   │
   ▼
Worker Assignment
   │
   ▼
Assigned
   │
   ▼
In Progress
   │
   ▼
Work Done
   │
   ▼
Warden Confirmation
   │
   ▼
Resolved
   │
   ▼
Student Notification
```

The system also monitors deadlines and identifies complaints that become **Delayed**.

---

## 🛠️ Tech Stack

**Frontend**

- HTML5
- CSS3
- JavaScript

**Backend**

- Node.js
- Express.js
- REST APIs

**Database**

- MySQL

**Intelligent Component**

- Rule-based weighted keyword classification
- Priority prediction
- Resolution-time estimation

**Database Engineering**

- Relational schema
- 3NF normalization
- Foreign keys
- Indexing
- Transactions
- Triggers
- Stored procedures
- Cursors
- Views

---

## 🏗️ Architecture

```text
┌───────────────────────────────┐
│           USERS               │
│ Student | Warden | Worker    │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│          FRONTEND             │
│       HTML / CSS / JS         │
└───────────────┬───────────────┘
                │ REST API
                ▼
┌───────────────────────────────┐
│          BACKEND              │
│      Node.js + Express        │
│                               │
│ Auth | Complaints | Alerts    │
│ Analytics | Classification    │
└───────────┬─────────┬─────────┘
            │         │
            ▼         ▼
     ┌──────────┐  ┌───────────┐
     │Classifier│  │   MySQL   │
     │          │  │ Database  │
     └──────────┘  └───────────┘
```

---

## 🗄️ Database Design

The database is normalized to **Third Normal Form (3NF)** and separates responsibilities across multiple entities.

### Main Entities

```text
Users
Complaints
Assignments
Complaint History
Feedback
Alerts
Notifications
```

### Database Automation

**Triggers**

- Automatically detect overdue complaints
- Maintain complaint status history
- Record resolution timestamps
- Notify students after resolution

**Stored Procedures**

- Worker performance analysis
- Average resolution time by category

**Views**

- Complaint summary
- Delayed complaints

This allows business rules to be enforced at the database level rather than relying entirely on application code.

---

## 📡 REST API

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | Student registration |
| GET | `/api/auth/workers` | Retrieve workers |

### Complaints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/complaints` | Retrieve complaints |
| GET | `/api/complaints/:id` | Complaint details |
| POST | `/api/complaints` | Create complaint |
| PATCH | `/api/complaints/:id/verify` | Verify complaint |
| PATCH | `/api/complaints/:id/assign` | Assign worker |
| PATCH | `/api/complaints/:id/status` | Update status |
| PATCH | `/api/complaints/:id/resolve` | Resolve complaint |
| DELETE | `/api/complaints/:id` | Delete complaint |

### Analytics & Notifications

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/alerts` | Retrieve alerts |
| POST | `/api/alerts/check-deadlines` | Check deadlines |
| GET | `/api/alerts/notifications/:user_id` | Student notifications |
| POST | `/api/alerts/feedback` | Submit feedback |
| GET | `/api/alerts/analytics/summary` | Analytics |

### Classification

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/ml/classify` | Classify complaint |

---

## 📁 Project Structure

```text
hostel_cms/
│
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── package.json
│   ├── .env.example
│   │
│   ├── ml/
│   │   └── classifier.js
│   │
│   └── routes/
│       ├── auth.js
│       ├── complaints.js
│       └── alerts.js
│
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
│
└── hostel_cms_schema.sql
```

---

## 💻 Running Locally

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- MySQL Workbench
- Modern web browser

### 1. Clone the Repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd hostel_cms
```

### 2. Set Up MySQL

Import the database schema:

```bash
mysql -u root -p < hostel_cms_schema.sql
```

### 3. Configure Environment Variables

Inside `backend/`, create `.env`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=hostel_cms
PORT=3000
```

### 4. Install Dependencies

```bash
cd backend
npm install
```

### 5. Start the Application

```bash
npm start
```

Open:

```text
http://localhost:3000
```

---

## 🔐 Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | `warden@hostel.edu` | `password123` |
| Worker | `suresh.worker@hostel.edu` | `password123` |
| Worker | `ravi.worker@hostel.edu` | `password123` |
| Student | `ankit@student.edu` | `password123` |
| Student | `neha@student.edu` | `password123` |

> These credentials are intended for local demonstration only.

---

## 📸 Application Preview

Add screenshots here to give recruiters an immediate understanding of the project.

**Recommended screenshots:**

- Login page
- Student dashboard
- Complaint submission
- Admin/Warden dashboard
- Worker dashboard
- Complaint tracking
- Analytics dashboard

```text
## 📸 Screenshots

### Login
[Add screenshot]

### Student Dashboard
[Add screenshot]

### Admin Dashboard
[Add screenshot]

### Worker Dashboard
[Add screenshot]

### Complaint Tracking
[Add screenshot]

### Analytics
[Add screenshot]
```

---

## 🎯 What I Learned

This project provided practical experience with:

- Designing a relational database from a real-world problem
- Building REST APIs using Node.js and Express
- Connecting a web application with MySQL
- Implementing role-based workflows
- Designing normalized database schemas
- Using SQL joins and aggregate queries
- Implementing triggers and stored procedures
- Managing transactions and database integrity
- Building a rule-based text classification system
- Connecting frontend components with backend APIs

---

## 🔮 Future Improvements

- Replace the rule-based classifier with a trained NLP model
- Add JWT-based authentication and authorization
- Deploy the application to the cloud
- Add email/SMS/WhatsApp notifications
- Support image uploads with complaints
- Add advanced complaint trend analytics
- Add worker workload optimization
- Add multilingual complaint submission

---

## 👩‍💻 Project Summary

**Smart Hostel Complaint Management System** is a full-stack application built to solve a real-world hostel management problem while demonstrating practical knowledge of:

**Web Development + REST APIs + MySQL + DBMS + Intelligent Classification**

---

⭐ **If you find the project interesting, feel free to explore the repository.**
