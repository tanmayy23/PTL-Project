const express = require('express');
const router = express.Router();
const pool = require('../db');

// Session check middleware
const checkSession = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] Checking admin session for ${req.originalUrl}, Session username: ${req.session.username}`);
  if (!req.session || !req.session.username) {
    console.log(`[${new Date().toISOString()}] Unauthorized access attempt to ${req.originalUrl}`);
    return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
  }
  next();
};

// Helper to get last 7 non-Sunday days in DD-MM-YY format
const getLast7NonSundayDays = () => {
  const dates = [];
  let count = 0;
  let i = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (count < 7) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    if (date.getDay() !== 0) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      dates.push(`${day}-${month}-${year}`);
      count++;
    }
    i++;
  }
  return dates.reverse();
};

// List Handlers (public access for handler.html dropdown)
router.get('/list-handlers', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Fetching handlers`);
    const result = await pool.query('SELECT username FROM handlers ORDER BY username');
    console.log(`[${new Date().toISOString()}] Handlers fetched:`, result.rows);
    res.json({ success: true, handlers: result.rows });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching handlers:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// List Receiver Credentials
router.get('/list-receiver-credentials', checkSession, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Fetching receiver credentials`);
    const result = await pool.query('SELECT username, password FROM receivers ORDER BY username');
    console.log(`[${new Date().toISOString()}] Receiver credentials fetched:`, result.rows);
    res.json({ success: true, receivers: result.rows });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching receiver credentials:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// List Handler Credentials
router.get('/list-handler-credentials', checkSession, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Fetching handler credentials`);
    const result = await pool.query('SELECT username, password FROM handlers ORDER BY username');
    console.log(`[${new Date().toISOString()}] Handler credentials fetched:`, result.rows);
    res.json({ success: true, handlers: result.rows });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching handler credentials:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// List End User Credentials
router.get('/list-enduser-credentials', checkSession, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Fetching end user credentials`);
    const result = await pool.query('SELECT username, password FROM end_users ORDER BY username');
    console.log(`[${new Date().toISOString()}] End user credentials fetched:`, result.rows);
    res.json({ success: true, endusers: result.rows });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching end user credentials:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`[${new Date().toISOString()}] Login attempt for username: ${username}`);
    if (!username || !password) {
      console.log(`[${new Date().toISOString()}] Missing username or password`);
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const result = await pool.query('SELECT * FROM admins WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length === 0) {
      console.log(`[${new Date().toISOString()}] Invalid credentials for username: ${username}`);
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    req.session.username = username;
    console.log(`[${new Date().toISOString()}] Login successful for username: ${username}`);
    res.json({ success: true, username });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error logging in:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Check session
router.get('/check-session', (req, res) => {
  if (req.session && req.session.username) {
    console.log(`[${new Date().toISOString()}] Session check successful for username: ${req.session.username}`);
    res.json({ success: true, username: req.session.username });
  } else {
    console.log(`[${new Date().toISOString()}] No active session`);
    res.json({ success: false });
  }
});

// Logout
router.post('/logout', (req, res) => {
  console.log(`[${new Date().toISOString()}] Logout attempt`);
  req.session.destroy(err => {
    if (err) {
      console.error(`[${new Date().toISOString()}] ❌ Error logging out:`, err.message, err.stack);
      return res.status(500).json({ success: false, message: 'Server error during logout' });
    }
    console.log(`[${new Date().toISOString()}] Logout successful`);
    res.json({ success: true });
  });
});

// Add Receiver
router.post('/add-receiver', checkSession, async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`[${new Date().toISOString()}] Adding receiver: username=${username}`);
    if (!username || !password) {
      console.error('Missing username or password');
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    if (!username.match(/^[A-Za-z0-9]+$/)) {
      console.error('Invalid username format:', username);
      return res.status(400).json({ success: false, message: 'Invalid username format. Use alphanumeric characters only' });
    }

    const checkResult = await pool.query('SELECT username FROM receivers WHERE username = $1', [username]);
    if (checkResult.rows.length > 0) {
      console.log(`Receiver already exists: ${username}`);
      return res.status(400).json({ success: false, message: 'Receiver already exists' });
    }

    await pool.query('INSERT INTO receivers (username, password) VALUES ($1, $2)', [username, password]);
    console.log(`Receiver added: ${username}`);
    res.json({ success: true, message: `Receiver ${username} added successfully` });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error adding receiver:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Delete Receiver
router.post('/delete-receiver', checkSession, async (req, res) => {
  try {
    const { username } = req.body;
    console.log(`[${new Date().toISOString()}] Deleting receiver: ${username}`);
    if (!username) {
      console.error('Missing username');
      return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const result = await pool.query('DELETE FROM receivers WHERE username = $1 RETURNING username', [username]);
    if (result.rowCount === 0) {
      console.log(`Receiver not found: ${username}`);
      return res.status(400).json({ success: false, message: 'Receiver not found' });
    }

    console.log(`Receiver deleted: ${username}`);
    res.json({ success: true, message: `Receiver ${username} deleted successfully` });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error deleting receiver:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// List Receivers
router.get('/list-receivers', checkSession, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Fetching receivers`);
    const result = await pool.query('SELECT username FROM receivers ORDER BY username');
    console.log('Receivers fetched:', result.rows);
    res.json({ success: true, receivers: result.rows });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching receivers:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Add Handler
