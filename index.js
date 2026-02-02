const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

console.log("Starting server...");

// ==========================
// DATABASE CONNECTION
// ==========================
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set!");
} else {
  console.log("DATABASE_URL detected");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create table if not exists
pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  last_login TIMESTAMP DEFAULT NOW()
)
`).then(() => {
  console.log("Users table ready");
}).catch(err => {
  console.error("DB INIT ERROR:", err);
});

// ==========================
// ROUTES
// ==========================

// Health check
app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "API is working!" });
});

// Database check
app.get("/db", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM users");
    res.json({
      status: "ok",
      users: result.rows[0].count
    });
  } catch (e) {
    console.error("DB CHECK ERROR:", e);
    res.status(500).json({
      status: "error",
      error: e.toString()
    });
  }
});

// Login endpoint
app.post("/login", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      status: "error",
      message: "Username required"
    });
  }

  try {
    await pool.query(
      "INSERT INTO users(username) VALUES($1) ON CONFLICT (username) DO UPDATE SET last_login = NOW()",
      [username]
    );

    console.log("User login:", username);

    res.json({
      status: "ok",
      token: "demo-token-" + username
    });
  } catch (e) {
    console.error("DB ERROR:", e);
    res.status(500).json({
      status: "error",
      message: "Database error"
    });
  }
});

// ==========================
// START SERVER
// ==========================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
