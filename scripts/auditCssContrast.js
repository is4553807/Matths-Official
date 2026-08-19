const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cssRoot = path.join(root, "public", "css");

function expandHex(value) {
  const raw = value.slice(1);
  if (raw.length === 3 || raw.length === 4) {
    return raw
      .split("")
      .map((digit) => digit + digit)
      .join("");
  }
  return raw;
}

function parseColor(raw, variables = {}) {
  if (!raw) return null;
  let value = String(raw).trim().toLowerCase();
  const variable = value.match(/^var\((--[\w-]+)(?:,\s*([^)]*))?\)$/);
  if (variable) {
    return parseColor(variables[variable[1]] || variable[2], variables);
  }
  if (value === "white") value = "#fff";
  if (value === "black") value = "#000";
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0, raw };

  if (/^#[0-9a-f]{3,8}$/.test(value)) {
    const hex = expandHex(value);
    if (![6, 8].includes(hex.length)) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      raw,
    };
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/);
  if (!rgb) return null;
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: rgb[4] === undefined ? 1 : Number(rgb[4]) > 1 ? Number(rgb[4]) / 100 : Number(rgb[4]),
    raw,
  };
}

function composite(foreground, background) {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha <= 0) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  };
}

function luminance(color) {
  const channels = [color.r, color.g, color.b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const solidBackground = composite(background, { r: 255, g: 255, b: 255, a: 1 });
  const solidForeground = composite(foreground, solidBackground);
  const left = luminance(solidForeground);
  const right = luminance(solidBackground);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function declarations(body) {
  const result = {};
  for (const match of body.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) {
    result[match[1].toLowerCase()] = match[2].trim().replace(/\s*!important\s*$/, "");
  }
  return result;
}

function gradientColors(value, variables) {
  if (!/gradient\(/i.test(value || "")) return [];
  return [...String(value).matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|var\([^)]*\)/g)]
    .map((match) => parseColor(match[0], variables))
    .filter((color) => color && color.a === 1);
}

const findings = [];
for (const filename of fs.readdirSync(cssRoot).filter((name) => name.endsWith(".css")).sort()) {
  const source = fs.readFileSync(path.join(cssRoot, filename), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const variables = {};
  for (const rootRule of source.matchAll(/:root\s*\{([^{}]*)\}/g)) {
    Object.assign(variables, declarations(rootRule[1]));
  }

  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    const style = declarations(rule[2]);
    const foreground = parseColor(style.color, variables);
    const backgroundValue = style["background-color"] || style.background;
    const solidBackground = parseColor(backgroundValue, variables);
    const backgrounds = solidBackground && solidBackground.a > 0
      ? [solidBackground]
      : gradientColors(backgroundValue, variables);
    if (!foreground || !backgrounds.length) continue;

    const ratios = backgrounds.map((background) => contrastRatio(foreground, background));
    const minimumRatio = Math.min(...ratios);
    if (minimumRatio < 4.5) {
      findings.push({
        file: filename,
        selector,
        foreground: style.color,
        background: backgroundValue,
        ratio: Number(minimumRatio.toFixed(2)),
      });
    }
  }
}

const opaqueFindings = findings.filter((finding) => {
  const background = parseColor(finding.background);
  return background?.a === 1;
});
const contextualFindings = findings.filter(
  (finding) => !opaqueFindings.includes(finding)
);

if (require.main === module) {
  console.log(JSON.stringify({
    opaqueCount: opaqueFindings.length,
    opaqueFindings,
    contextualReviewCount: contextualFindings.length,
    contextualFindings,
  }, null, 2));
}

module.exports = {
  parseColor,
  contrastRatio,
  findings,
  opaqueFindings,
  contextualFindings,
};
