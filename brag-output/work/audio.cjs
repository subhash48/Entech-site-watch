// Render the soundtrack with offline Web Audio. Usage (from frontend/): node ../brag-output/work/audio.cjs
const { chromium } = require(process.cwd() + "/node_modules/@playwright/test");
const fs = require("fs");
const path = require("path");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file:///" + path.join(__dirname, "audio.html").split(path.sep).join("/"));
  const r = await p.evaluate(() => window.renderAudio());
  fs.writeFileSync(path.join(__dirname, "soundtrack.wav"), Buffer.from(r.b64, "base64"));
  console.log("peak", r.peak.toFixed(3), "norm", r.norm.toFixed(3));
  await b.close();
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
