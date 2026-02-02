const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

console.log("Starting FullBright API...");

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set!");
  process.exit(1);
}

// Подключение к базе
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Проверка таблицы
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

// -------------------- API --------------------

app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "API is working!" });
});

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
      token: "demo-token-" + username
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Database error" });
  }
});

// -------------------- АДМИНКА --------------------

// Раздаём статические файлы
app.use("/admin", express.static(path.join(__dirname, "admin")));

// API для панели
app.get("/admin/api/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, last_login FROM users ORDER BY last_login DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// -------------------- START --------------------

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
