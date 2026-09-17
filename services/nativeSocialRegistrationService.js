const bcrypt = require("bcrypt");
const crypto = require("crypto");
const mongoose = require("mongoose");

const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const AppleAuthCredential = require(
  "../models/appleAuthCredentialModel"
);
const NativeSocialRegistrationTicket = require(
  "../models/nativeSocialRegistrationTicketModel"
);
const {
  GRANT_TTL_MS,
  issueMobileAuthGrant,
} = require("./mobileSocialAuthGrantService");
const {
  verifyNativeKakaoIdentity,
} = require("./kakaoNativeAuthService");
const {
  isPlaceholderAppleEmail,
  isNativeAppleAudience,
  placeholderAppleEmail,
  prepareAppleAuthorization,
  storePreparedAppleAuthorization,
  verifyAppleIdentityToken,
} = require("./appleAuthService");
const {
  accountBlockedMessage,
  normalizedAccountStatus,
  synchronizeAccountAccess,
} = require("./accountAccessService");
const {
  getAcademicYear,
} = require("./userLifecycleService");
const {
  validateRealName,
} = require("./userIdentityService");
const {
  nicknameKey,
  validateNickname,
} = require("./nicknameService");
const {
  alertPotentialDuplicateIdentity,
  buildIdentityMatchHash,
  normalizeBirthDate,
} = require("./identityRiskService");
const {
  OVERSEAS_HIGH_SCHOOL_OPTION_CODE,
  buildOverseasSchool,
  findSchool,
} = require("./schoolService");
const {
  OVERSEAS_UNIVERSITY_OPTION_CODE,
  buildOverseasUniversity,
  findUniversity,
} = require("./universityService");

const TERMS_VERSION = "2026-08-13";
const PRIVACY_VERSION = "2026-08-13";
const TICKET_TTL_MS = 15 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const REGISTRATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SOCIAL_AUTH_SELECT =
  "+birthDate +socialAuth.googleId +socialAuth.kakaoId +socialAuth.appleId";
const PARENT_SOCIAL_AUTH_SELECT =
  "+socialAuth.googleId +socialAuth.kakaoId +socialAuth.appleId";

let indexPromise = null;

async function ensureNativeSocialRegistrationIndexes() {
  if (!indexPromise) {
    indexPromise = NativeSocialRegistrationTicket.createIndexes()
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  await indexPromise;
  return true;
}

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifierChallenge(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("base64url");
}

function ticketEncryptionKey() {
  const secret =
    process.env.API_TOKEN_SECRET ||
    process.env.SECRET;
  if (!secret) {
    throw new Error(
      "API_TOKEN_SECRET 또는 SECRET 환경 변수가 필요합니다."
    );
  }
  return crypto
    .createHash("sha256")
    .update("matths-native-social-registration-v1\0")
    .update(String(secret))
    .digest();
}

function seal(ticketId, purpose, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    ticketEncryptionKey(),
    iv
  );
  cipher.setAAD(
    Buffer.from(`${purpose}:${ticketId}`, "utf8")
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

function open(ticketId, purpose, encrypted) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    ticketEncryptionKey(),
    Buffer.from(String(encrypted.iv || ""), "base64url")
  );
  decipher.setAAD(
    Buffer.from(`${purpose}:${ticketId}`, "utf8")
  );
  decipher.setAuthTag(
    Buffer.from(String(encrypted.tag || ""), "base64url")
  );
  const plaintext = Buffer.concat([
    decipher.update(
      Buffer.from(
        String(encrypted.ciphertext || ""),
        "base64url"
      )
    ),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext);
}

function identityDigest(provider, providerUserId) {
  return crypto
    .createHmac("sha256", ticketEncryptionKey())
    .update(String(provider))
    .update("\0")
    .update(String(providerUserId))
    .digest("hex");
}

function registrationDigest(value) {
  return crypto
    .createHmac("sha256", ticketEncryptionKey())
    .update("profile\0")
    .update(String(value))
    .digest("hex");
}

function assertCodeChallenge(value) {
  const normalized = String(value || "").trim();
  if (!CODE_CHALLENGE_PATTERN.test(normalized)) {
    throw statusError(
      400,
      "로그인 보안 값을 확인하지 못했습니다.",
      "NATIVE_SOCIAL_PKCE_REQUIRED"
    );
  }
  return normalized;
}

function normalizeIdentity(provider, identity) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  if (!["apple", "kakao"].includes(normalizedProvider)) {
    throw statusError(
      404,
      "지원하지 않는 소셜 로그인 방식입니다.",
      "NATIVE_SOCIAL_PROVIDER_NOT_FOUND"
    );
  }
  const providerUserId = String(identity?.providerUserId || "").trim();
  if (!providerUserId || providerUserId.length > 512) {
    throw statusError(
      401,
      "소셜 계정 정보를 확인하지 못했습니다.",
      "NATIVE_SOCIAL_IDENTITY_INVALID"
    );
  }
  const emailVerified = identity?.emailVerified === true;
  const candidateEmail = String(identity?.email || "")
    .trim()
    .toLowerCase();
  const email =
    emailVerified &&
    candidateEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)
      ? candidateEmail
      : "";
  const suggestedRealNameValidation = validateRealName(
    String(identity?.suggestedRealName || "")
  );
  return {
    provider: normalizedProvider,
    providerUserId,
    email,
    emailVerified: Boolean(email),
    suggestedRealName:
      normalizedProvider === "apple" &&
      suggestedRealNameValidation.valid
        ? suggestedRealNameValidation.realName
        : "",
  };
}

