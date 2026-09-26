const {
  completeNativeSocialRegistration,
  startAppleNativeSocial,
  startKakaoNativeSocial,
} = require(
  "../services/nativeSocialRegistrationService"
);

function noStore(res) {
  res.set("Cache-Control", "no-store");
}
function sendResult(req, res, result, registration = false) {
  if (result.verification && req.get?.("X-Matths-Client-Version") && req.body?.emailVerificationUI !== true) {
    return res.status(403).json({ code: "EMAIL_VERIFICATION_REQUIRED",
      message: "이메일 인증이 필요합니다. 받은 인증 메일의 링크를 누른 뒤 다시 로그인해 주세요. 메일이 없다면 www.matths.kr에서 로그인 후 재발송할 수 있습니다." });
  }
  return res.status(registration && result.verification ? 202 : 200).json(result);
}

exports.startKakao = async (req, res, next) => {
  noStore(res);
  try {
    return sendResult(req, res,
      await startKakaoNativeSocial({
        accessToken: req.body?.accessToken,
        codeChallenge: req.body?.codeChallenge,
      })
    );
  } catch (error) {
    return next(error);
  }
};

exports.startApple = async (req, res, next) => {
  noStore(res);
  try {
    // email은 의도적으로 받지 않습니다. 계정 연결에 사용할 수 있는 이메일은
    // Apple이 서명한 identity token의 검증된 claim뿐입니다.
    return sendResult(req, res,
      await startAppleNativeSocial({
        identityToken: req.body?.identityToken,
        authorizationCode: req.body?.authorizationCode,
        nonce: req.body?.nonce,
        fullName: req.body?.fullName,
        codeChallenge: req.body?.codeChallenge,
      })
    );
  } catch (error) {
    return next(error);
  }
};

exports.register = async (req, res, next) => {
  noStore(res);
  try {
    const result = await completeNativeSocialRegistration(req.body || {});
    return sendResult(req, res, result, true);
  } catch (error) {
    return next(error);
  }
};
