const express = require('express');
const session = require('cookie-session');
const pool = require('./db');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ name: 'session', keys: ['secret'], maxAge: 24 * 60 * 60 * 1000 }));

const layout = (body) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
    <style>
        body { background-color: #ffffff; font-family: -apple-system, sans-serif; margin: 0; }
        .login-page { display: flex; align-items: center; justify-content: center; height: 100vh; }
        .main-wrapper { display: flex; align-items: center; justify-content: center; gap: 80px; width: 100%; max-width: 1100px; padding: 40px; }
        .login-content { width: 350px; }
        .image-box {
            width: 500px; height: 500px;
            background: url('https://images.unsplash.com/photo-1498623116890-37e912163d5d?q=80&w=1974&auto=format&fit=crop') no-repeat center center; 
            background-size: cover; border-radius: 4px; flex-shrink: 0;
        }
        .nav-header { border-bottom: 1px solid #eee; padding: 15px 30px; display: flex; justify-content: space-between; position: fixed; top: 0; width: 100%; background: #fff; z-index: 1000; }
        .sparkline-bar { width: 4px; background: #0d6efd; border-radius: 1px; height: 100%; }
    </style>
</head>
<body>
    ${body}
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
            return res.redirect('/login?error=Invalid credentials or blocked');
        }
        req.currentUser = user;
        next();
    } catch { res.redirect('/login'); }
};

app.get('/login', (req, res) => {
    const errorMsg = req.query.error ? `<div class="alert alert-danger py-2 small mb-4 text-center" style="background-color: #f8d7da; border: 1px solid #f5c2c7; color: #842029;">${req.query.error}</div>` : '';
    res.send(layout(`
        <div class="login-page">
            <div class="main-wrapper">
                <div class="login-content text-center">
                    <h2 class="text-primary fw-bold mb-5" style="letter-spacing: 2px;">THE APP</h2>
                    <h4 class="fw-bold mb-4">Sign In</h4>
                    ${errorMsg}
                    <form action="/login" method="POST">
                        <input type="email" name="email" class="form-control mb-3" placeholder="Email" required>
                        <input type="password" name="password" class="form-control mb-3" value="123" required>
                        <button class="btn btn-primary w-100 py-2 fw-bold">Sign In</button>
                    </form>
                    <div class="mt-4 small text-muted">
                        New here? <a href="/register" class="text-primary fw-bold text-decoration-none">Sign up</a>
                    </div>
                </div>
                <div class="image-box"></div>
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
        res.redirect('/login?error=Invalid credentials or blocked');
    } catch { res.redirect('/login?error=Server error'); }
});

app.get('/register', (req, res) => {
    res.send(layout(`
        <div class="login-page">
            <div class="main-wrapper">
                <div class="login-content text-center">
                    <h2 class="text-primary fw-bold mb-5" style="letter-spacing: 2px;">THE APP</h2>
                    <h4 class="fw-bold mb-4">Create Account</h4>
                    <form action="/register" method="POST">
                        <input type="text" name="name" class="form-control mb-3" placeholder="Name" required>
                        <input type="email" name="email" class="form-control mb-3" placeholder="Email" required>
                        <button class="btn btn-primary w-100 py-2 fw-bold">Подключиться</button>
                    </form>
                    <div class="mt-3 small"><a href="/login">Back to Sign In</a></div>
                </div>
                <div class="image-box"></div>
            </div>
        </div>
    `));
});

app.post('/register', async (req, res) => {
    try {
        await pool.query('INSERT INTO users (name, email) VALUES ($1, $2)', [req.body.name, req.body.email.toLowerCase()]);
        res.redirect('/login?error=Success! Please Sign In');
    } catch (err) {
        res.redirect('/login?error=Email already exists');
    }
});

app.use(checkStatus);

app.get('/users', async (req, res) => {
    const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
    const rows = result.rows.map(u => `
        <tr class="align-middle">
            <td class="ps-4"><input type="checkbox" name="userIds" value="${u.id}" class="form-check-input"></td>
            <td><b>${u.name}</b><br><small class="text-muted">ID: ${u.id}</small></td>
            <td>${u.email}</td>
            <td>${u.is_blocked ? '<span class="badge bg-danger">Blocked</span>' : '<span class="badge bg-success">Active</span>'}</td>
            <td>
                <div class="small mb-1">${u.last_login_time ? u.last_login_time.toLocaleString() : 'Never'}</div>
                <div class="d-flex align-items-end gap-1" style="height: 18px;">
                    <div class="sparkline-bar"></div>
                </div>
            </td>
        </tr>
    `).join('');

    res.send(layout(`
        <div class="nav-header">
            <span class="text-primary fw-bold">THE APP</span>
            <div class="small">${req.currentUser.email} | <a href="/logout" class="text-danger">Logout</a></div>
        </div>
        <div class="container" style="margin-top: 100px;">
            <form action="/bulk" method="POST">
                <div class="mb-3 d-flex justify-content-between align-items-center">
                    <div>
                        <button name="action" value="block" class="btn btn-sm btn-outline-primary"><i class="bi bi-lock-fill"></i> Block</button>
                        <button name="action" value="unblock" class="btn btn-sm btn-outline-secondary"><i class="bi bi-unlock-fill"></i></button>
                        <button name="action" value="delete" class="btn btn-sm btn-danger text-white"><i class="bi bi-trash-fill"></i></button>
                    </div>
                </div>
                <div class="card shadow-sm">
                    <table class="table mb-0">
                        <thead class="table-light small text-uppercase">
                            <tr>
                                <th class="ps-4" style="width: 50px;"><input type="checkbox" class="form-check-input" onclick="toggleAll(this)"></th>
                                <th>Name</th><th>Email ↓</th><th>Status</th><th>Last Seen</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </form>
        </div>
    `));
});

app.post('/bulk', async (req, res) => {
    const { userIds, action } = req.body;
    const ids = Array.isArray(userIds) ? userIds : (userIds ? [userIds] : []);
    if (ids.length > 0) {
        if (action === 'block') {
            await pool.query('UPDATE users SET is_blocked = true WHERE id = ANY($1)', [ids]);
            if (ids.includes(req.session.userId.toString())) { req.session = null; return res.redirect('/login'); }
        } else if (action === 'unblock') {
            await pool.query('UPDATE users SET is_blocked = false WHERE id = ANY($1)', [ids]);
        } else if (action === 'delete') {
            await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
            if (ids.includes(req.session.userId.toString())) { req.session = null; return res.redirect('/login'); }
        }
    }
    res.redirect('/users');
});

app.get('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

module.exports = app;


