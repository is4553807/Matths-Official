const { createHash, randomUUID } = require("node:crypto");
const bcrypt = require("bcrypt");
const { ParentAccount } = require("../models/parentModel");
const { User } = require("../models/matthsModel");
const { AcademyAccount } = require("../models/academyModel");
const {
  acceptParentInvite,
  assertPaidCheckoutEnabled,
  createCheckoutIntent,
  getParentInvite,
  getProduct,
  getProductCatalog,
  getPricingProductAccess,
  isPaidCheckoutAllowedForEmail,
  registerParent,
} = require("../services/checkoutService");
const {
  buildCheckoutClientConfig,
} = require("../services/paymentService");
const {
  getParentFamily,
  updateParentNotificationSettings,
} = require("../services/parentFamilyService");
const { getDashboardData } = require("../services/dashboardService");
const { getRankingData } = require("../services/rankingService");
const {
  getParentPaymentManagement,
  requestParentPaymentRefund,
} = require("../services/parentPaymentService");
const {
  createSupportInquiry,
  getParentInquiryPageData,
} = require("../services/supportInquiryService");
const { serviceUrl } = require("../services/serviceUrlService");

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function safeNext(value) {
  const next = String(value || "");
  return /^\/parent(?:\/|$)/.test(next) ? next : "/parent";
}

function parentUsernameKey(email) {
  return `parent-${createHash("sha256").update(String(email)).digest("hex").slice(0, 20)}`;
}

function parentSession(parent) {
  return {
    id: String(parent._id),
    username: parent.username,
    email: parent.email,
    childUserId: parent.childUserId ? String(parent.childUserId) : "",
    selectedChildUserId: parent.childUserId ? String(parent.childUserId) : "",
    accountType: "parent",
  };
}

async function renderInvite(req, res, { status = 200, error = "", oldInput = {} } = {}) {
  const invite = await getParentInvite(req.params.token);
  res.set("Cache-Control", "no-store");
  return res.status(status).render("parent-register", {
    invite,
    token: req.params.token,
    error,
    oldInput: { username: String(oldInput.username || "") },
  });
}

exports.inviteSignupPage = async (req, res, next) => {
  try {
    const invite = await getParentInvite(req.params.token);
    const existingParent = await ParentAccount.findOne({
      email: invite.parentEmail,
      isActive: true,
    }).lean();
    if (!existingParent) return await renderInvite(req, res);

    if (!req.session?.parent?.id) {
      const nextPath = encodeURIComponent(`/parent/invite/${req.params.token}`);
      return res.redirect(serviceUrl("parents", `/parent/login?next=${nextPath}`));
    }
    if (String(req.session.parent.id) !== String(existingParent._id)) {
      const error = new Error("초대를 받은 이메일의 학부모 계정으로 로그인해주세요.");
      error.status = 403;
      throw error;
    }
    res.set("Cache-Control", "no-store");
    return res.render("parent-link-child", {
      invite,
      token: req.params.token,
    });
  } catch (error) {
    return next(error);
  }
};

exports.acceptExistingParentInvite = async (req, res, next) => {
  try {
    const result = await acceptParentInvite({
      rawToken: req.params.token,
      parentAccountId: req.session.parent.id,
    });
    req.session.parent.selectedChildUserId = String(result.child._id);
    req.session.parent.childUserId = String(result.child._id);
    await saveSession(req);
    return res.redirect("/parent?linked=1");
  } catch (error) {
    return next(error);
  }
};

exports.completeInviteSignup = async (req, res, next) => {
  try {
    const parent = await registerParent({
      rawToken: req.params.token,
      username: req.body.username,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
    });
    await regenerateSession(req);
    req.session.parent = parentSession(parent);
    await saveSession(req);
    return res.redirect("/parent?welcome=1");
  } catch (error) {
    if ([400, 409].includes(Number(error.status))) {
      return renderInvite(req, res, {
        status: Number(error.status),
        error: error.message,
        oldInput: req.body,
      });
    }
    return next(error);
  }
};

function parentLoginLocals(req, overrides = {}) {
  return {
    accountType: "parent",
    error: null,
    success: req.query.registered === "1"
      ? "학부모 계정이 생성되었습니다. 로그인해주세요."
      : null,
    loginNotice: null,
    oldInput: { email: "" },
    next: safeNext(req.query.next),
    socialAuthProviders: [],
    ...overrides,
  };
}

