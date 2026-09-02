const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const controllerSource = fs.readFileSync(
  path.join(root, "controllers/ipadStudyHallController.js"), "utf8"
);
const USER_ID = "0123456789abcdef01234567";
const CONTENT_ID = "111111111111111111111111";

function installStubs() {
  const serviceFilename = require.resolve("../services/studyHallService");
  require.cache[serviceFilename] = {
    id: serviceFilename,
    filename: serviceFilename,
    loaded: true,
    exports: {
      listStudyHall: async ({ userId, tab }) => ({ activeTab: tab, items: [{ id: CONTENT_ID, userId }] }),
      getStudyHallContent: async ({ contentId, userId }) => ({ id: contentId, owner: userId }),
      saveStudyHallAnswers: async ({ contentId, userId, input, submit }) => ({
        id: contentId,
        owner: userId,
        progress: { status: submit ? "SUBMITTED" : "IN_PROGRESS", answers: JSON.parse(input.answersJson) },
      }),
      getStudyHallAsset: async () => { throw new Error("download is covered by the source contract"); },
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

function request({ body = {}, params = {}, query = {} } = {}) {
  return { apiUser: { _id: USER_ID, role: "user" }, body, params, query };
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
  'router.get("/study-hall"',
  'router.get("/study-hall/content/:contentId"',
  'router.put("/study-hall/content/:contentId/answers"',
  'router.post("/study-hall/content/:contentId/submit"',
  '"/study-hall/content/:contentId/files/:assetId"',
]) assert.ok(routes.includes(route), `missing route: ${route}`);

for (const behavior of [
  "listStudyHall",
  "getStudyHallContent",
  "saveStudyHallAnswers",
  "getStudyHallAsset",
  "issuePersonalizedPdf",
  'sourceType: "STUDY_HALL"',
  'SCHEMA_VERSION = "STUDY_HALL_NATIVE_V1"',
  'res.set("Cache-Control", "private, no-store")',
]) assert.ok(controllerSource.includes(behavior), `missing behavior: ${behavior}`);

const authBoundary = routes.indexOf("router.use(requireApiAuth)");
const studyHallBoundary = routes.indexOf('router.get("/study-hall"');
assert.ok(authBoundary >= 0 && studyHallBoundary > authBoundary, "study hall escaped Bearer auth");
assert.ok(!controllerSource.includes("req.session"), "native controller must not depend on web session");

async function main() {
  installStubs();
  const controller = require("../controllers/ipadStudyHallController");

  const listed = await invoke(controller.list, request({ query: { tab: "FINAL" } }));
  assert.ifError(listed.error);
  assert.equal(listed.payload.schemaVersion, "STUDY_HALL_NATIVE_V1");
  assert.equal(listed.payload.hall.activeTab, "FINAL");
  assert.equal(listed.headers.get("Cache-Control"), "private, no-store");

  const detailed = await invoke(controller.detail, request({ params: { contentId: CONTENT_ID } }));
  assert.ifError(detailed.error);
  assert.equal(detailed.payload.content.id, CONTENT_ID);
  assert.equal(detailed.payload.content.owner, USER_ID);

  const saved = await invoke(controller.save, request({
    params: { contentId: CONTENT_ID },
    body: { answers: [{ number: 1, answer: " 3 " }, { number: 2, answer: "1" }] },
  }));
  assert.ifError(saved.error);
  assert.equal(saved.payload.content.progress.status, "IN_PROGRESS");
  assert.deepEqual(saved.payload.content.progress.answers, [
    { number: 1, answer: "3" },
    { number: 2, answer: "1" },
  ]);

  const submitted = await invoke(controller.submit, request({
    params: { contentId: CONTENT_ID },
    body: { answers: [{ number: 1, answer: "3" }] },
  }));
  assert.ifError(submitted.error);
  assert.equal(submitted.payload.content.progress.status, "SUBMITTED");

  for (const body of [
    { answers: [{ number: 0, answer: "1" }] },
    { answers: [{ number: 1, answer: "1" }, { number: 1, answer: "2" }] },
    { answers: [{ number: 1, answer: "1", userId: USER_ID }] },
    { answers: "1" },
    { answers: [], contentId: CONTENT_ID },
  ]) {
    const rejected = await invoke(controller.save, request({ params: { contentId: CONTENT_ID }, body }));
    assert.equal(rejected.payload, undefined);
    assert.equal(rejected.error?.status, 400);
  }

  console.log("iPad study hall HTTP contract passed");
}

Promise.resolve().then(main).then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
