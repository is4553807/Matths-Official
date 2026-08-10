const crypto = require("crypto");

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SOCIAL_REGISTRATION_MAX_AGE_MS = 30 * 60 * 1000;

const PROVIDERS = Object.freeze({
  google: {
    key: "google",
    label: "Google",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_OAUTH_REDIRECT_URI",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
});

function providerConfig(provider) {
  const definition = PROVIDERS[String(provider || "").toLowerCase()];
  if (!definition) {
    const error = new Error("지원하지 않는 소셜 로그인 방식입니다.");
    error.status = 404;
    error.code = "SOCIAL_AUTH_PROVIDER_NOT_FOUND";
    throw error;
  }
  return {
    ...definition,
    clientId: String(process.env[definition.clientIdEnv] || "").trim(),
    clientSecret: String(process.env[definition.clientSecretEnv] || "").trim(),
    redirectUri: String(process.env[definition.redirectUriEnv] || "").trim(),
  };
}

function publicProviderStatus() {
  return Object.values(PROVIDERS).map((provider) => {
    const config = providerConfig(provider.key);
    return {
      key: provider.key,
      label: provider.label,
      configured: Boolean(config.clientId && config.redirectUri),
    };
  });
}

function assertConfigured(config) {
  if (!config.clientId || !config.redirectUri) {
    const error = new Error(`${config.label} 로그인이 아직 설정되지 않았습니다.`);
    error.status = 503;
    error.code = "SOCIAL_AUTH_NOT_CONFIGURED";
    throw error;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function beginSocialAuthorization(req, provider) {
  const config = providerConfig(provider);
  assertConfigured(config);
  const state = randomToken();
  req.session.socialOAuthState = {
    provider: config.key,
    state,
    createdAt: Date.now(),
  };

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", config.scope);
  if (config.key === "google") {
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

function consumeAndVerifyState(req, provider, state) {
  const saved = req.session?.socialOAuthState;
  delete req.session.socialOAuthState;
  const valid =
    saved &&
    saved.provider === provider &&
    Date.now() - Number(saved.createdAt || 0) <= OAUTH_STATE_MAX_AGE_MS &&
    safeEqual(saved.state, state);
  if (!valid) {
    const error = new Error("소셜 로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.");
    error.status = 400;
    error.code = "SOCIAL_AUTH_STATE_INVALID";
    throw error;
  }
}

async function responseJson(response, providerLabel, step) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${providerLabel} ${step}에 실패했습니다.`);
    error.status = 502;
    error.code = "SOCIAL_AUTH_PROVIDER_ERROR";
    error.providerResponse = body;
    throw error;
  }
  return body;
}

async function exchangeCode(config, code, fetchImpl = fetch) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code: String(code || ""),
  });
  if (config.clientSecret) body.set("client_secret", config.clientSecret);
  const response = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
  });
  const token = await responseJson(response, config.label, "인증");
  if (!token.access_token) {
    const error = new Error(`${config.label}에서 로그인 토큰을 받지 못했습니다.`);
    error.status = 502;
    error.code = "SOCIAL_AUTH_TOKEN_MISSING";
    throw error;
  }
  return token;
}

async function fetchProviderProfile(config, accessToken, fetchImpl = fetch) {
  const response = await fetchImpl(config.profileUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const raw = await responseJson(response, config.label, "계정 조회");
  return {
    provider: config.key,
    providerUserId: String(raw.sub || ""),
    email: String(raw.email || "").trim().toLowerCase(),
    emailVerified: raw.email_verified === true,
    displayName: String(raw.name || "").trim(),
  };
}

function assertVerifiedProfile(profile) {
  if (!profile.providerUserId || !profile.email || !profile.emailVerified) {
    const error = new Error(
      "소셜 계정에서 검증된 이메일을 확인하지 못했습니다. 이메일 제공 동의를 확인해주세요."
    );
    error.status = 400;
    error.code = "SOCIAL_AUTH_EMAIL_REQUIRED";
    throw error;
  }
  return profile;
}

async function completeSocialAuthorization(req, provider, { code, state }, fetchImpl = fetch) {
  const config = providerConfig(provider);
  assertConfigured(config);
  consumeAndVerifyState(req, config.key, state);
  if (!code) {
    const error = new Error(`${config.label} 로그인이 취소되었거나 인증 코드가 없습니다.`);
    error.status = 400;
    error.code = "SOCIAL_AUTH_CODE_MISSING";
    throw error;
  }
  const token = await exchangeCode(config, code, fetchImpl);
  return assertVerifiedProfile(
    await fetchProviderProfile(config, token.access_token, fetchImpl)
  );
}

function setPendingSocialRegistration(req, profile) {
  req.session.pendingSocialRegistration = {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    email: profile.email,
    displayName: profile.displayName,
    createdAt: Date.now(),
  };
}

function getPendingSocialRegistration(req) {
  const pending = req.session?.pendingSocialRegistration;
  if (
    !pending ||
    !PROVIDERS[pending.provider] ||
    !pending.providerUserId ||
    !pending.email ||
    Date.now() - Number(pending.createdAt || 0) > SOCIAL_REGISTRATION_MAX_AGE_MS
  ) {
    if (req.session) delete req.session.pendingSocialRegistration;
    return null;
  }
  return {
    ...pending,
    providerLabel: PROVIDERS[pending.provider].label,
  };
}

function clearPendingSocialRegistration(req) {
  if (req.session) delete req.session.pendingSocialRegistration;
}

function socialIdPath(provider) {
  if (provider === "google") return "socialAuth.googleId";
  throw new Error("지원하지 않는 소셜 로그인 방식입니다.");
}

module.exports = {
  beginSocialAuthorization,
  clearPendingSocialRegistration,
  completeSocialAuthorization,
  getPendingSocialRegistration,
  publicProviderStatus,
  setPendingSocialRegistration,
  socialIdPath,
  _testing: {
    consumeAndVerifyState,
    fetchProviderProfile,
    safeEqual,
  },
};
