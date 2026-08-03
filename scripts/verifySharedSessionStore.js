const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { MongoSessionStore, sessionExpiry } = require("../services/mongoSessionStore");
const { WebSession } = require("../models/sessionModel");

const expiry = sessionExpiry({ cookie: {} }, 600);
assert.ok(expiry.getTime() > Date.now() + 590_000);
assert.ok(expiry.getTime() < Date.now() + 610_000);
assert.equal(new MongoSessionStore({ ttlSeconds: 600 }).ttlSeconds, 600);
assert.ok(
  WebSession.schema.indexes().some(
    ([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0
  ),
  "공유 세션에는 expiresAt TTL 인덱스가 필요합니다."
);

const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
assert.ok(serverSource.includes("store: new MongoSessionStore"));
assert.ok(serverSource.includes('sameSite: "lax"'));
assert.ok(serverSource.includes('httpOnly: true'));

console.log("MongoDB TTL 공유 로그인 세션 저장소 검증 완료");