function providerPlaceholderEmail(provider, providerUserId) {
  if (provider === "apple") {
    return placeholderAppleEmail(providerUserId);
  }
  return `kakao.${digest(providerUserId).slice(0, 24)}@kakao.invalid`;
}

function isProviderPlaceholderEmail(email, provider, providerUserId) {
  if (provider === "apple") {
    return isPlaceholderAppleEmail(email, providerUserId);
  }
  return safeEqual(
    String(email || "").trim().toLowerCase(),
    providerPlaceholderEmail(provider, providerUserId)
  );
}

function providerIdPath(provider) {
  return `socialAuth.${provider === "apple" ? "appleId" : "kakaoId"}`;
}

function querySession(query, session) {
  return session ? query.session(session) : query;
}

async function findIdentityOwner(identity, { session = null } = {}) {
  const idPath = providerIdPath(identity.provider);
  const providerUserQuery = querySession(
    User.findOne({ [idPath]: identity.providerUserId })
      .select(SOCIAL_AUTH_SELECT),
    session
  );
  const emailUserQuery = identity.emailVerified
    ? querySession(
        User.findOne({ email: identity.email })
          .select(SOCIAL_AUTH_SELECT),
        session
      )
    : Promise.resolve(null);
  const providerParentQuery = querySession(
    ParentAccount.findOne({
      [idPath]: identity.providerUserId,
    }).select(PARENT_SOCIAL_AUTH_SELECT),
    session
  );
  const emailParentQuery = identity.emailVerified
    ? querySession(
        ParentAccount.findOne({
          email: identity.email,
        }).select(PARENT_SOCIAL_AUTH_SELECT),
        session
      )
    : Promise.resolve(null);
  const credentialQuery =
    identity.provider === "apple"
      ? querySession(
          AppleAuthCredential.findOne({
            appleSubject: identity.providerUserId,
          }).select("+appleSubject"),
          session
        )
      : Promise.resolve(null);

  let mirroredUser;
  let emailUser;
  let providerParent;
  let emailParent;
  let appleCredential;
  if (session) {
    // MongoDB 트랜잭션의 단일 session에서는 병렬 연산이 지원되지 않습니다.
    // 같은 snapshot을 쓰되 반드시 순서대로 조회합니다.
    mirroredUser = await providerUserQuery;
    emailUser = await emailUserQuery;
    providerParent = await providerParentQuery;
    emailParent = await emailParentQuery;
    appleCredential = await credentialQuery;
  } else {
    [
      mirroredUser,
      emailUser,
      providerParent,
      emailParent,
      appleCredential,
    ] = await Promise.all([
      providerUserQuery,
      emailUserQuery,
      providerParentQuery,
      emailParentQuery,
      credentialQuery,
    ]);
  }
  if (providerParent) {
    throw statusError(
      409,
      "이 소셜 계정은 학부모 계정에 연결되어 있습니다. 학부모 웹 로그인을 이용해주세요.",
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );
  }
  if (appleCredential?.ownerModel === "ParentAccount") {
    throw statusError(
      409,
      "학부모 계정은 학부모 웹 로그인을 이용해주세요.",
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );
  }
  const credentialUser = appleCredential
    ? await querySession(
        User.findById(appleCredential.userId)
          .select(SOCIAL_AUTH_SELECT),
        session
      )
    : null;

  if (
    mirroredUser &&
    credentialUser &&
    String(mirroredUser._id) !== String(credentialUser._id)
  ) {
    throw statusError(
      409,
      "소셜 계정 연결 정보가 다른 계정과 충돌합니다.",
      "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
    );
  }
  const providerUser = credentialUser || mirroredUser;
  if (
    providerUser &&
    emailUser &&
    String(providerUser._id) !== String(emailUser._id)
  ) {
    throw statusError(
      409,
      "소셜 계정 연결 정보가 다른 계정과 충돌합니다.",
      "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
    );
  }
  const user = providerUser || emailUser;
  if (user && emailParent) {
    throw statusError(
      409,
      "같은 이메일이 학생 계정과 학부모 계정에 함께 연결되어 있습니다. 계정 연결을 확인해주세요.",
      "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
    );
  }
  if (!user) {
    if (emailParent && emailParent.isActive !== false) {
      throw statusError(
        409,
        "같은 이메일의 학부모 계정이 있습니다. 학부모 로그인 방식을 이용해주세요.",
        "SOCIAL_AUTH_PARENT_ACCOUNT"
      );
    }
    return null;
  }

  const linkedId = String(user.get(idPath) || "");
  if (linkedId && linkedId !== identity.providerUserId) {
    throw statusError(
      409,
      "이미 다른 소셜 계정이 연결된 이메일입니다.",
      "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
    );
  }
  if (identity.provider === "apple") {
    const conflictingCredential = await querySession(
      AppleAuthCredential.findOne({
        userId: user._id,
        $or: [
          { ownerModel: "User" },
          { ownerModel: { $exists: false } },
        ],
      })
        .select("+appleSubject"),
      session
    );
    if (
      conflictingCredential &&
      conflictingCredential.appleSubject !== identity.providerUserId
    ) {
      throw statusError(
        409,
        "이미 다른 Apple 계정이 연결된 이메일입니다.",
        "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
      );
    }
  }
  return user;
}

