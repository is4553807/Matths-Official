(function (scope, factory) {
  const grid = factory();
  if (typeof module === "object" && module.exports) module.exports = grid;
  else scope.MatthsNoteGrid = grid;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";

  // NotePalette + GraphPaper, as supplied in matths-note-grid.svg/export-grid.cjs.
  // These are logical points (CSS px on the web), not backing-store pixels.
  const spec = Object.freeze({
    version: "MATTHS_NOTE_GRID_V1",
    spacing: 24,
    lineWidth: 0.7,
    paperColor: "rgb(100%,99.6%,98.8%)",
    lineColor: "rgb(85.5%,87.8%,92.5%)",
    logicalWidth: 1024,
    logicalHeight: 768,
    exportScale: 2,
  });

  function dimensions(options = {}) {
    const logicalWidth = Number(options.logicalWidth ?? spec.logicalWidth);
    const logicalHeight = Number(options.logicalHeight ?? spec.logicalHeight);
    const scale = Number(options.scale ?? spec.exportScale);
    if (![logicalWidth, logicalHeight, scale].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error("Invalid note-grid dimensions.");
    }
    const pixelWidth = Number(options.pixelWidth ?? Math.round(logicalWidth * scale));
    const pixelHeight = Number(options.pixelHeight ?? Math.round(logicalHeight * scale));
    if (![pixelWidth, pixelHeight].every((value) => Number.isInteger(value) && value > 0)) throw new Error("Invalid note-grid pixel dimensions.");
    return { logicalWidth, logicalHeight, pixelWidth, pixelHeight, scale };
  }

  function draw(context, options = {}) {
    const box = dimensions(options);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = spec.paperColor;
    context.fillRect(0, 0, box.pixelWidth, box.pixelHeight);
    context.setTransform(options.pixelWidth === undefined ? box.scale : box.pixelWidth / box.logicalWidth,
      0, 0, options.pixelHeight === undefined ? box.scale : box.pixelHeight / box.logicalHeight, 0, 0);
    context.strokeStyle = spec.lineColor;
    context.lineWidth = spec.lineWidth;
    context.lineCap = "butt";
    context.lineJoin = "miter";
    context.beginPath();
    for (let x = 0; x <= box.logicalWidth; x += spec.spacing) {
      context.moveTo(x, 0); context.lineTo(x, box.logicalHeight);
    }
    for (let y = 0; y <= box.logicalHeight; y += spec.spacing) {
      context.moveTo(0, y); context.lineTo(box.logicalWidth, y);
    }
    context.stroke();
    context.restore();
    return box;
  }

  function toSVG(options = {}) {
    const box = dimensions(options);
    const segments = [];
    for (let x = 0; x <= box.logicalWidth; x += spec.spacing) segments.push(`M${x} 0V${box.logicalHeight}`);
    for (let y = 0; y <= box.logicalHeight; y += spec.spacing) segments.push(`M0 ${y}H${box.logicalWidth}`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.pixelWidth}" height="${box.pixelHeight}" viewBox="0 0 ${box.logicalWidth} ${box.logicalHeight}"><rect width="100%" height="100%" fill="${spec.paperColor}"/><path d="${segments.join(" ")}" fill="none" stroke="${spec.lineColor}" stroke-width="${spec.lineWidth}"/></svg>`;
  }

  function displaySize(canvas) {
    const bounds = canvas.getBoundingClientRect();
    return {
      width: (bounds.width - 2 * (canvas.clientLeft || 0)) || canvas.clientWidth || spec.logicalWidth,
      height: (bounds.height - 2 * (canvas.clientTop || 0)) || canvas.clientHeight || spec.logicalHeight,
    };
  }

  function drawScreen(canvas) {
    const size = displaySize(canvas);
    // Keep legacy stroke coordinates (1200x900) while maintaining 24 CSS px
    // squares at every viewport size. Grid and handwriting use separate transforms.
    draw(canvas.getContext("2d"), { logicalWidth: size.width, logicalHeight: size.height, pixelWidth: canvas.width, pixelHeight: canvas.height, scale: 1 });
  }

  function drawStrokes(context, strokes, sourceWidth, sourceHeight, pixelWidth, pixelHeight) {
    context.save();
    context.setTransform(pixelWidth / sourceWidth, 0, 0, pixelHeight / sourceHeight, 0, 0);
    context.strokeStyle = "#17233c";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    strokes.forEach((stroke) => {
      if (!stroke.length) return;
      context.beginPath(); context.moveTo(stroke[0][0], stroke[0][1]);
      stroke.slice(1).forEach(([x, y]) => context.lineTo(x, y));
      context.stroke();
    });
    context.restore();
  }

  function createEvidenceCanvas(canvas, strokes) {
    const size = displaySize(canvas);
    const box = dimensions({ logicalWidth: size.width, logicalHeight: size.height });
    const evidence = document.createElement("canvas");
    evidence.width = box.pixelWidth;
    evidence.height = box.pixelHeight;
    const context = evidence.getContext("2d");
    draw(context, { logicalWidth: size.width, logicalHeight: size.height });
    drawStrokes(context, strokes, canvas.width, canvas.height, box.pixelWidth, box.pixelHeight);
    return evidence;
  }

  function observeCanvas(canvas, redraw) {
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(redraw);
      observer.observe(canvas);
      return observer;
    }
    if (typeof window === "object") window.addEventListener?.("resize", redraw, { passive: true });
    return null;
  }

  function isTouchBoardDevice() {
    return typeof navigator === "object" && (
      /Android|iPad|iPhone|iPod/i.test(navigator.userAgent || "") ||
      (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1) ||
      (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches)
    ) && matchMedia("(max-width: 1440px)").matches;
  }

  return Object.freeze({ spec, dimensions, draw, toSVG, drawScreen, drawStrokes, createEvidenceCanvas, observeCanvas, isTouchBoardDevice });
});
