const bcrypt = require("bcrypt");
const { ParentAccount } = require("../models/parentModel");
const {
  acceptParentInvite,
  assertPaidCheckoutEnabled,
  createCheckoutIntent,
  getParentInvite,
  getProduct,
  getProductCatalog,
  isPaidCheckoutEnabled,
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

function parentSession(parent) {
  return {
    id: String(parent._id),
    username: parent.username,
    email: parent.email,
    childUserId: parent.childUserId ? String(parent.childUserId) : "",
    selectedChildUserId: parent.childUserId ? String(parent.childUserId) : "",
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
      return res.redirect(`/parent/login?next=${nextPath}`);
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

exports.loginPage = (req, res) => {
  res.set("Cache-Control", "no-store");
  return res.render("parent-login", {
    error: "",
    oldInput: { identifier: "" },
    next: safeNext(req.query.next),
  });
};

exports.login = async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || "").trim().toLowerCase();
    const parent = await ParentAccount.findOne({
      $or: [{ email: identifier }, { usernameNormalized: identifier }],
      isActive: true,
    }).select("+passwordHash");
    const valid = parent
      ? await bcrypt.compare(String(req.body.password || ""), parent.passwordHash)
      : false;
    if (!valid) {
      return res.status(401).render("parent-login", {
        error: "학부모 아이디 또는 비밀번호를 다시 확인해주세요.",
        oldInput: { identifier },
        next: safeNext(req.body.next),
      });
    }
    const nextPath = safeNext(req.body.next);
    parent.lastLoginAt = new Date();
    await parent.save();
    await regenerateSession(req);
    req.session.parent = parentSession(parent);
    await saveSession(req);
    return res.redirect(nextPath);
  } catch (error) {
    return next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    delete req.session.parent;
    await saveSession(req);
    return res.redirect("/parent/login");
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
    return next(error);
  }
};

exports.pricingPage = async (req, res, next) => {
  try {
    const context = await getRequestParentContext(req);
    const { parent, child } = context;
    return res.render("parent-pricing", {
      parent,
      child,
      familyChildren: context.familyChildren,
      selectedChildId: context.selectedChildId,
      products: await getProductCatalog(),
      checkoutEnabled: isPaidCheckoutEnabled(),
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
    feedback: req.query.submitted === "1"
      ? `문의를 접수했습니다. 답변은 ${inquiryData.contactEmail} 이메일로 보내드립니다.`
      : "",
    error,
    oldInput: {
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
    assertPaidCheckoutEnabled();
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
