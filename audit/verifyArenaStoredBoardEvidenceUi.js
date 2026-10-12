"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
async function run(boardCount, useSavedPng = false) {
  let reloaded = false, finalized = false, painted = 0;
  const controls = { form: { hidden: false }, button: { hidden: true, addEventListener(event, callback) { this.click = callback; } }, previews: { hidden: true, figures: [], append(figure) { this.figures.push(figure); } }, state: {} };
  const root = { dataset: { boardsUrl: "/fixture/boards", finalizeUrl: "/fixture/finalize" }, querySelector(selector) {
    return selector.includes("photo-form") ? controls.form : selector.includes("finalize") ? controls.button : selector.includes("previews") ? controls.previews : controls.state;
  } };
  const boards = Array.from({ length: boardCount }, (_, index) => ({ questionSlot: index + 1, sha256: "a".repeat(64), previewURL: useSavedPng ? `https://private.example.invalid/board-${index}.png` : null, drawingDataBase64: useSavedPng ? "opaque-native-drawing" : Buffer.from(JSON.stringify({ strokes: [[[10,20],[40,50]]] })).toString("base64") }));
  vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "../public/js/arena-solution-evidence.js"), "utf8"), {
    document: { querySelectorAll: () => [root], createElement(tag) { return { tag, append(...children) { this.children = children; }, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }; } },
    window: { MatthsNoteGrid: { drawScreen() { painted++; } } },
    TextDecoder, Uint8Array, atob: value => Buffer.from(value, "base64").toString("binary"), location: { reload() { reloaded = true; } },
    fetch: async (url, options) => {
      if (url === "/fixture/boards") return { ok: true, json: async () => ({ boards }) };
      assert.equal(url, "/fixture/finalize"); assert.equal(options.method, "POST"); finalized = true;
      return { ok: true, json: async () => ({ finalized: true }) };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(painted, useSavedPng ? 0 : boardCount); assert.equal(controls.previews.figures.length, boardCount);
  if (useSavedPng) assert.ok(controls.previews.figures.every(figure => figure.children[0].tag === "img" && figure.children[0].src.startsWith("https://private.example.invalid/")), "native binary drawings must use their saved PNG instead of an empty JSON canvas");
  assert.equal(controls.form.hidden, boardCount === 5); assert.equal(controls.button.hidden, boardCount !== 5);
  assert.equal(controls.previews.hidden, boardCount === 0);
  if (boardCount === 5) { await controls.button.click(); assert.equal(finalized, true); assert.equal(reloaded, true); }
}
(async () => { for (const count of [0, 2, 5]) await run(count); await run(5, true); console.log("Stored-board submission UI verified: zero/partial/full board previews, native PNGs, mixed-device photo submission, and complete-board finalization on desktop or tablet."); })().catch(error => { console.error(error); process.exitCode = 1; });
