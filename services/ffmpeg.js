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
        const color = zone.fontcolor.replace("#", "0x");

        const xExpr = zone.align === "center" ? `(720-text_w)/2` : `${zone.x}`;

        // Smoothstep ease-out: p = linear progress, smooth = 3p²-2p³
        const p = `(t-${start})/${fadeDur}`;
        const smooth = `(3*(${p})*(${p})-2*(${p})*(${p})*(${p}))`;

        const alpha = `if(lt(t\\,${start})\\,0\\,if(lt(t\\,${start}+${fadeDur})\\,${smooth}\\,1))`;
        const yExpr = `${zone.y}-${slide}*if(lt(t\\,${start}+${fadeDur})\\,1-${smooth}\\,0)`;

        return [
          `drawtext=fontfile='${fontFile}'`,
          `text='${text}'`,
          `fontcolor=${color}`,
          `fontsize=${zone.fontsize}`,
          `x=${xExpr}`,
          `y=${yExpr}`,
          `alpha='${alpha}'`,
          `enable='between(t\\,${start}\\,${end})'`
        ].join(":");
      });

    const filterComplex = [`scale=720:720`, ...drawtextFilters].join(",");

    ffmpeg(inputVideo)
      .outputOptions([
        `-filter_complex`, filterComplex,
        `-preset`, `veryfast`,
        `-movflags`, `faststart`,
        `-crf`, `28`
      ])
      .on("start", cmd => console.log("FFmpeg started:", cmd))
      .on("end", () => resolve())
      .on("error", err => reject(err))
      .save(outputPath);
  });
}

module.exports = { renderVideo };