"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function exportedHandler(source, name) {
  const start = source.indexOf(`exports.${name} =`);
  assert.notEqual(start, -1, `${name} handler not found`);
  const end = source.indexOf("\nexports.", start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

const webLogin = exportedHandler(read("controllers/matthsController.js"), "login");
const apiLogin = exportedHandler(read("controllers/apiController.js"), "login");
const loginView = read("views/login.ejs");
const faqView = read("views/faq.ejs");

for (const [label, source] of [
  ["web", webLogin],
  ["api", apiLogin],
]) {
  assert.match(source, /User\.findOne\(\{ email \}\)/, `${label} login must query email only`);
  assert.doesNotMatch(source, /nameNormalized|nicknameKey|\$regex|\$or/, `${label} login still has a nickname fallback`);
  assert.match(source, /이메일 또는 비밀번호가 올바르지 않습니다/, `${label} login must keep a generic credential error`);
}

assert.match(loginView, /type="email"/);
assert.match(loginView, /name="email"/);
assert.doesNotMatch(loginView, /이메일 또는 닉네임|name="identifier"/);
assert.match(faqView, /닉네임은 공개 랭킹과 커뮤니티 표시용이며 로그인 식별자로 사용하지 않습니다/);

console.log("Email-only web and iPad/API login verified; nickname remains display-only");
