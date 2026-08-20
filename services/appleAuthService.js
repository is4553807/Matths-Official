const bcrypt = require("bcrypt");
const crypto = require("crypto");

const { User } = require("../models/matthsModel");
const {
  ParentAccount,
} = require("../models/parentModel");
const AppleAuthCredential = require(
  "../models/appleAuthCredentialModel"
);
const {
  getAcademicYear,
} = require("./userLifecycleService");
const {
  nicknameKey,
} = require("./nicknameService");

/*
 * Sign in with Apple 서버 교환입니다. 앱은 네이티브 시트(ASAuthorization)로 받은
 * identityToken 을 그대로 넘기고, 서버는 그것을 애플 공개키로 검증해 계정으로 바꿉니다.
 *
 * 구글과 모양이 다른 이유는 하나뿐입니다. 구글은 브라우저 왕복(PKCE + grant 저장소)을
 * 거치지만 애플은 시스템 시트가 이미 신원을 증명해 왔기 때문에, 우리가 할 일은
 * "이 토큰이 정말 애플이 발급했고, 정말 이번 요청에 대한 것인가" 를 확인하는 것뿐입니다.
 * 그래서 로그인 자체에는 client_secret(ES256)이 필요 없습니다 — 그 값은 탈퇴 시
 * 토큰 폐기에만 씁니다. 폐기 설정이 없어도 로그인은 계속 되어야 하므로 두 설정을
 * 분리해 둡니다(appleProviderStatus 의 configured / revocable).
 */

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`;
const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`;

/*
 * 사용자 문서에 애플 식별자를 남기는 경로입니다. 구글(socialAuth.googleId)과 같은
 * 자리를 쓰되, models/matthsModel.js 는 이 작업의 소유 범위 밖이라 스키마에 그 경로가
 * 있을 때만 기록합니다. 실제 조회 정본은 AppleAuthCredential 컬렉션입니다
 * (linkAppleIdentity 주석 참조).
 */
const APPLE_ID_PATH = "socialAuth.appleId";

const BCRYPT_ROUNDS = 12;
// 소셜 가입 경로(matthsController.js 의 register)와 같은 값이어야 한다. 두 경로가
// 서로 다른 약관 버전을 남기면 동의 이력 감사에서 같은 시점 가입자가 갈라진다.
const TERMS_VERSION = "2026-08-13";
const PRIVACY_VERSION = "2026-08-13";

// 시계 오차 허용치. 애플 서버와 우리 서버의 시간이 몇 초 어긋나는 것으로
// 정상 로그인을 떨구지 않되, 만료 토큰이 통과할 만큼 넉넉히 주지는 않는다.
const CLOCK_SKEW_SECONDS = 60;
// 모르는 kid 가 올 때마다 애플에 붙으면 잘못된 토큰 폭주가 그대로 외부 호출이 된다.
const JWKS_MIN_REFETCH_MS = 60 * 1000;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

/* --------------------------------------------------
 * 설정
 * -------------------------------------------------- */

function envValue(key) {
  return String(process.env[key] || "").trim();
}

function appleLoginConfig() {
  /*
   * aud 는 네이티브 앱의 번들 ID 입니다. 기본값을 코드에 박아 두면 환경변수 없이도
   * configured 가 true 가 되어, 앱이 "서버 준비됨" 으로 읽고 애플 시트를 띄웁니다.
   * 그 순서가 최악입니다 — 학생이 Face ID 까지 통과한 **뒤에** 교환에서 실패합니다.
   * 그래서 운영자가 값을 넣기 전까지는 꺼진 상태로 둡니다.
   */
  const audiences = envValue("APPLE_BUNDLE_ID")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return { audiences };
}

function appleRevokeConfig() {
  const bundleIds = appleLoginConfig().audiences;
  /*
   * 폐기 대상 client_id 는 **그 토큰을 발급한 주체**여야 합니다. 우리 코드는
   * 네이티브 앱이 받아 온 것이므로 기본값은 번들 ID 이고, 웹(Services ID)으로
   * 발급한 코드까지 폐기해야 할 때만 APPLE_SERVICES_ID 가 앞섭니다.
   */
  const clientId =
    envValue("APPLE_SERVICES_ID") || bundleIds[0] || "";
  const privateKey = envValue("APPLE_PRIVATE_KEY").replace(
    /\\n/g,
    "\n"
  );
  return {
    clientId,
    teamId: envValue("APPLE_TEAM_ID"),
    keyId: envValue("APPLE_KEY_ID"),
    privateKey,
  };
}

