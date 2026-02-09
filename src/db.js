const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const initDatabase = async () => {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) DEFAULT '123',
                is_blocked BOOLEAN DEFAULT false,
                last_login_time TIMESTAMP
            );
        `;
        await pool.query(createTableQuery);
        console.log('Database ready ✅');
    } catch (err) {
        console.error(err.message);
    }
};

pool.query('SELECT NOW()', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        initDatabase();
    }
});

module.exports = pool;






