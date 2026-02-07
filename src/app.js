const express = require('express');
const session = require('cookie-session');
const pool = require('./db');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    name: 'session',
    keys: ['secret'],
    maxAge: 24 * 60 * 60 * 1000
}));

const layout = (body, user = null) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
    <title>Management System</title>
</head>
<body class="bg-light">
    <nav class="navbar navbar-dark bg-dark mb-4">
        <div class="container">
            <span class="navbar-brand">User Management</span>
            ${user ? `<div class="text-white">User: ${user.email} | <a href="/logout" class="btn btn-outline-light btn-sm">Logout</a></div>` : ''}
        </div>
    </nav>
    <div class="container">${body}</div>
    <script>
        function toggleAll(source) {
            const checkboxes = document.getElementsByName('userIds');
            for (let cb of checkboxes) cb.checked = source.checked;
        }
    </script>
</body>
</html>
`;

const checkStatus = async (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
        const user = result.rows[0];
        if (!user || user.is_blocked) {
            req.session = null;
            return res.redirect('/login?error=Session expired or account blocked');
        }
        req.currentUser = user;
        next();
    } catch {
        res.redirect('/login');
    }
};

app.get('/login', (req, res) => {
    res.send(layout(`
        <div class="row justify-content-center">
            <div class="col-md-5 card p-4 shadow-sm">
                <h2 class="h4 mb-3 text-center">Authorization</h2>
                ${req.query.error ? `<div class="alert alert-warning py-2 small">${req.query.error}</div>` : ''}
                <form action="/login" method="POST">
                    <div class="mb-3">
                        <input type="email" name="email" class="form-control" placeholder="Email" required>
                    </div>
                    <button class="btn btn-primary w-100">Login</button>
                </form>
                <div class="mt-3 text-center small">
                    <a href="/register">Create account</a>
                </div>
            </div>
        </div>
    `));
});

app.post('/login', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [req.body.email]
        );
        const user = result.rows[0];
        if (user && !user.is_blocked) {
            req.session.userId = user.id;
            await pool.query(
                'UPDATE users SET last_login_time = NOW() WHERE id = $1',
                [user.id]
            );
            return res.redirect('/users');
        }
        return res.redirect('/login?error=Invalid email or blocked status');
    } catch {
        return res.redirect('/login?error=Server error');
    }
});

app.get('/register', (req, res) => {
    res.send(layout(`
        <div class="row justify-content-center">
            <div class="col-md-5 card p-4 shadow-sm">
                <h2 class="h4 mb-3 text-center">Registration</h2>
                <form action="/register" method="POST">
                    <div class="mb-2">
                        <input type="text" name="name" class="form-control" placeholder="Full Name" required>
                    </div>
                    <div class="mb-3">
                        <input type="email" name="email" class="form-control" placeholder="Email" required>
                    </div>
                    <button class="btn btn-success w-100">Register</button>
                </form>
            </div>
        </div>
    `));
});

app.post('/register', async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO users (name, email) VALUES ($1, $2)',
            [req.body.name, req.body.email]
        );
        res.redirect('/login?error=Registration successful');
    } catch (err) {
        if (err.code === '23505') {
            return res.send(layout('<div class="alert alert-danger mt-5">Email already exists</div>'));
        }
        res.status(500).send('Storage Error');
    }
});

app.use(checkStatus);

app.get('/users', async (req, res) => {
    const result = await pool.query('SELECT * FROM users ORDER BY last_login_time DESC');
    const rows = result.rows.map(u => `
        <tr>
            <td><input type="checkbox" name="userIds" value="${u.id}"></td>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${u.last_login_time ? u.last_login_time.toLocaleString() : '-'}</td>
            <td>
                <span class="badge ${u.is_blocked ? 'bg-danger' : 'bg-success'}">
                    ${u.is_blocked ? 'Blocked' : 'Active'}
                </span>
            </td>
        </tr>
    `).join('');

    res.send(layout(`
        <div class="card shadow-sm">
            <form action="/bulk" method="POST">
                <div class="card-header bg-white py-3">
                    <div class="btn-toolbar gap-2">
                        <button name="action" value="block" class="btn btn-outline-warning btn-sm">Block</button>
                        <button name="action" value="unblock" class="btn btn-outline-info btn-sm">
                            <i class="bi bi-unlock"></i>
                        </button>
                        <button name="action" value="delete" class="btn btn-outline-danger btn-sm">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th><input type="checkbox" onclick="toggleAll(this)"></th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Last Login</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </form>
        </div>
    `, req.currentUser));
});

app.post('/bulk', async (req, res) => {
    const { userIds, action } = req.body;
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids[0]) return res.redirect('/users');
    if (action === 'block') await pool.query('UPDATE users SET is_blocked = true WHERE id = ANY($1)', [ids]);
    if (action === 'unblock') await pool.query('UPDATE users SET is_blocked = false WHERE id = ANY($1)', [ids]);
    if (action === 'delete') await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
    res.redirect('/users');
});

app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});
const express = require('express');
const session = require('cookie-session');
const pool = require('./db');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    name: 'session',
    keys: ['secret'],
    maxAge: 24 * 60 * 60 * 1000
}));

const layout = (body, user = null) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
    <title>Management System</title>
</head>
<body class="bg-light">
    <nav class="navbar navbar-dark bg-dark mb-4">
        <div class="container">
            <span class="navbar-brand">User Management</span>
            ${user ? `<div class="text-white">User: ${user.email} | <a href="/logout" class="btn btn-outline-light btn-sm">Logout</a></div>` : ''}
        </div>
    </nav>
    <div class="container">${body}</div>
    <script>
        function toggleAll(source) {
            const checkboxes = document.getElementsByName('userIds');
            for (let cb of checkboxes) cb.checked = source.checked;
        }
    </script>
</body>
</html>
`;

