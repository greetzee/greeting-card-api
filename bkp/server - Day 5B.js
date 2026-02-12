/**
 * server.js — FULL CLEAN WORKING VERSION (Day 5 base)
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
🌿 TEMP DATABASE (later real DB)
========================================
*/
const members = [
  "gaston.ditommaso.2@gmail.com"
];

const tokens = {}; // token -> email


/*
========================================
📨 MAILER (Gmail app password)
========================================
*/
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "gaston.ditommaso.2@gmail.com",
    pass: "mhrj phih frap xrkm" // your gmail app password
  }
});


/*
========================================
🌿 MIDDLEWARE
========================================
*/
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve generated videos
app.use("/output", express.static(path.join(__dirname, "output")));


/*
========================================
🔐 AUTH MIDDLEWARE
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

// Health check
app.get("/", (req, res) => {
  res.send("Greeting Card API running 🚀");
});


/*
----------------------------------------
STEP 1 — Magic link form
----------------------------------------
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
----------------------------------------
STEP 2 — Send magic link
----------------------------------------
*/
app.post("/send-link", async (req, res) => {
  const email = req.body.email.toLowerCase();

  if (!members.includes(email)) {
    return res.send("❌ You are not a member");
  }

  const token = crypto.randomBytes(24).toString("hex");
  tokens[token] = email;

  const link = `http://localhost:${PORT}/verify?token=${token}`;

  await transporter.sendMail({
    from: "Greeting Cards",
    to: email,
    subject: "Your magic link ✨",
    html: `
      <h2>Create your card</h2>
      <a href="${link}">Click here to continue</a>
    `
  });

  res.send("✅ Email sent! Check your inbox.");
});


/*
----------------------------------------
STEP 3 — Verify token
----------------------------------------
*/
app.get("/verify", (req, res) => {
  const { token } = req.query;

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
----------------------------------------
STEP 4 — Gallery (protected)
----------------------------------------
*/
app.get("/gallery", requireAuth, (req, res) => {
  const token = req.query.token;

  res.send(`
    <h2>Choose your card 🎬</h2>
    <ul>
      <li><a href="/personalize?card=soft&token=${token}">Soft Card</a></li>
      <li><a href="/personalize?card=fun&token=${token}">Fun Card</a></li>
    </ul>
  `);
});


/*
----------------------------------------
STEP 5 — Personalize form
----------------------------------------
*/
app.get("/personalize", requireAuth, (req, res) => {
  const { card, token } = req.query;

  res.send(`
    <h2>Personalize your "${card}" card</h2>

    <form method="POST" action="/render-video">
      <input type="hidden" name="card" value="${card}" />
      <input type="hidden" name="token" value="${token}" />

      <label>Line 1</label><br/>
      <input name="line1" maxlength="18" required/><br/><br/>

      <label>Line 2</label><br/>
      <input name="line2" maxlength="18"/><br/><br/>

      <label>Signature</label><br/>
      <input name="signature" maxlength="18"/><br/><br/>

      <button type="submit">Generate Video</button>
    </form>
  `);
});


/*
----------------------------------------
STEP 6 — Render video (FFmpeg + Share page)
----------------------------------------
*/
app.post("/render-video", requireAuth, (req, res) => {
  const { card, line1, line2, signature, token } = req.body;

  const inputVideo = path.join(__dirname, "assets", `${card}.mp4`);
  const outputFileName = `${card}_${Date.now()}.mp4`;
  const outputVideo = path.join(__dirname, "output", outputFileName);
  const fontPath = path.join(__dirname, "assets", "font.ttf");

  const message = line2 ? `${line1}\\n${line2}` : line1;

  const filters = [
    {
      filter: "drawtext",
      options: {
        fontfile: fontPath,
        text: message,
        fontsize: 48,
        fontcolor: "yellow",
        x: "(w-text_w)/2",
        y: "h*0.6",
        alpha: "1"
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
        y: "h*0.8",
        alpha: "1"
      }
    }
  ];

  ffmpeg(inputVideo)
    .videoFilters(filters)
    .outputOptions("-movflags faststart")
    .save(outputVideo)

    .on("end", () => {

      const videoUrl = `/output/${outputFileName}`;

      res.send(`
        <h2>Your card is ready 🎉</h2>

        <video width="480" controls>
          <source src="${videoUrl}" type="video/mp4">
        </video>

        <br/><br/>

        <a href="${videoUrl}" download>
          ⬇ Download video
        </a>

        <br/><br/>

        <button onclick="shareVideo()">📤 Share</button>

        <br/><br/>

        <a href="/gallery?token=${token}">← Back to gallery</a>

        <script>
          function shareVideo() {
            if (navigator.share) {
              navigator.share({
                title: "My Greeting Card",
                text: "Look what I made 💌",
                url: window.location.origin + "${videoUrl}"
              });
            } else {
              alert("Sharing not supported on this browser. You can download instead.");
            }
          }
        </script>
      `);
    })

    .on("error", (err) => {
      console.error(err);
      res.send("❌ Error rendering video");
    });
});


/*
========================================
🌿 START SERVER
========================================
*/
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