exports.loginPage = (req, res) => res.render("login", parentLoginLocals(req));

exports.login = async (req, res, next) => {
  try {
    const rawEmail = String(req.body.email || "").trim();
    const email = rawEmail.toLowerCase();
    const password = String(req.body.password || "");
    const parent = await ParentAccount.findOne({ email }).select("+passwordHash");
    const matched = parent
      ? await bcrypt.compare(password, parent.passwordHash || "")
      : false;
    if (!parent || !matched) {
      return res.status(401).render("login", parentLoginLocals(req, {
        error: "이메일 또는 비밀번호가 올바르지 않습니다.",
        oldInput: { email: rawEmail },
        next: safeNext(req.body.next),
      }));
    }
    if (parent.isActive === false) {
      return res.status(403).render("login", parentLoginLocals(req, {
        error: "이용이 중지된 학부모 계정입니다.",
        oldInput: { email: rawEmail },
        next: safeNext(req.body.next),
      }));
    }
    parent.lastLoginAt = new Date();
    await parent.save();
    const destination = safeNext(req.body.next);
    await regenerateSession(req);
    req.session.parent = parentSession(parent);
    await saveSession(req);
    return res.redirect(serviceUrl("parents", destination));
  } catch (error) {
    return next(error);
  }
};

function parentRegistrationLocals(overrides = {}) {
  return {
    accountType: "parent",
    error: null,
    oldInput: { displayName: "", email: "" },
    ...overrides,
  };
}

exports.registerPage = (_req, res) => (
  res.render("portal-register", parentRegistrationLocals())
);

exports.register = async (req, res, next) => {
  try {
    const displayName = String(req.body.displayName || "").replace(/\s+/g, " ").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const passwordConfirm = String(req.body.passwordConfirm || "");
    const termsAccepted = ["1", "true", "on"].includes(String(req.body.termsAccepted || ""));

    if (displayName.length < 2 || displayName.length > 40) {
      const error = new Error("학부모 이름은 2자 이상 40자 이하로 입력해주세요.");
      error.status = 400;
      throw error;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const error = new Error("올바른 이메일 주소를 입력해주세요.");
      error.status = 400;
      throw error;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      const error = new Error("비밀번호는 영문과 숫자를 포함해 8자 이상으로 입력해주세요.");
      error.status = 400;
      throw error;
    }
    if (Buffer.byteLength(password, "utf8") > 72 || password !== passwordConfirm) {
      const error = new Error(password !== passwordConfirm
        ? "비밀번호 확인이 일치하지 않습니다."
        : "비밀번호가 너무 깁니다.");
      error.status = 400;
      throw error;
    }
    if (!termsAccepted) {
      const error = new Error("이용약관과 개인정보처리방침에 동의해주세요.");
      error.status = 400;
      throw error;
    }
    const [parentExists, userExists, academyExists] = await Promise.all([
      ParentAccount.exists({ email }),
      User.exists({ email }),
      AcademyAccount.exists({ email }),
    ]);
    if (parentExists || userExists || academyExists) {
      const error = new Error("이미 사용 중인 이메일입니다.");
      error.status = 409;
      throw error;
    }

    const parent = await ParentAccount.create({
      username: displayName,
      usernameNormalized: parentUsernameKey(email),
      email,
      passwordHash: await bcrypt.hash(password, 12),
      childUserId: null,
      acceptedTermsAt: new Date(),
      acceptedPrivacyAt: new Date(),
      lastLoginAt: new Date(),
    });
    await regenerateSession(req);
    req.session.parent = parentSession(parent);
    await saveSession(req);
    return res.redirect(serviceUrl("parents", "/parent?welcome=1"));
  } catch (error) {
    if ([400, 409].includes(Number(error.status)) || Number(error.code) === 11000) {
      return res.status(Number(error.status) || 409).render(
        "portal-register",
        parentRegistrationLocals({
          error: Number(error.code) === 11000 ? "이미 사용 중인 이메일입니다." : error.message,
          oldInput: {
            displayName: String(req.body.displayName || ""),
            email: String(req.body.email || ""),
          },
        })
      );
    }
    return next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    delete req.session.parent;
    await saveSession(req);
    return res.redirect(serviceUrl("parents", "/parent/login"));
  } catch (error) {
    return next(error);
  }
};

