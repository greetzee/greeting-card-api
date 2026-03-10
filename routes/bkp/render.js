const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

router.post("/", auth, async (req, res) => {
  const userEmail = req.user.email;

  console.log("Rendering for:", userEmail);

  // run your ffmpeg render here

  res.json({ success: true });
});

module.exports = router;
