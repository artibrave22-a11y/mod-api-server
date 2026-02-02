const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

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

// Create table if not exists
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

initDB().catch(console.error);

// =======================
// API ROUTES
// =======================

// Ping
app.get('/ping', (req, res) => {
  res.json({ status: "ok", message: "FullBright API alive" });
});

// Login
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
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length === 0) {
      // New user
      await pool.query(
        "INSERT INTO users (username, hwid) VALUES ($1, $2)",
        [username, hwid]
      );
      console.log(`New user registered: ${username}`);
    } else {
      // Update login time
      await pool.query(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = $1",
        [username]
      );
      console.log(`User logged in: ${username}`);
    }

    res.json({
      status: "ok",
      token: `fb-token-${username}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Database error"
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

    let rows = result.rows.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.hwid}</td>
        <td>${u.last_login}</td>
      </tr>
    `).join('');

    res.send(`
      <html>
      <head>
        <title>FullBright Admin Panel</title>
        <style>
          body {
            background:#0f0f1a;
            color:white;
            font-family:Arial;
            padding:20px;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border:1px solid #444;
            padding:8px;
            text-align:left;
          }
          th {
            background:#6c3cff;
          }
          tr:nth-child(even) {
            background:#1a1a2e;
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
    console.error(err);
    res.status(500).send("Admin error");
  }
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
