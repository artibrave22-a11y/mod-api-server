const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

console.log("Starting FullBright API...");

if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

// ======================
// DATABASE
// ======================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create users table
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      last_login TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("Users table ready");
}

initDB();

// ======================
// API ROUTES
// ======================
app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "API is working!" });
});

// LOGIN
app.post("/login", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.json({ status: "error", message: "Username required" });
  }

  try {
    await pool.query(
      `
      INSERT INTO users (username, last_login)
      VALUES ($1, NOW())
      ON CONFLICT (username)
      DO UPDATE SET last_login = NOW()
    `,
      [username]
    );

    res.json({
      status: "ok",
      token: `demo-token-${username}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Database error" });
  }
});

// ======================
// ADMIN PANEL (NO PASSWORD)
// ======================
app.get("/admin", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, last_login FROM users ORDER BY last_login DESC"
    );

    let html = `
    <html>
    <head>
      <title>Admin Panel</title>
      <style>
        body { font-family: Arial; background:#111; color:#eee; padding:20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #444; padding: 8px; }
        th { background:#222; }
      </style>
    </head>
    <body>
      <h1>Admin Panel</h1>
      <table>
        <tr>
          <th>ID</th>
          <th>Username</th>
          <th>Last Login</th>
        </tr>
    `;

    for (const user of result.rows) {
      html += `
        <tr>
          <td>${user.id}</td>
          <td>${user.username}</td>
          <td>${user.last_login}</td>
        </tr>
      `;
    }

    html += `
      </table>
    </body>
    </html>
    `;

    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Admin panel error");
  }
});

// ======================
// START SERVER
// ======================
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
