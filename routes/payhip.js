const express = require("express");
const router = express.Router();
const { addSubscriber, removeSubscriber } = require("../services/subscribers");

router.post("/payhip-webhook", (req, res) => {
  const { event, email } = req.body;
  if (!email) return res.status(400).send("No email");
  if (event === "subscription.created" || event === "paid") addSubscriber(email);
  if (event === "subscription.deleted" || event === "refunded") removeSubscriber(email);
  res.status(200).send("Webhook received");
});

module.exports = router;