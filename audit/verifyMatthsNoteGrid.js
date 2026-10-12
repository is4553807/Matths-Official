"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const grid = require("../public/js/matths-note-grid.js");
const ROOT = path.resolve(__dirname, "..");

function withDisplay(canvas, width, height) {
  canvas.clientWidth = width; canvas.clientHeight = height;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
  return canvas;
}

async function verifyReferenceAndResponsiveGrid() {
  const svg = fs.readFileSync(path.join(__dirname, "fixtures/matths-note-grid/matths-note-grid.svg"), "utf8").trim();
  assert.equal(grid.toSVG({ scale: 1 }), svg, "the logical grid must match the supplied native SVG");
  const canvas = createCanvas(2048, 1536);
  grid.draw(canvas.getContext("2d"));
  const native = createCanvas(2048, 1536);
  native.getContext("2d").drawImage(await loadImage(path.join(__dirname, "fixtures/matths-note-grid/matths-note-grid@2x.png")), 0, 0);
  assert.deepEqual(canvas.getContext("2d").getImageData(0, 0, 2048, 1536).data,
    native.getContext("2d").getImageData(0, 0, 2048, 1536).data,
    "every raster pixel must match the supplied @2x app grid");
  assert.equal(fs.readFileSync(path.join(ROOT, "public/images/note-grid/matths-note-grid-tile.svg"), "utf8"),
    grid.toSVG({ logicalWidth: 24, logicalHeight: 24, scale: 1 }));

  const previousDocument = global.document;
  global.document = { createElement: () => createCanvas(1, 1) };
  try {
    for (const width of [320, 390, 768, 1024, 1366]) {
      const height = width * 3 / 4;
      const board = withDisplay(createCanvas(1200, 900), width, height);
      grid.drawScreen(board);
      const before = board.getContext("2d").getImageData(0, 0, 1200, 900).data;
      const expected = createCanvas(1200, 900);
      const ctx = expected.getContext("2d");
      ctx.scale(1200 / width, 900 / height);
      ctx.fillStyle = "rgb(255,253.98,251.94)"; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgb(218.025,223.89,235.875)"; ctx.lineWidth = 0.7; ctx.beginPath();
      for (let x = 0; x <= width; x += 24) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
      for (let y = 0; y <= height; y += 24) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
      ctx.stroke();
      assert.deepEqual(before, ctx.getImageData(0, 0, 1200, 900).data, `${width}px screen keeps 24 CSS px squares`);

      const strokes = [[[120, 300], [600, 300]]];
      const original = JSON.stringify(strokes);
      const snapshot = grid.createEvidenceCanvas(board, strokes);
      assert.equal(snapshot.width, width * 2);
      assert.equal(snapshot.height, Math.round(height * 2));
      assert.equal(JSON.stringify(strokes), original, "export preserves saved stroke coordinates");
      const middle = snapshot.getContext("2d").getImageData(Math.round(snapshot.width * .3), Math.round(snapshot.height / 3), 1, 1).data;
      assert.ok(middle[0] < 70 && middle[1] < 80, "handwriting appears at the same normalized position in the saved PNG");
      const empty = grid.createEvidenceCanvas(board, []);
      const expectedExport = createCanvas(empty.width, empty.height);
      grid.draw(expectedExport.getContext("2d"), { logicalWidth: width, logicalHeight: height });
      assert.deepEqual(empty.getContext("2d").getImageData(0, 0, empty.width, empty.height).data,
        expectedExport.getContext("2d").getImageData(0, 0, empty.width, empty.height).data);
    }
  } finally { global.document = previousDocument; }
}

async function verifyActualGuestCapture() {
  const events = [], listeners = new Map(), storage = new Map();
  const canvas = withDisplay(createCanvas(1200, 900), 400, 300);
  canvas.setPointerCapture = () => {};
  canvas.addEventListener = (name, fn) => listeners.set(name, fn);
  const inert = { addEventListener() {} };
  const boardState = { textContent: "" };
  const board = { querySelector: (selector) => selector === "[data-board-canvas]" ? canvas : selector === "[data-board-state]" ? boardState : inert };
  const button = { addEventListener: (_name, fn) => listeners.set("advance", fn), disabled: false };
  const errorBox = { hidden: true, textContent: "" };
  const root = { dataset: { token: "grid-guest", attemptId: "attempt", questionSlot: "1", finalQuestion: "false", deadline: new Date(Date.now() + 600000).toISOString() },
    querySelector: (selector) => ({ "[data-guest-inline-board]": board, "[data-guest-timer]": {}, "[data-guest-answer]": { value: "12" }, "[data-guest-advance]": button, "[data-guest-error]": errorBox })[selector] };
  const document = { querySelector: (selector) => selector === "[data-guest-challenge]" ? root : null,
    querySelectorAll: () => [], documentElement: { classList: { toggle(_name, enabled) { assert.equal(enabled, true); } } },
    createElement: () => {
      const result = createCanvas(1, 1);
      result.toBlob = (fn) => { events.push("capture"); fn(new Blob([result.toBuffer("image/png")], { type: "image/png" })); };
      return result;
    } };
  const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  const fetch = async (url, init = {}) => {
    if (url.endsWith("/solution-boards")) return json({ boards: [] });
    if (url.endsWith("/lock-question")) { events.push("lock"); return json({}); }
    if (url.endsWith("/solution-board")) {
      events.push("upload");
      const metadata = await require("sharp")(Buffer.from(await init.body.get("solutionBoard").arrayBuffer())).metadata();
      assert.equal(metadata.width, 800); assert.equal(metadata.height, 600);
      const drawing = JSON.parse(Buffer.from(init.body.get("drawingDataBase64"), "base64"));
      assert.equal(drawing.strokes.length, 1);
      assert.equal(drawing.version, 1);
      return json({ board: { revision: 1 } });
    }
    if (url.endsWith("/advance")) { events.push("advance"); return json({ finalQuestion: false }); }
    throw new Error(`Unexpected guest request ${url}`);
  };
  const matchMedia = () => ({ matches: true });
  const window = { fetch, matchMedia, setTimeout, clearTimeout };
  const context = { window, document, matchMedia, navigator: { userAgent: "iPad", platform: "MacIntel", maxTouchPoints: 5 },
    fetch, location: { assign: (url) => assert.equal(url, "/arena-invite/grid-guest") },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setInterval() {}, TextEncoder, TextDecoder, Uint8Array, Blob, File, FormData,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"), atob: (value) => Buffer.from(value, "base64").toString("binary") };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "public/js/matths-note-grid.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "public/js/arena-guest-challenge.js"), "utf8"), context);
  await new Promise((resolve) => setImmediate(resolve));
  listeners.get("pointerdown")({ preventDefault() {}, pointerId: 1, clientX: 20, clientY: 30 });
  listeners.get("pointermove")({ preventDefault() {}, clientX: 60, clientY: 30 });
  listeners.get("pointerup")();
  await listeners.get("advance")();
  assert.equal(errorBox.hidden, true, errorBox.textContent);
  assert.deepEqual(events, ["lock", "capture", "upload", "advance"]);
}

(async () => {
  await verifyReferenceAndResponsiveGrid();
  await verifyActualGuestCapture();
  console.log("Matths note grid verified: native SVG/pixels, five viewport widths, unchanged strokes, @2x PNG exports and actual guest lock/capture/upload flow.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
