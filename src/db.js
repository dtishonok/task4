const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Функция, которая автоматически пересоздаст правильную таблицу
const fixDatabase = async () => {
    try {
        // Сначала удаляем старую таблицу, чтобы создать новую с правильными полями
        await pool.query('DROP TABLE IF EXISTS users CASCADE;');
        
        const createTableQuery = `
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) DEFAULT '123',
                is_blocked BOOLEAN DEFAULT false,
                last_login_time TIMESTAMP
            );
        `;
        await pool.query(createTableQuery);
        console.log('Таблица users успешно пересоздана под app.js! ✅');
    } catch (err) {
        console.error('Ошибка при обновлении таблицы:', err.message);
    }
};

// Проверка подключения и запуск исправления
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.message);
    } else {
        console.log('База подключена. Начинаю обновление структуры...');
        fixDatabase();
    }
});

module.exports = pool;