function isRegistrationComplete(user) {
  // 기존 교사·관리자 계정은 학생 학적 입력 대상이 아닙니다. 공급자가 검증한
  // 기존 계정 연결 정책은 유지하고 학생 가입 폼으로 역할 정보를 덮지 않습니다.
  if (user?.role && user.role !== "student") return true;
  const realName = validateRealName(user?.realName);
  const nickname = validateNickname(user?.name);
  const grade = Number(user?.schoolGrade);
  if (
    !realName.valid ||
    !nickname.valid ||
    !(user?.birthDate instanceof Date) ||
    !Number.isFinite(user.birthDate.getTime()) ||
    !user?.termsAcceptedAt ||
    ![10, 11, 12, 13, 14, 15].includes(grade)
  ) {
    return false;
  }
  if ([10, 11, 12].includes(grade)) {
    return Boolean(user?.school?.code && user?.school?.name);
  }
  if (grade === 14) {
    return Boolean(user?.university?.code && user?.university?.name);
  }
  return true;
}

async function assertAccountAllowed(userId) {
  const access = await synchronizeAccountAccess(userId);
  if (!access?.allowed) {
    throw statusError(
      403,
      accountBlockedMessage(
        access?.status,
        access?.user?.accountStatusReason
      ),
      "ACCOUNT_BLOCKED"
    );
  }
  return access.user;
}

async function assertNoParentConflict(identity, { session = null } = {}) {
  if (!identity.emailVerified) return;
  const query = ParentAccount.exists({
    email: identity.email,
    isActive: true,
  });
  if (session) query.session(session);
  if (await query) {
    throw statusError(
      409,
      "같은 이메일의 학부모 계정이 있습니다. 학부모 로그인 방식을 이용해주세요.",
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );
  }
}

async function issueRegistrationTicket({
  identity,
  codeChallenge,
  existingUserId = null,
  appleAuthorization = null,
  TicketModel = NativeSocialRegistrationTicket,
  now = new Date(),
}) {
  await ensureNativeSocialRegistrationIndexes();
  const registrationToken = crypto.randomBytes(32).toString("base64url");
  const ticket = new TicketModel({
    tokenHash: digest(registrationToken),
    provider: identity.provider,
    identityDigest: identityDigest(
      identity.provider,
      identity.providerUserId
    ),
    codeChallenge,
    existingUserId,
    expiresAt: new Date(now.getTime() + TICKET_TTL_MS),
  });
  const encrypted = seal(ticket._id, "payload", {
    identity,
    appleAuthorization,
  });
  ticket.payloadCiphertext = encrypted.ciphertext;
  ticket.payloadIv = encrypted.iv;
  ticket.payloadTag = encrypted.tag;
  await ticket.save();

  return {
    status: "registration_required",
    registration: {
      token: registrationToken,
      provider: identity.provider,
      expiresAt: ticket.expiresAt.toISOString(),
      ...(identity.emailVerified
        ? { email: identity.email }
        : {}),
      ...(identity.suggestedRealName
        ? { suggestedRealName: identity.suggestedRealName }
        : {}),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    },
  };
}

