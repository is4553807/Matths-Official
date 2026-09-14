"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  DEFAULT_GOOGLE_TAG_MANAGER_ID,
  injectGoogleTagManager,
  resolveGoogleTagManagerId,
} = require("../services/googleTagManagerService");

const root = path.resolve(__dirname, "..");
const viewsDirectory = path.join(root, "views");
const containerId = "GTM-T9FC8Z4B";

assert.equal(DEFAULT_GOOGLE_TAG_MANAGER_ID, containerId);
assert.equal(resolveGoogleTagManagerId(""), containerId);
assert.equal(resolveGoogleTagManagerId(` ${containerId} `), containerId);
assert.throws(() => resolveGoogleTagManagerId("G-INVALID"), /valid Google Tag Manager/);

const source = "<!doctype html><html><head><title>Matths</title></head><body class=\"page\"><main>Content</main></body></html>";
const injected = injectGoogleTagManager(source, containerId);

assert.match(
  injected,
  new RegExp(`<head>\\s*<!-- Google Tag Manager -->[\\s\\S]*${containerId}`),
  "GTM loader must be placed immediately after the opening head tag."
);
assert.match(
  injected,
  new RegExp(`<body class=\"page\">\\s*<!-- Google Tag Manager \\(noscript\\) -->[\\s\\S]*ns\\.html\\?id=${containerId}`),
  "GTM noscript fallback must be placed immediately after the opening body tag."
);
assert.equal(
  (injected.match(/<!-- Google Tag Manager -->/g) || []).length,
  1,
  "The loader snippet must be present once."
);
assert.equal(
  (injected.match(/<!-- Google Tag Manager \(noscript\) -->/g) || []).length,
  1,
  "The noscript snippet must be present once."
);
assert.equal(
  injectGoogleTagManager(injected, containerId),
  injected,
  "GTM injection must be idempotent."
);

const loaderSource = injected.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(loaderSource, "The GTM loader script must be present.");
let insertedScript;
const firstScript = {
  parentNode: {
    insertBefore(script) {
      insertedScript = script;
    },
  },
};
const browserContext = {
  window: {},
  document: {
    createElement() {
      return {};
    },
    getElementsByTagName() {
      return [firstScript];
    },
  },
};
vm.runInNewContext(loaderSource, browserContext);
assert.equal(insertedScript.async, true);
assert.equal(
  insertedScript.src,
  `https://www.googletagmanager.com/gtm.js?id=${containerId}`,
  "The loader must request the configured GTM container."
);
assert.equal(browserContext.window.dataLayer[0].event, "gtm.js");

const viewNames = fs
  .readdirSync(viewsDirectory)
  .filter((name) => name.endsWith(".ejs"));

for (const viewName of viewNames) {
  const viewSource = fs.readFileSync(path.join(viewsDirectory, viewName), "utf8");
  const renderedShape = injectGoogleTagManager(viewSource, containerId);
  assert.match(renderedShape, /googletagmanager\.com\/gtm\.js/);
  assert.match(renderedShape, /googletagmanager\.com\/ns\.html/);
}

const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
assert.match(serverSource, /injectGoogleTagManager\(/);
assert.match(serverSource, /script-src[^\n]+https:\/\/www\.googletagmanager\.com/);
assert.match(serverSource, /frame-src[^\n]+https:\/\/www\.googletagmanager\.com/);
assert.match(serverSource, /connect-src[^\n]+https:\/\/\*\.google-analytics\.com/);

console.log(`Google Tag Manager integration verified for ${viewNames.length} page templates.`);