function isAppleLoginConfigured() {
  return appleLoginConfig().audiences.length > 0;
}

function isAppleRevokeConfigured() {
  const config = appleRevokeConfig();
  return Boolean(
    config.clientId &&
    config.teamId &&
    config.keyId &&
    config.privateKey
  );
}

/*
 * GET /auth/providers 에 실리는 한 줄입니다. 앱은 configured 가 true 일 때만
 * 애플 버튼을 그립니다. revocable 은 앱이 쓰지 않는 운영 정보입니다 —
 * 폐기 설정이 빠진 채 배포되면 탈퇴 시 심사 요구사항을 못 지키므로 드러내 둡니다.
 */
function appleProviderStatus() {
  return {
    key: "apple",
    label: "Apple",
    configured: isAppleLoginConfigured(),
    revocable: isAppleRevokeConfigured(),
  };
}

/* --------------------------------------------------
 * identityToken 검증
 * -------------------------------------------------- */

const jwksCache = {
  keys: [],
  fetchedAt: 0,
  inFlight: null,
};

function decodeSegment(segment) {
  return JSON.parse(
    Buffer.from(String(segment || ""), "base64url").toString("utf8")
  );
}

async function refreshAppleJwks(fetchImpl) {
  if (jwksCache.inFlight) return jwksCache.inFlight;
  jwksCache.inFlight = (async () => {
    const response = await fetchImpl(APPLE_JWKS_URL, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw statusError(
        502,
        "Apple 인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
        "APPLE_AUTH_JWKS_UNAVAILABLE"
      );
    }
    const body = await response.json();
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    if (!keys.length) {
      throw statusError(
        502,
        "Apple 인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
        "APPLE_AUTH_JWKS_UNAVAILABLE"
      );
    }
    jwksCache.keys = keys;
    jwksCache.fetchedAt = Date.now();
    return keys;
  })().finally(() => {
    jwksCache.inFlight = null;
  });
  return jwksCache.inFlight;
}

/*
 * 애플은 서명 키를 예고 없이 교체합니다. kid 가 캐시에 없으면 다시 받아야 하고,
 * 그러지 않으면 키 교체 당일 전원이 로그인하지 못합니다. 반대로 아무 kid 에나
 * 재조회하면 위조 토큰 하나로 외부 호출을 끌 수 있어 최소 간격을 둡니다.
 */
async function appleSigningKey(kid, fetchImpl) {
  if (!kid) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_TOKEN_MALFORMED"
    );
  }
  const cached = jwksCache.keys.find((key) => key.kid === kid);
  if (cached) return crypto.createPublicKey({ key: cached, format: "jwk" });

  if (Date.now() - jwksCache.fetchedAt < JWKS_MIN_REFETCH_MS) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_KEY_NOT_FOUND"
    );
  }

  const keys = await refreshAppleJwks(fetchImpl);
  const refreshed = keys.find((key) => key.kid === kid);
  if (!refreshed) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_KEY_NOT_FOUND"
    );
  }
  return crypto.createPublicKey({ key: refreshed, format: "jwk" });
}

