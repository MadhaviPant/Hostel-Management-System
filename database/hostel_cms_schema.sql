
-- ============================================================
--  Smart Hostel Complaint Management System
--  MySQL Database Schema
--  Version: 2.0 (with enhanced features)
-- ============================================================
--
--  ER Overview:
--  Users (1) ──< Complaints (N)
--  Complaints (1) ──< Assignments (N)
--  Workers (1) ──< Assignments (N)
--  Complaints (1) ──< Status_History (N)
--  Complaints (1) ──  Feedback (1)
--  Complaints (1) ──< Alerts (N)
--  Users (1) ──< Notifications (N)
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  DATABASE
-- ────────────────────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS hostel_cms
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE hostel_cms;

-- ────────────────────────────────────────────────────────────
--  TABLE 1: users
--  Stores all system actors: students, admins (wardens), workers
--  Normalized: role data stored as ENUM (no separate roles table
--  needed as roles are finite and fixed).
-- ────────────────────────────────────────────────────────────
CREATE TABLE users (
    user_id       INT            NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(100)   NOT NULL,
    email         VARCHAR(150)   NOT NULL,
    password_hash VARCHAR(255)   NOT NULL,
    role          ENUM(
                      'student',
                      'admin',
                      'worker'
                  )              NOT NULL,
    -- room_no only relevant for students; NULL for admin/worker
    room_no       VARCHAR(20)    DEFAULT NULL,
    phone         VARCHAR(15)    DEFAULT NULL,
    is_active     TINYINT(1)     NOT NULL DEFAULT 1,
    created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id),
    UNIQUE KEY uq_email (email),
    -- Index on role for fast role-based lookups
    INDEX idx_role (role)
) ENGINE=InnoDB;


