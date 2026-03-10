const express = require("express");
const router = express.Router();
const path = require("path");
const cards = require("../data/cards.json");
const { renderVideo } = require("../services/ffmpeg");
const { requireAuth } = require("../services/subscribers");

router.get("/gallery", requireAuth, (req, res) => {
  const list = Object.values(cards).map(c => ({
    id: c.id,
    name: c.name,
    occasion: c.occasion,
    preview: c.preview
  }));
  res.json({ cards: list });
});

router.post("/render-video", requireAuth, async (req, res) => {
  const { card: cardId, line1, line2, signature } = req.body;
  const card = cards[cardId];
  if (!card) return res.status(400).json({ error: "Unknown card" });

  const outputFilename = `${cardId}_${Date.now()}.mp4`;
  const outputPath = path.join("/tmp", outputFilename);

  await renderVideo(card, { line1, line2, signature }, outputPath);
  res.json({ file: outputFilename });
});

module.exports = router;