async function linkAndIssueGrant({
  userId,
  identity,
  codeChallenge,
  appleAuthorization = null,
}) {
  const session = await mongoose.startSession();
  let code = "";
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId)
        .select(SOCIAL_AUTH_SELECT)
        .session(session);
      if (!user) {
        throw statusError(
          409,
          "사용자 정보를 다시 확인해주세요.",
          "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
        );
      }
      const status = normalizedAccountStatus(user);
      if (status !== "active" || user.isActive === false) {
        throw statusError(
          403,
          accountBlockedMessage(status, user.accountStatusReason),
          "ACCOUNT_BLOCKED"
        );
      }

      const owner = await findIdentityOwner(identity, { session });
      if (owner && String(owner._id) !== String(user._id)) {
        throw statusError(
          409,
          "소셜 계정 연결 정보가 다른 계정과 충돌합니다.",
          "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
        );
      }
      user.set(providerIdPath(identity.provider), identity.providerUserId);
      if (
        identity.emailVerified &&
        String(user.email || "").trim().toLowerCase() === identity.email &&
        !user.emailVerifiedAt
      ) {
        user.emailVerifiedAt = new Date();
      }
      user.lastLoginAt = new Date();
      await user.save({ session });

      if (identity.provider === "apple") {
        await storePreparedAppleAuthorization(
          {
            userId: user._id,
            subject: identity.providerUserId,
            prepared: appleAuthorization,
          },
          { session }
        );
      }
      code = await issueMobileAuthGrant(user._id, {
        codeChallenge,
        session,
      });
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw statusError(
        409,
        "이미 다른 계정에 연결된 소셜 로그인입니다.",
        "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return { status: "authenticated", code };
}

async function startNativeSocialRegistration({
  provider,
  identity: rawIdentity,
  codeChallenge,
  appleAuthorization = null,
}) {
  const challenge = assertCodeChallenge(codeChallenge);
  const identity = normalizeIdentity(provider, rawIdentity);
  const owner = await findIdentityOwner(identity);

  if (owner) {
    await assertAccountAllowed(owner._id);
    if (isRegistrationComplete(owner)) {
      return linkAndIssueGrant({
        userId: owner._id,
        identity,
        codeChallenge: challenge,
        appleAuthorization,
      });
    }
    return issueRegistrationTicket({
      identity,
      codeChallenge: challenge,
      existingUserId: owner._id,
      appleAuthorization,
    });
  }

  // 이미 provider ID가 연결된 사용자는 카카오 이메일 권한을 나중에 철회해도
  // 그 ID 자체로 안전하게 로그인할 수 있습니다. 반면 신규 가입이나 이메일로
  // 기존 계정을 찾는 경로는 검증 이메일 없이는 절대 진행하지 않습니다.
  if (identity.provider === "kakao" && !identity.emailVerified) {
    throw statusError(
      400,
      "카카오 계정에서 검증된 이메일을 확인하지 못했습니다. 이메일 제공 동의를 확인해주세요.",
      "SOCIAL_AUTH_EMAIL_REQUIRED"
    );
  }

  await assertNoParentConflict(identity);
  return issueRegistrationTicket({
    identity,
    codeChallenge: challenge,
    appleAuthorization,
  });
}

async function startKakaoNativeSocial(
  { accessToken, codeChallenge } = {},
  { verifyIdentity = verifyNativeKakaoIdentity } = {}
) {
  const challenge = assertCodeChallenge(codeChallenge);
  const profile = await verifyIdentity(accessToken);
  return startNativeSocialRegistration({
    provider: "kakao",
    identity: {
      providerUserId: profile.providerUserId,
      email: profile.email,
      emailVerified: profile.emailVerified,
    },
    codeChallenge: challenge,
  });
}

async function startAppleNativeSocial(
  {
    identityToken,
    authorizationCode,
    nonce,
    fullName,
    codeChallenge,
  } = {},
  {
    verifyIdentity = verifyAppleIdentityToken,
    prepareAuthorization = prepareAppleAuthorization,
    validateNativeAudience = isNativeAppleAudience,
  } = {}
) {
  const challenge = assertCodeChallenge(codeChallenge);
  const claims = await verifyIdentity({ identityToken, nonce });
  if (!validateNativeAudience(claims.audience)) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_AUDIENCE_INVALID"
    );
  }
  const appleAuthorization = await prepareAuthorization({
    authorizationCode,
    clientId: claims.audience,
    expectedSubject: claims.subject,
    expectedCodeHash: claims.authorizationCodeHash,
  });
  return startNativeSocialRegistration({
    provider: "apple",
    identity: {
      providerUserId: claims.subject,
      email: claims.email,
      emailVerified: claims.emailVerified,
      suggestedRealName: fullName,
    },
    codeChallenge: challenge,
    appleAuthorization,
  });
}