router.post('/add-handler', checkSession, async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`[${new Date().toISOString()}] Adding handler: username=${username}`);
    if (!username || !password) {
      console.error('Missing username or password');
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    if (!username.match(/^\d{8}_[A-Za-z\s]+_[A-Za-z\s]+$/)) {
      console.error('Invalid username format:', username);
      return res.status(400).json({ success: false, message: 'Invalid username format. Use: employeeID_Name_Category' });
    }

    const checkResult = await pool.query('SELECT username FROM handlers WHERE username = $1', [username]);
    if (checkResult.rows.length > 0) {
      console.log(`Handler already exists: ${username}`);
      return res.status(400).json({ success: false, message: 'Handler already exists' });
    }

    await pool.query('INSERT INTO handlers (username, password) VALUES ($1, $2)', [username, password]);
    console.log(`Handler added: ${username}`);
    res.json({ success: true, message: `Handler ${username} added successfully` });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error adding handler:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Delete Handler
router.post('/delete-handler', checkSession, async (req, res) => {
  try {
    const { username } = req.body;
    console.log(`[${new Date().toISOString()}] Deleting handler: ${username}`);
    if (!username) {
      console.error('Missing username');
      return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const result = await pool.query('DELETE FROM handlers WHERE username = $1 RETURNING username', [username]);
    if (result.rowCount === 0) {
      console.log(`Handler not found: ${username}`);
      return res.status(400).json({ success: false, message: 'Handler not found' });
    }

    console.log(`Handler deleted: ${username}`);
    res.json({ success: true, message: `Handler ${username} deleted successfully` });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error deleting handler:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Add End User
router.post('/add-enduser', checkSession, async (req, res) => {
  try {
    const { section, username, email, mobile, employee_id, password } = req.body;
    console.log(`[${new Date().toISOString()}] Adding end user: username=${username}, section=${section}`);
    if (!section || !username || !email || !password) {
      console.error('Missing required fields');
      return res.status(400).json({ success: false, message: 'Section, username, email, and password are required' });
    }
    if (!username.match(/^[A-Za-z\s.]+$/)) {
      console.error('Invalid username format:', username);
      return res.status(400).json({ success: false, message: 'Invalid username format. Use letters, spaces, or periods only' });
    }
    if (!email.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/)) {
      console.error('Invalid email format:', email);
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    await pool.query(
      'INSERT INTO end_users (section, username, email, mobile, employee_id, password) VALUES ($1, $2, $3, $4, $5, $6)',
      [section, username, email, mobile || null, employee_id || null, password]
    );
    console.log(`End user added: ${username}`);
    res.json({ success: true, message: `End user ${username} added successfully` });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error adding end user:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Delete End User
router.post('/delete-enduser', checkSession, async (req, res) => {
  try {
    const { username } = req.body;
    console.log(`[${new Date().toISOString()}] Deleting end user: ${username}`);
    if (!username) {
      console.error('Missing username');
      return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const result = await pool.query('DELETE FROM end_users WHERE username = $1 RETURNING username', [username]);
    if (result.rowCount === 0) {
      console.log(`End user not found: ${username}`);
      return res.status(400).json({ success: false, message: 'End user not found' });
    }

    console.log(`End user deleted: ${username}`);
    res.json({ success: true, message: `End user ${username} deleted successfully` });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error deleting end user:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// List End Users
router.get('/list-endusers', checkSession, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Fetching end users`);
    const result = await pool.query('SELECT section, username, email, mobile, employee_id FROM end_users ORDER BY username');
    console.log('End users fetched:', result.rows);
    res.json({ success: true, endusers: result.rows });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching end users:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Change Password (Admin)
router.post('/change-password', checkSession, async (req, res) => {
  try {
    const { username, old_password, new_password } = req.body;
    console.log(`[${new Date().toISOString()}] Changing password for admin: ${username}`);
    if (!username || !old_password || !new_password) {
      console.error('Missing username, old_password, or new_password');
      return res.status(400).json({ success: false, message: 'Username, old password, and new password are required' });
    }
    if (username !== req.session.username) {
      console.error('Unauthorized password change attempt for username:', username);
      return res.status(403).json({ success: false, message: 'Unauthorized: Cannot change password for another user' });
    }

    const result = await pool.query('SELECT * FROM admins WHERE username = $1 AND password = $2', [username, old_password]);
    if (result.rows.length === 0) {
      console.log(`[${new Date().toISOString()}] Invalid old password for username: ${username}`);
      return res.status(401).json({ success: false, message: 'Invalid old password' });
    }

    const updateQuery = 'UPDATE admins SET password = $1 WHERE username = $2 RETURNING username';
    const updateResult = await pool.query(updateQuery, [new_password, username]);
    if (updateResult.rowCount === 0) {
      console.log(`[${new Date().toISOString()}] Failed to update password for username: ${username}`);
      return res.status(500).json({ success: false, message: 'Failed to update password' });
    }

    console.log(`[${new Date().toISOString()}] Password changed successfully for admin: ${username}`);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error changing admin password:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Change User Password (Receiver, Handler, End User)
router.post('/change-user-password', checkSession, async (req, res) => {
  try {
    const { user_type, username, new_password } = req.body;
    console.log(`[${new Date().toISOString()}] Changing password for ${user_type}: ${username}`);
    if (!user_type || !username || !new_password) {
      console.error('Missing user_type, username, or new_password');
      return res.status(400).json({ success: false, message: 'User type, username, and new password are required' });
    }
    if (!['receiver', 'handler', 'enduser'].includes(user_type)) {
      console.error('Invalid user_type:', user_type);
      return res.status(400).json({ success: false, message: 'Invalid user type' });
    }

    const tableName = user_type === 'enduser' ? 'end_users' : `${user_type}s`;
    const checkResult = await pool.query(`SELECT username FROM ${tableName} WHERE username = $1`, [username]);
    if (checkResult.rows.length === 0) {
      console.log(`[${new Date().toISOString()}] ${user_type} not found: ${username}`);
      return res.status(400).json({ success: false, message: `${user_type} not found` });
    }

    await pool.query(`UPDATE ${tableName} SET password = $1 WHERE username = $2`, [new_password, username]);
    console.log(`[${new Date().toISOString()}] Password changed for ${user_type}: ${username}`);
    res.json({ success: true, message: `${user_type} password changed successfully` });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error changing ${user_type} password:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Dashboard Data
router.get('/dashboard-data', checkSession, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Fetching dashboard data`);
    const dates = getLast7NonSundayDays();
    const handlerCounts = [];
    const endUserCounts = [];
    const handlerPending = [];
    const endUserPending = [];

    for (const date of dates) {
      const handlerResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM material_items 
         WHERE handler IS NOT NULL 
         AND TO_CHAR(created_at, 'DD-MM-YY') = $1 
         AND (acceptance_status IS NULL OR acceptance_status = 'rejected')`,
        [date]
      );
      const endUserResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM material_items 
         WHERE end_user IS NOT NULL 
         AND TO_CHAR(created_at, 'DD-MM-YY') = $1 
         AND (acceptance_status IS NULL OR acceptance_status = 'rejected')`,
        [date]
      );
      handlerCounts.push(parseInt(handlerResult.rows[0].count));
      endUserCounts.push(parseInt(endUserResult.rows[0].count));
    }

    const handlerPendingResult = await pool.query(
      `SELECT id, handler, identifier_value as po_no, NULL as docket_no, NULL as invoice_no, TO_CHAR(created_at, 'DD-MM-YY') as day 
       FROM material_items 
       WHERE handler IS NOT NULL 
       AND identifier_type = 'po_no' 
       AND (acceptance_status IS NULL OR acceptance_status = 'rejected') 
       ORDER BY created_at DESC`
    );
    const endUserPendingResult = await pool.query(
      `SELECT id, end_user, identifier_value as po_no, NULL as docket_no, NULL as invoice_no, TO_CHAR(created_at, 'DD-MM-YY') as day 
       FROM material_items 
       WHERE end_user IS NOT NULL 
       AND identifier_type = 'po_no' 
       AND (acceptance_status IS NULL OR acceptance_status = 'rejected') 
       ORDER BY created_at DESC`
    );

    handlerPending.push(...handlerPendingResult.rows);
    endUserPending.push(...endUserPendingResult.rows);

    console.log(`[${new Date().toISOString()}] Dashboard data fetched`);
    res.json({
      success: true,
      data: { dates, handlerCounts, endUserCounts, handlerPending, endUserPending }
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching dashboard data:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Export Logs
router.post('/export-logs', checkSession, async (req, res) => {
  try {
    const { start_date, end_date, user_type, username, format } = req.body;
    console.log(`[${new Date().toISOString()}] Exporting logs for ${user_type}: ${username}, ${start_date} to ${end_date}, format: ${format}`);
    if (!start_date || !end_date || !user_type || !username || !format) {
      console.error('Missing required fields');
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (!['receiver', 'handler', 'enduser'].includes(user_type)) {
      console.error('Invalid user_type:', user_type);
      return res.status(400).json({ success: false, message: 'Invalid user type' });
    }
    if (!['csv', 'pdf'].includes(format)) {
      console.error('Invalid format:', format);
      return res.status(400).json({ success: false, message: 'Invalid format' });
    }

    const tableName = user_type === 'enduser' ? 'end_users' : `${user_type}s`;
    const checkResult = await pool.query(`SELECT username FROM ${tableName} WHERE username = $1`, [username]);
    if (checkResult.rows.length === 0) {
      console.log(`[${new Date().toISOString()}] ${user_type} not found: ${username}`);
      return res.status(400).json({ success: false, message: `${user_type} not found` });
    }

    const query = `
      SELECT id, username, action, details, timestamp 
      FROM user_logs 
      WHERE username = $1 AND DATE(timestamp) BETWEEN $2 AND $3 
      ORDER BY timestamp DESC
    `;
    const result = await pool.query(query, [username, start_date, end_date]);
    const logs = result.rows;

    if (logs.length === 0) {
      console.log(`[${new Date().toISOString()}] No logs found for ${user_type}: ${username} between ${start_date} and ${end_date}`);
      return res.json({ success: true, data: { csv: '', logs: [] }, message: 'No logs found for the specified user and date range' });
    }

    if (format === 'csv') {
      let csv = 'ID,Username,Action,Details,Timestamp\n';
      logs.forEach(log => {
        csv += `${log.id},${log.username.replace(/^\d{8}_/, '')},${log.action},"${log.details.replace(/"/g, '""')}",${log.timestamp}\n`;
      });
      res.json({ success: true, data: { csv } });
    } else {
      res.json({ success: true, data: { logs } });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error exporting logs:`, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

module.exports = router;

