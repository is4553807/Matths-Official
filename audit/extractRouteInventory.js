const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceFiles = [
  path.join(root, "server.js"),
  ...fs
    .readdirSync(path.join(root, "routes"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(root, "routes", name)),
];

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function firstLiteral(source) {
  const match = source.match(/^\s*(["'`])([^\n]*?)\1/);
  return match ? match[2] : "<dynamic>";
}

const rows = [];

for (const filename of sourceFiles) {
  const source = fs.readFileSync(filename, "utf8");
  const direct = /\b(router|server)\.(get|post|put|patch|delete|all|use)\s*\(/g;
  const chained = /\b(router|server)\.route\s*\(\s*(["'`])([^\n]*?)\2\s*\)((?:\s*\.\s*(?:get|post|put|patch|delete|all)\s*\([^)]*\))+)/g;
  let match;

  while ((match = direct.exec(source))) {
    const tail = source.slice(direct.lastIndex, direct.lastIndex + 500);
    rows.push({
      file: path.relative(root, filename),
      line: lineNumber(source, match.index),
      method: match[2].toUpperCase(),
      route: firstLiteral(tail),
    });
  }

  while ((match = chained.exec(source))) {
    const methodPattern = /\.\s*(get|post|put|patch|delete|all)\s*\(/g;
    let methodMatch;
    while ((methodMatch = methodPattern.exec(match[4]))) {
      rows.push({
        file: path.relative(root, filename),
        line: lineNumber(source, match.index),
        method: methodMatch[1].toUpperCase(),
        route: match[3],
      });
    }
  }
}

rows.sort((left, right) =>
  left.file.localeCompare(right.file) ||
  left.line - right.line ||
  left.method.localeCompare(right.method)
);

for (const row of rows) {
  console.log(`${row.method}\t${row.route}\t${row.file}:${row.line}`);
}

const counts = rows.reduce((result, row) => {
  result[row.method] = (result[row.method] || 0) + 1;
  return result;
}, {});

console.error(JSON.stringify({ total: rows.length, counts }, null, 2));
