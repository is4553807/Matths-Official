"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadStoreCatalogController.js"), "utf8");
const PRODUCT_ID = "111111111111111111111111";

function installStubs() {
  const storeFilename = require.resolve("../services/storeService");
  require.cache[storeFilename] = {
    id: storeFilename,
    filename: storeFilename,
    loaded: true,
    exports: {
      listPublishedProducts: async (options) => ({ ...options, products: [{ id: PRODUCT_ID }] }),
      getPublishedProduct: async (slug) => ({ product: { id: PRODUCT_ID, slug }, categories: [] }),
      getFreeProductDownload: async () => { throw new Error("covered by source contract"); },
      getStoreMedia: async () => { throw new Error("covered by source contract"); },
    },
  };
  const pdfFilename = require.resolve("../services/pdfWatermarkService");
  require.cache[pdfFilename] = {
    id: pdfFilename,
    filename: pdfFilename,
    loaded: true,
    exports: { isPdfDownload: () => false, issuePersonalizedPdf: async () => ({}) },
  };
}

async function invoke(handler, req) {
  let payload;
  let error;
  const headers = new Map();
  const res = {
    set(name, value) { headers.set(name, value); return res; },
    json(value) { payload = value; return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, headers };
}

for (const route of [
  'router.get("/store-products"',
  'router.get("/store-products/:slug"',
  '"/store-products/:slug/files/:assetId"',
  '"/store-products/:productId/media/:assetId"',
]) assert.ok(routes.includes(route), `missing route: ${route}`);

const authBoundary = routes.indexOf("router.use(requireApiAuth)");
assert.ok(routes.indexOf('router.get("/store-products"') > authBoundary, "catalog must require Bearer auth");
assert.ok(!source.includes("req.session"), "native catalog must not depend on web session");
for (const behavior of [
  "listPublishedProducts",
  "getPublishedProduct",
  "getFreeProductDownload",
  "getStoreMedia",
  "issuePersonalizedPdf",
  'sourceType: "STORE"',
  'SCHEMA_VERSION = "STORE_CATALOG_NATIVE_V1"',
]) assert.ok(source.includes(behavior), `missing behavior: ${behavior}`);

async function main() {
  installStubs();
  const controller = require("../controllers/ipadStoreCatalogController");
  const listed = await invoke(controller.list, {
    apiUser: { _id: "0123456789abcdef01234567" },
    query: { query: "미적분", sort: "newest", category: "N제" },
  });
  assert.ifError(listed.error);
  assert.equal(listed.payload.schemaVersion, "STORE_CATALOG_NATIVE_V1");
  assert.equal(listed.payload.catalog.query, "미적분");
  assert.equal(listed.payload.catalog.sort, "newest");
  assert.equal(listed.headers.get("Cache-Control"), "private, no-store");

  const detailed = await invoke(controller.detail, {
    apiUser: { _id: "0123456789abcdef01234567" },
    params: { slug: "free-preview" },
  });
  assert.ifError(detailed.error);
  assert.equal(detailed.payload.product.slug, "free-preview");
  assert.equal(detailed.payload.schemaVersion, "STORE_CATALOG_NATIVE_V1");

  console.log("iPad native store catalog HTTP contract passed");
}

Promise.resolve().then(main).then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
