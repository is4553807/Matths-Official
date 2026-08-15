const http = require("node:http");
const { randomUUID } = require("node:crypto");

const listenPort = Number(process.env.AUDIT_PROXY_PORT || 8124);
const upstreamHost = "127.0.0.1";
const upstreamPort = Number(process.env.AUDIT_UPSTREAM_PORT || 8123);
const maximumEntries = 20_000;
const networkEntries = [];
const browserEntries = [];

function appendBounded(collection, value) {
  collection.push(value);
  if (collection.length > maximumEntries) {
    collection.splice(0, collection.length - maximumEntries);
  }
}

function safeRequestTarget(rawUrl) {
  const parsed = new URL(rawUrl, "http://audit.local");
  const keys = [...parsed.searchParams.keys()].sort();
  return keys.length ? `${parsed.pathname}?${keys.join("&")}` : parsed.pathname;
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "cache-control": "no-store",
  });
  res.end(payload);
}

function viewportWrapper(res, parsed) {
  const width = Math.max(240, Math.min(2560, Number(parsed.searchParams.get("w")) || 1280));
  const height = Math.max(320, Math.min(1600, Number(parsed.searchParams.get("h")) || 720));
  const requestedPath = String(parsed.searchParams.get("path") || "/");
  const targetPath = requestedPath.startsWith("/") && !requestedPath.startsWith("/__audit__/")
    ? requestedPath
    : "/";
  const scale = Math.min(1, 1220 / width, 660 / height);
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Audit viewport ${width}x${height}</title><style>
    html,body{margin:0;background:#d8dde9;font-family:system-ui,sans-serif}.audit-meta{height:40px;display:flex;align-items:center;padding:0 14px;background:#111827;color:#fff;font-size:13px}.audit-stage{width:${width * scale}px;height:${height * scale}px;margin:10px auto;overflow:hidden;box-shadow:0 8px 30px #11182755;background:#fff}.audit-frame{width:${width}px;height:${height}px;border:0;transform:scale(${scale});transform-origin:top left;background:#fff}
  </style></head><body><div class="audit-meta">${width}×${height} · scale ${scale.toFixed(4)} · ${targetPath.replace(/[<>&"']/g, "")}</div><div class="audit-stage"><iframe class="audit-frame" title="감사 대상 뷰포트" src="${targetPath.replace(/"/g, "&quot;")}"></iframe></div></body></html>`;
  const body = Buffer.from(html);
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  res.end(body);
}

const hookSource = `(() => {
  const pageId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
  const normalize = (value) => {
    try {
      if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack || "" };
      if (typeof value === "string") return value;
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      try { return String(value); } catch (_) { return "[unserializable]"; }
    }
  };
  const send = (kind, detail) => {
    const body = JSON.stringify({ pageId, kind, href: location.href, timestamp: new Date().toISOString(), detail });
    try {
      fetch("/__audit__/browser-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  };
  addEventListener("error", (event) => send("window-error", {
    message: event.message || "",
    filename: event.filename || "",
    line: event.lineno || 0,
    column: event.colno || 0,
    error: normalize(event.error),
  }), true);
  addEventListener("unhandledrejection", (event) => send("unhandled-rejection", normalize(event.reason)), true);
  for (const level of ["error", "warn"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      send("console-" + level, args.map(normalize));
      return original(...args);
    };
  }
  const textSample = (element) => String(element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120);
  const elementSummary = (element, rect) => ({
    tag: element.tagName,
    id: element.id || "",
    className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
    text: textSample(element),
    rect: {
      left: Math.round(rect.left * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      top: Math.round(rect.top * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    },
  });
  const collectLayout = (phase) => {
    const root = document.documentElement;
    const overflow = [];
    const clipped = [];
    for (const element of document.querySelectorAll("body *")) {
      if (overflow.length >= 40 && clipped.length >= 40) break;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (
        overflow.length < 40
        && element.tagName !== "SVG"
        && element.tagName !== "PATH"
        && (rect.left < -2 || rect.right > innerWidth + 2)
      ) overflow.push(elementSummary(element, rect));
      if (
        clipped.length < 40
        && element.clientWidth > 0
        && element.scrollWidth > element.clientWidth + 2
        && ["hidden", "clip"].includes(style.overflowX)
        && textSample(element)
      ) clipped.push({
        ...elementSummary(element, rect),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: style.overflowX,
      });
    }
    const rawMathLines = String(document.body.innerText || "").split("\\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("\\\\(") || line.includes("\\\\[") || /\\\\(frac|sqrt|lim|sum|prod|int|begin|left|right)/.test(line))
      .slice(0, 30);
    send("layout-metrics", {
      phase,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      document: {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      },
      fonts: document.fonts ? document.fonts.status : "unsupported",
      counts: {
        links: document.querySelectorAll("a[href]").length,
        buttons: document.querySelectorAll("button,[role=button]").length,
        forms: document.forms.length,
        inputs: document.querySelectorAll("input,select,textarea").length,
        katex: document.querySelectorAll(".katex").length,
        mathSources: document.querySelectorAll("[data-math],.math-render-source,.math-text").length,
      },
      runtime: {
        mathJaxTypesetPromise: typeof window.MathJax?.typesetPromise,
        matthsMathRender: typeof window.MatthsMath?.render,
        matthsMathSetText: typeof window.MatthsMath?.setText,
      },
      brokenImages: [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src)
        .slice(0, 30),
      rawMathLines,
      overflow,
      clipped,
    });
  };
  addEventListener("DOMContentLoaded", () => collectLayout("dom-content-loaded"), { once: true });
  addEventListener("load", () => {
    collectLayout("load");
    setTimeout(() => collectLayout("settled-500ms"), 500);
    setTimeout(() => collectLayout("settled-2000ms"), 2000);
  }, { once: true });
  send("page-hook-ready", { userAgent: navigator.userAgent });
})();`;

function receiveBrowserEvent(req, res) {
  const chunks = [];
  let total = 0;
  req.on("data", (chunk) => {
    total += chunk.length;
    if (total <= 256 * 1024) chunks.push(chunk);
  });
  req.on("end", () => {
    try {
      const event = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      appendBounded(browserEntries, {
        receivedAt: new Date().toISOString(),
        pageId: String(event.pageId || ""),
        kind: String(event.kind || "unknown"),
        href: String(event.href || "").replace(/([?&])([^=&#]+)=([^&#]*)/g, "$1$2=[redacted]"),
        timestamp: String(event.timestamp || ""),
        detail: event.detail ?? null,
      });
      res.writeHead(204, { "cache-control": "no-store" });
      res.end();
    } catch (error) {
      json(res, 400, { ok: false, message: error.message });
    }
  });
}

function proxyRequest(req, res) {
  const requestId = randomUUID();
  const started = Date.now();
  let requestBytes = 0;
  let responseBytes = 0;
  const headers = { ...req.headers, "accept-encoding": "identity" };
  delete headers["content-length"];

  const upstream = http.request({
    hostname: upstreamHost,
    port: upstreamPort,
    method: req.method,
    path: req.url,
    headers,
  }, (upstreamResponse) => {
    const contentType = String(upstreamResponse.headers["content-type"] || "");
    const responseHeaders = { ...upstreamResponse.headers };
    delete responseHeaders["content-length"];
    delete responseHeaders["content-encoding"];
    delete responseHeaders["x-frame-options"];
    if (responseHeaders["content-security-policy"]) {
      responseHeaders["content-security-policy"] = String(responseHeaders["content-security-policy"])
        .replace(/frame-ancestors\s+'none'/i, "frame-ancestors 'self'");
    }
    if (responseHeaders.location) {
      responseHeaders.location = String(responseHeaders.location)
        .replace(`http://${upstreamHost}:${upstreamPort}`, `http://${upstreamHost}:${listenPort}`);
    }

    const finish = (status, error = "") => appendBounded(networkEntries, {
      requestId,
      at: new Date().toISOString(),
      method: req.method,
      target: safeRequestTarget(req.url),
      status,
      durationMs: Date.now() - started,
      requestBytes,
      responseBytes,
      contentType,
      error,
    });

    if (contentType.includes("text/html")) {
      const chunks = [];
      upstreamResponse.on("data", (chunk) => {
        responseBytes += chunk.length;
        chunks.push(chunk);
      });
      upstreamResponse.on("end", () => {
        const source = Buffer.concat(chunks).toString("utf8");
        const injection = '<script src="/__audit__/console-hook.js"></script>';
        const html = source.includes("<head>")
          ? source.replace("<head>", `<head>${injection}`)
          : `${injection}${source}`;
        const body = Buffer.from(html);
        responseHeaders["content-length"] = body.length;
        res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
        res.end(body);
        finish(upstreamResponse.statusCode || 502);
      });
      upstreamResponse.on("error", (error) => finish(upstreamResponse.statusCode || 502, error.message));
      return;
    }

    res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.on("data", (chunk) => { responseBytes += chunk.length; });
    upstreamResponse.pipe(res);
    upstreamResponse.on("end", () => finish(upstreamResponse.statusCode || 502));
    upstreamResponse.on("error", (error) => finish(upstreamResponse.statusCode || 502, error.message));
  });

  upstream.on("error", (error) => {
    appendBounded(networkEntries, {
      requestId,
      at: new Date().toISOString(),
      method: req.method,
      target: safeRequestTarget(req.url),
      status: 502,
      durationMs: Date.now() - started,
      requestBytes,
      responseBytes,
      contentType: "",
      error: error.message,
    });
    if (!res.headersSent) json(res, 502, { ok: false, message: "Audit upstream unavailable" });
    else res.end();
  });
  req.on("data", (chunk) => { requestBytes += chunk.length; });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || "audit.local"}`);
  if (parsed.pathname === "/__audit__/console-hook.js") {
    res.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(hookSource),
    });
    return res.end(hookSource);
  }
  if (parsed.pathname === "/__audit__/browser-event" && req.method === "POST") {
    return receiveBrowserEvent(req, res);
  }
  if (parsed.pathname === "/__audit__/report" && req.method === "GET") {
    return json(res, 200, { networkEntries, browserEntries });
  }
  if (parsed.pathname === "/__audit__/viewport" && req.method === "GET") {
    return viewportWrapper(res, parsed);
  }
  if (parsed.pathname === "/__audit__/reset" && req.method === "POST") {
    networkEntries.length = 0;
    browserEntries.length = 0;
    return json(res, 200, { ok: true });
  }
  return proxyRequest(req, res);
});

server.listen(listenPort, "127.0.0.1", () => {
  console.log(`Audit proxy running at http://127.0.0.1:${listenPort}/ -> ${upstreamHost}:${upstreamPort}`);
});
