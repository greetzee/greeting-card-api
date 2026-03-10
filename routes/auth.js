const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { getToken, saveToken, isSubscribed } = require("../services/subscribers");
const { sendMagicLink } = require("../services/email");

router.get("/start", (req, res) => {
  res.send(`<h2>Enter your email</h2>
    <form method="POST" action="/send-link">
      <input name="email" type="email" required />
      <button type="submit">Send magic link</button>
    </form>`);
});

router.post("/send-link", async (req, res) => {
  if (!req.body.email) return res.status(400).json({ error: "No email provided" });
  const email = req.body.email.toLowerCase();
  if (!isSubscribed(email)) return res.status(403).json({ error: "You are not subscribed" });

  const token = crypto.randomBytes(24).toString("hex");
  saveToken(token, email);
  const base = process.env.BASE_URL || `https://${req.headers.host}`;
  await sendMagicLink(email, `${base}/verify?token=${token}`);
  res.json({ success: true });
});

router.get("/verify", (req, res) => {
  const token = req.query.token;
  if (!getToken(token)) return res.send("❌ Invalid or expired link");
  const frontendBase = process.env.FRONTEND_URL || "";
  res.redirect(`${frontendBase}/Gallery?token=${token}`);
});

module.exports = router;