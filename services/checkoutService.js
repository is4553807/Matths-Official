const { randomBytes, createHash } = require("node:crypto");
const bcrypt = require("bcrypt");
const {
  ParentAccount,
  ParentChildLink,
  ParentInvite,
  CheckoutIntent,
} = require("../models/parentModel");
const { User } = require("../models/matthsModel");
const { sendEmail, buildBrandedHtml } = require("./emailService");
const { getActiveMockExamPackagePolicy } = require("./mockExamPackageService");
const { getActiveArenaPolicy } = require("./arenaPolicyService");
const { linkChildToParent } = require("./parentFamilyService");

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const CHECKOUT_TTL_MS = 30 * 60 * 1000;
const PRODUCTS = new Set(["MOCK_EXAM_ONLY", "LEARNING_PACKAGE_29"]);
const LEGAL_GUARDIAN_CONSENT_VERSION = "MINOR_PAYMENT_GUARDIAN_V1";
const MINOR_PAYMENT_NOTICE_VERSION = "MINOR_SELF_PAYMENT_NOTICE_V1";

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function tokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function normalizeProductCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!PRODUCTS.has(code)) {
    throw statusError(404, "선택한 패키지를 찾을 수 없습니다.");
  }
  return code;
}

async function getProductCatalog() {
  const [mockPolicy, learningPolicy] = await Promise.all([
    getActiveMockExamPackagePolicy(),
    getActiveArenaPolicy(),
  ]);
  return [
    {
      code: "MOCK_EXAM_ONLY",
      name: "Matths 주간 공식 모의고사 이용권",
      amount: Number(mockPolicy?.monthlyPriceAmount ?? 5000),
      periodLabel: "30일",
      description: "주간 공식 모의고사 응시에 집중하는 이용권",
    },
    {
      code: "LEARNING_PACKAGE_29",
      name: "29일 학습권 패키지",
      amount: Number(learningPolicy?.priceAmount ?? 29000),
      periodLabel: "29일",
      description: "모의고사·배치고사·GOAT Arena까지 포함한 학습권",
    },
  ];
}

async function getProduct(code) {
  const productCode = normalizeProductCode(code);
  const catalog = await getProductCatalog();
  return catalog.find((product) => product.code === productCode);
}

async function createCheckoutIntent({
  studentUserId,
  parentAccountId = null,
  requestedBy,
  productCode,
  legalGuardianConsent = false,
  requiresMinorPaymentNotice = false,
  minorPaymentNoticeAccepted = false,
}) {
  const [student, product] = await Promise.all([
    User.findById(studentUserId).select("_id name isActive accountStatus").lean(),
    getProduct(productCode),
  ]);
  if (!student || student.isActive === false || student.accountStatus === "withdrawn") {
    throw statusError(404, "결제 대상 학생 계정을 찾을 수 없습니다.");
  }
  if (requestedBy === "PARENT" && legalGuardianConsent !== true) {
    throw statusError(
      400,
      "미성년자 결제 법정대리인 동의를 확인한 뒤 결제 주문을 준비해주세요.",
      "LEGAL_GUARDIAN_CONSENT_REQUIRED"
    );
  }
  if (
    requestedBy === "STUDENT" &&
    requiresMinorPaymentNotice === true &&
    minorPaymentNoticeAccepted !== true
  ) {
    throw statusError(
      400,
      "미성년자 결제 안내를 확인한 뒤 본인 결제를 진행해주세요.",
      "MINOR_PAYMENT_NOTICE_REQUIRED"
    );
  }
  return CheckoutIntent.create({
    studentUserId: student._id,
    parentAccountId,
    requestedBy,
    productCode: product.code,
    productName: product.name,
    amount: product.amount,
    legalGuardianConsentAt:
      requestedBy === "PARENT" ? new Date() : null,
    legalGuardianConsentVersion:
      requestedBy === "PARENT" ? LEGAL_GUARDIAN_CONSENT_VERSION : "",
    minorPaymentNoticeAcceptedAt:
      requestedBy === "STUDENT" && requiresMinorPaymentNotice
        ? new Date()
        : null,
    minorPaymentNoticeVersion:
      requestedBy === "STUDENT" && requiresMinorPaymentNotice
        ? MINOR_PAYMENT_NOTICE_VERSION
        : "",
    expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
  });
}

