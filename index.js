const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

console.log("Starting FullBright API...");

// =====================
// DATABASE
// =====================
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

console.log("DATABASE_URL detected");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// =====================
// INIT TABLE
// =====================
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        hardware_id TEXT,
        last_login TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("Users table ready");
  } catch (err) {
    console.error("DB INIT ERROR:", err);
    process.exit(1);
  }
}

initDB();

// =====================
// ROUTES
// =====================
app.get("/ping", (req, res) => {
  res.json({
    status: "ok",
    service: "fullbright-api",
    time: new Date().toISOString()
  });
});

// LOGIN / REGISTER
app.post("/login", async (req, res) => {
  try {
    const { username, hardwareId } = req.body;

    if (!username || !hardwareId) {
      return res.status(400).json({
        status: "error",
        message: "username and hardwareId required"
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      await pool.query(
        "INSERT INTO users (username, hardware_id) VALUES ($1, $2)",
        [username, hardwareId]
      );

      return res.json({
        status: "ok",
        message: "User registered",
        token: "demo-token-" + username
      });
    } else {
      const user = result.rows[0];

      if (user.hardware_id && user.hardware_id !== hardwareId) {
        return res.status(403).json({
          status: "error",
          message: "Hardware mismatch"
        });
      }

      await pool.query(
        "UPDATE users SET last_login = NOW() WHERE username = $1",
        [username]
      );

      return res.json({
        status: "ok",
        message: "Login successful",
        token: "demo-token-" + username
      });
    }
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error"
    });
  }
});

// ADMIN PANEL API
app.get("/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, hardware_id, last_login FROM users ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("USERS ERROR:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// =====================
// KEEP ALIVE
// =====================
setInterval(() => {
  console.log("Heartbeat:", new Date().toISOString());
}, 30000);

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started on port ${PORT}`);
});
