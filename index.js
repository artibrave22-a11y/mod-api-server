const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
app.use(express.json());

// ======================
// CONFIG
// ======================
const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log("❌ DATABASE_URL not found");
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

// ======================
// INIT TABLE
// ======================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      last_login TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("✅ Users table ready");
}

// ======================
// ROUTES
// ======================

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "FullBright API is working!" });
});

app.get("/ping", (req, res) => {
  res.json({ status: "ok", ping: "pong" });
});

// LOGIN
app.post("/login", async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ status: "error", message: "Username required" });
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
      token: "demo-token-" + username
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Database error" });
  }
});

// ======================
// ADMIN PANEL (WEB)
// ======================
app.get("/admin", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, last_login FROM users ORDER BY last_login DESC"
    );

    let rows = result.rows
      .map(
        u =>
          `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.last_login}</td></tr>`
      )
      .join("");

    res.send(`
      <html>
        <head>
          <title>FullBright Admin</title>
          <style>
            body { font-family: Arial; background:#111; color:#eee; padding:20px }
            table { border-collapse: collapse; width:100% }
            td, th { border:1px solid #444; padding:8px }
          </style>
        </head>
        <body>
          <h1>FullBright Admin Panel</h1>
          <table>
            <tr><th>ID</th><th>Username</th><th>Last Login</th></tr>
            ${rows}
          </table>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// ======================
// START
// ======================
initDB().then(() => {
  app.listen(PORT, () => {
    console.log("🚀 FullBright API started on port " + PORT);
  });
});
