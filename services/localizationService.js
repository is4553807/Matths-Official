const fs = require("node:fs");
const path = require("node:path");

const SUPPORTED_LOCALES = new Set(["ko", "en"]);
const englishDictionaryPath = path.resolve(
  __dirname,
  "..",
  "public",
  "i18n",
  "en.json"
);

let cachedDictionary = null;
let cachedMtime = null;

function normalizeLocale(value, fallback = "ko") {
  const locale = String(value || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return SUPPORTED_LOCALES.has(locale) ? locale : fallback;
}

function loadEnglishDictionary() {
  try {
    const stat = fs.statSync(englishDictionaryPath);
    if (cachedDictionary && cachedMtime === stat.mtimeMs) {
      return cachedDictionary;
    }
    const parsed = JSON.parse(fs.readFileSync(englishDictionaryPath, "utf8"));
    cachedDictionary = parsed.translations || parsed;
    cachedMtime = stat.mtimeMs;
    return cachedDictionary;
  } catch (_error) {
    return {};
  }
}

function translate(locale, source, fallback = source) {
  if (normalizeLocale(locale) !== "en") return source;
  const key = String(source || "").replace(/\s+/g, " ").trim();
  return loadEnglishDictionary()[key] || fallback;
}

module.exports = {
  SUPPORTED_LOCALES,
  normalizeLocale,
  loadEnglishDictionary,
  translate,
};
