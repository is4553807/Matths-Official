const apiController = require("./apiController");
const {
  exchangeAppleIdentity,
} = require("../services/appleAuthService");
const {
  accountBlockedMessage,
  synchronizeAccountAccess,
} = require("../services/accountAccessService");
const {
  getGradeLabel,
  synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
  ACCESS_TOKEN_TTL_SECONDS,
  createAccessToken,
} = require("../services/mobileAuthService");

/**
 * Sign in with Apple 교환 경계 — POST /api/v1/auth/apple/exchange (인증 없음).
 *
 * 왜 별도 컨트롤러인가. 구글은 브라우저 왕복 뒤 grant 코드를 교환하지만
 * (apiController.exchangeSocialAuthCode), 애플은 네이티브 시트가 준 identityToken
 * 하나로 끝난다. 앞 단계가 완전히 다르고 뒷 단계(계정 상태 확인 → 생애주기 동기화
 * → AuthResponse)는 같다. 그래서 **앞 단계만** 여기서 처리하고 뒷 단계는 구글과
 * 같은 함수들을 그대로 부른다. 응답 타입을 새로 만들지 않는 것이 핵심이다 —
 * 앱의 로그인 이후 파이프(슬롯 전환·게스트 기록 승계·동기화)가 AuthResponse
 * 하나에 매달려 있다.
 */

/*
 * 구글 교환이 쓰는 authResponse 는 apiController 안의 지역 함수라 내보내지지 않는다.
 * 그 파일은 이 작업의 소유 범위 밖이라 여기서 export 를 붙일 수 없어, 같은 모양을
 * 이 자리에 한 벌 더 둔다. **apiController.js 에 `exports.authResponse = authResponse;`
 * 한 줄이 붙으면** 아래 폴백은 지우고 그쪽을 쓰면 된다 — 호출 시점에 확인하므로
 * 그 한 줄이 붙는 순간 자동으로 정본을 따라간다. 두 벌이 오래 남으면 필드가 갈린다.
 */
function fallbackAuthResponse(user, { issuedAtSeconds } = {}) {
  return {
    tokenType: "Bearer",
    accessToken: createAccessToken(user, { issuedAtSeconds }),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: String(user._id),
      name: user.name,
      realName: user.realName || "",
      email: user.email,
      role: user.role || "student",
      schoolGrade: user.schoolGrade,
      educationStatus:
        user.educationStatus ||
        ([13, 15].includes(Number(user.schoolGrade))
          ? "graduated"
          : "enrolled"),
      schoolGradeLabel: getGradeLabel(user.schoolGrade),
      school: user.school?.code
        ? {
            region: user.school.region,
            code: user.school.code,
            name: user.school.name,
            isOverseas: user.school.isOverseas === true,
          }
        : null,
      university: user.university?.code
        ? {
            code: user.university.code,
            name: user.university.name,
            campus: user.university.campus,
            region: user.university.region,
            isOverseas: user.university.isOverseas === true,
          }
        : null,
      currentStreak: Number(user.currentStreak) || 0,
      longestStreak: Number(user.longestStreak) || 0,
      rankingDisplayMode: "nickname",
    },
  };
}

function buildAuthResponse(user, options) {
  return (apiController.authResponse || fallbackAuthResponse)(
    user,
    options
  );
}

/**
 * POST /api/v1/auth/apple/exchange
 *
 * body: { identityToken, authorizationCode, nonce, fullName, email }
 * 응답: 구글 교환과 같은 AuthResponse.
 */
exports.exchangeAppleIdentityToken = async (req, res, next) => {
  try {
    const { user } = await exchangeAppleIdentity({
      identityToken: req.body?.identityToken,
      authorizationCode: req.body?.authorizationCode,
      nonce: req.body?.nonce,
      fullName: req.body?.fullName,
      email: req.body?.email,
    });

    // 정지·탈퇴 계정이 애플 경로로 되살아나지 않게 한다. 구글 교환과 같은 관문이다.
    const access = await synchronizeAccountAccess(user._id);
    if (!access?.allowed) {
      return res.status(403).json({
        code: "ACCOUNT_BLOCKED",
        message: accountBlockedMessage(
          access?.status,
          access?.user?.accountStatusReason
        ),
      });
    }

    const synchronized = await synchronizeUserLifecycle(access.user._id);
    synchronized.lastLoginAt = new Date();
    await synchronized.save();

    res.set("Cache-Control", "no-store");
    return res.json(buildAuthResponse(synchronized));
  } catch (error) {
    return next(error);
  }
};