function sha256Hex(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
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

/*
 * 앱(AppleSignInCoordinator)이 요청에 담은 값은 원본 nonce 의 SHA-256 **hex 소문자**
 * 이고, 애플은 그것을 토큰 안에 그대로 넣어 줍니다. 그래서 서버는 body 로 받은
 * 원본을 같은 방식으로 해싱해 대조합니다. 이 대조가 재생 공격 방어의 전부입니다 —
 * 빼면 남의 identityToken 을 주워 온 사람이 그대로 로그인합니다.
 */
async function verifyAppleIdentityToken(
  { identityToken, nonce } = {},
  { fetchImpl = fetch, now = Date.now() } = {}
) {
  const config = appleLoginConfig();
  if (!config.audiences.length) {
    throw statusError(
      503,
      "Apple 로그인이 아직 설정되지 않았습니다.",
      "SOCIAL_AUTH_NOT_CONFIGURED"
    );
  }

  const rawNonce = String(nonce || "").trim();
  if (!rawNonce) {
    throw statusError(
      400,
      "Apple 로그인 요청 정보가 올바르지 않습니다. 다시 시도해주세요.",
      "APPLE_AUTH_NONCE_REQUIRED"
    );
  }

  const segments = String(identityToken || "").split(".");
  if (segments.length !== 3) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_TOKEN_MALFORMED"
    );
  }

  let header;
  let claims;
  try {
    header = decodeSegment(segments[0]);
    claims = decodeSegment(segments[1]);
  } catch {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_TOKEN_MALFORMED"
    );
  }

  // alg 를 토큰이 정하게 두면 alg:none 이나 HS256(공개키를 비밀키로 쓰는 고전적인
  // 위조)이 통과한다. 애플이 쓰는 것만 받는다.
  if (header?.alg !== "RS256") {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_ALG_UNSUPPORTED"
    );
  }

  const publicKey = await appleSigningKey(header.kid, fetchImpl);
  const signatureValid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${segments[0]}.${segments[1]}`, "utf8"),
    publicKey,
    Buffer.from(segments[2], "base64url")
  );
  if (!signatureValid) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_SIGNATURE_INVALID"
    );
  }

  // 여기부터가 "애플이 서명한 값" 이다. 서명 확인 전 클레임은 아무 의미가 없으므로
  // 순서를 바꾸지 말 것.
  if (String(claims?.iss || "") !== APPLE_ISSUER) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_ISSUER_INVALID"
    );
  }

  const audiences = Array.isArray(claims?.aud)
    ? claims.aud.map((value) => String(value))
    : [String(claims?.aud || "")];
  if (!audiences.some((value) => config.audiences.includes(value))) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_AUDIENCE_INVALID"
    );
  }

  const nowSeconds = Math.floor(now / 1000);
  const expiresAt = Number(claims?.exp);
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt + CLOCK_SKEW_SECONDS <= nowSeconds
  ) {
    throw statusError(
      401,
      "Apple 로그인 정보가 만료되었습니다. 다시 시도해주세요.",
      "APPLE_AUTH_TOKEN_EXPIRED"
    );
  }
  const issuedAt = Number(claims?.iat);
  if (
    !Number.isFinite(issuedAt) ||
    issuedAt - CLOCK_SKEW_SECONDS > nowSeconds
  ) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_TOKEN_NOT_YET_VALID"
    );
  }

  if (!safeEqual(String(claims?.nonce || ""), sha256Hex(rawNonce))) {
    throw statusError(
      401,
      "Apple 로그인 요청을 확인하지 못했습니다. 다시 시도해주세요.",
      "APPLE_AUTH_NONCE_MISMATCH"
    );
  }

  const subject = String(claims?.sub || "").trim();
  if (!subject) {
    throw statusError(
      401,
      "Apple 로그인 정보를 확인하지 못했습니다.",
      "APPLE_AUTH_SUBJECT_MISSING"
    );
  }

  return {
    subject,
    email: String(claims?.email || "").trim().toLowerCase(),
    // 애플은 email_verified 를 불린으로도 문자열로도 보낸다.
    emailVerified:
      claims?.email_verified === true ||
      claims?.email_verified === "true",
    isPrivateEmail:
      claims?.is_private_email === true ||
      claims?.is_private_email === "true",
  };
}

/* --------------------------------------------------
 * 계정 연결
 * -------------------------------------------------- */

/*
 * 애플이 이메일을 주지 않는 경우(비공개 이메일 거부, 두 번째 기기 로그인 등)에도
 * 계정은 만들어져야 합니다. email 은 스키마 필수이자 앱의 로컬 슬롯 키라
 * 비워 둘 수 없으므로, sub 에서 결정적으로 만든 자리표시자를 넣습니다.
 * 탈퇴 계정이 쓰는 @anonymous.invalid 와 같은 예약 TLD 라 실제로 발송되지 않습니다.
 */
function placeholderEmail(subject) {
  return `apple.${sha256Hex(subject).slice(0, 24)}@appleid.invalid`;
}

function randomNickname() {
  // 실명을 닉네임으로 쓰지 않는다. 랭킹·게시판에 그대로 노출되는 값이라,
  // 애플이 준 이름을 여기에 넣으면 학생이 고르지도 않은 실명이 공개된다.
  return `학생${crypto.randomInt(100000, 1000000)}`;
}

function userSupportsAppleIdPath() {
  return Boolean(User.schema.path(APPLE_ID_PATH));
}

/*
 * 사용자 스키마에 appleId 경로가 생기면 구글과 같은 자리에도 남깁니다.
 * 지금은 그 경로가 없어(모델 파일이 이 작업의 소유 범위 밖) 조용히 건너뜁니다 —
 * strict 스키마에서는 없는 경로에 set 해도 저장되지 않으므로, 저장된 척하는
 * 코드를 남기는 것보다 조건을 드러내는 편이 낫습니다.
 */
function mirrorAppleIdOnUser(user, subject) {
  if (!userSupportsAppleIdPath()) return;
  user.set(APPLE_ID_PATH, subject);
}

async function createAppleUser({ subject, claims, fullName, email }) {
  const passwordHash = await bcrypt.hash(
    crypto.randomBytes(48).toString("base64url"),
    BCRYPT_ROUNDS
  );

  // 닉네임 중복은 유니크 인덱스가 잡는다. 조회 후 생성 사이의 경합은 남으므로
  // 실패하면 다른 번호로 다시 만든다.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nickname = randomNickname();
    try {
      const user = new User({
        realName: fullName || "",
        name: nickname,
        nameNormalized: nicknameKey(nickname),
        email,
        passwordHash,
        emailVerifiedAt: claims.emailVerified ? new Date() : null,
        lastGradePromotionYear: getAcademicYear(),
        lastLoginAt: new Date(),
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
      mirrorAppleIdOnUser(user, subject);
      await user.save();
      return user;
    } catch (error) {
      const duplicateKeys = Object.keys(error?.keyPattern || {});
      if (error?.code === 11000 && duplicateKeys.includes("email")) {
        // 같은 이메일이 방금 다른 경로로 가입한 경우다. 여기서 다시 조회해
        // 덮어쓰기를 시도하면 남의 계정을 애플 계정에 붙이게 된다.
        throw statusError(
          409,
          "이미 가입된 이메일입니다. 기존 방식으로 로그인해주세요.",
          "SOCIAL_AUTH_ACCOUNT_CONFLICT"
        );
      }
      if (
        error?.code !== 11000 ||
        !duplicateKeys.includes("nameNormalized")
      ) {
        throw error;
      }
    }
  }

  throw statusError(
    503,
    "지금은 계정을 만들 수 없습니다. 잠시 후 다시 시도해주세요.",
    "APPLE_AUTH_NICKNAME_UNAVAILABLE"
  );
}

/*
 * 애플 계정 하나가 우리 계정 하나에 붙는 지점입니다.
 *
 * 조회 정본이 User.socialAuth.appleId 가 아니라 AppleAuthCredential 인 이유:
 * 사용자 스키마 파일은 이 작업의 소유 범위 밖이라 새 경로를 추가할 수 없습니다.
 * 자격 증명 컬렉션은 appleSubject 와 userId 가 각각 유니크라 같은 보장을 줍니다
 * (한 애플 계정 → 한 사용자, 한 사용자 → 한 애플 계정).
 */
async function linkAppleIdentity({ claims, fullName }) {
  const subject = claims.subject;
  const providedName = String(fullName || "").trim().slice(0, 40);
  /*
   * 이름·이메일은 애플이 **최초 승인 1회만** 줍니다. 두 번째 로그인부터는 없으므로
   * 지금 받은 것은 지금 저장해야 하고, 반대로 없는 값으로 기존 값을 덮으면
   * 다시 채울 방법이 영영 없습니다. 그래서 아래는 전부 "비어 있을 때만 채운다" 입니다.
   */
  /*
   * **body 의 email 은 절대 쓰지 않는다.**
   *
   * 전에는 `claims.email || body.email` 이었다. 애플 토큰에 email 클레임이 없는
   * 경우(앱이 .email scope 를 안 받았거나 Work&School 계정)에 요청 body 의
   * 미검증 이메일이 그대로 계정 연결 키가 됐고, 아래에서 그 이메일로 기존 User 를
   * 찾아 요청자의 애플 sub 를 붙였다. 즉 공격자가 **자기 애플 계정으로 서명·aud·
   * nonce·exp 를 전부 통과하는 진짜 토큰**을 받은 뒤 body 에 피해자 이메일만 넣으면
   * 그 계정을 가져갈 수 있었다. 매핑이 영구 저장되므로 진짜 소유자는 자기 애플 ID 를
   * 다시는 연결하지 못한다.
   *
   * 구글 경로에는 이 구멍이 없다 — 이메일이 오직 IdP 프로필에서만 온다.
   * 여기도 같은 규칙을 쓴다. 토큰이 주지 않은 이메일은 존재하지 않는 것으로 본다.
   */
  const providedEmail = claims.email || "";

  const credential = await AppleAuthCredential.findOne({
    appleSubject: subject,
  }).select("+appleSubject");

  let user = credential
    ? await User.findById(credential.userId)
    : null;

  if (credential && !user) {
    // 계정이 완전 삭제(purge)된 뒤 같은 애플 계정으로 다시 들어온 경우다.
    // 고아 자격 증명을 남겨 두면 새 가입이 유니크 인덱스에 막힌다.
    await AppleAuthCredential.deleteOne({ _id: credential._id });
  }

  /*
   * 기존 계정에 붙이려면 **애플이 검증한** 이메일이어야 한다.
   * 구글 경로가 socialAuthService.assertVerifiedProfile 에서 email_verified 를
   * 강제하는 것과 같은 규칙이다. 미검증 이메일은 신규 생성 때 값으로만 쓰고
   * 연결 키로는 쓰지 않는다 — 이메일 소유 증명이 없는 값으로 남의 계정에
   * 붙는 길을 열어 두면 위 탈취 경로가 형태만 바꿔 되살아난다.
   */
  if (!user && providedEmail && claims.emailVerified === true) {
    user = await User.findOne({ email: providedEmail });
    if (user) {
      const conflicting = await AppleAuthCredential.findOne({
        userId: user._id,
      }).select("+appleSubject");
      if (conflicting && conflicting.appleSubject !== subject) {
        throw statusError(
          409,
          "이미 다른 Apple 계정이 연결된 이메일입니다.",
          "SOCIAL_AUTH_ACCOUNT_CONFLICT"
        );
      }
    }
  }

  let created = false;
  if (!user) {
    /*
     * 학부모 계정과 같은 이메일이면 학생 계정을 새로 만들지 않는다. 구글 콜백의
     * 같은 관문(SOCIAL_AUTH_PARENT_ACCOUNT)과 이유가 같다 — 학부모가 자기 이메일로
     * 애플 로그인을 누르면 학생 계정이 하나 더 생기고, 그쪽이 진짜 계정처럼 보인다.
     */
    if (
      providedEmail &&
      (await ParentAccount.exists({
        email: providedEmail,
        isActive: true,
      }))
    ) {
      throw statusError(
        409,
        "같은 이메일의 학부모 계정이 있습니다. 학부모 로그인 방식을 이용해주세요.",
        "SOCIAL_AUTH_PARENT_ACCOUNT"
      );
    }
    user = await createAppleUser({
      subject,
      claims,
      fullName: providedName,
      email: providedEmail || placeholderEmail(subject),
    });
    created = true;
  } else {
    if (providedName && !String(user.realName || "").trim()) {
      user.realName = providedName;
    }
    if (claims.emailVerified && !user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
    }
    mirrorAppleIdOnUser(user, subject);
    user.lastLoginAt = new Date();
    await user.save();
  }

  try {
    await AppleAuthCredential.updateOne(
      { appleSubject: subject },
      { $set: { userId: user._id } },
      { upsert: true }
    );
  } catch (error) {
    // userId 유니크 위반 = 그 계정에 이미 **다른** 애플 계정이 붙어 있다는 뜻이다.
    // 조용히 넘기면 두 애플 계정이 한 계정을 두고 번갈아 로그인하게 된다.
    if (error?.code === 11000) {
      throw statusError(
        409,
        "이미 다른 Apple 계정이 연결된 계정입니다.",
        "SOCIAL_AUTH_ACCOUNT_CONFLICT"
      );
    }
    throw error;
  }

  return { user, created };
}

/* --------------------------------------------------
 * 폐기용 자격 증명 보관
 * -------------------------------------------------- */

function credentialCipherKey() {
  const secret =
    process.env.API_TOKEN_SECRET || process.env.SECRET;
  if (!secret) {
    throw new Error(
      "API_TOKEN_SECRET 또는 SECRET 환경 변수가 필요합니다."
    );
  }
  return crypto
    .createHash("sha256")
    .update("matths-apple-auth-credential-v1\0")
    .update(String(secret))
    .digest();
}

function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    credentialCipherKey(),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function open(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return "";
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      credentialCipherKey(),
      Buffer.from(parts[1], "base64url")
    );
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // 시크릿이 바뀌었거나 값이 훼손된 경우다. 폐기만 못 할 뿐 로그인·탈퇴는
    // 계속되어야 하므로 예외로 올리지 않는다.
    return "";
  }
}

function appleClientSecret(config, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const header = {
    alg: "ES256",
    kid: config.keyId,
    typ: "JWT",
  };
  const payload = {
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + 300,
    aud: APPLE_ISSUER,
    sub: config.clientId,
  };
  const encode = (value) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  // 애플은 JWS 규격의 R||S 서명을 요구한다. 노드 기본값은 DER 이라 그대로 보내면
  // invalid_client 만 돌아온다.
  const signature = crypto.sign(
    "sha256",
    Buffer.from(signingInput, "utf8"),
    {
      key: crypto.createPrivateKey(config.privateKey),
      dsaEncoding: "ieee-p1363",
    }
  );
  return `${signingInput}.${signature.toString("base64url")}`;
}

async function exchangeAuthorizationCode(
  authorizationCode,
  { fetchImpl = fetch } = {}
) {
  const config = appleRevokeConfig();
  const response = await fetchImpl(APPLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(authorizationCode),
      client_id: config.clientId,
      client_secret: appleClientSecret(config),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.refresh_token) {
    return {
      refreshToken: "",
      error: String(body?.error || `HTTP_${response.status}`),
    };
  }
  return { refreshToken: String(body.refresh_token), error: "" };
}

/*
 * 로그인마다 authorizationCode 를 받아 둡니다. 다만 이 코드는 5분짜리 1회용이라
 * 몇 달 뒤 탈퇴 시점에는 이미 죽어 있습니다. 그래서 **받은 자리에서** refresh_token
 * 으로 바꿔 둡니다 — 폐기(revoke)가 실제로 쓰는 값은 그쪽입니다.
 * 폐기 설정이 없는 배포에서는 교환을 건너뛰고 코드만 남깁니다(로그인은 계속 된다).
 */
async function rememberAppleAuthorization(
  { userId, subject, authorizationCode },
  { fetchImpl = fetch } = {}
) {
  const code = String(authorizationCode || "").trim();
  if (!code) return { stored: false, exchanged: false };

  const update = {
    userId,
    authorizationCode: seal(code),
    authorizationCodeIssuedAt: new Date(),
  };

  let exchanged = false;
  if (isAppleRevokeConfigured()) {
    try {
      const { refreshToken } = await exchangeAuthorizationCode(code, {
        fetchImpl,
      });
      if (refreshToken) {
        update.refreshToken = seal(refreshToken);
        update.refreshTokenIssuedAt = new Date();
        exchanged = true;
      }
    } catch (error) {
      // 로그인을 애플 토큰 엔드포인트 장애에 묶지 않는다. 폐기 자료가 없다는
      // 사실만 남기고 로그인은 그대로 성립시킨다.
      console.warn(
        `[apple-auth] refresh token 교환 실패: ${error?.message || error}`
      );
    }
  }

  await AppleAuthCredential.updateOne(
    { appleSubject: subject },
    { $set: update },
    { upsert: true }
  );
  return { stored: true, exchanged };
}

/* --------------------------------------------------
 * 진입점
 * -------------------------------------------------- */

async function exchangeAppleIdentity(
  // body 의 email 은 **의도적으로 받지 않는다.** 이메일은 오직 검증된 토큰
  // 클레임에서만 온다(linkAppleIdentity 주석 참조 — 계정 탈취 경로였다).
  // 앱이 보내더라도 여기서 버려진다.
  { identityToken, authorizationCode, nonce, fullName } = {},
  { fetchImpl = fetch, now = Date.now() } = {}
) {
  const claims = await verifyAppleIdentityToken(
    { identityToken, nonce },
    { fetchImpl, now }
  );
  const { user, created } = await linkAppleIdentity({
    claims,
    fullName,
  });

  try {
    await rememberAppleAuthorization(
      {
        userId: user._id,
        subject: claims.subject,
        authorizationCode,
      },
      { fetchImpl }
    );
  } catch (error) {
    // 폐기 자료 보관 실패로 로그인을 막지 않는다. 탈퇴 때 폐기가 안 될 뿐이고,
    // 그건 revokeAppleTokens 가 사유와 함께 남긴다.
    console.warn(
      `[apple-auth] 자격 증명 보관 실패: ${error?.message || error}`
    );
  }

  return { user, created, claims };
}

/*
 * 탈퇴 시 애플 토큰 폐기. **심사 요구사항**이라 탈퇴 흐름에서 반드시 불려야 합니다
 * (services/accountDeletionService.js 의 withdrawUserAccount 진입부 — 사용자 문서를
 * 지우기 전에 불러야 자격 증명을 찾을 수 있습니다).
 *
 * 어떤 이유로도 예외를 올리지 않습니다. 애플 장애로 탈퇴가 막히면 그것이 더 큰
 * 위반입니다. 실패는 사유를 문서에 남기고 false 로 돌려줍니다.
 */
async function revokeAppleTokens(userId, { fetchImpl = fetch } = {}) {
  try {
    const credential = await AppleAuthCredential.findOne({ userId })
      .select("+appleSubject +refreshToken +authorizationCode");
    if (!credential) return { revoked: false, reason: "NO_CREDENTIAL" };
    if (credential.revokedAt) {
      return { revoked: true, reason: "ALREADY_REVOKED" };
    }

    const noteFailure = async (reason) => {
      await AppleAuthCredential.updateOne(
        { _id: credential._id },
        {
          $set: {
            lastRevokeError: reason,
            lastRevokeAttemptedAt: new Date(),
          },
        }
      );
      return { revoked: false, reason };
    };

    if (!isAppleRevokeConfigured()) {
      return noteFailure("NOT_CONFIGURED");
    }

    let token = open(credential.refreshToken);
    const tokenTypeHint = "refresh_token";
    if (!token) {
      // refresh_token 이 없으면 남아 있는 authorizationCode 로 마지막 시도를 한다.
      // 5분이 지났으면 실패하지만, 가입 직후 탈퇴 같은 경우는 이쪽으로 살아난다.
      const code = open(credential.authorizationCode);
      if (!code) return noteFailure("NO_TOKEN");
      const exchange = await exchangeAuthorizationCode(code, { fetchImpl });
      if (!exchange.refreshToken) {
        return noteFailure(`CODE_EXCHANGE_FAILED:${exchange.error}`);
      }
      token = exchange.refreshToken;
    }

    const config = appleRevokeConfig();
    const response = await fetchImpl(APPLE_REVOKE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: appleClientSecret(config),
        token,
        token_type_hint: tokenTypeHint,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return noteFailure(
        `REVOKE_FAILED:${String(body?.error || `HTTP_${response.status}`)}`
      );
    }

    await AppleAuthCredential.updateOne(
      { _id: credential._id },
      {
        $set: {
          revokedAt: new Date(),
          lastRevokeError: null,
          lastRevokeAttemptedAt: new Date(),
        },
        $unset: { refreshToken: 1, authorizationCode: 1 },
      }
    );
    return { revoked: true, reason: "" };
  } catch (error) {
    console.warn(
      `[apple-auth] 토큰 폐기 실패: ${error?.message || error}`
    );
    return {
      revoked: false,
      reason: `ERROR:${String(error?.message || error).slice(0, 120)}`,
    };
  }
}

/*
 * 완전 삭제(purge) 경로용입니다. 익명 보존 탈퇴는 감사 흔적을 남겨야 하므로
 * 문서를 지우지 않지만, 사용자 문서 자체를 지우는 경로에서는 이 행도 같이
 * 지워야 합니다 — 남겨 두면 같은 애플 계정의 재가입이 유니크 인덱스에 막힙니다.
 */
async function forgetAppleCredential(userId) {
  await AppleAuthCredential.deleteOne({ userId });
}

module.exports = {
  APPLE_ID_PATH,
  appleProviderStatus,
  exchangeAppleIdentity,
  forgetAppleCredential,
  isAppleLoginConfigured,
  isAppleRevokeConfigured,
  revokeAppleTokens,
  verifyAppleIdentityToken,
  _testing: {
    APPLE_JWKS_URL,
    appleClientSecret,
    linkAppleIdentity,
    placeholderEmail,
    rememberAppleAuthorization,
    resetJwksCache: () => {
      jwksCache.keys = [];
      jwksCache.fetchedAt = 0;
      jwksCache.inFlight = null;
    },
    expireJwksCache: () => {
      jwksCache.fetchedAt = Date.now() - JWKS_MIN_REFETCH_MS - 1;
    },
    seal,
    open,
    sha256Hex,
  },
};