async function getRequestParentContext(req) {
  const family = await getParentFamily({
    parentId: req.session.parent.id,
    selectedChildUserId: req.session.parent.selectedChildUserId,
  });
  return {
    ...family,
    familyChildren: family.children,
    selectedChildId: family.selected.childId,
    childLink: family.selected,
  };
}

exports.selectChild = async (req, res, next) => {
  try {
    const requestedChildId = String(req.body.childUserId || "");
    const family = await getParentFamily({
      parentId: req.session.parent.id,
      selectedChildUserId: requestedChildId,
    });
    if (family.selected.childId !== requestedChildId) {
      const error = new Error("선택할 수 있는 자녀 계정을 찾지 못했습니다.");
      error.status = 404;
      throw error;
    }
    req.session.parent.selectedChildUserId = requestedChildId;
    req.session.parent.childUserId = requestedChildId;
    await saveSession(req);
    return res.redirect(safeNext(req.body.returnTo));
  } catch (error) {
    return next(error);
  }
};

exports.dashboardPage = async (req, res, next) => {
  try {
    const context = await getRequestParentContext(req);
    const { parent, child } = context;
    const [dashboard, ranking] = await Promise.all([
      getDashboardData(child._id),
      getRankingData(child._id),
    ]);
    const currentFinal = ranking.currentFinal;
    let affiliationRanking = null;
    if (Number(child.schoolGrade) === 13) {
      affiliationRanking = ranking.retakerRankings.find(
        (entry) => entry.userId === String(child._id)
      ) || null;
    } else if (Number(child.schoolGrade) === 14) {
      affiliationRanking = ranking.universityRankings?.find(
        (group) => group.id === String(child.university?.code || "")
      ) || null;
    } else if (Number(child.schoolGrade) === 15) {
      affiliationRanking = ranking.workerRankings?.find(
        (entry) => entry.userId === String(child._id)
      ) || null;
    } else {
      affiliationRanking = ranking.schoolRankings.find(
        (group) => group.id === String(child.school?.code || "")
      ) || null;
    }
    res.set("Cache-Control", "no-store");
    return res.render("parent-dashboard", {
      parent,
      child,
      dashboard,
      currentFinal,
      currentArena: ranking.current,
      affiliationRanking,
      welcome: req.query.welcome === "1",
      linked: req.query.linked === "1",
      familyChildren: context.familyChildren,
      selectedChildId: context.selectedChildId,
    });
  } catch (error) {
    if (error?.code === "PARENT_CHILD_LINK_REQUIRED") {
      const parent = await ParentAccount.findById(req.session.parent.id).lean();
      res.set("Cache-Control", "private, no-store");
      return res.status(200).render("parent-onboarding", { parent });
    }
    return next(error);
  }
};

exports.pricingPage = async (req, res, next) => {
  try {
    const context = await getRequestParentContext(req);
    const { parent, child } = context;
    const [products, productAccess] = await Promise.all([
      getProductCatalog(),
      getPricingProductAccess(child._id),
    ]);
    return res.render("parent-pricing", {
      parent,
      child,
      familyChildren: context.familyChildren,
      selectedChildId: context.selectedChildId,
      products,
      productAccess,
      checkoutEnabled: isPaidCheckoutAllowedForEmail(parent.email),
    });
  } catch (error) {
    return next(error);
  }
};

async function renderPaymentManagement(
  req,
  res,
  { status = 200, error = "" } = {}
) {
  const context = await getRequestParentContext(req);
  const { parent, child } = context;
  res.set("Cache-Control", "no-store");
  return res.status(status).render("parent-payments", {
    parent,
    child,
    familyChildren: context.familyChildren,
    selectedChildId: context.selectedChildId,
    paymentData: await getParentPaymentManagement({
      parentAccountId: parent._id,
      studentUserId: child._id,
    }),
    feedback: req.query.refund === "requested"
      ? "환불 신청을 접수했습니다. 운영자가 기준에 따라 금액을 산정한 뒤 처리 상태를 갱신합니다."
      : "",
    error,
  });
}

