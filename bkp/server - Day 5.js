/**
 * server.js — Day 5 (cleanup + ready for Payhip next)
 */

const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = 3000;


/*
========================================
🌿 TEMP DATABASE
========================================
*/
const members = [
  "gaston.ditommaso.2@gmail.com"
];

const tokens = {};


/*
========================================
📨 MAILER
========================================
*/
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "gaston.ditommaso.2@gmail.com",
    pass: "mhrj phih frap xrkm"
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


/*
========================================
🔐 AUTH
========================================
*/
function requireAuth(req, res, next) {
  const token = req.query.token || req.body.token;

  if (!tokens[token]) {
    return res.send("Not authorized");
  }

  next();
}


/*
========================================
🧹 CLEANUP SYSTEM
========================================
Deletes videos older than 2 hours
========================================
*/
function cleanupOldVideos() {
  const folder = path.join(__dirname, "output");
  const maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours

  if (!fs.existsSync(folder)) return;

  const files = fs.readdirSync(folder);

  files.forEach(file => {
    const filePath = path.join(folder, file);
    const stats = fs.statSync(filePath);

    const age = Date.now() - stats.mtimeMs;

    if (age > maxAgeMs) {
      fs.unlinkSync(filePath);
      console.log("🧹 deleted old video:", file);
    }
  });
}

// run at startup
cleanupOldVideos();


/*
========================================
🌿 ROUTES
========================================
*/

// health
app.get("/", (req, res) => {
  res.send("Greeting Card API running 🚀");
});


/*
STEP 1 — magic link form
*/
app.get("/start", (req, res) => {
  res.send(`
    <h2>Enter your email</h2>
    <form method="POST" action="/send-link">
      <input name="email" required />
      <button type="submit">Send magic link</button>
    </form>
  `);
});


/*
STEP 2 — send link
*/
app.post("/send-link", async (req, res) => {
  const email = req.body.email.toLowerCase();

  if (!members.includes(email)) {
    return res.send("❌ Not a member");
  }

  const token = crypto.randomBytes(24).toString("hex");
  tokens[token] = email;

  const link = `http://localhost:${PORT}/verify?token=${token}`;

  await transporter.sendMail({
    to: email,
    subject: "Your magic link ✨",
    html: `<a href="${link}">Open your card creator</a>`
  });

  res.send("✅ Email sent!");
});


/*
STEP 3 — verify
*/
app.get("/verify", (req, res) => {
  const { token } = req.query;

  if (!tokens[token]) {
    return res.send("❌ Invalid link");
  }

  res.send(`
    <a href="/gallery?token=${token}">Go to gallery 🎬</a>
  `);
});


/*
STEP 4 — gallery
*/
app.get("/gallery", requireAuth, (req, res) => {
  const token = req.query.token;

  res.send(`
    <h2>Choose card</h2>
    <a href="/personalize?card=soft&token=${token}">Soft</a><br/>
    <a href="/personalize?card=fun&token=${token}">Fun</a>
  `);
});


/*
STEP 5 — personalize
*/
app.get("/personalize", requireAuth, (req, res) => {
  const { card, token } = req.query;

  res.send(`
    <form method="POST" action="/render-video">
      <input type="hidden" name="card" value="${card}" />
      <input type="hidden" name="token" value="${token}" />

      Line 1 <input name="line1"/><br/>
      Line 2 <input name="line2"/><br/>
      Signature <input name="signature"/><br/>

      <button>Generate</button>
    </form>
  `);
});


/*
STEP 6 — render video
*/
app.post("/render-video", requireAuth, (req, res) => {
  const { card, line1, line2, signature, token } = req.body;

  const inputVideo = path.join(__dirname, "assets", `${card}.mp4`);
  const outputVideo = path.join(__dirname, "output", `${Date.now()}.mp4`);
  const fontPath = path.join(__dirname, "assets", "font.ttf");

  const message = line2 ? `${line1}\n${line2}` : line1;

  ffmpeg(inputVideo)
    .videoFilters([
      {
        filter: "drawtext",
        options: {
          fontfile: fontPath,
          text: message,
          fontsize: 48,
          x: "(w-text_w)/2",
          y: "h*0.6"
        }
      },
      {
        filter: "drawtext",
        options: {
          fontfile: fontPath,
          text: signature,
          fontsize: 30,
          x: "(w-text_w)/2",
          y: "h*0.8"
        }
      }
    ])
    .save(outputVideo)
    .on("end", () => {
      res.send(`
        <video width="400" controls>
          <source src="/output/${path.basename(outputVideo)}">
        </video>
        <br/><a href="/gallery?token=${token}">Back</a>
      `);
    })
    .on("error", () => {
      res.send("❌ Render error");
    });
});


/*
========================================
START
========================================
*/
app.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
});
