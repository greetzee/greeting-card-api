const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

const assetsDir = path.join(__dirname, "../assets");
const fontsDir = path.join(assetsDir, "fonts");

function renderVideo(card, fields, outputPath) {
  return new Promise((resolve, reject) => {
    const inputVideo = path.join(assetsDir, card.video);
    if (!fs.existsSync(inputVideo)) return reject(new Error("Video template missing"));

    const drawtextFilters = card.textZones
      .filter(zone => fields[zone.field])
      .map(zone => {
        const text = fields[zone.field].replace(/'/g, "\u2019");
        const fontFile = path.join(fontsDir, zone.font || "playfair.ttf");
        const start = zone.start ?? 0;
        const end = zone.end ?? 15;
        const fadeDur = zone.fadeDuration ?? 1;
        const slide = zone.slideDistance ?? 0;

        const alpha = `if(lt(t,${start}),0,if(lt(t,${start}+${fadeDur}),(t-${start})/${fadeDur},1))`;
        const yExpr = `${zone.y}+${slide}*if(lt(t,${start}+${fadeDur}),1-(t-${start})/${fadeDur},0)`;

        return [
          `drawtext=fontfile='${fontFile}'`,
          `text='${text}'`,
          `fontcolor=${zone.fontcolor}`,
          `fontsize=${zone.fontsize}`,
          `x=${zone.x}`,
          `y=${yExpr}`,
          `alpha='${alpha}'`,
          `enable='between(t,${start},${end})'`
        ].join(":");
      });

    ffmpeg(inputVideo)
      .videoFilters([
        { filter: "scale", options: { w: 720, h: 720 } }
      ])
      .complexFilter(drawtextFilters.join(","))
      .outputOptions(["-movflags faststart", "-crf 28"])
      .on("start", cmd => console.log("FFmpeg started:", cmd))
      .on("end", () => resolve())
      .on("error", err => reject(err))
      .save(outputPath);
  });
}

module.exports = { renderVideo };