const checkStatus = async (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
        const user = result.rows[0];
        if (!user || user.is_blocked) {
            req.session = null;
            return res.redirect('/login?error=Session expired or account blocked');
        }
        req.currentUser = user;
        next();
    } catch {
        res.redirect('/login');
    }
};

app.get('/login', (req, res) => {
    res.send(layout(`
        <div class="row justify-content-center">
            <div class="col-md-5 card p-4 shadow-sm">
                <h2 class="h4 mb-3 text-center">Authorization</h2>
                ${req.query.error ? `<div class="alert alert-warning py-2 small">${req.query.error}</div>` : ''}
                <form action="/login" method="POST">
                    <div class="mb-3">
                        <input type="email" name="email" class="form-control" placeholder="Email" required>
                    </div>
                    <button class="btn btn-primary w-100">Login</button>
                </form>
                <div class="mt-3 text-center small">
                    <a href="/register">Create account</a>
                </div>
            </div>
        </div>
    `));
});

app.post('/login', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [req.body.email]
        );
        const user = result.rows[0];
        if (user && !user.is_blocked) {
            req.session.userId = user.id;
            await pool.query(
                'UPDATE users SET last_login_time = NOW() WHERE id = $1',
                [user.id]
            );
            return res.redirect('/users');
        }
        return res.redirect('/login?error=Invalid email or blocked status');
    } catch {
        return res.redirect('/login?error=Server error');
    }
});

app.get('/register', (req, res) => {
    res.send(layout(`
        <div class="row justify-content-center">
            <div class="col-md-5 card p-4 shadow-sm">
                <h2 class="h4 mb-3 text-center">Registration</h2>
                <form action="/register" method="POST">
                    <div class="mb-2">
                        <input type="text" name="name" class="form-control" placeholder="Full Name" required>
                    </div>
                    <div class="mb-3">
                        <input type="email" name="email" class="form-control" placeholder="Email" required>
                    </div>
                    <button class="btn btn-success w-100">Register</button>
                </form>
            </div>
        </div>
    `));
});

app.post('/register', async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO users (name, email) VALUES ($1, $2)',
            [req.body.name, req.body.email]
        );
        res.redirect('/login?error=Registration successful');
    } catch (err) {
        if (err.code === '23505') {
            return res.send(layout('<div class="alert alert-danger mt-5">Email already exists</div>'));
        }
        res.status(500).send('Storage Error');
    }
});

app.use(checkStatus);

app.get('/users', async (req, res) => {
    const result = await pool.query('SELECT * FROM users ORDER BY last_login_time DESC');
    const rows = result.rows.map(u => `
        <tr>
            <td><input type="checkbox" name="userIds" value="${u.id}"></td>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${u.last_login_time ? u.last_login_time.toLocaleString() : '-'}</td>
            <td>
                <span class="badge ${u.is_blocked ? 'bg-danger' : 'bg-success'}">
                    ${u.is_blocked ? 'Blocked' : 'Active'}
                </span>
            </td>
        </tr>
    `).join('');

    res.send(layout(`
        <div class="card shadow-sm">
            <form action="/bulk" method="POST">
                <div class="card-header bg-white py-3">
                    <div class="btn-toolbar gap-2">
                        <button name="action" value="block" class="btn btn-outline-warning btn-sm">Block</button>
                        <button name="action" value="unblock" class="btn btn-outline-info btn-sm">
                            <i class="bi bi-unlock"></i>
                        </button>
                        <button name="action" value="delete" class="btn btn-outline-danger btn-sm">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th><input type="checkbox" onclick="toggleAll(this)"></th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Last Login</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </form>
        </div>
    `, req.currentUser));
});

app.post('/bulk', async (req, res) => {
    const { userIds, action } = req.body;
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids[0]) return res.redirect('/users');
    if (action === 'block') await pool.query('UPDATE users SET is_blocked = true WHERE id = ANY($1)', [ids]);
    if (action === 'unblock') await pool.query('UPDATE users SET is_blocked = false WHERE id = ANY($1)', [ids]);
    if (action === 'delete') await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
    res.redirect('/users');
});

app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});
module.exports = app;


