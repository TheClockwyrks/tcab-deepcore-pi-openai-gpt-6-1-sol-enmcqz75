/* global console, document, window, KeyboardEvent */
// One-time showcase capture against the running Vite dev server.
// All scenarios use the shipped engine/debug surface and real input actions.
import { chromium } from "playwright";
import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => console.error(error));
await page.goto("http://localhost:5173");
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh";
  document.body.append(canvas);
  const e = createEngine({
    canvas,
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 30),
  });
  await e.initialize();
  window.capture = e;
  window.pose = (name, ...args) => e.apply((s) => e.debug[name](s, ...args));
  window.key = (code, down) =>
    document.dispatchEvent(
      new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }),
    );
});
await mkdir("showcase", { recursive: true });
await page.evaluate(async () => {
  const e = window.capture,
    p = window.pose;
  p("setScreen", "in-mine");
  p("setWorldSize", "quick");
  p("generateMine");
  p("setTier", "fuel", 5);
  p("setFuel", 550);
  p("setTier", "drill", 3);
  p("setTier", "hull", 5);
  p("setHull", 450);
  p("setTier", "jetpack", 3);
  p("setTier", "scanner", 2);
  p("setCredits", 2350);
  p("setCargo", "argenite", 4);
  p("setCargo", "cuprite", 3);
  for (let r = 70; r <= 80; r++) p("setTile", 15, r, "tunnel");
  for (let r = 81; r <= 88; r++) p("setOreTile", 15, r, "argenite");
  p("setMaterialTile", 19, 83, "resonite");
  p("setOreTile", 13, 81, "verdite");
  p("setTile", 12, 84, "stone");
  p("setTile", 21, 82, "gas");
  p("setOreTile", 16, 82, "cobaltine");
  p("setOreTile", 16, 83, "cobaltine");
  p("setMinerPosition", 15 * 80 + 12, 81 * 80 - 72);
  p("setMinerVelocity", 0, 0);
  await e.advance(1);
  e.startRecording();
  window.key("KeyS", true);
  await e.advance(37);
});
await page.screenshot({ path: "showcase/mining.png" });
await page.evaluate(async () => {
  const e = window.capture;
  await e.advance(23);
  window.key("KeyS", false);
  window.key("Space", true);
  await e.advance(120);
  window.key("Space", false);
});
const recording = await page.evaluate(() =>
  JSON.stringify(window.capture.stopRecording()),
);
await writeFile("showcase/descent.json.gz", gzipSync(recording, { level: 9 }));
await page.evaluate(async () => {
  const e = window.capture,
    p = window.pose;
  p("reset");
  p("setScreen", "in-mine");
  p("setWorldSize", "quick");
  p("generateMine");
  p("setMinerPosition", 1050, 8);
  p("setCredits", 6870);
  p("setTier", "fuel", 3);
  p("setFuel", 241);
  p("setTier", "hull", 3);
  p("setHull", 187);
  p("setRocketInstalled", 3);
  p("setMaterial", "resonite", 1);
  p("setCargo", "argenite", 6);
  await e.advance(1);
});
await page.screenshot({ path: "showcase/surface.png" });
await page.evaluate(async () => {
  const e = window.capture,
    p = window.pose;
  p("setScreen", "in-mine");
  p("setMinerPosition", 15 * 80 + 12, 200 * 80 - 72);
  p("setTier", "fuel", 5);
  p("setFuel", 423);
  p("setTier", "hull", 5);
  p("setHull", 367);
  p("setTier", "radiator", 4);
  p("setTier", "drill", 5);
  p("setCoreCarried", true);
  p("setCoreTimer", 48);
  p("setMaterial", "cryenite", 1);
  p("setTier", "scanner", 3);
  for (let r = 195; r < 200; r++)
    for (let c = 14; c < 17; c++) p("setTile", c, r, "tunnel");
  for (let c = 18; c < 22; c++)
    for (let r = 201; r < 204; r++) p("setTile", c, r, "lava");
  p("setOreTile", 13, 200, "aurite");
  p("setTile", 15, 200, "rock");
  p("setMinerDrill", false);
  await e.advance(1);
});
await page.screenshot({ path: "showcase/coreshell.png" });
await browser.close();
console.log("Captured live play, surface camp, and the Core run.");
