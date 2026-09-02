"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { listFAQ } = require("../services/faqService");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const authBoundary = routes.indexOf("router.use(requireApiAuth)");
const faqBoundary = routes.indexOf('router.get("/faq", ipadFaqController.list)');
assert.ok(faqBoundary >= 0 && faqBoundary < authBoundary, "FAQ must remain public before Bearer auth");

const all = listFAQ();
assert.ok(all.totalCount >= 50, "web FAQ and error help rows must be present");
assert.equal(all.items.length, all.totalCount);
assert.ok(all.categories.some((item) => item.value === "arena" && item.count >= 20));

const searched = listFAQ({ query: "시각화 학습" });
assert.ok(searched.items.some((item) => item.id === "faq-visual-learning"));
const error = listFAQ({ code: "409" });
assert.equal(error.items.length, 1);
assert.equal(error.items[0].id, "faq-error-409");
const unknownCategory = listFAQ({ category: "private-admin-value" });
assert.equal(unknownCategory.category, "");

console.log("iPad native FAQ HTTP contract passed");