-- ────────────────────────────────────────────────────────────
--  TABLE 2: complaints
--  Core entity. Stores complaint text, auto-detected category
--  and priority (from ML/keyword logic), plus timeline fields.
--
--  Status flow:
--  Pending → Verified → Assigned → In Progress → Work Done → Resolved
--  (Delayed is an orthogonal flag set by trigger)
-- ────────────────────────────────────────────────────────────
CREATE TABLE complaints (
    complaint_id     INT            NOT NULL AUTO_INCREMENT,
    student_id       INT            NOT NULL,               -- FK → users
    description      TEXT           NOT NULL,
    category         ENUM(
                         'Electrical',
                         'Plumbing',
                         'WiFi',
                         'Housekeeping',
                         'Other'
                     )              NOT NULL DEFAULT 'Other',
    priority         ENUM(
                         'Low',
                         'Medium',
                         'High'
                     )              NOT NULL DEFAULT 'Medium',
    status           ENUM(
                         'Pending',
                         'Verified',
                         'Assigned',
                         'In Progress',
                         'Work Done',
                         'Resolved',
                         'Delayed'
                     )              NOT NULL DEFAULT 'Pending',
    -- predicted_time: system suggestion in hours (from ML/logic)
    predicted_time   DECIMAL(5,2)   DEFAULT NULL,
    -- final_time: warden confirms or overrides predicted_time (hours)
    final_time       DECIMAL(5,2)   DEFAULT NULL,
    -- deadline: computed as verified_at + final_time
    deadline         DATETIME       DEFAULT NULL,
    -- verified_at: when warden approves the complaint
    verified_at      DATETIME       DEFAULT NULL,
    resolved_at      DATETIME       DEFAULT NULL,
    created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (complaint_id),
    CONSTRAINT fk_complaint_student
        FOREIGN KEY (student_id) REFERENCES users (user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    -- Frequently filtered columns
    INDEX idx_status   (status),
    INDEX idx_category (category),
    INDEX idx_priority (priority),
    INDEX idx_student  (student_id),
    INDEX idx_deadline (deadline)
) ENGINE=InnoDB;


-- ────────────────────────────────────────────────────────────
--  TABLE 3: assignments
--  Links a complaint to a worker. Kept separate (not merged into
--  complaints) to satisfy 3NF and allow reassignment history.
-- ────────────────────────────────────────────────────────────
CREATE TABLE assignments (
    assignment_id   INT          NOT NULL AUTO_INCREMENT,
    complaint_id    INT          NOT NULL,               -- FK → complaints
    worker_id       INT          NOT NULL,               -- FK → users (worker)
    assigned_by     INT          NOT NULL,               -- FK → users (admin)
    remarks         TEXT         DEFAULT NULL,           -- worker's progress notes
    is_current      TINYINT(1)   NOT NULL DEFAULT 1,     -- 1 = active assignment
    assigned_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (assignment_id),
    CONSTRAINT fk_assign_complaint
        FOREIGN KEY (complaint_id) REFERENCES complaints (complaint_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_assign_worker
        FOREIGN KEY (worker_id) REFERENCES users (user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_assign_admin
        FOREIGN KEY (assigned_by) REFERENCES users (user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    INDEX idx_assign_complaint (complaint_id),
    INDEX idx_assign_worker    (worker_id)
) ENGINE=InnoDB;


-- ────────────────────────────────────────────────────────────
--  TABLE 4: status_history
--  Audit trail. Every status change is recorded here.
--  Enables full lifecycle tracking and helps the cursor
--  calculate resolution time accurately.
-- ────────────────────────────────────────────────────────────
CREATE TABLE status_history (
    history_id    INT          NOT NULL AUTO_INCREMENT,
    complaint_id  INT          NOT NULL,               -- FK → complaints
    changed_by    INT          NOT NULL,               -- FK → users
    old_status    VARCHAR(20)  NOT NULL,
    new_status    VARCHAR(20)  NOT NULL,
    note          VARCHAR(255) DEFAULT NULL,
    changed_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (history_id),
    CONSTRAINT fk_history_complaint
        FOREIGN KEY (complaint_id) REFERENCES complaints (complaint_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_history_user
        FOREIGN KEY (changed_by) REFERENCES users (user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    INDEX idx_hist_complaint (complaint_id),
    INDEX idx_hist_changed   (changed_at)
) ENGINE=InnoDB;


-- ────────────────────────────────────────────────────────────
--  TABLE 5: feedback
--  One feedback per resolved complaint (1:1 with complaints).
--  Student submits after status reaches 'Resolved'.
-- ────────────────────────────────────────────────────────────
CREATE TABLE feedback (
    feedback_id   INT          NOT NULL AUTO_INCREMENT,
    complaint_id  INT          NOT NULL,               -- FK → complaints (UNIQUE)
    student_id    INT          NOT NULL,               -- FK → users
    rating        TINYINT      NOT NULL,               -- 1–5
    comment       TEXT         DEFAULT NULL,
    submitted_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (feedback_id),
    UNIQUE KEY uq_feedback_complaint (complaint_id),   -- one feedback per complaint
    CONSTRAINT fk_feedback_complaint
        FOREIGN KEY (complaint_id) REFERENCES complaints (complaint_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_feedback_student
        FOREIGN KEY (student_id) REFERENCES users (user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;


-- ────────────────────────────────────────────────────────────
--  TABLE 6: alerts
--  Stores in-system alerts (reminder & delay).
--  alert_type: 'Reminder' (before deadline) or 'Delay' (after).
--  target_role: who should see it ('worker', 'admin', or 'both').
-- ────────────────────────────────────────────────────────────
CREATE TABLE alerts (
    alert_id      INT          NOT NULL AUTO_INCREMENT,
    complaint_id  INT          NOT NULL,               -- FK → complaints
    alert_type    ENUM(
                      'Reminder',
                      'Delay'
                  )            NOT NULL,
    target_role   ENUM(
                      'worker',
                      'admin',
                      'both'
                  )            NOT NULL DEFAULT 'both',
    message       VARCHAR(500) NOT NULL,
    is_read       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (alert_id),
    CONSTRAINT fk_alert_complaint
        FOREIGN KEY (complaint_id) REFERENCES complaints (complaint_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    INDEX idx_alert_type (alert_type),
    INDEX idx_alert_read (is_read)
) ENGINE=InnoDB;


-- ────────────────────────────────────────────────────────────
--  TABLE 7: notifications
--  In-dashboard notifications for students (e.g., "Resolved").
--  Decoupled from alerts (alerts = operational; notifications = user-facing).
-- ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
    notif_id      INT          NOT NULL AUTO_INCREMENT,
    user_id       INT          NOT NULL,               -- FK → users (recipient)
    complaint_id  INT          NOT NULL,               -- FK → complaints
    message       VARCHAR(500) NOT NULL,
    is_read       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (notif_id),
    CONSTRAINT fk_notif_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_notif_complaint
        FOREIGN KEY (complaint_id) REFERENCES complaints (complaint_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    INDEX idx_notif_user (user_id),
    INDEX idx_notif_read (is_read)
) ENGINE=InnoDB;


-- ============================================================
--  TRIGGERS
-- ============================================================

DELIMITER $$

-- ────────────────────────────────────────────────────────────
--  TRIGGER 1: trg_auto_delayed
--
--  Purpose:
--    Automatically marks a complaint as 'Delayed' when it is
--    updated (e.g., by a scheduled event or any UPDATE) and
--    the deadline has passed but the complaint is not Resolved.
--
--  When it fires:
--    BEFORE UPDATE on complaints
--
--  Logic:
--    IF NEW.deadline IS NOT NULL
--       AND NOW() > NEW.deadline
--       AND NEW.status NOT IN ('Resolved', 'Delayed')
--    THEN SET NEW.status = 'Delayed'
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER trg_auto_delayed
BEFORE UPDATE ON complaints
FOR EACH ROW
BEGIN
    IF  NEW.deadline IS NOT NULL
    AND NOW() > NEW.deadline
    AND NEW.status NOT IN ('Resolved', 'Delayed')
    THEN
        SET NEW.status = 'Delayed';
    END IF;
END$$


-- ────────────────────────────────────────────────────────────
--  TRIGGER 2: trg_log_status_change
--
--  Purpose:
--    Automatically inserts a row into status_history whenever
--    a complaint's status changes, providing a full audit trail
--    without requiring the application layer to do it manually.
--
--  When it fires:
--    AFTER UPDATE on complaints (only when status actually changes)
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER trg_log_status_change
AFTER UPDATE ON complaints
FOR EACH ROW
BEGIN
    -- Only insert a history record if the status actually changed
    IF OLD.status <> NEW.status THEN
        INSERT INTO status_history
            (complaint_id, changed_by, old_status, new_status, note)
        VALUES
            -- changed_by = student_id as a proxy; backend should pass real actor
            (NEW.complaint_id, NEW.student_id, OLD.status, NEW.status,
             CONCAT('Status changed from ', OLD.status, ' to ', NEW.status));
    END IF;
END$$


-- ────────────────────────────────────────────────────────────
--  TRIGGER 3: trg_set_resolved_at
--
--  Purpose:
--    Automatically sets resolved_at timestamp the moment a
--    complaint transitions to 'Resolved', avoiding any
--    application-level oversight.
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER trg_set_resolved_at
BEFORE UPDATE ON complaints
FOR EACH ROW
BEGIN
    IF NEW.status = 'Resolved' AND OLD.status <> 'Resolved' THEN
        SET NEW.resolved_at = NOW();
    END IF;
END$$


-- ────────────────────────────────────────────────────────────
--  TRIGGER 4: trg_student_notification_on_resolve
--
--  Purpose:
--    When a complaint is marked Resolved, automatically insert
--    a notification for the student so it appears in their
--    dashboard without any backend code change.
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER trg_student_notification_on_resolve
AFTER UPDATE ON complaints
FOR EACH ROW
BEGIN
    IF NEW.status = 'Resolved' AND OLD.status <> 'Resolved' THEN
        INSERT INTO notifications (user_id, complaint_id, message)
        VALUES (
            NEW.student_id,
            NEW.complaint_id,
            CONCAT('Your complaint #', NEW.complaint_id,
                   ' has been resolved. Please submit your feedback.')
        );
    END IF;
END$$

DELIMITER ;


-- ============================================================
--  STORED PROCEDURE WITH CURSOR
-- ============================================================

DELIMITER $$

-- ────────────────────────────────────────────────────────────
--  CURSOR 1: sp_worker_performance
--
--  Purpose:
--    Calculates per-worker performance metrics:
--      - Total complaints assigned
--      - Total resolved
--      - Average resolution time (in hours)
--      - Average feedback rating received
--
--  How it works:
--    A cursor iterates over every worker in the users table.
--    For each worker, it runs aggregation queries against
--    complaints and feedback, then stores the result in the
--    worker_performance_report temp table.
--
--  Usage:
--    CALL sp_worker_performance();
--    SELECT * FROM worker_performance_report;
-- ────────────────────────────────────────────────────────────
CREATE PROCEDURE sp_worker_performance()
BEGIN
    -- Variables to hold cursor data
    DECLARE v_done         INT DEFAULT FALSE;
    DECLARE v_worker_id    INT;
    DECLARE v_worker_name  VARCHAR(100);

    -- Metrics variables
    DECLARE v_total        INT     DEFAULT 0;
    DECLARE v_resolved     INT     DEFAULT 0;
    DECLARE v_avg_hours    DECIMAL(8,2) DEFAULT 0.00;
    DECLARE v_avg_rating   DECIMAL(3,2) DEFAULT 0.00;

    -- Declare cursor: iterates over all active workers
    DECLARE worker_cursor CURSOR FOR
        SELECT user_id, full_name
        FROM   users
        WHERE  role = 'worker'
          AND  is_active = 1;

    -- Handler: sets v_done = TRUE when cursor is exhausted
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

    -- Create (or recreate) temp result table
    DROP TEMPORARY TABLE IF EXISTS worker_performance_report;
    CREATE TEMPORARY TABLE worker_performance_report (
        worker_id         INT,
        worker_name       VARCHAR(100),
        total_assigned    INT,
        total_resolved    INT,
        avg_resolution_hrs DECIMAL(8,2),
        avg_feedback_rating DECIMAL(3,2)
    );

    -- Open the cursor
    OPEN worker_cursor;

    -- Loop through each worker
    read_loop: LOOP
        FETCH worker_cursor INTO v_worker_id, v_worker_name;

        -- Exit loop when no more rows
        IF v_done THEN
            LEAVE read_loop;
        END IF;

        -- Reset metric variables for this worker
        SET v_total     = 0;
        SET v_resolved  = 0;
        SET v_avg_hours = 0.00;
        SET v_avg_rating = 0.00;

        -- Count total complaints assigned to this worker
        SELECT COUNT(DISTINCT a.complaint_id)
        INTO   v_total
        FROM   assignments a
        WHERE  a.worker_id = v_worker_id;

        -- Count resolved complaints and compute avg resolution time
        SELECT COUNT(*),
               COALESCE(AVG(TIMESTAMPDIFF(HOUR, c.created_at, c.resolved_at)), 0)
        INTO   v_resolved, v_avg_hours
        FROM   complaints c
        JOIN   assignments a ON a.complaint_id = c.complaint_id
        WHERE  a.worker_id   = v_worker_id
          AND  c.status      = 'Resolved'
          AND  c.resolved_at IS NOT NULL;

        -- Compute average feedback rating for this worker's resolved complaints
        SELECT COALESCE(AVG(f.rating), 0)
        INTO   v_avg_rating
        FROM   feedback f
        JOIN   complaints c  ON c.complaint_id = f.complaint_id
        JOIN   assignments a ON a.complaint_id = c.complaint_id
        WHERE  a.worker_id = v_worker_id;

        -- Insert computed row into temp table
        INSERT INTO worker_performance_report
            (worker_id, worker_name, total_assigned,
             total_resolved, avg_resolution_hrs, avg_feedback_rating)
        VALUES
            (v_worker_id, v_worker_name, v_total,
             v_resolved, v_avg_hours, v_avg_rating);

    END LOOP;

    -- Close the cursor (frees resources)
    CLOSE worker_cursor;

    -- Return the full report
    SELECT * FROM worker_performance_report
    ORDER BY avg_resolution_hrs ASC;

END$$


-- ────────────────────────────────────────────────────────────
--  CURSOR 2: sp_avg_resolution_by_category
--
--  Purpose:
--    Uses a cursor to iterate over each complaint category and
--    compute the average resolution time. Demonstrates cursor
--    usage for analytics (GROUP BY equivalent done imperatively).
--
--  Usage:
--    CALL sp_avg_resolution_by_category();
-- ────────────────────────────────────────────────────────────
CREATE PROCEDURE sp_avg_resolution_by_category()
BEGIN
    DECLARE v_done      INT DEFAULT FALSE;
    DECLARE v_category  VARCHAR(50);
    DECLARE v_avg_hrs   DECIMAL(8,2);
    DECLARE v_count     INT;

    -- Cursor over distinct categories that have resolved complaints
    DECLARE cat_cursor CURSOR FOR
        SELECT DISTINCT category
        FROM   complaints
        WHERE  status = 'Resolved';

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

    DROP TEMPORARY TABLE IF EXISTS category_resolution_report;
    CREATE TEMPORARY TABLE category_resolution_report (
        category           VARCHAR(50),
        resolved_count     INT,
        avg_resolution_hrs DECIMAL(8,2)
    );

    OPEN cat_cursor;

    cat_loop: LOOP
        FETCH cat_cursor INTO v_category;

        IF v_done THEN
            LEAVE cat_loop;
        END IF;

        SELECT COUNT(*),
               AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at))
        INTO   v_count, v_avg_hrs
        FROM   complaints
        WHERE  category    = v_category
          AND  status      = 'Resolved'
          AND  resolved_at IS NOT NULL;

        INSERT INTO category_resolution_report
            (category, resolved_count, avg_resolution_hrs)
        VALUES
            (v_category, v_count, v_avg_hrs);

    END LOOP;

    CLOSE cat_cursor;

    SELECT * FROM category_resolution_report
    ORDER BY avg_resolution_hrs ASC;

END$$

DELIMITER ;


-- ============================================================
--  USEFUL VIEWS (for Analytics Dashboard)
-- ============================================================

-- View: complaint summary with student name and current worker
CREATE VIEW vw_complaint_summary AS
SELECT
    c.complaint_id,
    c.description,
    c.category,
    c.priority,
    c.status,
    c.deadline,
    c.created_at,
    c.resolved_at,
    u.full_name   AS student_name,
    u.room_no,
    w.full_name   AS worker_name,
    CASE
        WHEN c.resolved_at IS NOT NULL
        THEN ROUND(TIMESTAMPDIFF(MINUTE, c.created_at, c.resolved_at) / 60.0, 2)
        ELSE NULL
    END           AS resolution_hrs
FROM complaints c
JOIN users u ON u.user_id = c.student_id
LEFT JOIN assignments a ON a.complaint_id = c.complaint_id AND a.is_current = 1
LEFT JOIN users w       ON w.user_id = a.worker_id;


-- View: delayed complaints (live check)
CREATE VIEW vw_delayed_complaints AS
SELECT *
FROM   vw_complaint_summary
WHERE  status NOT IN ('Resolved')
  AND  deadline IS NOT NULL
  AND  NOW() > deadline;


-- ============================================================
--  SAMPLE DATA — INSERT STATEMENTS
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
-- Passwords stored as bcrypt hashes; here we use placeholder hash.
-- In production: hash = bcrypt('password123')

INSERT INTO users (full_name, email, password_hash, role, room_no, phone) VALUES
-- Admin / Wardens
('Dr. Rajesh Sharma',  'warden@hostel.edu', '$2b$10$placeholder_hash_admin1', 'admin', NULL, '9800000001'),
('Mrs. Priya Nair',    'priya@hostel.edu',  '$2b$10$placeholder_hash_admin2', 'admin', NULL, '9800000002'),

-- Workers
('Suresh Kumar',   'suresh.worker@hostel.edu', '$2b$10$placeholder_hash_w1', 'worker', NULL, '9800000011'),
('Ravi Electrician','ravi.worker@hostel.edu',  '$2b$10$placeholder_hash_w2', 'worker', NULL, '9800000012'),
('Mohan Plumber',  'mohan.worker@hostel.edu',  '$2b$10$placeholder_hash_w3', 'worker', NULL, '9800000013'),

-- Students
('Ankit Verma',   'ankit@student.edu',   '$2b$10$placeholder_hash_s1', 'student', 'A-101', '9811111111'),
('Neha Singh',    'neha@student.edu',    '$2b$10$placeholder_hash_s2', 'student', 'A-102', '9822222222'),
('Rohit Gupta',   'rohit@student.edu',   '$2b$10$placeholder_hash_s3', 'student', 'B-201', '9833333333'),
('Priya Joshi',   'priya.s@student.edu', '$2b$10$placeholder_hash_s4', 'student', 'B-202', '9844444444'),
('Karan Mehta',   'karan@student.edu',   '$2b$10$placeholder_hash_s5', 'student', 'C-301', '9855555555');

-- ── Complaints ───────────────────────────────────────────────
-- student_id 6=Ankit, 7=Neha, 8=Rohit, 9=Priya, 10=Karan

INSERT INTO complaints
    (student_id, description, category, priority, status,
     predicted_time, final_time, deadline, verified_at, resolved_at)
VALUES
-- Resolved complaint (for analytics)
(6, 'The ceiling fan in my room stopped working. It does not rotate at all.',
 'Electrical', 'High', 'Resolved',
 4.00, 5.00,
 DATE_SUB(NOW(), INTERVAL 2 DAY),
 DATE_SUB(NOW(), INTERVAL 5 DAY),
 DATE_SUB(NOW(), INTERVAL 3 DAY)),

-- Resolved complaint
(7, 'Water is leaking from the bathroom tap continuously since last night.',
 'Plumbing', 'High', 'Resolved',
 6.00, 8.00,
 DATE_SUB(NOW(), INTERVAL 4 DAY),
 DATE_SUB(NOW(), INTERVAL 6 DAY),
 DATE_SUB(NOW(), INTERVAL 3 DAY)),

-- Delayed complaint
(8, 'WiFi is extremely slow in room B-201. Cannot attend online classes.',
 'WiFi', 'Medium', 'Delayed',
 3.00, 4.00,
 DATE_SUB(NOW(), INTERVAL 1 DAY),
 DATE_SUB(NOW(), INTERVAL 3 DAY),
 NULL),

-- In Progress
(9, 'The toilet flush is broken and water keeps running.',
 'Plumbing', 'High', 'In Progress',
 5.00, 6.00,
 DATE_ADD(NOW(), INTERVAL 6 HOUR),
 DATE_SUB(NOW(), INTERVAL 1 DAY),
 NULL),

-- Assigned
(10, 'Light bulbs in the corridor near room C-301 are not working.',
 'Electrical', 'Medium', 'Assigned',
 2.00, 3.00,
 DATE_ADD(NOW(), INTERVAL 3 HOUR),
 DATE_SUB(NOW(), INTERVAL 12 HOUR),
 NULL),

-- Verified (not yet assigned)
(6, 'Room A-101 has not been swept for 3 days. Garbage is overflowing.',
 'Housekeeping', 'Low', 'Verified',
 2.00, NULL, NULL,
 NOW(),
 NULL),

-- Pending (just submitted)
(7, 'The power socket near my study table gives electric sparks.',
 'Electrical', 'High', 'Pending',
 NULL, NULL, NULL, NULL, NULL),

-- Pending
(8, 'Dustbin in common area has not been cleaned since 4 days.',
 'Housekeeping', 'Low', 'Pending',
 NULL, NULL, NULL, NULL, NULL),

-- Work Done (awaiting warden to mark Resolved)
(9, 'Shower drain is completely blocked, water is stagnating.',
 'Plumbing', 'High', 'Work Done',
 4.00, 5.00,
 DATE_ADD(NOW(), INTERVAL 2 HOUR),
 DATE_SUB(NOW(), INTERVAL 2 DAY),
 NULL),

-- Resolved
(10, 'WiFi router on 3rd floor reboots every few minutes.',
 'WiFi', 'Medium', 'Resolved',
 3.00, 4.00,
 DATE_SUB(NOW(), INTERVAL 1 DAY),
 DATE_SUB(NOW(), INTERVAL 3 DAY),
 DATE_SUB(NOW(), INTERVAL 1 DAY));

-- ── Assignments ──────────────────────────────────────────────
-- complaint_id 1=Resolved fan, 2=Resolved tap, 3=Delayed WiFi
-- 4=In Progress flush, 5=Assigned bulbs, 9=Work Done drain, 10=Resolved WiFi router
-- worker_id 3=Suresh, 4=Ravi(electrical), 5=Mohan(plumbing)
-- assigned_by 1=Dr.Sharma

INSERT INTO assignments (complaint_id, worker_id, assigned_by, remarks, is_current) VALUES
(1,  4, 1, 'Fan motor replaced. Issue resolved.',        0),  -- archived
(2,  5, 1, 'Tap washer replaced. No more leakage.',      0),  -- archived
(3,  3, 1, 'Checked router settings. Escalated to ISP.', 1),  -- current, delayed
(4,  5, 1, 'Working on the flush mechanism.',            1),  -- current
(5,  4, 1, 'Replacement bulbs procured.',                1),  -- current
(9,  5, 1, 'Drain cleared using plunger.',               1),  -- current, work done
(10, 3, 1, 'Router firmware updated. Stable now.',       1);  -- current, resolved

-- ── Status History ───────────────────────────────────────────
-- changed_by: admin=1

INSERT INTO status_history (complaint_id, changed_by, old_status, new_status, note) VALUES
-- Complaint 1 (fan): full lifecycle
(1, 6, 'Pending',     'Verified',     'Warden verified the complaint'),
(1, 1, 'Verified',    'Assigned',     'Assigned to Ravi'),
(1, 4, 'Assigned',    'In Progress',  'Started working on fan'),
(1, 4, 'In Progress', 'Work Done',    'Fan motor replaced'),
(1, 1, 'Work Done',   'Resolved',     'Admin confirmed resolution'),

-- Complaint 2 (tap): full lifecycle
(2, 7, 'Pending',     'Verified',     'Warden verified'),
(2, 1, 'Verified',    'Assigned',     'Assigned to Mohan'),
(2, 5, 'Assigned',    'In Progress',  'Checking tap'),
(2, 5, 'In Progress', 'Work Done',    'Washer replaced'),
(2, 1, 'Work Done',   'Resolved',     'Confirmed by warden'),

-- Complaint 3 (WiFi delay)
(3, 8, 'Pending',     'Verified',     'Verified by warden'),
(3, 1, 'Verified',    'Assigned',     'Assigned to Suresh'),
(3, 3, 'Assigned',    'In Progress',  'Checking network'),
(3, 1, 'In Progress', 'Delayed',      'Deadline crossed, auto-delayed'),

-- Complaint 4 (flush)
(4, 9, 'Pending',     'Verified',     'Verified'),
(4, 1, 'Verified',    'Assigned',     'Assigned to Mohan'),
(4, 5, 'Assigned',    'In Progress',  'Started on flush'),

-- Complaint 5 (bulbs)
(5, 10, 'Pending',    'Verified',     'Verified'),
(5, 1,  'Verified',   'Assigned',     'Assigned to Ravi'),

-- Complaint 9 (drain)
(9, 9, 'Pending',     'Verified',     'Verified'),
(9, 1, 'Verified',    'Assigned',     'Assigned to Mohan'),
(9, 5, 'Assigned',    'In Progress',  'Started drain clearance'),
(9, 5, 'In Progress', 'Work Done',    'Drain cleared'),

-- Complaint 10 (WiFi router)
(10, 10, 'Pending',    'Verified',    'Verified'),
(10, 1,  'Verified',   'Assigned',    'Assigned to Suresh'),
(10, 3,  'Assigned',   'In Progress', 'Updating firmware'),
(10, 3,  'In Progress','Work Done',   'Firmware updated'),
(10, 1,  'Work Done',  'Resolved',    'Warden confirmed');

-- ── Feedback ─────────────────────────────────────────────────
-- Only for resolved complaints (1, 2, 10)

INSERT INTO feedback (complaint_id, student_id, rating, comment) VALUES
(1,  6, 5, 'Fan was fixed quickly. Very satisfied!'),
(2,  7, 4, 'Took a bit longer but resolved well. Good job.'),
(10, 10, 5, 'WiFi is stable now. Thanks for the quick fix.');

-- ── Alerts ───────────────────────────────────────────────────

INSERT INTO alerts (complaint_id, alert_type, target_role, message, is_read) VALUES
-- Reminder for complaint 4 (flush, deadline in 6 hrs)
(4, 'Reminder', 'worker',
 'Reminder: Complaint #4 (Plumbing - flush) deadline is in 6 hours.', 0),

-- Reminder for complaint 5 (bulbs, deadline in 3 hrs)
(5, 'Reminder', 'worker',
 'Reminder: Complaint #5 (Electrical - bulbs) deadline is in 3 hours.', 0),

-- Delay alert for complaint 3 (WiFi, already past deadline)
(3, 'Delay', 'both',
 'DELAY ALERT: Complaint #3 (WiFi - B-201) has crossed its deadline. Immediate action required.', 0);

-- ── Notifications (for students) ─────────────────────────────
-- Complaint 1 resolved → notify Ankit (user_id=6)
-- Complaint 2 resolved → notify Neha  (user_id=7)
-- Complaint 10 resolved → notify Karan (user_id=10)

INSERT INTO notifications (user_id, complaint_id, message, is_read) VALUES
(6,  1,  'Your complaint #1 has been resolved. Please submit your feedback.', 1),
(7,  2,  'Your complaint #2 has been resolved. Please submit your feedback.', 1),
(10, 10, 'Your complaint #10 has been resolved. Please submit your feedback.', 0);


INSERT INTO users (full_name, email, password_hash, role)
VALUES 
('Warden Admin', 'warden@hostel.edu', 'password123', 'admin'),
('Suresh Worker', 'suresh.worker@hostel.edu', 'password123', 'worker');
-- ============================================================
--  VERIFICATION QUERIES (run these to check the schema)
-- ============================================================

-- 1. Show all complaints with student name and status
-- SELECT * FROM vw_complaint_summary;

-- 2. Check delayed complaints
-- SELECT * FROM vw_delayed_complaints;

-- 3. Worker performance (uses cursor-based stored procedure)
-- CALL sp_worker_performance();

-- 4. Avg resolution by category
-- CALL sp_avg_resolution_by_category();

-- 5. Analytics: complaints per category
-- SELECT category, COUNT(*) AS total FROM complaints GROUP BY category;

-- 6. Analytics: complaints per status
-- SELECT status, COUNT(*) AS total FROM complaints GROUP BY status;

-- 7. Analytics: avg resolution time overall
-- SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)), 2) AS avg_hrs
-- FROM complaints WHERE status = 'Resolved' AND resolved_at IS NOT NULL;

-- 8. Avg feedback per worker
-- SELECT w.full_name, ROUND(AVG(f.rating), 2) AS avg_rating
-- FROM users w
-- JOIN assignments a ON a.worker_id = w.user_id
-- JOIN complaints c  ON c.complaint_id = a.complaint_id
-- JOIN feedback f    ON f.complaint_id = c.complaint_id
-- GROUP BY w.user_id, w.full_name;

-- ============================================================
--  END OF SCHEMA
-- ============================================================

Select * FROM users
WHERE email IN (
  'suresh.worker@hostel.edu',
  'ravi.worker@hostel.edu',
  'mohan.worker@hostel.edu'
);
INSERT INTO users (full_name, email, password_hash, role, room_no, phone) VALUES
-- Workers
('Suresh Kumar',   'suresh.worker@hostel.edu', 'worker123', 'worker', NULL, '9800000011'),
('Ravi Electrician','ravi.worker@hostel.edu',  'worker123', 'worker', NULL, '9800000012'),
('Mohan Plumber',  'mohan.worker@hostel.edu',  'worker123', 'worker', NULL, '9800000013');

