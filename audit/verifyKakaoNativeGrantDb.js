"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const { start } = require("../controllers/kakaoNativeAuthController");
const { consumeMobileAuthGrant } = require("../services/mobileSocialAuthGrantService");
async function main() {
  assert.equal(process.env.ALLOW_TEST_DATA_MUTATION, "1");
  assert.match(process.env.DB || "", /127\.0\.0\.1|localhost/);
  await mongoose.connect(process.env.DB);
  const originalFetch = global.fetch;
  let fetches = 0;
  global.fetch = async url => {
    fetches++;
    return {ok: true, json: async () => url.endsWith("access_token_info")
      ? {app_id: 1539001, id: 7654321, expires_in: 300} : {id: 7654321}};
  };
  try {
    const invoke = async body => {
      const result = {status: 200};
      const res = {status(n){ result.status=n; return this; }, set(){return this;}, json(value){result.body=value;return this;}};
      await start({body}, res, error => { throw error; });
      return result;
    };
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const unknown = await invoke({accessToken:"fixture", codeChallenge:challenge});
    assert.equal(unknown.body.code, "KAKAO_NATIVE_REGISTRATION_REQUIRED");
    assert.equal(await User.countDocuments({}), 0, "must not auto-register");
    const userId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({_id:userId, socialAuth:{kakaoId:"7654321"}});
    const response = await invoke({accessToken:"fixture", codeChallenge:challenge});
    assert.equal(response.status, 200);
    assert.equal(await consumeMobileAuthGrant(response.body.code, {codeVerifier:"x".repeat(43)}), null);
    const consumed = await consumeMobileAuthGrant(response.body.code, {codeVerifier:verifier});
    assert.equal(String(consumed.grant.userId), String(userId));
    fetches = 0;
    assert.equal((await invoke({accessToken:"fixture", codeChallenge:"invalid"})).status, 400);
    assert.equal(fetches, 0);
    console.log("PASS actual native endpoint + isolated DB: linked identity, PKCE, no auto registration, invalid challenge denied before network");
  } finally { global.fetch=originalFetch; await mongoose.disconnect(); }
}
main().catch(error => {console.error(error);process.exitCode=1;});
