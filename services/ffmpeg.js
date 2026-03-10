const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

const assetsDir = path.join(__dirname, "../assets");
const fontPath = path.join(assetsDir, "font.ttf");

function renderVideo(card, fields, outputPath) {
  return new Promise((resolve, reject) => {
    const inputVideo = path.join(assetsDir, card.video);
    if (!fs.existsSync(inputVideo)) return reject(new Error("Video template missing"));
    if (!fs.existsSync(fontPath)) return reject(new Error("Font file missing"));

    const filters = card.textZones
      .filter(zone => fields[zone.field])
      .map(zone => ({
        filter: "drawtext",
        options: {
          fontfile: fontPath,
          text: fields[zone.field],
          fontsize: zone.fontsize,
          fontcolor: zone.fontcolor,
          x: zone.x,
          y: zone.y
        }
      }));

    ffmpeg(inputVideo)
      .videoFilters([{ filter: "scale", options: { w: 720, h: 720 } }, ...filters])
      .outputOptions(["-movflags faststart", "-crf 28"])
      .on("start", cmd => console.log("FFmpeg started:", cmd))
      .on("end", () => resolve())
      .on("error", err => reject(err))
      .save(outputPath);
  });
}

module.exports = { renderVideo };