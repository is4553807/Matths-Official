const crypto = require("node:crypto");

const {
  verifyAppleIdentityToken,
  exchangeAuthorizationCode,
  sealAppleCredential,
} = require("./appleAuthService");

const APPLE_AUTHORIZE_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_WEB_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

function envValue(environment, key) {
  return String(environment?.[key] || "").trim();
}

function appleWebConfig(environment = process.env) {
  const publicBaseUrl = envValue(environment, "PUBLIC_BASE_URL").replace(
    /\/$/,
    "",
  );
  const expectedRedirectUri = publicBaseUrl
    ? `${publicBaseUrl}/auth/apple/callback`
    : "";
  const redirectUri =
    envValue(environment, "APPLE_OAUTH_REDIRECT_URI") || expectedRedirectUri;
  const privateKey = envValue(environment, "APPLE_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );
  const stateSecrets = [
    envValue(environment, "APPLE_OAUTH_STATE_SECRET"),
    envValue(environment, "API_TOKEN_SECRET"),
    envValue(environment, "SECRET"),
  ];

  return {
    clientId: envValue(environment, "APPLE_SERVICES_ID"),
    redirectUri,
    expectedRedirectUri,
    teamId: envValue(environment, "APPLE_TEAM_ID"),
    keyId: envValue(environment, "APPLE_KEY_ID"),
    privateKey,
    // 별도 키가 짧게 잘못 등록돼도 이미 강도 검증된 SECRET이 있으면 웹 로그인을
    // 불필요하게 끄지 않는다. 32자 이상인 첫 후보를 사용한다.
    stateSecret:
      stateSecrets.find((value) => value.length >= 32) ||
      stateSecrets.find(Boolean) ||
      "",
  };
}

function isAppleWebConfigured(environment = process.env) {
  const config = appleWebConfig(environment);
  return Boolean(
    config.clientId &&
    config.redirectUri &&
    config.redirectUri === config.expectedRedirectUri &&
    config.teamId &&
    config.keyId &&
    config.privateKey &&
    config.stateSecret.length >= 32,
  );
}

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function assertConfigured(environment = process.env) {
  if (!isAppleWebConfigured(environment)) {
    throw statusError(
      503,
      "웹 Apple 로그인이 아직 설정되지 않았습니다.",
      "SOCIAL_AUTH_NOT_CONFIGURED",
    );
  }
  return appleWebConfig(environment);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function stateSignature(encodedPayload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function issueState(config, now = Date.now(), context = {}) {
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      issuedAt: now,
      nonce: crypto.randomBytes(32).toString("base64url"),
      requestId: crypto.randomBytes(16).toString("base64url"),
      ...(context.nativePortal === true && /^[A-Za-z0-9_-]{43}$/.test(context.codeChallenge || "")
        ? { nativePortal: true, codeChallenge: context.codeChallenge } : {}),
      accountType: ["academy", "parent"].includes(context.accountType)
        ? context.accountType
        : "student",
      inviteToken: /^[A-Za-z0-9_-]{1,512}$/.test(
        String(context.inviteToken || ""),
      )
        ? context.inviteToken
        : "",
      registrationFlow: context.registrationFlow === "staff" ? "staff" : "new",
      next: /^\/(?!\/)[^\\\r\n]*$/.test(String(context.next || ""))
        ? String(context.next).slice(0, 2048)
        : "",
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${stateSignature(payload, config.stateSecret)}`;
}

function consumeState(rawState, config, now = Date.now()) {
  const [payload, signature, extra] = String(rawState || "").split(".");
  if (
    !payload ||
    !signature ||
    extra !== undefined ||
    !safeEqual(signature, stateSignature(payload, config.stateSecret))
  ) {
    throw statusError(
      400,
      "Apple 로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.",
      "SOCIAL_AUTH_STATE_INVALID",
    );
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (_error) {
    decoded = null;
  }
  const age = now - Number(decoded?.issuedAt || 0);
  if (
    decoded?.version !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(String(decoded?.nonce || "")) ||
    age < -CLOCK_SKEW_MS ||
    age > APPLE_WEB_STATE_MAX_AGE_MS
  ) {
    throw statusError(
      400,
      "Apple 로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.",
      "SOCIAL_AUTH_STATE_INVALID",
    );
  }
  return decoded;
}

function beginAppleWebAuthorization({
  environment = process.env,
  now = Date.now(),
  ...context
} = {}) {
  const config = assertConfigured(environment);
  const state = issueState(config, now, context);
  const decodedState = consumeState(state, config, now);
  const authorizationUrl = new URL(APPLE_AUTHORIZE_URL);
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code id_token");
  authorizationUrl.searchParams.set("response_mode", "form_post");
  authorizationUrl.searchParams.set("scope", "name email");
  authorizationUrl.searchParams.set("state", state);
  // 원본 nonce 는 서명된 state 안에만 두고 Apple에는 해시만 보낸다. 콜백에서
  // identity token 의 nonce 클레임과 다시 대조해 토큰 재생을 막는다.
  authorizationUrl.searchParams.set(
    "nonce",
    crypto.createHash("sha256").update(decodedState.nonce).digest("hex"),
  );
  return authorizationUrl.toString();
}

function appleFullName(rawUser) {
  if (!rawUser || String(rawUser).length > 4096) return "";
  try {
    const user = typeof rawUser === "string" ? JSON.parse(rawUser) : rawUser;
    return [user?.name?.firstName, user?.name?.lastName]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 40);
  } catch (_error) {
    return "";
  }
}

async function completeAppleWebAuthorization(
  { code, identityToken, state, user, error } = {},
  {
    environment = process.env,
    fetchImpl = fetch,
    now = Date.now(),
    exchangeImpl = verifyWebIdentity,
  } = {},
) {
  const config = assertConfigured(environment);
  const statePayload = consumeState(state, config, now);
  try {
    if (error || !code || !identityToken) {
      throw statusError(
        400,
        "Apple 로그인이 취소되었습니다.",
        "SOCIAL_AUTH_CANCELLED",
      );
    }

    const result = await exchangeImpl(
      {
        identityToken,
        authorizationCode: code,
        nonce: statePayload.nonce,
        fullName: appleFullName(user),
        redirectUri: config.redirectUri,
        clientId: config.clientId,
      },
      { fetchImpl, now },
    );
    return { ...result, context: statePayload };
  } catch (failure) {
    failure.context = statePayload;
    throw failure;
  }
}

// A web authorization proves identity only. It must not create a student before
// the callback has resolved the existing account or the signed signup portal.
async function verifyWebIdentity(input, { fetchImpl, now }) {
  const claims = await verifyAppleIdentityToken(input, { fetchImpl, now });
  if (claims.audience !== input.clientId)
    throw statusError(
      401,
      "Apple 웹 인증 대상이 올바르지 않습니다.",
      "SOCIAL_AUTH_ACCOUNT_CONFLICT",
    );
  if (!claims.emailVerified || !claims.email)
    throw statusError(
      400,
      "Apple 계정에서 검증된 이메일을 제공해주세요.",
      "SOCIAL_AUTH_EMAIL_REQUIRED",
    );
  // Fail closed: Apple consumes a code once, preventing replay of signed state.
  const exchanged = await exchangeAuthorizationCode(input.authorizationCode, {
    fetchImpl,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
  });
  if (!exchanged.refreshToken)
    throw statusError(
      401,
      "Apple 인증 코드가 만료되었거나 사용되었습니다. 다시 로그인해주세요.",
      "SOCIAL_AUTH_STATE_INVALID",
    );
  const exchangedClaims = await verifyAppleIdentityToken(
    { identityToken: exchanged.identityToken, nonce: input.nonce },
    { fetchImpl, now },
  );
  if (
    exchangedClaims.subject !== claims.subject ||
    exchangedClaims.audience !== input.clientId
  )
    throw statusError(
      401,
      "Apple 인증 코드와 계정이 일치하지 않습니다.",
      "SOCIAL_AUTH_ACCOUNT_CONFLICT",
    );
  return {
    claims,
    profile: {
      provider: "apple",
      providerUserId: claims.subject,
      email: claims.email,
      emailVerified: true,
      displayName: input.fullName,
      appleAuthorization: {
        authorizationCode: sealAppleCredential(input.authorizationCode),
        refreshToken: sealAppleCredential(exchanged.refreshToken),
        appleClientId: input.clientId,
        issuedAt: new Date(now).toISOString(),
      },
    },
  };
}

function appleWebProviderStatus(environment = process.env) {
  const config = appleWebConfig(environment);
  return {
    webConfigured: isAppleWebConfigured(environment),
    webRedirectUri: config.expectedRedirectUri,
  };
}

module.exports = {
  appleWebProviderStatus,
  beginAppleWebAuthorization,
  completeAppleWebAuthorization,
  isAppleWebConfigured,
  _testing: {
    APPLE_AUTHORIZE_URL,
    APPLE_WEB_STATE_MAX_AGE_MS,
    appleFullName,
    appleWebConfig,
    consumeState,
    issueState,
  },
};
