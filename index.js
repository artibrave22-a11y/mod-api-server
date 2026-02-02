const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// =======================
// CONFIG
// =======================
const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

console.log("Starting FullBright API...");
console.log("DATABASE_URL detected");

// =======================
// DATABASE
// =======================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Init table
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      hwid TEXT NOT NULL,
      last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Users table ready");
}

initDB().catch(err => {
  console.error("DB INIT ERROR:", err);
  process.exit(1);
});

// =======================
// ROUTES
// =======================

// Health check
app.get('/ping', (req, res) => {
  res.json({
    status: "ok",
    message: "FullBright API alive"
  });
});

// Login / Register
app.post('/login', async (req, res) => {
  const { username, hwid } = req.body;

  if (!username || !hwid) {
    return res.status(400).json({
      status: "error",
      message: "username and hwid required"
    });
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        "INSERT INTO users (username, hwid) VALUES ($1, $2)",
        [username, hwid]
      );
      console.log(`Registered new user: ${username}`);
    } else {
      await pool.query(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP, hwid = $2 WHERE username = $1",
        [username, hwid]
      );
      console.log(`User login: ${username}`);
    }

    res.json({
      status: "ok",
      token: `fb-token-${username}`
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({
      status: "error",
      message: "database error"
    });
  }
});

// =======================
// ADMIN PANEL (NO PASSWORD)
// =======================
app.get('/admin', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, hwid, last_login FROM users ORDER BY last_login DESC"
    );

    const rows = result.rows.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.hwid}</td>
        <td>${u.last_login}</td>
      </tr>
    `).join('');

    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>FullBright Admin Panel</title>
  <style>
    body {
      background: #0f0f1a;
      color: white;
      font-family: Arial, sans-serif;
      padding: 20px;
    }
    h1 {
      color: #7c4dff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      border: 1px solid #444;
      padding: 8px;
      text-align: left;
    }
    th {
      background: #7c4dff;
    }
    tr:nth-child(even) {
      background: #1a1a2e;
    }
  </style>
</head>
<body>
  <h1>FullBright Admin Panel</h1>
  <p>Total users: ${result.rows.length}</p>

  <table>
    <tr>
      <th>ID</th>
      <th>Username</th>
      <th>HWID</th>
      <th>Last Login</th>
    </tr>
    ${rows}
  </table>
</body>
</html>
    `);
  } catch (err) {
    console.error("ADMIN ERROR:", err);
    res.status(500).send("Admin panel error");
  }
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on port ${PORT}`);
});

