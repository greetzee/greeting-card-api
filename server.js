/**
 * server.js — Fixed version for Render deployment with SendGrid
 */

const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = process.env.PORT || 3000;

/*
========================================
🌿 SUBSCRIBERS DATABASE (JSON)
========================================
*/
const subscribersFile = path.join(__dirname, "data", "subscribers.json");

function getSubscribers() {
  try {
    if (!fs.existsSync(subscribersFile)) fs.writeFileSync(subscribersFile, "[]");
    const data = fs.readFileSync(subscribersFile);
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading subscribers.json:", err);
    return [];
  }
}

function addSubscriber(email) {
  const subs = getSubscribers();
  if (!subs.includes(email.toLowerCase())) {
    subs.push(email.toLowerCase());
    fs.writeFileSync(subscribersFile, JSON.stringify(subs, null, 2));
  }
}

function removeSubscriber(email) {
  let subs = getSubscribers();
  subs = subs.filter(e => e.toLowerCase() !== email.toLowerCase());
  fs.writeFileSync(subscribersFile, JSON.stringify(subs, null, 2));
}

function isSubscribed(email) {
  const subs = getSubscribers();
  return subs.some(e => e.toLowerCase() === email.toLowerCase());
}

/*
========================================
🌿 TEMP TOKENS (magic link)
========================================
*/
const tokens = {};

/*
========================================
📨 MAILER SETUP — SendGrid
========================================
*/
const transporter = nodemailer.createTransport({
  host: "smtp.sendgrid.net",
  port: 587,
  secure: false,
  auth: {
    user: "apikey",
    pass: process.env.EMAIL_API_KEY
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

/*
TEST SENDGRID CONNECTION ON STARTUP
*/
transporter.verify(function (error, success) {
  if (error) {
    console.log("❌ SendGrid connection error:", error);
  } else {
    console.log("✅ SendGrid is ready to send emails");
  }
});

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
  if (!tokens[token]) return res.send("Not authorized");
  const email = tokens[token];
  if (!isSubscribed(email)) return res.send("❌ You are not subscribed");
  req.email = email;
  next();
}

/*
========================================
🌿 ROUTES
========================================
*/

app.get("/", (req, res) => {
  res.send("Greeting Card API running 🚀 v2");
});

/*
STEP 1
*/
app.get("/start", (req, res) => {
  res.send(`
    <h2>Enter your email</h2>
    <form method="POST" action="/send-link">
      <input name="email" placeholder="email" required />
      <button type="submit">Send magic link</button>
    </form>
  `);
});

/*
STEP 2 — Send magic link
*/
app.post("/send-link", async (req, res) => {
  console.log("Send link route hit", req.body);

  const email = req.body.email.toLowerCase();

  if (!isSubscribed(email)) {
    return res.send("❌ You are not subscribed");
  }

  const token = crypto.randomBytes(24).toString("hex");
  tokens[token] = email;

  const link = `${process.env.BASE_URL || "http://localhost:" + PORT}/verify?token=${token}`;

  try {
    console.log("Attempting to send email...");

    await transporter.sendMail({
      from: "Greeting Cards <gaston.greetzee@gmail.com>", // must be verified in SendGrid
      to: email,
      subject: "Your magic link ✨",
      html: `<h2>Create your card</h2>
             <a href="${link}">Click here to continue</a>`
    });

    console.log("Email sent successfully");

    res.send("✅ Email sent! Check your inbox.");
  } catch (err) {
    console.error("Error sending email:", err);
    res.status(500).send("❌ Could not send email");
  }
});

/*
DEBUG ROUTE — email test
*/
app.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: "Greeting Cards <gaston.greetzee@gmail.com>",
      to: "gaston.ditommaso.2@gmail.com",
      subject: "SendGrid test",
      text: "If you receive this, email works."
    });

    res.send("Test email sent!");
  } catch (err) {
    console.error(err);
    res.send("Email test failed");
  }
});

/*
STEP 3
*/
app.get("/verify", (req, res) => {
  const { token } = req.query;
  if (!tokens[token]) return res.send("❌ Invalid link");

  const email = tokens[token];

  res.send(`
    <h2>Welcome ${email} 🎉</h2>
    <a href="/gallery?token=${token}">Go to gallery</a>
  `);
});

/*
STEP 4
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
STEP 5
*/
app.get("/personalize", requireAuth, (req, res) => {
  const card = req.query.card;
  const token = req.query.token;

  res.send(`
    <h2>Personalize your "${card}" card</h2>
    <form method="POST" action="/render-video">
      <input type="hidden" name="card" value="${card}" />
      <input type="hidden" name="token" value="${token}" />
      <input name="line1" required />
      <input name="line2" />
      <input name="signature" />
      <button type="submit">Generate</button>
    </form>
  `);
});

/*
STEP 6
*/
app.post("/render-video", requireAuth, (req, res) => {
  const { card, line1, line2, signature, token } = req.body;

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
        text: signature,
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
      console.error(err);
      res.send("Render error");
    });
});

/*
PAYHIP WEBHOOK
*/
app.post("/payhip-webhook", (req, res) => {
  const { event, email } = req.body;
  if (!email) return res.status(400).send("No email");

  if (event === "subscription.created" || event === "paid") {
    addSubscriber(email);
  }

  if (event === "subscription.deleted" || event === "refunded") {
    removeSubscriber(email);
  }

  res.status(200).send("Webhook received");
});

app.get("/debug-subs", (req, res) => {
  res.json(getSubscribers());
});

/*
START SERVER
*/
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});