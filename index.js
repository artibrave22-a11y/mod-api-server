const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

console.log("Starting FullBright API...");
console.log("DATABASE_URL detected");

app.use(express.json());
app.use(express.static("public"));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Создание таблицы
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      hwid TEXT,
      last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("Users table ready");
}

initDB();

// ===== API =====

app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "API is working!" });
});

app.post("/login", async (req, res) => {
  const { username, hwid } = req.body;

  if (!username) {
    return res.json({ status: "error", message: "Username required" });
  }

  try {
    await pool.query(
      `
      INSERT INTO users (username, hwid, last_login)
      VALUES ($1, $2, NOW())
      ON CONFLICT (username)
      DO UPDATE SET hwid = $2, last_login = NOW()
      `,
      [username, hwid || "unknown"]
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

// ===== АДМИН ПАНЕЛЬ API =====

app.get("/admin/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, hwid, last_login FROM users ORDER BY last_login DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

// ===== ВЕБ-ПАНЕЛЬ =====

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ===== ЗАПУСК =====

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started on port ${PORT}`);
});
