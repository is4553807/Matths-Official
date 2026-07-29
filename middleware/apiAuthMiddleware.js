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

module.exports = {
  requireApiAuth,
};
