/**
 * server.js — Full working version with Payhip membership check
 */

const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const fetch = require("node-fetch"); // for Payhip API calls

const app = express();
const PORT = 3000;

// ================================
// 🌿 TEMP TOKENS STORAGE
// ================================
const tokens = {}; // token -> email

// ================================
// 📨 MAILER SETUP (Gmail)
// ================================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "gaston.ditommaso.2@gmail.com", // change
    pass: "mhrj phih frap xrkm"    // change
  }
});

// ================================
// 🌿 MIDDLEWARE
// ================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/output", express.static(path.join(__dirname, "output"))); // serve generated videos

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.query.token || req.body.token;
  if (!tokens[token]) {
    return res.send("Not authorized");
  }
  next();
}

// ================================
// 🌿 PAYHIP MEMBERSHIP CHECK
// ================================
async function isSubscribed(email) {
  // Replace with your Payhip API call
  // Example using fetch (needs node-fetch installed)
  const PAYHIP_API_KEY = "6f67d35d72eb1a0aceec39aeae9d75254a4cf79b";

  try {
    const response = await fetch(`https://payhip.com/api/v1/memberships?api_key=${PAYHIP_API_KEY}`);
    const data = await response.json();

    // data.members is an array of subscriber emails
    return data.members.some(member => member.email.toLowerCase() === email.toLowerCase());
  } catch (err) {
    console.error("Payhip API error:", err);
    return false;
  }
}

// ================================
// 🌿 ROUTES
// ================================

// Health check
app.get("/", (req, res) => {
  res.send("Greeting Card API running 🚀");
});

// STEP 1 — Magic link form
app.get("/start", (req, res) => {
  res.send(`
    <h2>Enter your email</h2>
    <form method="POST" action="/send-link">
      <input name="email" placeholder="email" required />
      <button type="submit">Send magic link</button>
    </form>
  `);
});

// STEP 2 — Send magic link
app.post("/send-link", async (req, res) => {
  const email = req.body.email.toLowerCase();

  const subscribed = await isSubscribed(email);
  if (!subscribed) {
    return res.send("❌ You are not subscribed");
  }

  const token = crypto.randomBytes(24).toString("hex");
  tokens[token] = email;

  const link = `http://localhost:${PORT}/verify?token=${token}`;

  await transporter.sendMail({
    from: "Greeting Cards",
    to: email,
    subject: "Your magic link ✨",
    html: `<h2>Create your card</h2>
           <a href="${link}">Click here to continue</a>`
  });

  res.send("✅ Email sent! Check your inbox.");
});

// STEP 3 — Verify token
app.get("/verify", (req, res) => {
  const { token } = req.query;

  if (!tokens[token]) return res.send("❌ Invalid or expired link");

  const email = tokens[token];

  res.send(`
    <h2>Welcome ${email} 🎉</h2>
    <p>You are verified!</p>
    <a href="/gallery?token=${token}">Go to gallery</a>
  `);
});

// STEP 4 — Gallery (protected)
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

// STEP 5 — Personalization form (protected)
app.get("/personalize", requireAuth, (req, res) => {
  const card = req.query.card;
  const token = req.query.token;

  res.send(`
    <h2>Personalize your "${card}" card 🎬</h2>
    <form method="POST" action="/render-video">
      <input type="hidden" name="card" value="${card}" />
      <input type="hidden" name="token" value="${token}" />
      
      <label>Line 1:</label><br/>
      <input name="line1" maxlength="18" required /><br/><br/>
      
      <label>Line 2:</label><br/>
      <input name="line2" maxlength="18" /><br/><br/>
      
      <label>Signature:</label><br/>
      <input name="signature" maxlength="18" /><br/><br/>
      
      <button type="submit">Generate Video</button>
    </form>
  `);
});

// STEP 6 — Render personalized video (POST, protected)
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
        y: "h*0.6",
        alpha: "1"
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
      res.send(`
        <h2>Video ready! 🎉</h2>
        <video width="480" controls>
          <source src="/output/${path.basename(outputVideo)}" type="video/mp4">
        </video>
        <br/>
        <a href="/gallery?token=${token}">Back to gallery</a>
      `);
    })
    .on("error", (err) => {
      console.error(err);
      res.send("❌ Error rendering video");
    });
});

// ================================
// 🌿 START SERVER
// ================================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
