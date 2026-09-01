"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function main() {
  const routes = read("routes/api-routes.js");
  const controller = read("controllers/ipadSupportController.js");
  const authBoundary = routes.indexOf("router.use(requireApiAuth)");
  for (const route of [
    'router.get("/support/inquiries", ipadSupportController.dashboard)',
    'router.post("/support/inquiries", ipadSupportController.create)',
  ]) {
    assert.ok(routes.indexOf(route) > authBoundary, `${route}는 Bearer 인증 뒤에 있어야 합니다`);
  }
  assert.match(controller, /getContactPageData/);
  assert.match(controller, /createSupportInquiry/);
  assert.match(controller, /inquiryType:\s*"GENERAL"/);
  assert.ok(!controller.includes("refundableOrders"), "앱 문의 응답에 웹 결제 주문을 노출하면 안 됩니다");
  assert.ok(!controller.includes("adminReply.message"), "답변 본문은 가입 이메일 전달 정책을 우회하면 안 됩니다");
  console.log("iPad 문의 HTTP 계약 통과");
}

Promise.resolve().then(main).then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