async function createParentInvite({
  childUserId,
  parentEmail,
  productCode,
  baseUrl,
}) {
  const email = String(parentEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw statusError(400, "학부모 이메일 주소를 정확히 입력해주세요.");
  }
  const [child, product, existingParent] = await Promise.all([
    User.findById(childUserId).select("_id name realName isActive accountStatus").lean(),
    getProduct(productCode),
    ParentAccount.findOne({ email }).select("_id childUserId").lean(),
  ]);
  if (!child || child.isActive === false || child.accountStatus === "withdrawn") {
    throw statusError(404, "학생 계정을 찾을 수 없습니다.");
  }
  const [linkedParent, legacyParent] = await Promise.all([
    ParentChildLink.findOne({ childUserId: child._id, status: "ACTIVE" })
      .select("parentAccountId")
      .lean(),
    ParentAccount.findOne({ childUserId: child._id, isActive: true })
      .select("_id")
      .lean(),
  ]);
  const connectedParentId = String(
    linkedParent?.parentAccountId || legacyParent?._id || ""
  );
  if (
    connectedParentId &&
    (!existingParent || connectedParentId !== String(existingParent._id))
  ) {
    throw statusError(409, "이미 다른 학부모 계정과 연결된 학생입니다.");
  }
  if (existingParent) {
    const legacyLinkMatches =
      String(existingParent.childUserId || "") === String(child._id);
    const existingLink = await ParentChildLink.exists({
      parentAccountId: existingParent._id,
      childUserId: child._id,
      status: "ACTIVE",
    });
    if (legacyLinkMatches || existingLink) {
      throw statusError(409, "이미 이 학부모 계정과 연결된 자녀입니다.");
    }
  }
  await ParentInvite.updateMany(
    { childUserId: child._id, parentEmail: email, status: "PENDING" },
    { $set: { status: "REVOKED" } }
  );
  const rawToken = randomBytes(32).toString("base64url");
  const invite = await ParentInvite.create({
    childUserId: child._id,
    parentEmail: email,
    productCode: product.code,
    tokenHash: tokenHash(rawToken),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  const signupUrl = `${String(baseUrl).replace(/\/$/, "")}/parent/invite/${rawToken}`;
  const childName = String(child.realName || child.name || "자녀");
  const body = existingParent
    ? `${childName} 학생이 ${product.name} 결제를 요청했습니다. 아래 링크에서 기존 학부모 계정으로 로그인한 뒤 자녀 연결을 확인해주세요. 링크는 72시간 동안 유효합니다.`
    : `${childName} 학생이 ${product.name} 결제를 요청했습니다. 아래 링크에서 학부모 계정을 만들면 자녀 계정이 자동으로 연결됩니다. 링크는 72시간 동안 유효합니다.`;
  const delivery = await sendEmail({
    to: email,
    subject: `[Matths] ${childName} 학생의 패키지 결제 요청`,
    text: `${body}\n\n${signupUrl}`,
    html: buildBrandedHtml({
      kicker: "MATTHS PARENT",
      heading: "자녀의 패키지 결제 요청이 도착했습니다.",
      body,
      actionLabel: existingParent ? "자녀 계정 연결하기" : "학부모 계정 만들기",
      actionUrl: signupUrl,
      footer: "본인이 요청받은 내용이 아니라면 이 메일을 무시해주세요.",
    }),
  });
  invite.emailDelivery = {
    delivered: delivery.delivered === true,
    providerMessageId: String(delivery.providerMessageId || ""),
  };
  await invite.save();
  return {
    invite,
    existingParent: Boolean(existingParent),
    previewUrl: process.env.NODE_ENV === "production" ? "" : signupUrl,
  };
}

async function getParentInvite(rawToken) {
  const invite = await ParentInvite.findOne({
    tokenHash: tokenHash(rawToken),
  })
    .select("+tokenHash")
    .populate("childUserId", "name realName accountStatus isActive")
    .lean();
  if (!invite) throw statusError(404, "학부모 가입 링크를 찾을 수 없습니다.");
  if (invite.status !== "PENDING") {
    throw statusError(410, "이미 사용했거나 취소된 학부모 가입 링크입니다.");
  }
  if (new Date(invite.expiresAt) <= new Date()) {
    await ParentInvite.updateOne({ _id: invite._id }, { $set: { status: "EXPIRED" } });
    throw statusError(410, "학부모 가입 링크의 유효기간이 끝났습니다. 자녀가 다시 요청해야 합니다.");
  }
  return invite;
}

async function registerParent({ rawToken, username, password, passwordConfirm }) {
  const invite = await getParentInvite(rawToken);
  const cleanUsername = String(username || "").trim();
  const normalized = cleanUsername.toLowerCase();
  if (cleanUsername.length < 2 || cleanUsername.length > 30) {
    throw statusError(400, "학부모 아이디는 2자 이상 30자 이하로 입력해주세요.");
  }
  if (String(password).length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw statusError(400, "비밀번호는 영문과 숫자를 포함해 8자 이상으로 입력해주세요.");
  }
  if (password !== passwordConfirm) {
    throw statusError(400, "비밀번호 확인이 일치하지 않습니다.");
  }
  const duplicate = await ParentAccount.exists({
    $or: [
      { usernameNormalized: normalized },
      { email: invite.parentEmail },
      { childUserId: invite.childUserId._id },
    ],
  });
  if (duplicate) throw statusError(409, "이미 가입된 학부모 계정 또는 자녀 연결입니다.");
  const parent = await ParentAccount.create({
    username: cleanUsername,
    usernameNormalized: normalized,
    email: invite.parentEmail,
    passwordHash: await bcrypt.hash(password, 12),
    childUserId: invite.childUserId._id,
    acceptedTermsAt: new Date(),
    lastLoginAt: new Date(),
  });
  await linkChildToParent({
    parentAccountId: parent._id,
    childUserId: invite.childUserId._id,
  });
  await ParentInvite.updateOne(
    { _id: invite._id, status: "PENDING" },
    { $set: { status: "ACCEPTED", acceptedAt: new Date() } }
  );
  return parent;
}

async function acceptParentInvite({ rawToken, parentAccountId }) {
  const invite = await getParentInvite(rawToken);
  const parent = await ParentAccount.findById(parentAccountId).lean();
  if (!parent || !parent.isActive) {
    throw statusError(403, "학부모 계정 이용 상태를 확인해주세요.");
  }
  if (String(parent.email).toLowerCase() !== String(invite.parentEmail).toLowerCase()) {
    throw statusError(403, "초대를 받은 이메일의 학부모 계정으로 로그인해주세요.");
  }

  const link = await linkChildToParent({
    parentAccountId: parent._id,
    childUserId: invite.childUserId._id,
  });
  const accepted = await ParentInvite.updateOne(
    { _id: invite._id, status: "PENDING" },
    { $set: { status: "ACCEPTED", acceptedAt: new Date() } }
  );
  if (accepted.modifiedCount !== 1) {
    throw statusError(409, "이미 처리된 자녀 연결 초대입니다.");
  }
  return { parent, child: invite.childUserId, link };
}

module.exports = {
  acceptParentInvite,
  createCheckoutIntent,
  createParentInvite,
  getParentInvite,
  getProduct,
  getProductCatalog,
  LEGAL_GUARDIAN_CONSENT_VERSION,
  MINOR_PAYMENT_NOTICE_VERSION,
  registerParent,
};
