process.env.DISABLE_SCHEDULERS = "1";

const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");
const controllerPath = path.join(root, "controllers/appCommerceController.js");
const templatePath = path.join(root, "views/payment-result.ejs");
const controllerSource = fs.readFileSync(controllerPath, "utf8");
const template = fs.readFileSync(templatePath, "utf8");
const { _commerceFailureView: commerceFailureView } = require(controllerPath);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(typeof commerceFailureView === "function", "Commerce failure view builder must be exported for contract verification");
invariant(controllerSource.includes("res.status(410).render"), "Expired handoffs must remain HTTP 410");
invariant(controllerSource.includes("res.status(403).render"), "Restricted accounts must remain HTTP 403");

[
  {
    heading: "결제 연결이 만료되었습니다",
    message: "iPad 앱에서 이용권 화면을 다시 열어주세요.",
    href: "/pricing",
    label: "이용권 보기",
  },
  {
    heading: "계정 상태를 확인해 주세요",
    message: "현재 계정에서는 결제 페이지를 열 수 없습니다.",
    href: "/login",
    label: "로그인 화면으로",
  },
].forEach((fixture) => {
  const locals = commerceFailureView(fixture);
  invariant(locals.mode === "LIVE", "Error pages must use the production result contract");
  invariant(locals.result?.state === "FAILED", "Error pages must serialize a failed payment result");
  invariant(locals.result?.intent === null, "Error pages must not invent a payment intent");
  const html = ejs.render(template, locals, { filename: templatePath });
  invariant(html.includes(fixture.heading), `Missing rendered heading: ${fixture.heading}`);
  invariant(html.includes(fixture.message), `Missing rendered message: ${fixture.message}`);
  invariant(html.includes(`href="${fixture.href}"`), `Missing rendered recovery link: ${fixture.href}`);
  invariant(html.includes(fixture.label), `Missing rendered recovery label: ${fixture.label}`);
});

console.log("App commerce expired/restricted handoff error contract verified.");
