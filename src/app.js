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
        body { background-color: #ffffff; font-family: -apple-system, sans-serif; margin: 0; min-height: 100vh; }
        .login-page { display: flex; align-items: center; justify-content: center; height: 100vh; }
        .main-wrapper { display: flex; align-items: center; justify-content: center; gap: 80px; width: 100%; max-width: 1100px; padding: 40px; }
        .login-content { width: 350px; }
        .image-box {
            width: 500px; height: 500px;
            background: url('https://images.unsplash.com/photo-1498623116890-37e912163d5d?q=80&w=1974&auto=format&fit=crop') no-repeat center center; 
            background-size: cover; border-radius: 4px; flex-shrink: 0;
        }
        @media (max-width: 992px) { .main-wrapper { flex-direction: column; gap: 40px; } .image-box { width: 300px; height: 300px; } }
        .nav-header { border-bottom: 1px solid #eee; padding: 15px 30px; display: flex; justify-content: space-between; position: fixed; top: 0; width: 100%; background: #fff; z-index: 1000; }
        .btn-toolbar-custom .btn { border: 1px solid #dee2e6; background: #fff; color: #0d6efd; padding: 4px 12px; margin-right: 4px; border-radius: 4px; }
        .sparkline-bar { width: 4px; background: #0d6efd; border-radius: 1px; }
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
            return res.redirect('/login?error=Your account is blocked or deleted');
        }
        req.currentUser = user;
        next();
    } catch { res.redirect('/login'); }
};

app.get('/login', (req, res) => {
    const errorMsg = req.query.error ? `<div class="alert alert-danger py-2 small mb-4 text-center">${req.query.error}</div>` : '';
    res.send(layout(`
        <div class="login-page">
            <div class="main-wrapper">
                <div class="login-content">
                    <h2 class="text-primary fw-bold mb-5" style="letter-spacing: 2px;">THE APP</h2>
                    <p class="text-muted mb-1 small">Start your journey</p>
                    <h4 class="fw-bold mb-4">Sign In to The App</h4>
                    ${errorMsg}
                    <form action="/login" method="POST">
                        <div class="mb-3">
                            <label class="small text-muted mb-1">E-mail</label>
                            <input type="email" name="email" class="form-control" required>
                        </div>
                        <div class="mb-3">
                            <label class="small text-muted mb-1">Password</label>
                            <input type="password" name="password" class="form-control" value="123" required>
                        </div>
                        <button class="btn btn-primary w-100 py-2 mb-4 fw-bold">Sign In</button>
                    </form>
                    <div class="small text-center">
                        <span>New here? <a href="/register" class="text-primary text-decoration-none">Sign up</a></span>
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
    const errorMsg = req.query.error ? `<div class="alert alert-danger py-2 small mb-4 text-center">${req.query.error}</div>` : '';
    res.send(layout(`
        <div class="container py-5 text-center">
            <h2 class="text-primary fw-bold mb-4">THE APP</h2>
            <div class="card p-4 mx-auto shadow-sm border-0" style="max-width: 400px; background: #f8f9fa;">
                <h5 class="fw-bold mb-4">Create Account</h5>
                ${errorMsg}
                <form action="/register" method="POST">
                    <input type="text" name="name" class="form-control mb-3" placeholder="Name" required>
                    <input type="email" name="email" class="form-control mb-3" placeholder="Email" required>
                    <button class="btn btn-success w-100">Sign Up</button>
                </form>
                <a href="/login" class="d-block mt-3 small text-decoration-none">Back to Login</a>
            </div>
        </div>
    `));
});

app.post('/register', async (req, res) => {
    try {
        await pool.query('INSERT INTO users (name, email) VALUES ($1, $2)', [req.body.name, req.body.email.toLowerCase()]);
        res.redirect('/login?error=Success! Please login');
    } catch (err) {
        if (err.code === '23505') return res.redirect('/register?error=Email already exists');
        res.redirect('/register?error=Error');
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
                    <div class="sparkline-bar" style="height: 40%; opacity: 0.3;"></div>
                    <div class="sparkline-bar" style="height: 70%; opacity: 0.5;"></div>
                    <div class="sparkline-bar" style="height: 30%; opacity: 0.3;"></div>
                    <div class="sparkline-bar" style="height: 90%; opacity: 0.8;"></div>
                    <div class="sparkline-bar" style="height: 50%; opacity: 0.4;"></div>
                    <div class="sparkline-bar" style="height: 100%;"></div>
                </div>
            </td>
        </tr>
    `).join('');

    res.send(layout(`
        <div class="nav-header">
            <span class="text-primary fw-bold">THE APP</span>
            <div class="small"><b>${req.currentUser.email}</b> | <a href="/logout" class="text-danger ms-2 text-decoration-none">Logout</a></div>
        </div>
        <div class="container" style="margin-top: 100px; max-width: 1000px;">
            <form action="/bulk" method="POST">
                <div class="btn-toolbar-custom mb-3 d-flex justify-content-between">
                    <div>
                        <button name="action" value="block" class="btn btn-sm btn-outline-primary"><i class="bi bi-lock-fill"></i> Block</button>
                        <button name="action" value="unblock" class="btn btn-sm btn-outline-secondary"><i class="bi bi-unlock-fill"></i></button>
                        <button name="action" value="delete" class="btn btn-sm btn-danger text-white"><i class="bi bi-trash-fill"></i></button>
                    </div>
                    <input type="text" class="form-control form-control-sm w-25" placeholder="Filter">
                </div>
                <div class="table-responsive shadow-sm" style="border-radius: 8px;">
                    <table class="table table-hover border mb-0 bg-white">
                        <thead class="table-light small text-muted">
                            <tr>
                                <th class="ps-4" style="width:40px;"><input type="checkbox" class="form-check-input" onclick="toggleAll(this)"></th>
                                <th>NAME</th>
                                <th>EMAIL <i class="bi bi-arrow-down"></i></th>
                                <th>STATUS</th>
                                <th>LAST SEEN</th>
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
            if (req.session.userId && ids.includes(req.session.userId.toString())) {
                req.session = null;
                return res.redirect('/login?error=Account blocked');
            }
        } else if (action === 'unblock') {
            await pool.query('UPDATE users SET is_blocked = false WHERE id = ANY($1)', [ids]);
        } else if (action === 'delete') {
            await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
            if (req.session.userId && ids.includes(req.session.userId.toString())) {
                req.session = null;
                return res.redirect('/login?error=Account deleted');
            }
        }
    }
    res.redirect('/users');
});

app.get('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));

module.exports = app;

