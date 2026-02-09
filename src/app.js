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
        body { background-color: #ffffff; font-family: -apple-system, sans-serif; height: 100vh; margin: 0; }
        .login-container { display: flex; height: 100vh; width: 100%; }
        .login-form-side { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; }
        .login-image-side { 
            flex: 1; 
            background: url('https://i.ibb.co/vYm09Pz/image-c083a0.png') no-repeat center center; 
            background-size: cover; 
            display: block;
        }
        @media (max-width: 992px) { .login-image-side { display: none; } }
        .btn-toolbar-custom .btn { border: 1px solid #dee2e6; background: #fff; color: #0d6efd; padding: 4px 12px; margin-right: 4px; }
        .btn-toolbar-custom .btn-danger { color: #dc3545; }
        .form-check-input:checked { background-color: #0d6efd; border-color: #0d6efd; }
        .nav-header { border-bottom: 1px solid #eee; padding: 15px 30px; display: flex; justify-content: space-between; }
        .user-name { font-weight: 500; color: #000; display: block; }
        .user-info { font-size: 0.75rem; color: #6c757d; }
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
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    const user = result.rows[0];
    if (!user || user.is_blocked) {
        req.session = null;
        return res.redirect('/login?error=Your account is blocked or deleted');
    }
    req.currentUser = user;
    next();
};

app.get('/login', (req, res) => {
    const errorMsg = req.query.error ? `<div class="alert alert-danger py-2 small mb-4">${req.query.error}</div>` : '';
    res.send(layout(`
        <div class="login-container">
            <div class="login-form-side">
                <div style="width: 100%; max-width: 380px;">
                    <h2 class="text-primary fw-bold mb-5" style="letter-spacing: 2px;">THE APP</h2>
                    <p class="text-muted mb-1 small">Start your journey</p>
                    <h4 class="fw-bold mb-4">Sign In to The App</h4>
                    ${errorMsg}
                    <form action="/login" method="POST">
                        <div class="mb-3">
                            <label class="small text-muted mb-1">E-mail</label>
                            <input type="email" name="email" class="form-control py-2" placeholder="test@example.com" required>
                        </div>
                        <div class="mb-3">
                            <label class="small text-muted mb-1">Password</label>
                            <input type="password" name="password" class="form-control py-2" value="123" required>
                        </div>
                        <div class="form-check mb-4">
                            <input type="checkbox" class="form-check-input" id="rem">
                            <label class="form-check-label small text-muted" for="rem">Remember me</label>
                        </div>
                        <button class="btn btn-primary w-100 py-2 mb-4 fw-bold">Sign In</button>
                    </form>
                    <div class="d-flex justify-content-between small">
                        <span>Don't have an account? <a href="/register" class="text-primary text-decoration-none">Sign up</a></span>
                        <a href="#" class="text-primary text-decoration-none">Forgot password?</a>
                    </div>
                </div>
            </div>
            <div class="login-image-side"></div>
        </div>
    `));
});

app.post('/login', async (req, res) => {
    const { email } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];

    if (!user) return res.redirect('/login?error=User not found');
    if (user.is_blocked) return res.redirect('/login?error=Access denied: User is blocked');

    req.session.userId = user.id;
    await pool.query('UPDATE users SET last_login_time = NOW() WHERE id = $1', [user.id]);
    res.redirect('/users');
});

app.get('/register', (req, res) => {
    res.send(layout(`
        <div class="container mt-5">
            <div class="row justify-content-center">
                <div class="col-md-4 text-center">
                    <h2 class="text-primary fw-bold mb-4">THE APP</h2>
                    <div class="card p-4 shadow-sm border-0">
                        <h5 class="mb-4">Create Account</h5>
                        <form action="/register" method="POST">
                            <input type="text" name="name" class="form-control mb-3" placeholder="Full Name" required>
                            <input type="email" name="email" class="form-control mb-3" placeholder="Email Address" required>
                            <button class="btn btn-success w-100 py-2">Sign Up</button>
                        </form>
                        <div class="mt-3 small"><a href="/login">Already have an account?</a></div>
                    </div>
                </div>
            </div>
        </div>
    `));
});

app.post('/register', async (req, res) => {
    try {
        await pool.query('INSERT INTO users (name, email) VALUES ($1, $2)', [req.body.name, req.body.email.toLowerCase()]);
        res.redirect('/login?error=Registration successful! Please login.');
    } catch { res.redirect('/register?error=Email already exists'); }
});

app.use(checkStatus);

app.get('/users', async (req, res) => {
    const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
    const rows = result.rows.map(u => `
        <tr class="align-middle">
            <td class="ps-4"><input type="checkbox" class="form-check-input" name="userIds" value="${u.id}"></td>
            <td><span class="user-name">${u.name}</span><span class="user-info">ID: ${u.id}</span></td>
            <td>${u.email} <i class="bi bi-arrow-down small text-muted"></i></td>
            <td>${u.is_blocked ? '<span class="text-danger">Blocked</span>' : '<span class="text-success">Active</span>'}</td>
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
            <span class="text-primary fw-bold fs-5">THE APP</span>
            <div class="small mt-1">Logged in as: <b>${req.currentUser.email}</b> | <a href="/logout" class="text-danger">Logout</a></div>
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
                <table class="table table-hover border-top">
                    <thead>
                        <tr class="text-muted">
                            <th class="ps-4" style="width: 50px;"><input type="checkbox" class="form-check-input" onclick="toggleAll(this)"></th>
                            <th>NAME</th>
                            <th>EMAIL</th>
                            <th>STATUS</th>
                            <th>LAST SEEN</th>
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



