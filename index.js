const express = require("express");
const app = express();

app.use(express.json());

app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "API is working!" });
});

app.post("/login", (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      status: "error",
      message: "Username required"
    });
  }

  res.json({
    status: "ok",
    token: "demo-token-" + username
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
