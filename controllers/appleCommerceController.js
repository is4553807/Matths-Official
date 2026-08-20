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
    /*
     * V1 통지를 알아보고 **큰 소리로** 말한다.
     *
     * App Store Connect 의 통지 설정에는 버전 선택이 있고, 그 선택은 URL 을 처음
     * 등록할 때(Set Up URL) 한 번만 묻는다. 나중에 Edit 로 열면 URL 만 보이고
     * 버전은 안 나온다 — 즉 **잘못 고른 것을 화면에서 확인할 방법이 없다.**
     *
     * V1 은 서명 없는 평문 JSON 이라 signedPayload 가 아예 없다. 그대로 두면
     * "본문 없음" 과 구분이 안 되는 400 으로 사라지고, 환불 통지가 며칠 재시도
     * 끝에 조용히 버려진다. 그 사고는 로그를 뒤져도 원인이 안 보인다.
     *
     * 그래서 V1 의 표식을 직접 찾아 무엇이 잘못됐는지 이름을 붙여 남긴다.
     */
    const body = req.body || {};
    const looksLikeV1 =
      typeof body.notification_type === "string" ||
      body.unified_receipt !== undefined ||
      body.auto_renew_product_id !== undefined;

    if (looksLikeV1) {
      console.error(
        "[apple] **V1 통지가 도착했습니다.** 서버는 V2 만 처리합니다. " +
        "App Store Connect → 앱 정보 → App Store Server Notifications 에서 " +
        "URL 을 지우고 Set Up URL 로 다시 등록하면서 Version 2 를 고르십시오. " +
        "이 상태로 두면 환불·취소 통지가 전부 버려집니다. (type=%s)",
        body.notification_type || "unknown"
      );
      // 400 을 준다. 재시도해도 우리가 V1 을 처리하게 되지는 않는다.
      return res.status(400).json({ received: false, reason: "V2_REQUIRED" });
    }

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
