const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

console.log("Starting FullBright API...");

if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

console.log("DATABASE_URL detected");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Создаём таблицу
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      hardware_id TEXT NOT NULL,
      last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Users table ready");
}

initDB();

// ---------- ROUTES ----------

app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "FullBright API online" });
});

app.post("/login", async (req, res) => {
  try {
    const { username, hardwareId } = req.body;

    if (!username || !hardwareId) {
      return res.status(400).json({
        status: "error",
        message: "username and hardwareId required"
      });
    }

    await pool.query(
      `
      INSERT INTO users (username, hardware_id, last_login)
      VALUES ($1, $2, NOW())
      ON CONFLICT (username)
      DO UPDATE SET hardware_id = $2, last_login = NOW()
    `,
      [username, hardwareId]
    );

    res.json({
      status: "ok",
      token: `fb-${username}-${Date.now()}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "server error" });
  }
});

// ---------- ADMIN PANEL ----------

app.get("/admin", async (req, res) => {
  if (req.query.pass !== ADMIN_PASSWORD) {
    return res.status(403).send("Access denied");
  }

  const result = await pool.query(
    "SELECT id, username, hardware_id, last_login FROM users ORDER BY last_login DESC"
  );

  let html = `
  <html>
  <head>
    <title>FullBright Admin</title>
    <style>
      body { background:#111; color:#0f0; font-family: monospace; padding:20px; }
      table { border-collapse: collapse; width:100%; }
      td, th { border:1px solid #0f0; padding:8px; }
    </style>
  </head>
  <body>
    <h2>FullBright Users</h2>
    <table>
      <tr>
        <th>ID</th>
        <th>Username</th>
        <th>Hardware ID</th>
        <th>Last Login</th>
      </tr>
  `;

  for (const u of result.rows) {
    html += `
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.hardware_id}</td>
        <td>${u.last_login}</td>
      </tr>
    `;
  }

  html += `
    </table>
  </body>
  </html>
  `;

  res.send(html);
});

// ---------- START SERVER ----------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started on port ${PORT}`);
});
