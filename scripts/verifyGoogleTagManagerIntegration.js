"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  COOKIE_CONSENT_VERSION,
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
  new RegExp(
    `<head>\\s*<!-- Matths cookie consent[\\s\\S]*data-gtm-container=\"${containerId}\"`
  ),
  "The consent controller must be placed at the start of head."
);
assert.match(injected, /data-analytics-enabled="true"/);
assert.match(injected, /data-cookie-consent-banner/);
assert.match(injected, /필수 쿠키만 사용/);
assert.match(injected, /모두 허용/);
assert.match(injected, /data-cookie-settings/);
assert.doesNotMatch(
  injected,
  /googletagmanager\.com\/(?:gtm\.js|ns\.html)/,
  "Rendered HTML must not make an unconditional GTM request."
);
assert.equal(
  injectGoogleTagManager(injected, containerId),
  injected,
  "Consent integration must be idempotent."
);

const disabledAnalytics = injectGoogleTagManager(source, containerId, {
  analyticsEnabled: false,
});
assert.match(disabledAnalytics, /data-analytics-enabled="false"/);

const fragment = "<div>Partial response</div>";
assert.equal(
  injectGoogleTagManager(fragment, containerId),
  fragment,
  "HTML fragments must not receive page-level consent markup."
);

const consentControllerPath = path.join(root, "public", "js", "cookie-consent.js");
const consentControllerSource = fs.readFileSync(consentControllerPath, "utf8");
assert.match(consentControllerSource, /analytics_storage:\s*"denied"/);
assert.match(consentControllerSource, /ad_storage:\s*"denied"/);
assert.match(consentControllerSource, /googletagmanager\.com\/gtm\.js/);
assert.match(consentControllerSource, /180 \* 24 \* 60 \* 60 \* 1000/);

function runConsentBootstrap(preference, analyticsEnabled = true) {
  let insertedScript = null;
  const listeners = {};
  const firstScript = {
    parentNode: {
      insertBefore(script) {
        insertedScript = script;
      },
    },
  };
  const localStorage = {
    getItem() {
      return preference ? JSON.stringify(preference) : null;
    },
    setItem() {},
  };
  const windowObject = {
    dataLayer: [],
    localStorage,
    location: { hostname: "app.matths.kr", reload() {} },
    dispatchEvent() {},
  };
  const documentObject = {
    currentScript: {
      getAttribute(name) {
        return {
          "data-gtm-container": containerId,
          "data-consent-version": COOKIE_CONSENT_VERSION,
          "data-analytics-enabled": analyticsEnabled ? "true" : "false",
        }[name] || null;
      },
    },
    cookie: "",
    readyState: "loading",
    head: { appendChild(script) { insertedScript = script; } },
    createElement() {
      return {};
    },
    getElementsByTagName() {
      return [firstScript];
    },
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
  };
  windowObject.document = documentObject;

  vm.runInNewContext(consentControllerSource, {
    window: windowObject,
    document: documentObject,
    CustomEvent: function CustomEvent() {},
    Date,
    JSON,
    Number,
    Boolean,
    String,
    RegExp,
    encodeURIComponent,
  });

  return { insertedScript, windowObject };
}

const deniedBootstrap = runConsentBootstrap({
  version: COOKIE_CONSENT_VERSION,
  analytics: false,
  updatedAt: new Date().toISOString(),
});
assert.equal(
  deniedBootstrap.insertedScript,
  null,
  "GTM must not load when analytics consent is denied."
);
assert.deepEqual(
  deniedBootstrap.windowObject.dataLayer[0][2].analytics_storage,
  "denied"
);

const grantedBootstrap = runConsentBootstrap({
  version: COOKIE_CONSENT_VERSION,
  analytics: true,
  updatedAt: new Date().toISOString(),
});
assert.ok(grantedBootstrap.insertedScript, "GTM must load after stored opt-in.");
assert.equal(grantedBootstrap.insertedScript.async, true);
assert.equal(
  grantedBootstrap.insertedScript.src,
  `https://www.googletagmanager.com/gtm.js?id=${containerId}`
);
assert.equal(
  grantedBootstrap.windowObject.dataLayer.some((entry) => entry.event === "gtm.js"),
  true
);

const sensitiveBootstrap = runConsentBootstrap(
  {
    version: COOKIE_CONSENT_VERSION,
    analytics: true,
    updatedAt: new Date().toISOString(),
  },
  false
);
assert.equal(
  sensitiveBootstrap.insertedScript,
  null,
  "Payment and invitation pages must not load GTM even after opt-in."
);

const viewNames = fs
  .readdirSync(viewsDirectory)
  .filter((name) => name.endsWith(".ejs"));

for (const viewName of viewNames) {
  const viewSource = fs.readFileSync(path.join(viewsDirectory, viewName), "utf8");
  const renderedShape = injectGoogleTagManager(viewSource, containerId);
  if (/<head\b/i.test(viewSource) && /<body\b/i.test(viewSource)) {
    assert.match(renderedShape, /\/js\/cookie-consent\.js/);
    assert.match(renderedShape, /data-cookie-consent-banner/);
  } else {
    assert.equal(renderedShape, viewSource);
  }
}

const footerSource = fs.readFileSync(
  path.join(viewsDirectory, "partials", "business-footer.ejs"),
  "utf8"
);
assert.match(footerSource, /data-cookie-settings-open/);
assert.match(footerSource, />쿠키 설정</);

const privacySource = fs.readFileSync(path.join(viewsDirectory, "privacy.ejs"), "utf8");
assert.match(privacySource, /matths\.cookie-consent/);
assert.match(privacySource, /Google Tag Manager/);
assert.match(privacySource, /분석 쿠키를 허용하기 전에는/);

const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
assert.match(serverSource, /injectGoogleTagManager\(/);
assert.match(serverSource, /analyticsEnabled:\s*options\.disablePageAnalytics !== true/);
assert.match(serverSource, /script-src[^\n]+https:\/\/www\.googletagmanager\.com/);
assert.match(serverSource, /connect-src[^\n]+https:\/\/\*\.google-analytics\.com/);

console.log(
  `Consent-managed Google Tag Manager verified for ${viewNames.length} page templates.`
);
