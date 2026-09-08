"use strict";
const { User } = require("../models/matthsModel");
const { verifyNativeKakaoToken } = require("../services/kakaoNativeAuthService");
const { issueMobileAuthGrant } = require("../services/mobileSocialAuthGrantService");

exports.start = async (req, res, next) => {
  try {
    const challenge = req.body?.codeChallenge;
    if (typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      return res.status(400).json({ code: "KAKAO_NATIVE_CHALLENGE_INVALID", message: "로그인 보안 값을 확인하지 못했습니다." });
    }
    const kakaoId = await verifyNativeKakaoToken(req.body?.accessToken);
    const user = await User.findOne({ "socialAuth.kakaoId": kakaoId }).select("_id").lean();
    if (!user) {
      // Registration, consent and email linking remain on the existing web
      // flow. Do not silently create an incomplete native account.
      return res.status(409).json({ code: "KAKAO_NATIVE_REGISTRATION_REQUIRED", message: "가입 정보를 확인해 주세요." });
    }
    // The existing exchange endpoint rechecks account access and lifecycle,
    // verifies PKCE and issues the same stable Matths authentication response.
    const code = await issueMobileAuthGrant(user._id, { codeChallenge: challenge });
    res.set("Cache-Control", "no-store");
    return res.json({ code });
  } catch (error) { return next(error); }
};
