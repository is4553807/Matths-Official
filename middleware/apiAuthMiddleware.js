const {
  synchronizeAccountAccess,
} = require("../services/accountAccessService");
const {
  verifyAccessToken,
} = require("../services/mobileAuthService");
const {
  synchronizeUserLifecycle,
} = require("../services/userLifecycleService");

async function requireApiAuth(
  req,
  res,
  next
) {
  try {
    const authorization = String(
      req.get("authorization") || ""
    );
    const match =
      authorization.match(
        /^Bearer\s+(.+)$/i
      );
    const payload = match
      ? verifyAccessToken(match[1])
      : null;

    if (!payload) {
      return res.status(401).json({
        code: "UNAUTHORIZED",
        message:
          "유효한 접근 토큰이 필요합니다.",
      });
    }

    const access =
      await synchronizeAccountAccess(
        payload.sub
      );
    const user =
      access?.user;

    if (
      !user ||
      !access.allowed ||
      Number(user.tokenVersion || 0) !==
        Number(payload.ver || 0)
    ) {
      return res.status(401).json({
        code: "TOKEN_REVOKED",
        message:
          "로그인이 만료되었습니다. 다시 로그인해주세요.",
      });
    }

    const synchronized =
      await synchronizeUserLifecycle(
        user._id
      );

    req.apiUser =
      synchronized.toObject();
    return next();
  } catch (error) {
    return next(error);
  }
}

// 공개 게시판 읽기처럼 로그인 없이도 열리되, Bearer가 있으면 차단 관계·소속
// 게시판 권한을 같은 계정 기준으로 적용해야 하는 경로에서 사용한다. 토큰을 보냈는데
// 잘못된 경우 게스트로 조용히 강등하지 않는다. 만료 사실을 숨기면 다른 계정의 공개
// 화면처럼 보인 채 차단·소속 필터가 풀릴 수 있다.
async function optionalApiAuth(req, res, next) {
  const authorization = String(req.get("authorization") || "");
  if (!authorization.trim()) return next();
  return requireApiAuth(req, res, next);
}

module.exports = {
  optionalApiAuth,
  requireApiAuth,
};
