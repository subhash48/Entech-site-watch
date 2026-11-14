// Render the stage. Usage (from frontend/ so Playwright resolves):
//   node ../brag-output/work/render.cjs stills 1.5,4.2,...   -> work/stills/t_<time>.png
//   node ../brag-output/work/render.cjs all                  -> work/frames/00000.png ... (30 fps, 21 s)
const { chromium } = require(process.cwd() + "/node_modules/@playwright/test");
const fs = require("fs");
const path = require("path");
const W = __dirname;
const FPS = 30, DURATION = 21;
const [mode, list] = process.argv.slice(2);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto("file:///" + path.join(W, "stage.html").replace(/\\/g, "/"));
  await p.evaluate(() => window.ready);
  const draw = async (t, file) => { await p.evaluate((x) => window.render(x), t); await p.screenshot({ path: file, type: "png" }); };
  if (mode === "stills") {
    fs.mkdirSync(path.join(W, "stills"), { recursive: true });
    for (const t of list.split(",").map(Number)) { await draw(t, path.join(W, "stills", `t_${t.toFixed(2)}.png`)); console.log("still", t); }
  } else {
    const dir = path.join(W, "frames");
    fs.mkdirSync(dir, { recursive: true });
    const total = FPS * DURATION;
    for (let i = 0; i < total; i++) {
      await draw(i / FPS, path.join(dir, `${String(i).padStart(5, "0")}.png`));
      if (i % 90 === 0) console.log(`frame ${i}/${total}`);
    }
    console.log("frames done");
  }
  await b.close();
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
