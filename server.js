/**
 * server.js — Stable version for Render deployment with SendGrid API
 */

const express = require("express");
const sgMail = require("@sendgrid/mail");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CORS — allow your Base44 frontend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

sgMail.setApiKey(process.env.EMAIL_API_KEY);

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const subscribersFile = path.join(dataDir, "subscribers.json");

function getSubscribers() {
  if (!fs.existsSync(subscribersFile)) fs.writeFileSync(subscribersFile, "[]");
  return JSON.parse(fs.readFileSync(subscribersFile));
}
function addSubscriber(email) {
  const subs = getSubscribers();
  const lower = email.toLowerCase();
  if (!subs.includes(lower)) {
    subs.push(lower);
    fs.writeFileSync(subscribersFile, JSON.stringify(subs, null, 2));
  }
}
function removeSubscriber(email) {
  const subs = getSubscribers().filter(e => e !== email.toLowerCase());
  fs.writeFileSync(subscribersFile, JSON.stringify(subs, null, 2));
}
function isSubscribed(email) {
  return getSubscribers().includes(email.toLowerCase());
}

const tokensFile = path.join(dataDir, "tokens.json");
function getTokens() {
  if (!fs.existsSync(tokensFile)) fs.writeFileSync(tokensFile, "{}");
  return JSON.parse(fs.readFileSync(tokensFile));
}
function saveToken(token, email) {
  const t = getTokens();
  t[token] = email;
  fs.writeFileSync(tokensFile, JSON.stringify(t));
}
function getToken(token) {
  return getTokens()[token];
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function requireAuth(req, res, next) {
  const token = req.query.token || req.body.token;
  if (!getToken(token)) return res.status(401).json({ error: "Not authorized" });
  const email = getToken(token);
  if (!isSubscribed(email)) return res.status(403).json({ error: "Not subscribed" });
  req.email = email;
  next();
}

app.get("/", (req, res) => res.send("Greeting Card API running 🚀"));

// STEP 1 — START (kept for direct browser access)
app.get("/start", (req, res) => {
  res.send(`
    <h2>Enter your email</h2>
    <form method="POST" action="/send-link">
      <input name="email" type="email" required />
      <button type="submit">Send magic link</button>
    </form>
  `);
});

// STEP 2 — SEND MAGIC LINK
app.post("/send-link", async (req, res) => {
  if (!req.body.email) return res.status(400).json({ error: "No email provided" });
  const email = req.body.email.toLowerCase();
  if (!isSubscribed(email)) return res.status(403).json({ error: "You are not subscribed" });

  const token = crypto.randomBytes(24).toString("hex");
  saveToken(token, email);
  const base = process.env.BASE_URL || `https://${req.headers.host}`;
  const link = `${base}/verify?token=${token}`;

  const msg = {
    to: email,
    from: "hello@greetzee.com",
    subject: "Your magic link ✨",
    html: `<h2>Create your card</h2><p>Click below to continue:</p><a href="${link}">${link}</a>`
  };

  await sgMail.send(msg);
  res.json({ success: true });
});

// STEP 3 — VERIFY
app.get("/verify", (req, res) => {
  const token = req.query.token;
  if (!getToken(token)) return res.send("❌ Invalid or expired link");
  // Redirect to your Base44 frontend gallery page
  const frontendBase = process.env.FRONTEND_URL || "";
  res.redirect(`${frontendBase}/Gallery?token=${token}`);
});

// STEP 4 — GALLERY (API)
app.get("/gallery", requireAuth, (req, res) => {
  res.json({ cards: ["soft", "fun"] });
});

// STEP 5 — PERSONALIZE (API)
app.get("/personalize", requireAuth, (req, res) => {
  res.json({ card: req.query.card });
});

// STEP 6 — RENDER VIDEO (FIXED)
app.post("/render-video", requireAuth, (req, res) => {
  const { card, line1, line2, signature } = req.body;
  const assetsDir = path.join(__dirname, "assets");
  const outputDir = "/tmp"; // ✅ Use /tmp on Render
  const inputVideo = path.join(assetsDir, `${card}.mp4`);
  const fontPath = path.join(assetsDir, "font.ttf");
  const outputFilename = `${card}_${Date.now()}.mp4`;
  const outputVideo = path.join(outputDir, outputFilename);

  if (!fs.existsSync(inputVideo)) return res.status(500).json({ error: "Video template missing" });
  if (!fs.existsSync(fontPath)) return res.status(500).json({ error: "Font file missing" });

  const message = line2 ? `${line1}\\n${line2}` : line1;

  const filters = [
    {
      filter: "drawtext",
      options: { fontfile: fontPath, text: message, fontsize: 48, fontcolor: "yellow", x: "(w-text_w)/2", y: "h*0.6" }
    },
    {
      filter: "drawtext",
      options: { fontfile: fontPath, text: signature || "", fontsize: 32, fontcolor: "white", x: "(w-text_w)/2", y: "h*0.8" }
    }
  ];

  ffmpeg(inputVideo)
    .videoFilters([
  	...filters,
 	{
 	  filter: "scale",
 	  options: {
 	     w: 720,
 	     h: 720
 	  }
  	}
      ])
    .outputOptions(["-movflags faststart", "-crf 28"])
    .on("start", cmd => console.log("FFmpeg started:", cmd))
    .on("end", () => {
  	console.log("Video done:", outputVideo);
 	res.setHeader("Content-Type", "video/mp4");
 	res.setHeader("Content-Disposition", `attachment; filename="${outputFilename}"`);
 	const stream = fs.createReadStream(outputVideo);
  	stream.pipe(res);
  	stream.on("close", () => fs.unlink(outputVideo, () => {}));
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: "Rendering failed" });
    })
    .save(outputVideo);
});

// PAYHIP WEBHOOK
app.post("/payhip-webhook", (req, res) => {
  const { event, email } = req.body;
  if (!email) return res.status(400).send("No email");
  if (event === "subscription.created" || event === "paid") addSubscriber(email);
  if (event === "subscription.deleted" || event === "refunded") removeSubscriber(email);
  res.status(200).send("Webhook received");
});

app.get("/debug-subs", (req, res) => res.json(getSubscribers()));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));