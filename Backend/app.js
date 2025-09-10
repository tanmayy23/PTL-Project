const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const PGSession = require('connect-pg-simple')(session);
const fs = require('fs');

const app = express();

// Verify db.js exists
try {
  const dbPath = path.join(__dirname, 'db.js');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ db.js not found at ${dbPath}`);
    process.exit(1);
  }
  console.log(`✅ db.js found at ${dbPath}`);
} catch (error) {
  console.error('❌ Error checking db.js:', error.message, error.stack);
  process.exit(1);
}

// Database connection
const pool = require('./db');

// Verify database connection
async function verifyDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    const res = await client.query('SELECT current_database(), current_schema');
    console.log(`Current database: ${res.rows[0].current_database}, Current schema: ${res.rows[0].current_schema}`);
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('materials_new', 'handlers', 'handler_sessions', 'end_users', 'user_logs')
    `);
    tableCheck.rows.forEach(row => {
      console.log(`✅ Table public.${row.table_name} exists`);
    });
    if (!tableCheck.rows.some(row => row.table_name === 'materials_new')) {
      console.error('❌ Table public.materials_new does not exist');
    }
    if (!tableCheck.rows.some(row => row.table_name === 'handlers')) {
      console.error('❌ Table public.handlers does not exist');
    }
    if (!tableCheck.rows.some(row => row.table_name === 'handler_sessions')) {
      console.error('❌ Table public.handler_sessions does not exist');
    }
    if (!tableCheck.rows.some(row => row.table_name === 'end_users')) {
      console.error('❌ Table public.end_users does not exist');
    }
    if (!tableCheck.rows.some(row => row.table_name === 'user_logs')) {
      console.error('❌ Table public.user_logs does not exist');
    }
    const rowCount = await client.query('SELECT COUNT(*) FROM public.materials_new WHERE LOWER(TRIM(status)) = $1', ['withreceiver']);
    console.log(`✅ Found ${rowCount.rows[0].count} rows in materials_new with status = 'withReceiver'`);
    client.release();
  } catch (error) {
    console.error('❌ Database connection error:', error.message, error.stack);
  }
}

// Initialize handlers table
async function initHandlersTable() {
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS handlers (
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        PRIMARY KEY (username)
      );
      CREATE TABLE IF NOT EXISTS handler_sessions (
        sid VARCHAR PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      );
    `;
    await pool.query(createTableQuery);
    console.log('✅ handlers and handler_sessions tables created or already exist');

    const insertQuery = `
      INSERT INTO handlers (username, password) VALUES
        ('15001870_DP Kuniya_General', 'admin'),
        ('15002610_VK Patel_Chemicals', 'admin'),
        ('15002563_RS Patel_Valve', 'admin'),
        ('15003246_JD Pandya_Project-MM', 'admin'),
        ('15003690_KB Patel_Machine Spare Banas 1', 'admin'),
        ('15003455_BH Patel_Packing', 'admin'),
        ('15003504_CM Patel_Machine Spare Banas 2', 'admin'),
        ('15004411_HN Korot_Tools', 'admin'),
        ('15004415_RS Chaudhary_Stationary General', 'admin'),
        ('15004472_MK Dekaliya_Electrical', 'admin'),
        ('15003442_DR Pilat_Lab and Pipe Material', 'admin'),
        ('15005536_SB Chaudhary_Bearings Vbelts', 'admin'),
        ('15006116_PV Chibhadiya_Ghee Packing', 'admin'),
        ('Other', 'admin')
      ON CONFLICT (username) DO NOTHING;
    `;
    await pool.query(insertQuery);
    console.log('✅ Handlers populated with default password "admin"');
  } catch (error) {
    console.error('❌ Error initializing handlers table:', error.message, error.stack);
  }
}

Promise.all([verifyDatabaseConnection(), initHandlersTable()]).then(() => {
  console.log('✅ Database and tables initialized');
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}, Session: ${req.session?.id || 'none'}`);
  next();
});
app.use((req, res, next) => {
  res.formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d)) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };
  next();
});

// Static Files
app.use(express.static(path.join(__dirname, '..')));

// Explicit routes for HTML files
app.get('/handler.html', (req, res) => {
  console.log(`[${new Date().toISOString()}] Serving handler.html`);
  res.sendFile(path.join(__dirname, '../handler.html'));
});

app.get('/receiver.html', (req, res) => {
  console.log(`[${new Date().toISOString()}] Serving receiver.html`);
  res.sendFile(path.join(__dirname, '../receiver.html'));
});

