const {
  redeemAppleTransaction,
  handleAppleNotification,
} = require("../services/appleCommerceService");

/**
 * App Store 인앱 결제 HTTP 경계.
 *
 * 경로가 둘이고 **인증 성격이 정반대**라 한 파일에 두되 분명히 갈라 둔다.
 *
 *   POST /api/v1/commerce/apple/redeem         ← 앱이 부른다. Bearer 필수.
 *   POST /api/v1/commerce/apple/notifications  ← 애플 서버가 부른다. Bearer 없음.
 *
 * 통지 경로에 인증을 걸 수 없는 이유는 애플이 우리 토큰을 모르기 때문이다.
 * 대신 **signedPayload 의 서명이 유일한 방어선**이다. 검증 전에는 payload 의 어떤
 * 값도 믿지 않는다 — 서비스 계층이 그 순서를 지킨다.
 */

/**
 * POST /api/v1/commerce/apple/redeem
 *
 * 앱은 이 응답이 성공해야 애플에 거래 완료(finish)를 알린다. 그래서 실패를 성공처럼
 * 답하면 안 된다 — 거래가 완료로 닫히고 학생은 돈만 낸 채 학습권이 없다.
 * 반대로 실패로 답하면 애플이 거래를 살려 두고 앱이 다음 실행에 다시 보낸다.
 */
exports.redeem = async (req, res, next) => {
  try {
    const result = await redeemAppleTransaction({
      userId: req.apiUser._id,
      jws: req.body?.jws,
      productCode: req.body?.productCode,
    });
    res.set("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/v1/commerce/apple/notifications
 *
 * 애플은 2xx 가 아니면 재시도한다(최대 며칠, 점점 뜸하게). 이 성질을 두 방향으로 쓴다.
 *
 *   · 우리가 **모르는** 통지에는 200 을 준다. 500 을 주면 처리할 수도 없는 통지를
 *     애플이 계속 두드린다.
 *   · 우리가 **처리하다 실패한** 통지에는 500 을 준다. 재시도가 곧 복구 수단이다.
 *     여기서 200 을 주면 그 환불은 영영 반영되지 않는다.
 *
 * 그래서 next(error) 로 넘기지 않고 여기서 직접 상태 코드를 정한다. 공용 오류 핸들러는
 * 사용자용 화면·문구를 붙이는데, 이 경로의 상대는 사람이 아니라 애플 서버다.
 */
exports.notifications = async (req, res) => {
  const signedPayload = req.body?.signedPayload;
  if (!signedPayload || typeof signedPayload !== "string") {
    // 애플이 보낸 것이 아니다. 재시도 받을 이유가 없다.
    return res.status(400).json({ received: false });
  }

  try {
    const result = await handleAppleNotification(signedPayload);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    // 서명 검증 실패는 위조이거나 우리 설정 오류다. 어느 쪽이든 재시도로 낫지 않는다.
    if (error?.code === "APPLE_JWS_INVALID" || error?.code === "APPLE_BUNDLE_MISMATCH") {
      console.error("[apple] 통지 서명 검증 실패: %s", error.message);
      return res.status(400).json({ received: false });
    }
    // 그 밖의 실패(DB 장애 등)는 재시도가 복구 수단이다.
    console.error("[apple] 통지 처리 실패", error);
    return res.status(500).json({ received: false });
  }
};
