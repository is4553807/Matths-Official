#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const grid = require("../public/js/matths-note-grid.js");

async function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  if (args.spec === "true") { process.stdout.write(JSON.stringify(grid.spec)); return; }
  const options = { logicalWidth: Number(args.width ?? grid.spec.logicalWidth), logicalHeight: Number(args.height ?? grid.spec.logicalHeight), scale: Number(args.scale ?? grid.spec.exportScale) };
  const box = grid.dimensions(options);
  if (!args.png && !args.svg) throw new Error("Pass --png and/or --svg output paths.");
  for (const target of [args.png, args.svg].filter(Boolean)) {
    if (fs.existsSync(target)) throw new Error(`Existing output is preserved: ${target}`);
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  }
  let renderer = "svg";
  if (args.svg) fs.writeFileSync(args.svg, grid.toSVG(options));
  if (args.png) {
    let createCanvas;
    try { ({ createCanvas } = require("@napi-rs/canvas")); } catch (_error) {}
    if (createCanvas) {
      const canvas = createCanvas(box.pixelWidth, box.pixelHeight);
      grid.draw(canvas.getContext("2d"), options);
      fs.writeFileSync(args.png, canvas.toBuffer("image/png"));
      renderer = "canvas";
    } else {
      await require("sharp")(Buffer.from(grid.toSVG(options))).png().toFile(args.png);
      renderer = "svg-sharp";
    }
  }
  process.stdout.write(JSON.stringify({ ...box, spec: grid.spec, renderer }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