app.get('/enduser.html', (req, res) => {
  console.log(`[${new Date().toISOString()}] Serving enduser.html`);
  res.sendFile(path.join(__dirname, '../enduser.html'));
});

app.get('/admin.html', (req, res) => {
  console.log(`[${new Date().toISOString()}] Serving admin.html`);
  res.sendFile(path.join(__dirname, '../admin.html'));
});

app.get('/dashboard.html', (req, res) => {
  console.log(`[${new Date().toISOString()}] Serving dashboard.html`);
  res.sendFile(path.join(__dirname, '../dashboard.html'));
});

// Route imports
let receiverRoutes, handlerRoutes, endUserRoutes, logsRoutes, dashboardRoutes, adminRoutes;
try {
  receiverRoutes = require('./routes/receiver');
  console.log('✅ receiverRoutes loaded');
} catch (e) {
  console.error('❌ Error loading receiverRoutes:', e.message, e.stack);
}
try {
  handlerRoutes = require('./routes/handler');
  console.log('✅ handlerRoutes loaded');
} catch (e) {
  console.error('❌ Error loading handlerRoutes:', e.message, e.stack);
}
try {
  endUserRoutes = require('./routes/enduser');
  console.log('✅ endUserRoutes loaded');
} catch (e) {
  console.error('❌ Error loading endUserRoutes:', e.message, e.stack);
}
try {
  logsRoutes = require('./routes/logs');
  console.log('✅ logsRoutes loaded');
} catch (e) {
  console.error('❌ Error loading logsRoutes:', e.message, e.stack);
}
try {
  dashboardRoutes = require('./routes/dashboard');
  console.log('✅ dashboardRoutes loaded');
} catch (e) {
  console.error('❌ Error loading dashboardRoutes:', e.message, e.stack);
}
try {
  adminRoutes = require('./routes/admin');
  console.log('✅ adminRoutes loaded');
} catch (e) {
  console.error('❌ Error loading adminRoutes:', e.message, e.stack);
}

// Session middleware for each route
const handlerSession = session({
  name: 'handler_session',
  store: new PGSession({
    pool: pool,
    tableName: 'handler_sessions'
  }),
  secret: 'ptl_material_flow_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});
const receiverSession = session({
  name: 'receiver_session',
  store: new PGSession({
    pool: pool,
    tableName: 'receiver_sessions'
  }),
  secret: 'ptl_material_flow_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});
const endUserSession = session({
  name: 'enduser_session',
  store: new PGSession({
    pool: pool,
    tableName: 'enduser_sessions'
  }),
  secret: 'ptl_material_flow_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});
const adminSession = session({
  name: 'admin_session',
  store: new PGSession({
    pool: pool,
    tableName: 'admin_sessions'
  }),
  secret: 'ptl_material_flow_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});
const dashboardSession = session({
  name: 'dashboard_session',
  store: new PGSession({
    pool: pool,
    tableName: 'dashboard_sessions'
  }),
  secret: 'ptl_material_flow_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});
const logsSession = session({
  name: 'logs_session',
  store: new PGSession({
    pool: pool,
    tableName: 'logs_sessions'
  }),
  secret: 'ptl_material_flow_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});

// API Routes with specific session middleware
if (receiverRoutes) app.use('/api/receiver', receiverSession, receiverRoutes);
else console.warn('⚠️ Warning: /api/receiver routes not loaded');
if (handlerRoutes) app.use('/api/handler', handlerSession, handlerRoutes);
else console.warn('⚠️ Warning: /api/handler routes not loaded');
if (endUserRoutes) app.use('/api/enduser', endUserSession, endUserRoutes);
else console.warn('⚠️ Warning: /api/enduser routes not loaded');
if (logsRoutes) app.use('/api/logs', logsSession, logsRoutes);
else console.warn('⚠️ Warning: /api/logs routes not loaded');
if (dashboardRoutes) app.use('/api/dashboard', dashboardSession, dashboardRoutes);
else console.warn('⚠️ Warning: /api/dashboard routes not loaded');
if (adminRoutes) app.use('/api/admin', adminSession, adminRoutes);
else console.warn('⚠️ Warning: /api/admin routes not loaded');

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Fallback for unknown routes
app.use((req, res) => {
  console.log(`[${new Date().toISOString()}] Unknown route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: `Cannot ${req.method} ${req.originalUrl}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message, err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Server Startup
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});