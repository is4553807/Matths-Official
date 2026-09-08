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

assert.match(webLogin, /User\.findOne\(\{ email \}\)/, "web user login must query email only");
assert.doesNotMatch(
  webLogin,
  /User\.findOne\(\{\s*\$or/,
  "student, teacher, and admin login must not accept display nicknames"
);
assert.match(webLogin, /const rawEmail = String\(\s*req\.body\.email/);
assert.doesNotMatch(webLogin, /req\.body\.identifier/);
assert.match(webLogin, /ParentAccount\.findOne\(\{[\s\S]*email,[\s\S]*isActive: true/);
assert.doesNotMatch(webLogin, /usernameNormalized/);
assert.match(webLogin, /이메일 또는 비밀번호가 올바르지 않습니다/);

assert.match(apiLogin, /User\.findOne\(\{ email \}\)/, "API login must query email only");
assert.doesNotMatch(apiLogin, /nameNormalized|nicknameKey|\$regex|\$or/);
assert.match(apiLogin, /이메일 또는 비밀번호가 올바르지 않습니다/);

assert.match(loginView, /type="email"/);
assert.match(loginView, /name="email"/);
assert.match(loginView, /autocomplete="email"/);
assert.match(loginView, /가입한 이메일을 입력하세요/);
assert.doesNotMatch(loginView, /name="identifier"/);
assert.doesNotMatch(loginView, /학부모 아이디/);
assert.doesNotMatch(loginView, /이메일 또는 닉네임/);
assert.match(faqView, /닉네임은 공개 랭킹과 커뮤니티 표시용이며 로그인 식별자로 사용하지 않습니다/);

console.log("통합 웹 로그인 검증 완료: 학생·선생님·관리자·학부모 모두 이메일 전용이며 닉네임은 표시 전용입니다.");
