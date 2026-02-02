const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
app.use(express.json());

console.log("Starting FullBright API...");

// ==========================
// DATABASE
// ==========================
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is NOT set!");
} else {
  console.log("DATABASE_URL detected");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create table
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

    res.json({
      status: "ok",
      message: "Registered successfully"
    });
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
// ADMIN VIEW
// ==========================
app.get("/admin/hwid", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        hwid,
        STRING_AGG(username, ', ') AS users,
        MAX(last_login) AS last_seen,
        MAX(last_ip) AS last_ip
      FROM users
      GROUP BY hwid
      ORDER BY last_seen DESC
    `);

    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ status: "error" });
  }
});

// ==========================
// START SERVER
// ==========================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
