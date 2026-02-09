const express = require('express');
const session = require('cookie-session');
const pool = require('./db');
const path = require('path');
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
<html>
<head>
    <meta charset="UTF-8">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
    <style>
        body { background-color: #ffffff; font-family: sans-serif; color: #333; }
        .toolbar { border: 1px solid #dee2e6; border-radius: 4px; padding: 10px; margin-bottom: 0; background: #fff; }
        .btn-custom { border: 1px solid #0d6efd; color: #0d6efd; background: #fff; padding: 2px 12px; font-size: 14px; }
        .btn-custom:hover { background: #0d6efd; color: #fff; }
        .btn-danger-custom { border: 1px solid #dc3545; color: #dc3545; background: #fff; padding: 2px 12px; }
        .table thead th { border-bottom: 2px solid #dee2e6; color: #000; font-weight: bold; font-size: 14px; }
        .user-id { color: #6c757d; font-size: 12px; display: block; }
        .user-name { font-weight: 500; color: #000; }
        .form-check-input:checked { background-color: #0d6efd; border-color: #0d6efd; }
    </style>
</head>
<body class="p-4">
    ${user ? `<div class="mb-3 text-end small">Logged in as: <b>${user.email}</b> | <a href="/logout">Logout</a></div>` : ''}
    <div class="container-fluid">${body}</div>
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
            return res.redirect('/login?error=Account blocked or deleted');
        }
        req.currentUser = user;
        next();
    } catch {
        res.redirect('/login');
    }
};

app.get('/login', (req, res) => {
    res.send(layout(`
        <div class="row justify-content-center mt-5">
            <div class="col-md-4 card shadow-sm p-4 text-center">
                <h2 class="h4 mb-4">Authorization</h2>
                ${req.query.error ? `<div class="alert alert-warning py-2 small">${req.query.error}</div>` : ''}
                <form action="/login" method="POST">
                    <div class="mb-3"><input type="email" name="email" class="form-control" placeholder="Email" required></div>
                    <button class="btn btn-primary w-100">Login</button>
                </form>
                <div class="mt-3 small"><a href="/register">Create account</a></div>
            </div>
        </div>
    `));
});

app.post('/login', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email.toLowerCase()]);
        const user = result.rows[0];
        if (user && !user.is_blocked) {
            req.session.userId = user.id;
            await pool.query('UPDATE users SET last_login_time = NOW() WHERE id = $1', [user.id]);
            return res.redirect('/users');
        }
        return res.redirect('/login?error=Invalid email or blocked status');
    } catch {
        return res.redirect('/login?error=Server error');
    }
});

app.get('/users', async (req, res) => {
    const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
    const rows = result.rows.map(u => `
        <tr class="align-middle">
            <td><input type="checkbox" class="form-check-input" name="userIds" value="${u.id}"></td>
            <td>
                <span class="user-name">${u.name}</span>
                <span class="user-id">ID: ${u.id}</span>
            </td>
            <td>${u.email} <i class="bi bi-arrow-down small text-muted"></i></td>
            <td>${u.is_blocked ? 'Blocked' : 'Active'}</td>
            <td>
                <div class="small">${u.last_login_time ? u.last_login_time.toLocaleString() : 'less than a minute ago'}</div>
                <div class="d-flex gap-1 mt-1">
                    <div style="height:12px; width:4px; background:#a3c2ff"></div>
                    <div style="height:15px; width:4px; background:#70a1ff"></div>
                    <div style="height:10px; width:4px; background:#a3c2ff"></div>
                </div>
            </td>
        </tr>
    `).join('');

    res.send(layout(`
        <form action="/bulk" method="POST">
            <div class="toolbar d-flex justify-content-between align-items-center mb-3">
                <div class="d-flex gap-2">
                    <button name="action" value="block" class="btn btn-custom btn-sm"><i class="bi bi-lock-fill"></i> Block</button>
                    <button name="action" value="unblock" class="btn btn-custom btn-sm"><i class="bi bi-unlock-fill"></i></button>
                    <button name="action" value="delete" class="btn btn-danger-custom btn-sm"><i class="bi bi-trash-fill"></i></button>
                </div>
                <div>
                    <input type="text" class="form-control form-control-sm" placeholder="Filter" style="width: 250px;">
                </div>
            </div>
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th style="width: 40px;"><input type="checkbox" class="form-check-input" onclick="toggleAll(this)"></th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Last seen</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </form>
    `, req.currentUser));
});

    res.send(layout(`
        <form action="/bulk" method="POST">
            <div class="toolbar d-flex justify-content-between align-items-center mb-3">
                <div class="d-flex gap-2">
                    <button name="action" value="block" class="btn btn-custom btn-sm"><i class="bi bi-lock-fill"></i> Block</button>
                    <button name="action" value="unblock" class="btn btn-custom btn-sm"><i class="bi bi-unlock-fill"></i></button>
                    <button name="action" value="delete" class="btn btn-danger-custom btn-sm"><i class="bi bi-trash-fill"></i></button>
                </div>
                <div>
                    <input type="text" class="form-control form-control-sm" placeholder="Filter" style="width: 250px;">
                </div>
            </div>
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th style="width: 40px;"><input type="checkbox" class="form-check-input" onclick="toggleAll(this)"></th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Last seen</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </form>
    `, req.currentUser));
});

    res.send(layout(`
        <form action="/bulk" method="POST">
            <div class="toolbar d-flex justify-content-between align-items-center mb-3">
                <div class="d-flex gap-2">
                    <button name="action" value="block" class="btn btn-custom btn-sm"><i class="bi bi-lock-fill"></i> Block</button>
                    <button name="action" value="unblock" class="btn btn-custom btn-sm"><i class="bi bi-unlock-fill"></i></button>
                    <button name="action" value="delete" class="btn btn-danger-custom btn-sm"><i class="bi bi-trash-fill"></i></button>
                </div>
                <div>
                    <input type="text" class="form-control form-control-sm" placeholder="Filter" style="width: 250px;">
                </div>
            </div>
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th style="width: 40px;"><input type="checkbox" class="form-check-input" onclick="toggleAll(this)"></th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Last seen</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </form>
    `, req.currentUser));
});

