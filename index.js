const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

console.log("Starting FullBright API...");
console.log("DATABASE_URL detected");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =======================
// INIT DATABASE
// =======================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      hwid TEXT NOT NULL,
      token TEXT NOT NULL,
      last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      banned BOOLEAN DEFAULT FALSE
    )
  `);
  console.log("Users table ready");
}
initDB();

// =======================
// UTILS
// =======================
function generateToken(username, hwid) {
  return Buffer.from(username + ":" + hwid + ":" + Date.now()).toString("base64");
}

// =======================
// ROUTES
// =======================
app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "API is working!" });
});

// LOGIN FROM MOD
app.post("/login", async (req, res) => {
  const { username, hwid } = req.body;

  if (!username || !hwid) {
    return res.status(400).json({ status: "error", message: "Username and HWID required" });
  }

  try {
    const check = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (check.rows.length > 0) {
      const user = check.rows[0];

      if (user.banned) {
        return res.status(403).json({ status: "banned", message: "You are banned" });
      }

      if (user.hwid !== hwid) {
        return res.status(403).json({ status: "error", message: "HWID mismatch" });
      }

      await pool.query(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = $1",
        [username]
      );

      return res.json({ status: "ok", token: user.token });
    }

    const token = generateToken(username, hwid);

    await pool.query(
      "INSERT INTO users (username, hwid, token) VALUES ($1, $2, $3)",
      [username, hwid, token]
    );

    res.json({ status: "ok", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "DB error" });
  }
});

// =======================
// ADMIN PANEL
// =======================
app.get("/admin", async (req, res) => {
  const users = await pool.query("SELECT * FROM users ORDER BY id ASC");

  let html = `
  <html>
  <head>
    <title>FullBright Admin</title>
    <style>
      body { font-family: Arial; background:#111; color:#eee; }
      table { border-collapse: collapse; width:100%; }
      th, td { border:1px solid #444; padding:8px; text-align:center; }
      th { background:#222; }
      button { padding:5px 10px; cursor:pointer; }
      .ban { background:#a00; color:white; }
      .unban { background:#0a0; color:white; }
    </style>
  </head>
  <body>
    <h1>FullBright Admin Panel</h1>
    <table>
      <tr>
        <th>ID</th>
        <th>Username</th>
        <th>HWID</th>
        <th>Token</th>
        <th>Last Login</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
  `;

  for (const u of users.rows) {
    html += `
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.hwid}</td>
        <td>${u.token}</td>
        <td>${u.last_login}</td>
        <td>${u.banned ? "BANNED" : "OK"}</td>
        <td>
          <form method="POST" action="/admin/ban">
            <input type="hidden" name="id" value="${u.id}">
            <button class="${u.banned ? "unban" : "ban"}">
              ${u.banned ? "UNBAN" : "BAN"}
            </button>
          </form>
        </td>
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

// BAN / UNBAN
app.post("/admin/ban", express.urlencoded({ extended: true }), async (req, res) => {
  const id = req.body.id;

  const user = await pool.query("SELECT banned FROM users WHERE id = $1", [id]);
  if (!user.rows.length) return res.redirect("/admin");

  const banned = !user.rows[0].banned;

  await pool.query("UPDATE users SET banned = $1 WHERE id = $2", [banned, id]);
  res.redirect("/admin");
});

// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started on port ${PORT}`);
});
