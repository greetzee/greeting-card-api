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

/*
========================================
📨 SENDGRID SETUP
========================================
*/
if (!process.env.EMAIL_API_KEY) {
  console.error("❌ EMAIL_API_KEY is missing in environment variables");
} else {
  console.log("✅ SendGrid API key loaded");
}

sgMail.setApiKey(process.env.EMAIL_API_KEY);

/*
========================================
🌿 ENSURE DATA FOLDER EXISTS
========================================
*/
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

/*
========================================
🌿 SUBSCRIBERS DATABASE (JSON)
========================================
*/
const subscribersFile = path.join(dataDir, "subscribers.json");

function getSubscribers() {
  try {
    if (!fs.existsSync(subscribersFile)) {
      fs.writeFileSync(subscribersFile, "[]");
    }
    const data = fs.readFileSync(subscribersFile);
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading subscribers:", err);
    return [];
  }
}

function addSubscriber(email) {
  const subs = getSubscribers();
  const lower = email.toLowerCase();

  if (!subs.includes(lower)) {
    subs.push(lower);
    fs.writeFileSync(subscribersFile, JSON.stringify(subs, null, 2));
    console.log("Subscriber added:", lower);
  }
}

function removeSubscriber(email) {
  let subs = getSubscribers();
  subs = subs.filter(e => e !== email.toLowerCase());
  fs.writeFileSync(subscribersFile, JSON.stringify(subs, null, 2));
  console.log("Subscriber removed:", email);
}

function isSubscribed(email) {
  const subs = getSubscribers();
  return subs.includes(email.toLowerCase());
}

/*
========================================
🌿 TEMP TOKENS (magic link)
========================================
*/
const tokens = {};

/*
========================================
🌿 MIDDLEWARE
========================================
*/
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/output", express.static(path.join(__dirname, "output")));

function requireAuth(req, res, next) {
  const token = req.query.token || req.body.token;

  if (!tokens[token]) {
    return res.send("Not authorized");
  }

  const email = tokens[token];

  if (!isSubscribed(email)) {
    return res.send("❌ You are not subscribed");
  }

  req.email = email;
  next();
}

/*
========================================
ROOT
========================================
*/
app.get("/", (req, res) => {
  res.send("Greeting Card API running 🚀");
});

/*
========================================
STEP 1 — START
========================================
*/
app.get("/start", (req, res) => {
  res.send(`
    <h2>Enter your email</h2>
    <form method="POST" action="/send-link">
      <input name="email" type="email" required />
      <button type="submit">Send magic link</button>
    </form>
  `);
});

/*
========================================
STEP 2 — SEND MAGIC LINK
========================================
*/
app.post("/send-link", async (req, res) => {
  console.log("Send link route hit:", req.body);

  if (!req.body.email) {
    return res.send("No email provided");
  }

  const email = req.body.email.toLowerCase();

  console.log("Checking subscription for:", email);

  if (!isSubscribed(email)) {
    console.log("User not subscribed");
    return res.send("❌ You are not subscribed");
  }

  const token = crypto.randomBytes(24).toString("hex");
  tokens[token] = email;

  const base =
    process.env.BASE_URL ||
    `https://${req.headers.host}`;

  const link = `${base}/verify?token=${token}`;

  console.log("Magic link generated:", link);

  const msg = {
    to: email,
    from: "gaston.greetzee@gmail.com", // must be verified in SendGrid
    subject: "Your magic link ✨",
    html: `
      <h2>Create your card</h2>
      <p>Click below to continue:</p>
      <a href="${link}">${link}</a>
    `
  };

  try {
    console.log("Sending email via SendGrid...");
    await sgMail.send(msg);
    console.log("✅ Email sent successfully");

    res.send("✅ Email sent! Check your inbox.");
  } catch (error) {
    console.error("SendGrid error:");
    console.error(error.response?.body || error);
    res.status(500).send("❌ Could not send email");
  }
});

/*
========================================
STEP 3 — VERIFY LINK
========================================
*/
app.get("/verify", (req, res) => {
  const token = req.query.token;

  if (!tokens[token]) {
    return res.send("❌ Invalid or expired link");
  }

  const email = tokens[token];

  res.send(`
    <h2>Welcome ${email} 🎉</h2>
    <a href="/gallery?token=${token}">Go to gallery</a>
  `);
});

/*
========================================
STEP 4 — GALLERY
========================================
*/
app.get("/gallery", requireAuth, (req, res) => {
  const token = req.query.token;

  res.send(`
    <h2>Choose your card</h2>
    <ul>
      <li><a href="/personalize?card=soft&token=${token}">Soft Card</a></li>
      <li><a href="/personalize?card=fun&token=${token}">Fun Card</a></li>
    </ul>
  `);
});

/*
========================================
STEP 5 — PERSONALIZE
========================================
*/
app.get("/personalize", requireAuth, (req, res) => {
  const card = req.query.card;
  const token = req.query.token;

  res.send(`
    <h2>Personalize your "${card}" card</h2>
    <form method="POST" action="/render-video">
      <input type="hidden" name="card" value="${card}" />
      <input type="hidden" name="token" value="${token}" />
      <input name="line1" required placeholder="Main message"/>
      <input name="line2" placeholder="Optional second line"/>
      <input name="signature" placeholder="Signature"/>
      <button type="submit">Generate</button>
    </form>
  `);
});

/*
========================================
STEP 6 — RENDER VIDEO
========================================
*/
app.post("/render-video", requireAuth, (req, res) => {
  const { card, line1, line2, signature } = req.body;

  const inputVideo = path.join(__dirname, "assets", `${card}.mp4`);
  const outputVideo = path.join(__dirname, "output", `${card}_${Date.now()}.mp4`);
  const fontPath = path.join(__dirname, "assets", "font.ttf");

  const message = line2 ? `${line1}\n${line2}` : line1;

  const filters = [
    {
      filter: "drawtext",
      options: {
        fontfile: fontPath,
        text: message,
        fontsize: 48,
        fontcolor: "yellow",
        x: "(w-text_w)/2",
        y: "h*0.6"
      }
    },
    {
      filter: "drawtext",
      options: {
        fontfile: fontPath,
        text: signature || "",
        fontsize: 32,
        fontcolor: "white",
        x: "(w-text_w)/2",
        y: "h*0.8"
      }
    }
  ];

  ffmpeg(inputVideo)
    .videoFilters(filters)
    .outputOptions("-movflags faststart")
    .save(outputVideo)
    .on("end", () => {
      res.send(`
        <h2>Video ready!</h2>
        <video width="480" controls>
          <source src="/output/${path.basename(outputVideo)}" type="video/mp4">
        </video>
      `);
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err);
      res.send("Video rendering error");
    });
});

/*
========================================
PAYHIP WEBHOOK
========================================
*/
app.post("/payhip-webhook", (req, res) => {
  const { event, email } = req.body;

  if (!email) {
    return res.status(400).send("No email");
  }

  if (event === "subscription.created" || event === "paid") {
    addSubscriber(email);
  }

  if (event === "subscription.deleted" || event === "refunded") {
    removeSubscriber(email);
  }

  res.status(200).send("Webhook received");
});

/*
DEBUG
*/
app.get("/debug-subs", (req, res) => {
  res.json(getSubscribers());
});

/*
========================================
START SERVER
========================================
*/
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});