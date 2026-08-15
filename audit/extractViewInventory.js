const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function walk(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [fullPath] : [];
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

const renderers = [];
for (const filePath of walk(path.join(root, "controllers"), ".js")) {
  const source = fs.readFileSync(filePath, "utf8");
  const matcher = /res\.render\(\s*["'`]([^"'`]+)["'`]/g;
  for (const match of source.matchAll(matcher)) {
    renderers.push({
      view: match[1],
      file: path.relative(root, filePath),
      line: lineNumber(source, match.index),
    });
  }
}

const views = walk(path.join(root, "views"), ".ejs").map((filePath) => {
  const source = fs.readFileSync(filePath, "utf8");
  const relative = path.relative(path.join(root, "views"), filePath).replace(/\\/g, "/");
  const viewName = relative.replace(/\.ejs$/, "");
  const count = (pattern) => (source.match(pattern) || []).length;
  return {
    view: viewName,
    file: path.relative(root, filePath),
    forms: count(/<form\b/gi),
    buttons: count(/<button\b/gi),
    links: count(/<a\b/gi),
    inputs: count(/<(?:input|select|textarea)\b/gi),
    mathHints: count(/(?:\\\(|\\\[|\$\$|data-math|latex|katex|mathjax)/gi),
    inlineScripts: count(/<script\b/gi),
  };
});

const renderMap = new Map();
for (const item of renderers) {
  if (!renderMap.has(item.view)) renderMap.set(item.view, []);
  renderMap.get(item.view).push(`${item.file}:${item.line}`);
}

console.log("view\tfile\trendered_by\tforms\tbuttons\tlinks\tinputs\tmath_hints\tscripts");
for (const view of views) {
  console.log([
    view.view,
    view.file,
    (renderMap.get(view.view) || []).join(","),
    view.forms,
    view.buttons,
    view.links,
    view.inputs,
    view.mathHints,
    view.inlineScripts,
  ].join("\t"));
}

const missing = [...renderMap.keys()].filter(
  (view) => !views.some((candidate) => candidate.view === view)
);
const neverRendered = views.filter((view) => !renderMap.has(view.view));
console.error(JSON.stringify({
  viewFiles: views.length,
  staticRenderCalls: renderers.length,
  distinctRenderedViews: renderMap.size,
  missingTemplates: missing,
  templatesWithoutStaticRenderCall: neverRendered.map((item) => item.view),
}, null, 2));
