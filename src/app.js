const express = require('express');
const session = require('cookie-session');
const pool = require('./db');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ name: 'session', keys: ['secret'], maxAge: 24 * 60 * 60 * 1000 }));

const layout = (body, user = null) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
    <style>
        body { background-color: #ffffff; font-family: -apple-system, sans-serif; }
        .btn-toolbar-custom .btn { border: 1px solid #dee2e6; background: #fff; color: #0d6efd; padding: 4px 12px; margin-right: 4px; }
        .btn-toolbar-custom .btn-danger { color: #dc3545; }
        .table thead th { border-top: none; color: #000; font-size: 0.85rem; padding: 12px; }
        .user-name { font-weight: 500; color: #000; display: block; }
        .user-info { font-size: 0.75rem; color: #6c757d; }
        .form-check-input:checked { background-color: #0d6efd; border-color: #0d6efd; }
        .login-split { display: flex; min-height: 100vh; }
        .login-form-side { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; }
        .login-image-side { flex: 1; background: url('https://w.wallhaven.cc/full/2e/wallhaven-2em8p9.jpg') no-repeat center center; background-size: cover; }
        .nav-header { border-bottom: 1px solid #eee; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; }
    </style>
</head>
<body>
    <div class="container-fluid p-0">${body}</div>
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
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    const user = result.rows[0];
    if (!user || user.is_blocked) { req.session = null; return res.redirect('/login'); }
    req.currentUser = user;
    next();
};

app.get('/login', (req, res) => {
    res.send(layout(`
        <div class="login-split">
            <div class="login-form-side">
                <div style="width: 100%; max-width: 350px;">
                    <h2 class="text-primary fw-bold mb-5">THE APP</h2>
                    <p class="text-muted mb-1 small">Start your journey</p>
                    <h4 class="fw-bold mb-4">Sign In to The App</h4>
                    <form action="/login" method="POST">
                        <div class="mb-3">
                            <label class="small text-muted">E-mail</label>
                            <input type="email" name="email" class="form-control" placeholder="test@example.com" required>
                        </div>
                        <div class="mb-3">
                            <label class="small text-muted">Password</label>
                            <input type="password" name="password" class="form-control" value="123" required>
                        </div>
                        <div class="form-check mb-4 small">
                            <input type="checkbox" class="form-check-input" id="rem">
                            <label class="form-check-label" for="rem">Remember me</label>
                        </div>
                        <button class="btn btn-primary w-100 py-2 mb-4">Sign In</button>
                    </form>
                    <div class="d-flex justify-content-between small">
                        <a href="/register" class="text-decoration-none">Sign up</a>
                        <a href="#" class="text-decoration-none text-muted">Forgot password?</a>
                    </div>
                </div>
            </div>
            <div class="login-image-side d-none d-lg-block"></div>
        </div>
    `));
});

app.post('/login', async (req, res) => {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email.toLowerCase()]);
    const user = result.rows[0];
    if (user && !user.is_blocked) {
        req.session.userId = user.id;
        await pool.query('UPDATE users SET last_login_time = NOW() WHERE id = $1', [user.id]);
        return res.redirect('/users');
    }
    res.redirect('/login?error=Invalid access');
});

app.get('/register', (req, res) => {
    res.send(layout(`
        <div class="p-5 text-center">
            <h2 class="text-primary fw-bold mb-4">THE APP</h2>
            <form action="/register" method="POST" class="mx-auto" style="max-width:300px">
                <input type="text" name="name" class="form-control mb-2" placeholder="Name" required>
                <input type="email" name="email" class="form-control mb-3" placeholder="Email" required>
                <button class="btn btn-success w-100">Register</button>
            </form>
        </div>
    `));
});

app.post('/register', async (req, res) => {
    try {
        await pool.query('INSERT INTO users (name, email) VALUES ($1, $2)', [req.body.name, req.body.email.toLowerCase()]);
        res.redirect('/login');
    } catch { res.send('Error'); }
});

app.use(checkStatus);

app.get('/users', async (req, res) => {
    const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
    const rows = result.rows.map(u => `
        <tr class="align-middle">
            <td class="ps-4"><input type="checkbox" class="form-check-input" name="userIds" value="${u.id}"></td>
            <td>
                <span class="user-name">${u.name}</span>
                <span class="user-info">ID: ${u.id}</span>
            </td>
            <td>${u.email} <i class="bi bi-arrow-down small text-muted"></i></td>
            <td>${u.is_blocked ? 'Blocked' : 'Active'}</td>
            <td>
                <div class="small">${u.last_login_time ? u.last_login_time.toLocaleString() : 'Never'}</div>
                <div class="d-flex gap-1 mt-1 opacity-50">
                    <div style="height:12px; width:4px; background:#0d6efd"></div>
                    <div style="height:15px; width:4px; background:#0d6efd"></div>
                    <div style="height:8px; width:4px; background:#0d6efd"></div>
                </div>
            </td>
        </tr>
    `).join('');

    res.send(layout(`
        <div class="nav-header">
            <span class="text-primary fw-bold">THE APP</span>
            <div class="small">User: <b>${req.currentUser.email}</b> | <a href="/logout">Logout</a></div>
        </div>
        <div class="p-4">
            <form action="/bulk" method="POST">
                <div class="btn-toolbar-custom d-flex justify-content-between mb-4">
                    <div class="d-flex">
                        <button name="action" value="block" class="btn btn-sm"><i class="bi bi-lock-fill"></i> Block</button>
                        <button name="action" value="unblock" class="btn btn-sm"><i class="bi bi-unlock-fill"></i></button>
                        <button name="action" value="delete" class="btn btn-sm btn-danger"><i class="bi bi-trash-fill"></i></button>
                    </div>
                    <input type="text" class="form-control form-control-sm w-25" placeholder="Filter">
                </div>
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th class="ps-4"><input type="checkbox" class="form-check-input" onclick="toggleAll(this)"></th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Last seen</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </form>
        </div>
    `, req.currentUser));
});

app.post('/bulk', async (req, res) => {
    const { userIds, action } = req.body;
    const ids = Array.isArray(userIds) ? userIds : (userIds ? [userIds] : []);
    if (ids.length > 0) {
        if (action === 'block') await pool.query('UPDATE users SET is_blocked = true WHERE id = ANY($1)', [ids]);
        else if (action === 'unblock') await pool.query('UPDATE users SET is_blocked = false WHERE id = ANY($1)', [ids]);
        else if (action === 'delete') await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
    }
    res.redirect('/users');
});

app.get('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

module.exports = app;