function normalizeRegistrationProfile(body = {}) {
  const realNameValidation = validateRealName(body.realName);
  if (!realNameValidation.valid) {
    throw statusError(
      400,
      realNameValidation.message,
      "INVALID_REAL_NAME"
    );
  }
  const nicknameValidation = validateNickname(body.name);
  if (!nicknameValidation.valid) {
    throw statusError(
      400,
      nicknameValidation.message,
      "INVALID_NICKNAME"
    );
  }

  let birthDate;
  try {
    birthDate = normalizeBirthDate(body.birthDate).birthDate;
  } catch (error) {
    throw statusError(
      400,
      error.message,
      "INVALID_BIRTH_DATE"
    );
  }
  const schoolGrade = Number(body.schoolGrade);
  if (![10, 11, 12, 13, 14, 15].includes(schoolGrade)) {
    throw statusError(
      400,
      "현재 학습자 구분을 선택해주세요.",
      "INVALID_GRADE"
    );
  }
  if (body.termsAccepted !== true || body.privacyAccepted !== true) {
    throw statusError(
      400,
      "이용약관과 개인정보처리방침에 동의해주세요.",
      "TERMS_REQUIRED"
    );
  }
  if (
    String(body.termsVersion || "") !== TERMS_VERSION ||
    String(body.privacyVersion || "") !== PRIVACY_VERSION
  ) {
    throw statusError(
      409,
      "약관 또는 개인정보처리방침이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요.",
      "NATIVE_SOCIAL_POLICY_VERSION_MISMATCH"
    );
  }

  const schoolRegion = String(body.schoolRegion || "").trim();
  const schoolCode = String(body.schoolCode || "").trim();
  const overseasSchoolName = String(body.overseasSchoolName || "");
  const universityCode = String(body.universityCode || "").trim();
  const overseasUniversityName = String(body.overseasUniversityName || "");
  const school = [10, 11, 12].includes(schoolGrade)
    ? schoolCode === OVERSEAS_HIGH_SCHOOL_OPTION_CODE
      ? buildOverseasSchool(overseasSchoolName).school
      : findSchool(schoolRegion, schoolCode)
    : null;
  const university = schoolGrade === 14
    ? universityCode === OVERSEAS_UNIVERSITY_OPTION_CODE
      ? buildOverseasUniversity(overseasUniversityName).university
      : findUniversity(universityCode)
    : null;

  if (
    [10, 11, 12].includes(schoolGrade) &&
    schoolCode === OVERSEAS_HIGH_SCHOOL_OPTION_CODE &&
    !school
  ) {
    throw statusError(
      400,
      buildOverseasSchool(overseasSchoolName).error,
      "INVALID_OVERSEAS_SCHOOL_NAME"
    );
  }
  if ([10, 11, 12].includes(schoolGrade) && !school) {
    throw statusError(
      400,
      "목록에서 고등학교를 선택해주세요.",
      "INVALID_SCHOOL"
    );
  }
  if (
    schoolGrade === 14 &&
    universityCode === OVERSEAS_UNIVERSITY_OPTION_CODE &&
    !university
  ) {
    throw statusError(
      400,
      buildOverseasUniversity(overseasUniversityName).error,
      "INVALID_OVERSEAS_UNIVERSITY_NAME"
    );
  }
  if (schoolGrade === 14 && !university) {
    throw statusError(
      400,
      "목록에서 대학교를 선택해주세요.",
      "INVALID_UNIVERSITY"
    );
  }

  const realName = realNameValidation.realName;
  const name = nicknameValidation.nickname;
  const normalized = {
    realName,
    name,
    birthDate,
    birthDateKey: birthDate.toISOString().slice(0, 10),
    schoolGrade,
    school,
    university,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  };
  normalized.fingerprint = registrationDigest(JSON.stringify({
    realName,
    name,
    birthDate: normalized.birthDateKey,
    schoolGrade,
    schoolCode: school?.code || "",
    universityCode: university?.code || "",
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  }));
  return normalized;
}

function ticketSelection(query) {
  return query.select([
    "+tokenHash",
    "+identityDigest",
    "+codeChallenge",
    "+payloadCiphertext",
    "+payloadIv",
    "+payloadTag",
    "+registrationFingerprint",
    "+resultCiphertext",
    "+resultIv",
    "+resultTag",
  ].join(" "));
}

