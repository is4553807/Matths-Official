const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");
const cssPath = path.join(root, "public/css/community.css");
const css = fs.readFileSync(cssPath, "utf8");
const communityViews = [
  "community.ejs",
  "community-announcement.ejs",
  "community-new.ejs",
  "community-notice.ejs",
  "community-post.ejs",
  "community-rules.ejs",
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function linearize(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16)
  );
  const [red, green, blue] = channels.map(linearize);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrast(foreground, background) {
  const brighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (brighter + 0.05) / (darker + 0.05);
}

function mediaBlock(source, query) {
  const start = source.indexOf(query);
  invariant(start >= 0, `Missing media query: ${query}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed media query: ${query}`);
}

const phoneCss = mediaBlock(css, "@media (max-width: 480px)");
const darkCss = mediaBlock(css, "@media (prefers-color-scheme: dark)");

invariant(phoneCss.includes("min-height: 44px"), "Phone controls must preserve a 44px target");
invariant(phoneCss.includes("grid-template-columns: minmax(0, 1fr)"), "Phone layout must collapse to one shrinkable column");
invariant(darkCss.includes("color-scheme: dark"), "Dark mode must declare its color scheme");

[
  ".community-popular-strip",
  ".community-popular-strip > header",
  ".community-popular-strip > div",
  ".community-popular-strip a",
  ".community-popular-strip a strong",
].forEach((selector) => {
  const selectorIndex = css.indexOf(selector);
  invariant(selectorIndex >= 0, `Missing popular strip selector: ${selector}`);
  const ruleEnd = css.indexOf("}", selectorIndex);
  invariant(css.slice(selectorIndex, ruleEnd).includes("min-width: 0"), `${selector} must be shrinkable`);
});

[
  ["board tab copy", "#56638d", "#eef1ff"],
  ["section eyebrow", "#385cc4", "#ffffff"],
  ["vote and timestamp metadata", "#5f687b", "#ffffff"],
].forEach(([label, foreground, background]) => {
  const ratio = contrast(foreground, background);
  invariant(ratio >= 4.5, `${label} contrast is ${ratio.toFixed(2)}:1`);
});

for (const filename of communityViews) {
  const viewPath = path.join(root, "views", filename);
  const source = fs.readFileSync(viewPath, "utf8");
  ejs.compile(source, { filename: viewPath });
  const tokenReference = "/css/matths-brand-tokens.css";
  invariant(source.split(tokenReference).length === 2, `${filename} must load brand tokens exactly once`);
  invariant(
    source.indexOf(tokenReference) < source.indexOf("/css/public-navigation.css"),
    `${filename} must load brand tokens before navigation styles`
  );
  invariant(
    source.indexOf(tokenReference) < source.indexOf("/css/community.css"),
    `${filename} must load brand tokens before community styles`
  );
}

console.log(`Community mobile surface verified: ${communityViews.length} views, phone/dark layout, overflow, and AA contrast.`);
