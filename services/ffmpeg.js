const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

const assetsDir = path.join(__dirname, "../assets");
const fontsDir = path.join(assetsDir, "fonts");

function renderVideo(card, fields, outputPath) {
  return new Promise((resolve, reject) => {
    const inputVideo = path.join(assetsDir, card.video);
    if (!fs.existsSync(inputVideo)) return reject(new Error("Video template missing"));

    // Find the earliest text start time to know where to split
    const textStarts = card.textZones
      .filter(zone => fields[zone.field])
      .map(zone => zone.start ?? 0);

    const splitTime = Math.max(0, Math.min(...textStarts) - 0.1); // e.g. ~12.9s

    const tmpTail = outputPath + "_tail.mp4";

    const drawtextFilters = card.textZones
      .filter(zone => fields[zone.field])
      .map(zone => {
        const text = fields[zone.field].replace(/'/g, "\u2019");
        const fontFile = path.join(fontsDir, zone.font || "playfair.ttf");
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

    const filterComplex = [`scale=720:720`, ...drawtextFilters].join(",");

    // Step 1: Render only the tail (from splitTime to end) with text overlaid
    ffmpeg(inputVideo)
      .inputOptions([`-ss`, `${splitTime}`])
      .outputOptions([
        `-filter_complex`, filterComplex,
        `-movflags`, `faststart`,
        `-crf`, `28`
      ])
      .on("end", () => {
        // Step 2: Concatenate the untouched head + rendered tail
        const concatList = outputPath + "_concat.txt";
        fs.writeFileSync(concatList,
          `file '${inputVideo}'\noutpoint ${splitTime}\nfile '${tmpTail}'\n`
        );

        ffmpeg()
          .input(concatList)
          .inputOptions([`-f`, `concat`, `-safe`, `0`])
          .outputOptions([`-c`, `copy`, `-movflags`, `faststart`])
          .on("end", () => {
            fs.unlinkSync(tmpTail);
            fs.unlinkSync(concatList);
            resolve();
          })
          .on("error", err => {
            fs.unlinkSync(tmpTail);
            reject(err);
          })
          .save(outputPath);
      })
      .on("error", err => reject(err))
      .save(tmpTail);
  });
}

module.exports = { renderVideo };