async function loadRegistrationTicket(
  registrationToken,
  codeVerifier,
  { session = null, now = new Date() } = {}
) {
  const token = String(registrationToken || "").trim();
  const verifier = String(codeVerifier || "").trim();
  if (
    !REGISTRATION_TOKEN_PATTERN.test(token) ||
    !CODE_VERIFIER_PATTERN.test(verifier)
  ) {
    throw statusError(
      400,
      "가입 요청 정보가 올바르지 않습니다. 소셜 로그인을 다시 진행해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_INVALID"
    );
  }
  let query = ticketSelection(
    NativeSocialRegistrationTicket.findOne({ tokenHash: digest(token) })
  );
  if (session) query = query.session(session);
  const ticket = await query;
  if (!ticket) {
    throw statusError(
      410,
      "가입 요청이 만료되었습니다. 소셜 로그인을 다시 진행해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_EXPIRED"
    );
  }
  if (ticket.expiresAt.getTime() <= now.getTime()) {
    throw statusError(
      410,
      "가입 요청이 만료되었습니다. 소셜 로그인을 다시 진행해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_EXPIRED"
    );
  }
  if (!safeEqual(ticket.codeChallenge, verifierChallenge(verifier))) {
    throw statusError(
      400,
      "가입 요청 정보가 올바르지 않습니다. 소셜 로그인을 다시 진행해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_INVALID"
    );
  }
  let payload;
  try {
    payload = open(ticket._id, "payload", {
      ciphertext: ticket.payloadCiphertext,
      iv: ticket.payloadIv,
      tag: ticket.payloadTag,
    });
  } catch {
    throw statusError(
      400,
      "가입 요청 정보가 올바르지 않습니다. 소셜 로그인을 다시 진행해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_INVALID"
    );
  }
  const identity = normalizeIdentity(ticket.provider, payload?.identity);
  if (
    !safeEqual(
      ticket.identityDigest,
      identityDigest(identity.provider, identity.providerUserId)
    )
  ) {
    throw statusError(
      400,
      "가입 요청 정보가 올바르지 않습니다. 소셜 로그인을 다시 진행해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_INVALID"
    );
  }
  return {
    ticket,
    identity,
    appleAuthorization: payload?.appleAuthorization || null,
  };
}

function registrationProfile(
  profile,
  now,
  {
    includePreferences = true,
    existingUser = null,
  } = {}
) {
  const preservedSchool = existingUser?.school?.code
    ? existingUser.school
    : null;
  const preservedUniversity = existingUser?.university?.code
    ? existingUser.university
    : null;
  const school = profile.school || preservedSchool;
  const university = profile.university || preservedUniversity;
  return {
    realName: profile.realName,
    name: profile.name,
    nameNormalized: nicknameKey(profile.name),
    birthDate: profile.birthDate,
    ...(school
      ? {
          identityMatchHash: buildIdentityMatchHash({
            realName: profile.realName,
            birthDate: profile.birthDate,
            schoolCode: school.code,
          }),
          identityMatchVersion: "name-birthdate-school-v1",
        }
      : existingUser
        ? {}
        : {
          identityMatchHash: undefined,
          identityMatchVersion: undefined,
        }),
    schoolGrade: profile.schoolGrade,
    learnerType:
      profile.schoolGrade === 13
        ? "RETAKER"
        : profile.schoolGrade === 14
          ? "UNIVERSITY"
          : profile.schoolGrade === 15
            ? "WORKER"
            : "HIGH_SCHOOL",
    educationStatus:
      [13, 15].includes(profile.schoolGrade)
        ? "graduated"
        : "enrolled",
    lastGradePromotionYear: getAcademicYear(now),
    lastLoginAt: now,
    ...(school
      ? {
          school: {
            region: school.region,
            code: school.code,
            name: school.name,
            roadAddress: school.roadAddress || "",
            establishment: school.establishment || "",
            highSchoolType: school.highSchoolType || "",
            isOverseas: school.isOverseas === true,
          },
        }
      : existingUser
        ? {}
        : {
            school: {
              region: "",
              code: "",
              name: "",
              roadAddress: "",
              establishment: "",
              highSchoolType: "",
              isOverseas: false,
            },
          }),
    ...(university
      ? { university }
      : existingUser
        ? {}
        : {
            university: {
              code: "",
              name: "",
              campus: "",
              region: "",
              institutionLevel: "",
              institutionType: "",
              establishment: "",
              isOverseas: false,
            },
          }),
    termsAcceptedAt: now,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    ...(includePreferences
      ? {
          preferences: {
            coachMode: "mild",
            dashboardTutorialStatus: "PENDING",
          },
        }
      : {}),
  };
}

