const express = require("express");
const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", require("./routes/auth"));
app.use("/", require("./routes/video"));
app.use("/", require("./routes/payhip"));

app.get("/", (req, res) => res.send("Greeting Card API running 🚀"));
app.get("/debug-subs", (req, res) => {
  const { getSubscribers } = require("./services/subscribers");
  res.json(getSubscribers());
});

app.use("/output", express.static("/tmp"));
app.use("/assets", express.static(require("path").join(__dirname, "assets")));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));