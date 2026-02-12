const express = require("express");

const app = express();
const PORT = 3000;

// allow JSON bodies
app.use(express.json());


/**
 * 🌿 Test routes
 */

// health check
app.get("/", (req, res) => {
  res.send("Greeting Card API is alive 🚀");
});

// simple test endpoint
app.get("/ping", (req, res) => {
  res.json({ message: "pong" });
});


/**
 * 🚀 Start server
 */
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