function readStoredResult(ticket, fingerprint) {
  if (
    ticket.status !== "COMPLETED" ||
    !ticket.resultExpiresAt ||
    ticket.resultExpiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  if (!safeEqual(ticket.registrationFingerprint, fingerprint)) {
    throw statusError(
      409,
      "이미 처리된 가입 요청의 정보와 일치하지 않습니다.",
      "NATIVE_SOCIAL_REGISTRATION_CONFLICT"
    );
  }
  try {
    return open(ticket._id, "result", {
      ciphertext: ticket.resultCiphertext,
      iv: ticket.resultIv,
      tag: ticket.resultTag,
    });
  } catch {
    throw statusError(
      410,
      "가입 결과를 다시 확인할 수 없습니다. 로그인부터 다시 진행해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_EXPIRED"
    );
  }
}

async function completeNativeSocialRegistration(
  body = {},
  { failurePoint = "" } = {}
) {
  await ensureNativeSocialRegistrationIndexes();
  const profile = normalizeRegistrationProfile(body);
  const initial = await loadRegistrationTicket(
    body.registrationToken,
    body.codeVerifier
  );
  if (initial.ticket.status === "COMPLETED") {
    const replay = readStoredResult(initial.ticket, profile.fingerprint);
    if (replay) return replay;
  }
  if (initial.ticket.status !== "PENDING") {
    throw statusError(
      410,
      "사용할 수 없는 가입 요청입니다. 소셜 로그인을 다시 진행해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_EXPIRED"
    );
  }
  if (initial.ticket.existingUserId) {
    await assertAccountAllowed(initial.ticket.existingUserId);
  }

  const passwordHash = await bcrypt.hash(
    crypto.randomBytes(48).toString("base64url"),
    BCRYPT_ROUNDS
  );
  const session = await mongoose.startSession();
  let result = null;
  let completedUser = null;
  try {
    await session.withTransaction(async () => {
      result = null;
      completedUser = null;
      const loaded = await loadRegistrationTicket(
        body.registrationToken,
        body.codeVerifier,
        { session }
      );
      const { ticket, identity, appleAuthorization } = loaded;
      const replay = readStoredResult(ticket, profile.fingerprint);
      if (replay) {
        result = replay;
        return;
      }
      if (ticket.status !== "PENDING") {
        throw statusError(
          410,
          "사용할 수 없는 가입 요청입니다. 소셜 로그인을 다시 진행해주세요.",
          "NATIVE_SOCIAL_REGISTRATION_EXPIRED"
        );
      }

      // 트랜잭션 안에서 티켓 문서를 먼저 쓰면 같은 티켓의 동시 완료 요청이
      // 이 문서에서 충돌하고 재시도됩니다. 중간 PROCESSING 상태를 커밋하지
      // 않으므로 프로세스가 죽어도 티켓이 영구 정지하지 않습니다.
      ticket.completionAttempt =
        (Number(ticket.completionAttempt) || 0) + 1;
      await ticket.save({ session });

      const currentOwner = await findIdentityOwner(identity, { session });
      let user = null;
      if (ticket.existingUserId) {
        user = await User.findById(ticket.existingUserId)
          .select(SOCIAL_AUTH_SELECT)
          .session(session);
        if (!user) {
          throw statusError(
            409,
            "기존 계정 정보를 확인하지 못했습니다. 로그인부터 다시 진행해주세요.",
            "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
          );
        }
        if (currentOwner && String(currentOwner._id) !== String(user._id)) {
          throw statusError(
            409,
            "소셜 계정 연결 정보가 다른 계정과 충돌합니다.",
            "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
          );
        }
        const status = normalizedAccountStatus(user);
        if (status !== "active" || user.isActive === false) {
          throw statusError(
            403,
            accountBlockedMessage(status, user.accountStatusReason),
            "ACCOUNT_BLOCKED"
          );
        }
      } else {
        if (currentOwner) {
          throw statusError(
            409,
            "이미 연결된 계정이 있습니다. 로그인부터 다시 진행해주세요.",
            "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
          );
        }
        await assertNoParentConflict(identity, { session });
        user = new User({
          email: identity.emailVerified
            ? identity.email
            : providerPlaceholderEmail(
                identity.provider,
                identity.providerUserId
              ),
          passwordHash,
        });
      }

      if (identity.emailVerified) {
        const emailOwner = await User.findOne({
          email: identity.email,
          _id: { $ne: user._id },
        })
          .session(session)
          .lean();
        if (emailOwner) {
          throw statusError(
            409,
            "이미 가입된 이메일입니다. 기존 방식으로 로그인해주세요.",
            "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
          );
        }
        if (
          isProviderPlaceholderEmail(
            user.email,
            identity.provider,
            identity.providerUserId
          )
        ) {
          user.email = identity.email;
        }
        if (
          String(user.email || "").trim().toLowerCase() === identity.email
        ) {
          user.emailVerifiedAt = user.emailVerifiedAt || new Date();
        }
      }

      const isNewUser = user.isNew;
      const shouldApplyRegistrationProfile =
        isNewUser ||
        (
          user.role === "student" &&
          !isRegistrationComplete(user)
        );
      if (shouldApplyRegistrationProfile) {
        const nicknameOwner = await User.exists({
          _id: { $ne: user._id },
          $or: [
            { nameNormalized: nicknameKey(profile.name) },
            {
              name: {
                $regex: `^${profile.name.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                )}$`,
                $options: "i",
              },
            },
          ],
        }).session(session);
        if (nicknameOwner) {
          throw statusError(
            409,
            "이미 사용 중인 닉네임입니다.",
            "NICKNAME_EXISTS"
          );
        }

        user.set(
          registrationProfile(profile, new Date(), {
            includePreferences: isNewUser,
            existingUser: isNewUser ? null : user,
          })
        );
        if (
          !isNewUser &&
          (user.preferences?.dashboardTutorialStatus || "NOT_REQUIRED") ===
            "NOT_REQUIRED" &&
          !user.preferences?.dashboardTutorialCompletedAt &&
          !user.preferences?.dashboardTutorialSkippedAt
        ) {
          user.set(
            "preferences.dashboardTutorialStatus",
            "PENDING"
          );
        }
      } else {
        // 티켓 발급 뒤 다른 기기나 관리자가 프로필을 먼저 완성했거나 역할을
        // 바꾼 경우, 오래된 폼 입력으로 최신 정보를 되돌리지 않습니다.
        user.lastLoginAt = new Date();
      }
      user.set(providerIdPath(identity.provider), identity.providerUserId);
      await user.save({ session });
      if (failurePoint === "after-user") {
        throw new Error("NATIVE_SOCIAL_TEST_FAILURE_AFTER_USER");
      }

      if (identity.provider === "apple") {
        await storePreparedAppleAuthorization(
          {
            userId: user._id,
            subject: identity.providerUserId,
            prepared: appleAuthorization,
          },
          { session }
        );
      }
      if (failurePoint === "after-credential") {
        throw new Error("NATIVE_SOCIAL_TEST_FAILURE_AFTER_CREDENTIAL");
      }

      const code = await issueMobileAuthGrant(user._id, {
        codeChallenge: ticket.codeChallenge,
        session,
      });
      if (failurePoint === "after-grant") {
        throw new Error("NATIVE_SOCIAL_TEST_FAILURE_AFTER_GRANT");
      }
      result = { code };
      const encryptedResult = seal(ticket._id, "result", result);
      const completedAt = new Date();
      const resultExpiresAt = new Date(
        completedAt.getTime() + GRANT_TTL_MS
      );
      ticket.status = "COMPLETED";
      ticket.registrationFingerprint = profile.fingerprint;
      ticket.userId = user._id;
      ticket.resultCiphertext = encryptedResult.ciphertext;
      ticket.resultIv = encryptedResult.iv;
      ticket.resultTag = encryptedResult.tag;
      ticket.completedAt = completedAt;
      ticket.resultExpiresAt = resultExpiresAt;
      ticket.expiresAt = resultExpiresAt;
      await ticket.save({ session });
      if (failurePoint === "after-ticket") {
        throw new Error("NATIVE_SOCIAL_TEST_FAILURE_AFTER_TICKET");
      }
      await NativeSocialRegistrationTicket.updateMany(
        {
          _id: { $ne: ticket._id },
          provider: ticket.provider,
          identityDigest: ticket.identityDigest,
          status: "PENDING",
        },
        {
          $set: {
            status: "REVOKED",
            userId: user._id,
            expiresAt: resultExpiresAt,
          },
        },
        { session }
      );
      completedUser = shouldApplyRegistrationProfile ? user : null;
    });
  } catch (error) {
    if (error?.code === 11000) {
      const keys = Object.keys(error.keyPattern || {});
      if (keys.includes("nameNormalized")) {
        throw statusError(
          409,
          "이미 사용 중인 닉네임입니다.",
          "NICKNAME_EXISTS"
        );
      }
      if (keys.includes("email")) {
        throw statusError(
          409,
          "이미 가입된 이메일입니다. 기존 방식으로 로그인해주세요.",
          "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
        );
      }
      throw statusError(
        409,
        "이미 연결된 소셜 계정입니다. 로그인부터 다시 진행해주세요.",
        "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (completedUser) {
    await alertPotentialDuplicateIdentity(completedUser).catch((error) => {
      console.error(
        "동일인 중복 계정 관리자 알림 생성 실패:",
        error
      );
    });
  }
  if (!result?.code) {
    throw statusError(
      409,
      "가입 결과를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      "NATIVE_SOCIAL_REGISTRATION_IN_PROGRESS"
    );
  }
  return result;
}

module.exports = {
  PRIVACY_VERSION,
  TERMS_VERSION,
  TICKET_TTL_MS,
  completeNativeSocialRegistration,
  ensureNativeSocialRegistrationIndexes,
  startAppleNativeSocial,
  startKakaoNativeSocial,
  _testing: {
    CODE_CHALLENGE_PATTERN,
    CODE_VERIFIER_PATTERN,
    isRegistrationComplete,
    issueRegistrationTicket,
    normalizeRegistrationProfile,
    open,
    providerPlaceholderEmail,
    seal,
    startNativeSocialRegistration,
    verifierChallenge,
  },
};
