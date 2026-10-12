"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto, createHash } = require("node:crypto");

async function runCase(restoreUploaded = false) {
  const events = [], listeners = new Map(), storage = new Map();
  let completed = false, lockHash, lockKey, captures = 0;
  const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  const canvas = {
    width: 1200, height: 900,
    getContext() { return new Proxy({}, { get: () => () => {}, set: () => true }); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 900 }; },
    setPointerCapture() {}, addEventListener(name, callback) { listeners.set(name, callback); },
    toBlob(callback) { captures += 1; events.push("capture"); callback(new Blob(["fixture"], { type: "image/png" })); },
  };
  const state = { textContent: "" };
  const board = { dataset: { questionSlot: "1" }, querySelector(selector) {
    if (selector === "[data-arena-board-canvas]") return canvas;
    if (selector === "[data-arena-board-state]") return state;
    return { addEventListener() {} };
  } };
  const root = { dataset: { matchId: "fixture" }, querySelector() { return board; } };
  const fetch = async (url, init = {}) => {
    if (url.endsWith("/solution-boards")) return json({ boards: restoreUploaded ? [{
      questionSlot: 1, revision: 1, strokeCount: 1, sha256: "a".repeat(64), completionLocked: true,
      completionRequestId: "audit-web-completion-key", lockedAnswer: "1", lockedSubmissionMode: "MANUAL",
      drawingDataBase64: Buffer.from(JSON.stringify({ version: 1, strokes: [[[10, 20]]] })).toString("base64"),
    }] : [] });
    if (url.endsWith("/lock-question")) {
      events.push("lock");
      const body = JSON.parse(init.body);
      assert.equal(body.drawingDataBase64, undefined, "the timing lock must not transfer the drawing file");
      assert.match(body.drawingSha256, /^[a-f0-9]{64}$/);
      lockHash = body.drawingSha256; lockKey ||= body.requestId;
      assert.equal(body.requestId, lockKey);
      return json({ lock: { advanced: completed, boardSha256: "a".repeat(64) } });
    }
    if (url.endsWith("/solution-boards/current")) {
      events.push("upload");
      const bytes = Buffer.from(init.body.get("drawingDataBase64"), "base64");
      assert.equal(createHash("sha256").update(bytes).digest("hex"), lockHash);
      return json({ board: { revision: 1, sha256: "a".repeat(64) } });
    }
    if (url.endsWith("/advance")) {
      events.push("advance");
      const body = JSON.parse(init.body);
      assert.equal(body.requestId, lockKey); assert.equal(body.value, "1");
      completed = true; return json({ finalQuestion: false });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const matchMedia = () => ({ matches: true });
  const window = { matchMedia, fetch, btoa: (value) => Buffer.from(value, "binary").toString("base64"), atob: (value) => Buffer.from(value, "base64").toString("binary") };
  const context = { window, matchMedia, navigator: { userAgent: "iPad", maxTouchPoints: 5 },
    document: { querySelector: () => root, documentElement: { classList: { toggle() {} } }, createElement: () => ({ ...canvas }) }, crypto: webcrypto,
    TextEncoder, TextDecoder, Uint8Array, Blob, File, FormData, Request,
    localStorage: { setItem: (key, value) => storage.set(key, value), getItem: (key) => storage.get(key), removeItem: (key) => storage.delete(key) } };
  vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "../public/js/matths-note-grid.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "../public/js/goat-arena-web-board.js"), "utf8"), context);
  await new Promise((resolve) => setImmediate(resolve));
  listeners.get("pointerdown")({ preventDefault() {}, pointerId: 1, clientX: 10, clientY: 20 });
  listeners.get("pointerup")();
  const input = { method: "POST", body: JSON.stringify({ requestId: "audit-web-completion-key", value: "1" }) };
  assert.equal((await window.fetch("/api/goat-arena/matches/fixture/advance", input)).ok, true);
  assert.deepEqual(events, restoreUploaded ? ["lock", "advance"] : ["lock", "capture", "upload", "advance"]);
  await window.fetch("/api/goat-arena/matches/fixture/advance", { ...input, body: JSON.stringify({ requestId: "different-button-key", value: "2" }) });
  assert.equal(captures, restoreUploaded ? 0 : 1, "lost-response retries and already uploaded completions must preserve accepted PNGs");
  assert.equal(storage.size, 0);
}
(async () => {
  await runCase();
  await runCase(true);
  console.log("Actual web-board script verified: lock before capture/upload, immutable drawing, lost-response replay and reuse of already accepted PNGs after grid/viewport updates.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