exports.paymentManagementPage = async (req, res, next) => {
  try {
    return await renderPaymentManagement(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.requestPaymentRefund = async (req, res, next) => {
  try {
    const context = await getRequestParentContext(req);
    await requestParentPaymentRefund({
      parentAccountId: context.parent._id,
      studentUserId: context.child._id,
      paymentId: req.params.paymentId,
      reasonType: req.body.reasonType,
      reasonDetail: req.body.reasonDetail,
    });
    return res.redirect("/parent/payments?refund=requested");
  } catch (error) {
    if ([400, 403, 404, 409].includes(Number(error.status))) {
      return renderPaymentManagement(req, res, {
        status: Number(error.status),
        error: error.message,
      });
    }
    return next(error);
  }
};

async function renderParentInquiries(
  req,
  res,
  {
    status = 200,
    error = "",
    oldInput = {},
  } = {}
) {
  const context = await getRequestParentContext(req);
  const { parent, child } = context;
  const inquiryData = await getParentInquiryPageData({
    parentAccountId: parent._id,
    userId: child._id,
  });
  res.set("Cache-Control", "no-store");
  return res.status(status).render("parent-inquiries", {
    parent,
    child,
    familyChildren: context.familyChildren,
    selectedChildId: context.selectedChildId,
    inquiryData,
    inquiryRequestId:
      String(oldInput.requestId || "") ||
      randomUUID(),
    feedback: req.query.submitted === "1"
      ? `문의를 접수했습니다. 답변은 ${inquiryData.contactEmail} 이메일로 보내드립니다.`
      : "",
    error,
    oldInput: {
      requestId: String(oldInput.requestId || ""),
      subject: String(oldInput.subject || ""),
      content: String(oldInput.content || ""),
    },
  });
}

exports.inquiriesPage = async (req, res, next) => {
  try {
    return await renderParentInquiries(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.submitInquiry = async (req, res, next) => {
  try {
    const context = await getRequestParentContext(req);
    await createSupportInquiry({
      userId: context.child._id,
      parentAccountId: context.parent._id,
      requestId: req.body.requestId,
      inquiryType: "GENERAL",
      subject: req.body.subject,
      content: req.body.content,
    });
    return res.redirect("/parent/inquiries?submitted=1");
  } catch (error) {
    if ([400, 403, 404, 429].includes(Number(error.status))) {
      return renderParentInquiries(req, res, {
        status: Number(error.status),
        error: error.message,
        oldInput: req.body,
      });
    }
    return next(error);
  }
};

async function renderCheckout(req, res, { intent = null } = {}) {
  const context = await getRequestParentContext(req);
  const { parent, child } = context;
  return res.render("parent-checkout", {
    parent,
    child,
    familyChildren: context.familyChildren,
    selectedChildId: context.selectedChildId,
    product: await getProduct(req.params.productCode),
    intent,
    checkoutConfig: intent
      ? buildCheckoutClientConfig(intent, {
          baseUrl:
            process.env.PUBLIC_BASE_URL ||
            `${req.protocol}://${req.get("host")}`,
          customerEmail: parent.email,
          customerName: parent.username,
        })
      : null,
  });
}

exports.checkoutPage = async (req, res, next) => {
  try {
    assertPaidCheckoutEnabled({ email: req.session.parent.email });
    return await renderCheckout(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.prepareCheckout = async (req, res, next) => {
  try {
    const { parent, child } = await getRequestParentContext(req);
    const intent = await createCheckoutIntent({
      studentUserId: child._id,
      parentAccountId: parent._id,
      requestedBy: "PARENT",
      productCode: req.params.productCode,
      legalGuardianConsent: req.body.legalGuardianConsent === "true",
      refundPolicyAccepted: req.body.refundPolicyAccepted === "true",
    });
    return await renderCheckout(req, res, { intent });
  } catch (error) {
    return next(error);
  }
};

exports.notificationSettingsPage = async (req, res, next) => {
  try {
    const context = await getRequestParentContext(req);
    const dashboard = await getDashboardData(context.child._id);
    res.set("Cache-Control", "no-store");
    return res.render("parent-notification-settings", {
      parent: context.parent,
      child: context.child,
      childLink: context.childLink,
      familyChildren: context.familyChildren,
      selectedChildId: context.selectedChildId,
      dashboard,
      saved: req.query.saved === "1",
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateNotificationSettings = async (req, res, next) => {
  try {
    const context = await getRequestParentContext(req);
    await updateParentNotificationSettings({
      parentAccountId: context.parent._id,
      childUserId: context.child._id,
      input: req.body,
    });
    return res.redirect("/parent/notifications?saved=1");
  } catch (error) {
    return next(error);
  }
};
