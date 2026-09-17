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

exports.startKakao = async (req, res, next) => {
  noStore(res);
  try {
    return res.json(
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
    return res.json(
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
    return res.json(
      await completeNativeSocialRegistration(req.body || {})
    );
  } catch (error) {
    return next(error);
  }
};
