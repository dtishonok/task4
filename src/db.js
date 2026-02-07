const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Функция для автоматического создания таблицы
const initDb = async () => {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                last_login TIMESTAMP,
                registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.query(createTableQuery);
        console.log('Таблица users готова к работе! ✅');
    } catch (err) {
        console.error('Ошибка при создании таблицы:', err.message);
    }
};

// Запускаем проверку при подключении
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.message);
    } else {
        console.log('База данных успешно подключена! 🐘');
        initDb(); // Создаем таблицу, если её нет
    }
});

module.exports = pool;


