"use strict";
const assert = require("node:assert/strict");
const { verifyNativeKakaoToken } = require("../services/kakaoNativeAuthService");
async function main() {
  const fake = (info, profile = {id: 123}) => async url => ({
    ok: true, json: async () => url.endsWith("access_token_info") ? info : profile
  });
  assert.equal(await verifyNativeKakaoToken("fixture-token",
    fake({app_id: 1539001, id: 123, expires_in: 300})), "123");
  for (const info of [
    {app_id: 999, id: 123, expires_in: 300},
    {app_id: 1539001, id: 123, expires_in: 0},
    {app_id: 1539001, id: 124, expires_in: 300},
    {app_id: 1539001, id: 123},
  ]) await assert.rejects(() => verifyNativeKakaoToken("fixture-token", fake(info)));
  for (const token of ["", "bad token", "x".repeat(4097), null]) {
    await assert.rejects(() => verifyNativeKakaoToken(token, () => { throw Error("must not fetch"); }));
  }
  await assert.rejects(() => verifyNativeKakaoToken("fixture-token", async () => ({ok:false})));
  console.log("PASS Kakao native token: correct app/id/expiry; foreign, expired, malformed and failed tokens denied");
}
main().catch(error => { console.error(error); process.exitCode=1; });