app.post('/register', async (req, res) => {
    try {
        await pool.query('INSERT INTO users (name, email) VALUES ($1, $2)', [req.body.name, req.body.email.toLowerCase()]);
        res.redirect('/login?error=Registration successful');
    } catch (err) {
        res.status(500).send('Error during registration. Maybe email exists?');
    }
});

app.use(checkStatus);

app.get('/users', async (req, res) => {
    const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
    const rows = result.rows.map(u => `
        <tr>
            <td class="align-middle"><input type="checkbox" name="userIds" value="${u.id}"></td>
            <td class="align-middle">
                <div class="fw-bold">${u.name}</div>
                <div class="text-muted small">ID: ${u.id}</div>
            </td>
            <td class="align-middle">${u.email}</td>
            <td class="align-middle">
                <span class="badge ${u.is_blocked ? 'bg-secondary' : 'bg-success'}">
                    ${u.is_blocked ? 'Blocked' : 'Active'}
                </span>
            </td>
            <td class="align-middle text-muted small">
                ${u.last_login_time ? u.last_login_time.toLocaleString() : 'Never'}
            </td>
        </tr>
    `).join('');

    res.send(layout(`
        <div class="card shadow-sm border-0">
            <form action="/bulk" method="POST">
                <div class="card-header bg-white py-3 border-bottom-0">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="btn-toolbar gap-2">
                            <button name="action" value="block" class="btn btn-warning btn-sm d-flex align-items-center gap-1">
                                <i class="bi bi-lock-fill"></i> Block
                            </button>
                            <button name="action" value="unblock" class="btn btn-info btn-sm text-white">
                                <i class="bi bi-unlock-fill"></i>
                            </button>
                            <button name="action" value="delete" class="btn btn-danger btn-sm">
                                <i class="bi bi-trash-fill"></i>
                            </button>
                        </div>
                        <div>
                            <input type="text" class="form-control form-control-sm" placeholder="Filter" style="width: 150px;">
                        </div>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th><input type="checkbox" onclick="toggleAll(this)"></th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Last seen</th>
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
    const ids = Array.isArray(userIds) ? userIds : (userIds ? [userIds] : []);
    if (ids.length === 0) return res.redirect('/users');

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

module.exports = app;



