"use strict";

// Existing Matths Kakao app, verified in the owner console. Never accept an
// app id supplied by the client or a token issued for another Kakao app.
const MATTHS_KAKAO_APP_ID = "1539001";
function failure(code, message, status = 401) {
  return Object.assign(new Error(message), { code, status });
}
async function verifyNativeKakaoToken(accessToken, fetchImpl = fetch) {
  if (typeof accessToken !== "string" || !accessToken.length ||
      accessToken.length > 4096 || /\s/.test(accessToken)) {
    throw failure("KAKAO_NATIVE_TOKEN_INVALID", "카카오 인증 정보가 올바르지 않습니다.");
  }
  const headers = { authorization: "Bearer " + accessToken };
  const infoResponse = await fetchImpl("https://kapi.kakao.com/v1/user/access_token_info",
    { headers, signal: AbortSignal.timeout(10000) });
  if (!infoResponse.ok) throw failure("KAKAO_NATIVE_TOKEN_INVALID", "카카오 인증이 만료되었습니다.");
  const info = await infoResponse.json();
  const expected = process.env.KAKAO_APP_ID || MATTHS_KAKAO_APP_ID;
  if (String(info.app_id) !== expected || !Number.isFinite(info.expires_in) || info.expires_in <= 0) {
    throw failure("KAKAO_NATIVE_APP_MISMATCH", "이 앱에서 발급한 카카오 인증이 아닙니다.");
  }
  const profileResponse = await fetchImpl("https://kapi.kakao.com/v2/user/me",
    { headers, signal: AbortSignal.timeout(10000) });
  if (!profileResponse.ok) throw failure("KAKAO_NATIVE_TOKEN_INVALID", "카카오 계정을 확인하지 못했습니다.");
  const profile = await profileResponse.json();
  if (!profile.id || String(profile.id) !== String(info.id)) {
    throw failure("KAKAO_NATIVE_ID_MISMATCH", "카카오 계정 정보가 일치하지 않습니다.");
  }
  return String(profile.id);
}
module.exports = { verifyNativeKakaoToken };
