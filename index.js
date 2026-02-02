const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ==========================
// CONFIG
// ==========================
const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

// ==========================
// DATABASE
// ==========================
console.log("Starting FullBright API...");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is NOT set!");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Init table
pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  hwid TEXT NOT NULL,
  role TEXT DEFAULT 'USER',
  banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP DEFAULT NOW(),
  last_ip TEXT
)
`).then(() => {
  console.log("Users table ready");
}).catch(err => {
  console.error("DB INIT ERROR:", err);
});

// ==========================
// ADMIN AUTH
// ==========================
function checkAdmin(req, res, next) {
  const pass = req.query.pass || req.headers["x-admin-pass"];
  if (!pass || pass !== ADMIN_PASSWORD) {
    return res.status(403).send("Access denied");
  }
  next();
}

// ==========================
// ROUTES
// ==========================
app.get("/", (req, res) => {
  res.json({ status: "ok", name: "FullBright API" });
});

app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "API is working!" });
});

// ==========================
// REGISTER
// ==========================
app.post("/register", async (req, res) => {
  const { username, hwid } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!username || !hwid) {
    return res.status(400).json({
      status: "error",
      message: "Username and HWID required"
    });
  }

  try {
    const existing = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "User already registered"
      });
    }

    await pool.query(`
      INSERT INTO users(username, hwid, last_ip)
      VALUES($1, $2, $3)
    `, [username, hwid, ip]);

    console.log("REGISTER:", username, ip);

    res.json({ status: "ok", message: "Registered" });
  } catch (e) {
    console.error("REGISTER ERROR:", e);
    res.status(500).json({ status: "error" });
  }
});

// ==========================
// LOGIN
// ==========================
app.post("/login", async (req, res) => {
  const { username, hwid } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!username || !hwid) {
    return res.status(400).json({
      status: "error",
      message: "Username and HWID required"
    });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "User not registered"
      });
    }

    const user = result.rows[0];

    if (user.banned) {
      return res.status(403).json({
        status: "banned",
        message: "Account banned"
      });
    }

    if (user.hwid !== hwid) {
      return res.status(403).json({
        status: "denied",
        message: "HWID mismatch"
      });
    }

    const token = crypto
      .createHash("sha256")
      .update(username + hwid + Date.now())
      .digest("hex");

    await pool.query(`
      UPDATE users
      SET last_login = NOW(), last_ip = $1
      WHERE username = $2
    `, [ip, username]);

    console.log("LOGIN:", username, ip);

    res.json({
      status: "ok",
      token,
      role: user.role
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    res.status(500).json({ status: "error" });
  }
});

// ==========================
// ADMIN PANEL (WEB UI)
// ==========================
app.get("/admin", checkAdmin, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>FullBright Admin Panel</title>
<style>
body { background:#0f0f1a; color:white; font-family:Arial; padding:20px }
table { border-collapse: collapse; width:100% }
td, th { border:1px solid #444; padding:8px }
button { background:#6c5ce7; color:white; border:none; padding:5px 10px; cursor:pointer }
</style>
</head>
<body>

<h2>🔥 FullBright Admin Panel</h2>
<table id="users">
<tr>
<th>ID</th>
<th>Username</th>
<th>HWID</th>
<th>Role</th>
<th>Banned</th>
<th>Last Login</th>
<th>IP</th>
<th>Actions</th>
</tr>
</table>

<script>
const pass = new URLSearchParams(window.location.search).get("pass");

fetch("/admin/api/users?pass=" + pass)
.then(r => r.json())
.then(users => {
  const table = document.getElementById("users");
  users.forEach(u => {
    const row = document.createElement("tr");
    row.innerHTML = \`
      <td>\${u.id}</td>
      <td>\${u.username}</td>
      <td style="font-size:10px">\${u.hwid}</td>
      <td>\${u.role}</td>
      <td>\${u.banned}</td>
      <td>\${u.last_login}</td>
      <td>\${u.last_ip}</td>
      <td>
        <button onclick="ban('\${u.username}')">BAN</button>
        <button onclick="vip('\${u.username}')">VIP</button>
      </td>
    \`;
    table.appendChild(row);
  });
});

function ban(user) {
  fetch("/admin/api/ban?pass=" + pass, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:user})
  }).then(()=>location.reload());
}

function vip(user) {
  fetch("/admin/api/role?pass=" + pass, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:user, role:"VIP"})
  }).then(()=>location.reload());
}
</script>

</body>
</html>
`);
});

// ==========================
// ADMIN API
// ==========================
app.get("/admin/api/users", checkAdmin, async (req, res) => {
  const result = await pool.query("SELECT * FROM users ORDER BY last_login DESC");
  res.json(result.rows);
});

app.post("/admin/api/ban", checkAdmin, async (req, res) => {
  const { username } = req.body;
  await pool.query("UPDATE users SET banned = TRUE WHERE username = $1", [username]);
  res.json({ status: "banned" });
});

app.post("/admin/api/role", checkAdmin, async (req, res) => {
  const { username, role } = req.body;
  await pool.query("UPDATE users SET role = $1 WHERE username = $2", [role, username]);
  res.json({ status: "updated" });
});

// ==========================
// START
// ==========================
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
