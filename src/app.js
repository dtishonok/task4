const express = require('express');
const session = require('cookie-session');
const pool = require('./db');

const app = express();

/* ===== middleware ===== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: 'session',
    keys: ['secret'],
    maxAge: 24 * 60 * 60 * 1000,
  })
);

/* ===== layout ===== */
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
      ${
        user
          ? `<div class="text-white">User: ${user.email} | <a href="/logout" class="btn btn-outline-light btn-sm">Logout</a></div>`
          : ''
      }
    </div>
  </nav>
  <div class="container">${body}</div>
</body>
</html>
`;

/* ===== auth middleware ===== */
const checkStatus = async (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [req.session.userId]
    );
    const user = result.rows[0];

    if (!user || user.is_blocked) {
      req.session = null;
      return res.redirect('/login?error=Session expired or blocked');
    }

    req.currentUser = user;
    next();
  } catch {
    res.redirect('/login');
  }
};

/* ===== routes ===== */
app.get('/login', (req, res) => {
  res.send(layout(`<h3>Login</h3>`));
});

app.post('/login', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [req.body.email]
  );
  const user = result.rows[0];

  if (!user || user.is_blocked) {
    return res.redirect('/login?error=Invalid user');
  }

  req.session.userId = user.id;
  res.redirect('/users');
});

app.get('/register', (req, res) => {
  res.send(layout(`<h3>Register</h3>`));
});

app.post('/register', async (req, res) => {
  await pool.query(
    'INSERT INTO users (name, email) VALUES ($1, $2)',
    [req.body.name, req.body.email]
  );
  res.redirect('/login');
});

app.use(checkStatus);

app.get('/users', async (req, res) => {
  const result = await pool.query('SELECT * FROM users');
  res.send(layout(`<pre>${JSON.stringify(result.rows, null, 2)}</pre>`, req.currentUser));
});

app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = app;




