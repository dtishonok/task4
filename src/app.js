const express = require('express');
const session = require('cookie-session');
const pool = require('./db'); 
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ name: 'session', keys: ['secret'], maxAge: 24 * 60 * 60 * 1000 }));

app.get('/', (req, res) => res.redirect('/register'));

const layout = (body) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
<style>
body { font-family: -apple-system, sans-serif; margin: 0; background: #fff; }
.login-page { display: flex; justify-content: center; align-items: center; height: 100vh; }
.main-wrapper { display: flex; justify-content: center; align-items: center; gap: 80px; width: 100%; max-width: 1100px; padding: 40px; }
.login-content { width: 350px; }
.image-box { width: 500px; height: 500px; background: url('https://images.unsplash.com/photo-1498623116890-37e912163d5d?q=80&w=1974&auto=format&fit=crop') no-repeat center/cover; border-radius: 4px; flex-shrink: 0; }
.nav-header { border-bottom: 1px solid #eee; padding: 15px 30px; display: flex; justify-content: space-between; position: fixed; top: 0; width: 100%; background: #fff; z-index: 1000; }
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
            return res.redirect('/login?error=Account blocked or deleted');
        }
        req.currentUser = user;
        next();
    } catch { res.redirect('/login'); }
};

app.get('/login', (req, res) => {
    const errorMsg = req.query.error ? `<div class="alert alert-danger py-2 mb-4 text-center small">${req.query.error}</div>` : '';
    res.send(layout(`
    <div class="login-page">
      <div class="main-wrapper">
        <div class="login-content text-center">
          <h2 class="text-primary fw-bold mb-5">THE APP</h2>
          <h4 class="fw-bold mb-4">Sign In</h4>
          ${errorMsg}
          <form action="/login" method="POST">
            <input type="email" name="email" class="form-control mb-3" placeholder="Email" required>
            <input type="text" name="name" class="form-control mb-3" placeholder="Your Name" required>
            <button class="btn btn-primary w-100 py-2 fw-bold">Sign In</button>
          </form>
          <div class="mt-4 small text-muted">New here? <a href="/register" class="text-primary fw-bold">Register</a></div>
        </div>
        <div class="image-box"></div>
      </div>
    </div>
  `));
});

app.post('/login', async (req, res) => {
    try {
        const { email, name } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1 AND name = $2', [email.toLowerCase().trim(), name.trim()]);
        const user = result.rows[0];

        if (user && !user.is_blocked) {
            req.session.userId = user.id;
            await pool.query('UPDATE users SET last_login_time = NOW() WHERE id = $1', [user.id]);
            return res.redirect('/users');
        }
        res.redirect('/login?error=Invalid email or name');
    } catch { res.redirect('/login?error=Server error'); }
});

app.get('/register', (req, res) => {
    res.send(layout(`
    <div class="login-page">
      <div class="main-wrapper">
        <div class="login-content text-center">
          <h2 class="text-primary fw-bold mb-5">THE APP</h2>
          <h4 class="fw-bold mb-4">Create Account</h4>
          <form action="/register" method="POST">
            <input type="text" name="name" class="form-control mb-3" placeholder="Full Name" required>
            <input type="email" name="email" class="form-control mb-3" placeholder="Email Address" required>
            <button class="btn btn-primary w-100 py-2 fw-bold">Register</button>
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
        const { name, email } = req.body;
        await pool.query('INSERT INTO users (name, email) VALUES ($1, $2)', [name.trim(), email.toLowerCase().trim()]);
        res.redirect('/login?error=Success! Please sign in');
    } catch { res.redirect('/login?error=Email already exists'); }
});

app.use(checkStatus);

app.get('/users', async (req, res) => {
    const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
    const rows = result.rows.map(u => `
    <tr>
      <td class="ps-4"><input type="checkbox" name="userIds" value="${u.id}" class="form-check-input"></td>
      <td><b>${u.name}</b><br><small class="text-muted">ID: ${u.id}</small></td>
      <td>${u.email}</td>
      <td>${u.is_blocked ? '<span class="badge bg-danger">Blocked</span>' : '<span class="badge bg-success">Active</span>'}</td>
      <td>${u.last_login_time ? u.last_login_time.toLocaleString() : 'Never'}</td>
    </tr>
  `).join('');

    res.send(layout(`
    <div class="nav-header">
      <span class="text-primary fw-bold">THE APP</span>
      <div class="small">${req.currentUser.email} | <a href="/logout" class="text-danger">Logout</a></div>
    </div>
    <div class="container" style="margin-top:100px;">
      <form action="/bulk" method="POST">
        <div class="mb-3 d-flex gap-2">
          <button name="action" value="block" class="btn btn-outline-primary btn-sm"><i class="bi bi-lock-fill"></i> Block</button>
          <button name="action" value="unblock" class="btn btn-outline-secondary btn-sm"><i class="bi bi-unlock-fill"></i> Unblock</button>
          <button name="action" value="delete" class="btn btn-danger btn-sm"><i class="bi bi-trash-fill"></i> Delete</button>
        </div>
        <div class="card shadow-sm">
          <table class="table mb-0">
            <thead class="table-light">
              <tr>
                <th class="ps-4" style="width:50px;"><input type="checkbox" onclick="toggleAll(this)"></th>
                <th>Name</th><th>Email</th><th>Status</th><th>Last Seen</th>
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
        if (action === 'block') await pool.query('UPDATE users SET is_blocked = true WHERE id = ANY($1)', [ids]);
        else if (action === 'unblock') await pool.query('UPDATE users SET is_blocked = false WHERE id = ANY($1)', [ids]);
        else if (action === 'delete') await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);

        if (ids.includes(req.session.userId.toString()) && (action === 'delete' || action === 'block')) {
            req.session = null;
            return res.redirect('/login');
        }
    }
    res.redirect('/users');
});

app.get('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

const PORT = 3001; 
app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
