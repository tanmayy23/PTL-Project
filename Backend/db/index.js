// db/index.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Force connection on startup
pool.query('SELECT NOW()')
  .then(res => {
    console.log('✅ Connected to PostgreSQL at', res.rows[0].now);
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.message);
  });

module.exports = pool;
