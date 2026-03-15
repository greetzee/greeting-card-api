const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

const assetsDir = path.join(__dirname, "../assets");
const fontsDir = path.join(assetsDir, "fonts");

function renderVideo(card, fields, outputPath) {
  return new Promise((resolve, reject) => {
    const inputVideo = path.join(assetsDir, card.video);
    if (!fs.existsSync(inputVideo)) return reject(new Error("Video template missing"));

    const textStarts = card.textZones
      .filter(zone => fields[zone.field])
      .map(zone => zone.start ?? 0);

    const splitTime = Math.max(0, Math.min(...textStarts) - 0.1); // e.g. 12.9

    const drawtextFilters = card.textZones
      .filter(zone => fields[zone.field])
      .map(zone => {
        const text = fields[zone.field].replace(/'/g, "\u2019");
        const fontFile = path.join(fontsDir, zone.font || "playfair.ttf");
        // Adjust times to be relative to the tail segment
        const start = (zone.start ?? 0) - splitTime;
        const end = (zone.end ?? 15) - splitTime;
        const fadeDur = zone.fadeDuration ?? 1;
        const slide = zone.slideDistance ?? 0;
        const color = zone.fontcolor.replace("#", "0x");

        const xExpr = zone.align === "center" ? `(720-text_w)/2` : `${zone.x}`;
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

    // Build filter_complex:
    // [0:v] trim head (0 to splitTime), setpts reset
    // [0:v] trim tail (splitTime to end), scale + drawtext, setpts reset
    // concat both video streams + both audio streams
    const drawtextChain = drawtextFilters.join(",");

    const filterComplex = [
      `[0:v]split[vhead_in][vtail_in]`,
      `[0:a]asplit[ahead_in][atail_in]`,
      `[vhead_in]trim=0:${splitTime},setpts=PTS-STARTPTS[vhead]`,
      `[ahead_in]atrim=0:${splitTime},asetpts=PTS-STARTPTS[ahead]`,
      `[vtail_in]trim=${splitTime},setpts=PTS-STARTPTS,scale=720:720${drawtextChain ? "," + drawtextChain : ""}[vtail]`,
      `[atail_in]atrim=${splitTime},asetpts=PTS-STARTPTS[atail]`,
      `[vhead][ahead][vtail][atail]concat=n=2:v=1:a=1[vout][aout]`
    ].join(";");

    ffmpeg(inputVideo)
      .outputOptions([
        `-filter_complex`, filterComplex,
        `-map`, `[vout]`,
        `-map`, `[aout]`,
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