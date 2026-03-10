const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

router.get("/verify", (req, res) => {
  const { email } = req.query;

  // create login token (valid 24h)
  const token = jwt.sign(
    { email },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  // redirect to Payhip page with token
  res.redirect(
    `https://greetzee.com/choose-your-greetzee?token=${token}`
  );
});

module.exports = router;
