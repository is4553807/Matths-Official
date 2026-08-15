const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viewsRoot = path.join(root, "views");
const publicRoot = path.join(root, "public");

function walk(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute, extension);
    return entry.name.endsWith(extension) ? [absolute] : [];
  });
}

function routeInventory() {
  const routes = [];
  const files = [
    ...walk(path.join(root, "routes"), ".js"),
    path.join(root, "server.js"),
  ];
  const pattern = /\b(router|server)\.(get|post|patch|delete)\s*\(\s*(["'`])([^"'`]+)\3/g;
  for (const filename of files) {
    const source = fs.readFileSync(filename, "utf8");
    const prefix = filename.endsWith("api-routes.js") ? "/api/v1" : "";
    for (const match of source.matchAll(pattern)) {
      const routePath = `${prefix}${match[4]}`.replace(/\/+/g, "/");
      routes.push({ method: match[2].toUpperCase(), path: routePath, file: filename });
    }
  }
  return routes;
}

function normalizeTarget(rawValue) {
  const value = String(rawValue || "")
    .replace(/<%[=-]?\s*(?:queryString|query)\b[\s\S]*?%>/g, "")
    .trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("<%") && /\?|:/.test(value.replace(/<%[\s\S]*?%>/g, ""))) {
    return null;
  }
  const normalized = value
    .replace(/&amp;/g, "&")
    .split(/[?#]/, 1)[0]
    .replace(/<%[=-]?[\s\S]*?%>/g, ":dynamic")
    .replace(/\$\{[^}]+\}/g, ":dynamic")
    .replace(/\/+/g, "/") || "/";
  return /[^/]:dynamic|:dynamic[^/]/.test(normalized) ? null : normalized;
}

function routeMatches(routePath, targetPath) {
  const routeSegments = routePath.split("/").filter(Boolean);
  const targetSegments = targetPath.split("/").filter(Boolean);
  if (routeSegments.length !== targetSegments.length) return false;
  return routeSegments.every((segment, index) => (
    segment.startsWith(":")
    || segment === "*"
    || targetSegments[index]?.startsWith(":")
    || segment === targetSegments[index]
  ));
}

function staticAssetExists(target) {
  if (target.startsWith("/vendor/mathjax-fonts/")) {
    return fs.existsSync(path.join(root, "node_modules", "@mathjax", target.slice(22)));
  }
  if (target.startsWith("/vendor/mathjax/")) {
    return fs.existsSync(path.join(root, "node_modules", "mathjax", target.slice(16)));
  }
  return fs.existsSync(path.join(publicRoot, target));
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function main() {
  const routes = routeInventory();
  assert.ok(routes.length > 250, `라우트 추출 수가 비정상적으로 적습니다: ${routes.length}`);

  const references = [];
  const attributePattern = /\b(href|action|src)\s*=\s*(["'])([^"']+)\2/gi;
  for (const filename of walk(viewsRoot, ".ejs")) {
    const source = fs.readFileSync(filename, "utf8");
    for (const match of source.matchAll(attributePattern)) {
      const target = normalizeTarget(match[3]);
      if (!target) continue;
      const tagStart = match[1].toLowerCase() === "action"
        ? source.lastIndexOf("<form", match.index)
        : source.lastIndexOf("<", match.index);
      const tagEnd = match[1].toLowerCase() === "action"
        ? Math.min(source.length, match.index + 500)
        : source.indexOf(">", match.index) + 1;
      const tagSource = source.slice(tagStart, tagEnd);
      const formMethod = match[1].toLowerCase() === "action"
        ? (tagSource.match(/\bmethod\s*=\s*["'](get|post)["']/i)?.[1] || "get").toUpperCase()
        : "GET";
      references.push({
        kind: match[1].toLowerCase(),
        method: formMethod,
        target,
        filename,
        line: lineNumber(source, match.index),
      });
    }
  }

  const assetPrefixes = ["/css/", "/js/", "/images/", "/fonts/", "/vendor/", "/templates/"];
  const brokenAssets = references.filter((reference) => (
    assetPrefixes.some((prefix) => reference.target.startsWith(prefix))
    && !reference.target.includes(":dynamic")
    && !staticAssetExists(reference.target)
  ));
  const brokenNavigation = references.filter((reference) => {
    if (assetPrefixes.some((prefix) => reference.target.startsWith(prefix))) return false;
    if (reference.kind === "src") return false;
    return !routes.some((route) => (
      route.method === reference.method
      && routeMatches(route.path, reference.target)
    ));
  });

  const format = (item) => `${path.relative(root, item.filename)}:${item.line} ${item.method || ""} ${item.target}`;
  assert.deepEqual(brokenAssets.map(format), [], "존재하지 않는 정적 자산 링크가 있습니다.");
  assert.deepEqual(brokenNavigation.map(format), [], "등록되지 않은 내부 링크 또는 폼 대상이 있습니다.");

  console.log(
    `Internal navigation verified: ${routes.length} routes cover ${references.length} literal view links/forms/assets.`
  );
}

main();
