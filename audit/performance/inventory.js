// Static coverage map, not a claim that every route has been load-tested.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const files = execFileSync("rg", ["--files", "services", "controllers", "routes", "middleware", "models", "constants", "dataAnalysis", "content/email", "public/js", "views"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter((name) => /\.(js|ejs)$/.test(name));
function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => ({ line: source.slice(0, match.index).split("\n").length, text: match[0].slice(0, 200) }));
}
const rows = ["server.js", ...files].map((file) => {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  return {
    file, lines: source.split("\n").length, bytes: Buffer.byteLength(source),
    imports: matches(source, /require\(["'][^"']+["']\)/g),
    queries: matches(source, /\b[A-Z][A-Za-z\d]*\.(?:find\w*|aggregate|countDocuments|distinct|bulkWrite|update\w*|delete\w*)\s*\(/g),
    network: matches(source, /\b(?:fetch|axios|https?\.request|https?\.get)\s*\(/g),
    scheduling: matches(source, /\b(?:setInterval|setTimeout|requestAnimationFrame|schedule|withSchedulerLease)\s*\(/g),
    filesystem: matches(source, /\bfs\.(?:promises\.)?[A-Za-z]+\s*\(/g),
    rendering: matches(source, /\b(?:res\.render|JSON\.(?:parse|stringify)|new Intl\.DateTimeFormat)\s*\(/g),
    collectionPasses: matches(source, /\.(?:find|filter|sort|map|reduce|forEach|flatMap)\s*\(/g),
    templates: matches(source, /(?:include\(["'][^"']+["']|<script[^>]+src=["'][^"']+["'])/g),
  };
});
const routes = execFileSync(process.execPath, ["audit/extractRouteInventory.js"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").map((line) => {
  const [method, route, location] = line.split("\t");
  return { method, route, location, mount: location.startsWith("routes/api-routes") ? "/api/v1" : "" };
});
const summary = { files: rows.length, lines: rows.reduce((sum, row) => sum + row.lines, 0), routeRegistrations: routes.length, queryCallSites: rows.reduce((sum, row) => sum + row.queries.length, 0), networkCallSites: rows.reduce((sum, row) => sum + row.network.length, 0) };
const destination = path.join(root, "outputs/performance/inventory.json");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify({ summary, routes, files: rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(destination);
