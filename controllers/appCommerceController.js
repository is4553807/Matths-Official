const {
  consumeAppCommerceHandoff,
  getAppStorefront,
  issueAppCommerceHandoff,
} = require("../services/appCommerceService");
const {
  lifecycleSessionView,
  synchronizeUserLifecycle,
} = require("../services/userLifecycleService");
const {
  synchronizeAccountAccess,
} = require("../services/accountAccessService");

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function browserSessionUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    realName: user.realName || "",
    email: user.email,
    role: user.role || "student",
    tokenVersion: Number(user.tokenVersion) || 0,
    ...lifecycleSessionView(user),
    preferences: {
      coachMode: user.preferences?.coachMode || "spicy",
      rankingDisplayMode: "nickname",
    },
    school: user.school?.code ? {
      region: user.school.region,
      code: user.school.code,
      name: user.school.name,
    } : null,
    university: user.university?.code ? {
      code: user.university.code,
      name: user.university.name,
      campus: user.university.campus,
      region: user.university.region,
    } : null,
  };
}

exports.storefront = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json({
      storefront: await getAppStorefront(req.apiUser._id),
    });
  } catch (error) {
    return next(error);
  }
};

exports.createHandoff = async (req, res, next) => {
  try {
    const handoff = await issueAppCommerceHandoff({
      userId: req.apiUser._id,
      productCode: req.body?.productCode,
      mode: String(req.body?.mode || "pricing"),
    });
    res.set("Cache-Control", "no-store");
    return res.status(201).json({ handoff });
  } catch (error) {
    return next(error);
  }
};

exports.consumeHandoff = async (req, res, next) => {
  try {
    const handoff = await consumeAppCommerceHandoff(req.params.token);
    if (!handoff) {
      return res.status(410).render("payment-result", {
        success: false,
        uncertain: false,
        heading: "결제 연결이 만료되었습니다",
        message: "iPad 앱에서 이용권 화면을 다시 열어주세요.",
        primaryHref: "/pricing",
        primaryLabel: "이용권 보기",
        paymentSummary: null,
      });
    }
    const access = await synchronizeAccountAccess(handoff.userId);
    if (!access?.allowed) {
      return res.status(403).render("payment-result", {
        success: false,
        uncertain: false,
        heading: "계정 상태를 확인해 주세요",
        message: "현재 계정에서는 결제 페이지를 열 수 없습니다.",
        primaryHref: "/login",
        primaryLabel: "로그인 화면으로",
        paymentSummary: null,
      });
    }
    const user = await synchronizeUserLifecycle(access.user._id);
    await regenerateSession(req);
    req.session.user = browserSessionUser(user);
    await saveSession(req);
    res.set("Cache-Control", "no-store");
    return res.redirect(303, handoff.destination);
  } catch (error) {
    return next(error);
  }
};

exports._browserSessionUser = browserSessionUser;
