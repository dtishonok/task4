const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'postgres',
  password: '123',
  port: 5432
});

const setupDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL,
        is_blocked BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'active',
        last_login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) { console.error(err.message); }
};

setupDatabase();
module.exports = pool;