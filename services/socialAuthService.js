const crypto = require("crypto");

const {
  appleProviderStatus,
} = require("./appleAuthService");

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SOCIAL_REGISTRATION_MAX_AGE_MS = 30 * 60 * 1000;

const PROVIDERS = Object.freeze({
  google: {
    key: "google",
    label: "Google",
    idPath: "socialAuth.googleId",
    testEnvPrefix: "GOOGLE_OAUTH",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_OAUTH_REDIRECT_URI",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
  kakao: {
    key: "kakao",
    label: "카카오",
    idPath: "socialAuth.kakaoId",
    testEnvPrefix: "KAKAO_OAUTH",
    clientIdEnv: "KAKAO_OAUTH_REST_API_KEY",
    clientSecretEnv: "KAKAO_OAUTH_CLIENT_SECRET",
    redirectUriEnv: "KAKAO_OAUTH_REDIRECT_URI",
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    profileUrl: "https://kapi.kakao.com/v2/user/me",
    scope: "account_email",
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
  const testEnvPrefix =
    definition.testEnvPrefix ||
    `${definition.key.toUpperCase()}_OAUTH`;
  const testOverrides =
    process.env.NODE_ENV === "test"
      ? {
          authorizeUrl: String(
            process.env[`${testEnvPrefix}_TEST_AUTHORIZE_URL`] ||
              definition.authorizeUrl
          ),
          tokenUrl: String(
            process.env[`${testEnvPrefix}_TEST_TOKEN_URL`] ||
              definition.tokenUrl
          ),
          profileUrl: String(
            process.env[`${testEnvPrefix}_TEST_PROFILE_URL`] ||
              definition.profileUrl
          ),
        }
      : {};

  return {
    ...definition,
    ...testOverrides,
    clientId: String(process.env[definition.clientIdEnv] || "").trim(),
    clientSecret: String(process.env[definition.clientSecretEnv] || "").trim(),
    redirectUri: String(process.env[definition.redirectUriEnv] || "").trim(),
  };
}

function publicProviderStatus() {
  const oauthProviders = Object.values(PROVIDERS).map((provider) => {
    const config = providerConfig(provider.key);
    return {
      key: provider.key,
      label: provider.label,
      configured: Boolean(
        config.clientId &&
        config.clientSecret &&
        config.redirectUri
      ),
    };
  });

  /*
   * 애플은 네이티브 identityToken 교환과 웹 form_post 왕복을 같은 서비스에서
   * 제공하지만, Google/Kakao의 providerConfig 계약과 환경변수 모양이 다르다.
   * 따라서 PROVIDERS에는 섞지 않고 네이티브 configured와 웹 webConfigured를
   * appleProviderStatus에서 따로 노출한다.
   */
  return [
    ...oauthProviders,
    appleProviderStatus(),
  ];
}

function assertConfigured(config) {
  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.redirectUri
  ) {
    const error = new Error(`${config.label} 로그인이 아직 설정되지 않았습니다.`);
    error.status = 503;
    error.code = "SOCIAL_AUTH_NOT_CONFIGURED";
    throw error;
  }
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function beginSocialAuthorization(
  req,
  provider,
  context = {}
) {
  const config = providerConfig(provider);
  assertConfigured(config);
  const state = crypto
    .randomBytes(32)
    .toString("base64url");
  const mobileContext =
    context.mobile === true
      ? {
          mobile: true,
          codeChallenge: String(
            context.codeChallenge || ""
          ),
          ...(context.purpose === "account-withdrawal" && context.userId
            ? {
                purpose: "account-withdrawal",
                userId: String(context.userId),
              }
            : {}),
        }
      : { mobile: false };
  req.session.socialOAuthState = {
    provider: config.key,
    state,
    createdAt: Date.now(),
    context: mobileContext,
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
  if (req.session) {
    delete req.session.socialOAuthState;
  }
  const valid =
    saved &&
    saved.provider === provider &&
    Date.now() - Number(saved.createdAt || 0) <= OAUTH_STATE_MAX_AGE_MS &&
    safeEqual(saved.state, state);
  if (!valid) {
    const error = new Error("소셜 로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.");
    error.status = 400;
    error.code = "SOCIAL_AUTH_STATE_INVALID";
    error.context =
      saved?.context || {};
    throw error;
  }
  return saved.context || {};
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
  if (config.key === "kakao") {
    const account = raw.kakao_account || {};
    return {
      provider: config.key,
      providerUserId: String(raw.id || ""),
      email: String(account.email || "").trim().toLowerCase(),
      emailVerified:
        account.email_needs_agreement !== true &&
        account.is_email_valid === true &&
        account.is_email_verified === true,
      displayName: String(account.profile?.nickname || "").trim(),
    };
  }
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
  const context =
    consumeAndVerifyState(
      req,
      config.key,
      state
    );
  if (!code) {
    const error = new Error(`${config.label} 로그인이 취소되었습니다.`);
    error.status = 400;
    error.code = "SOCIAL_AUTH_CANCELLED";
    error.context = context;
    throw error;
  }
  const token = await exchangeCode(config, code, fetchImpl);
  return {
    profile: assertVerifiedProfile(
      await fetchProviderProfile(
        config,
        token.access_token,
        fetchImpl
      )
    ),
    context,
  };
}

function setPendingSocialRegistration(
  req,
  profile,
  context = {}
) {
  req.session.pendingSocialRegistration = {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    email: profile.email,
    displayName: profile.displayName,
    mobile:
      context.mobile === true,
    ...(context.codeChallenge
      ? {
          codeChallenge: String(
            context.codeChallenge
          ),
        }
      : {}),
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
  // 애플은 PROVIDERS 테이블에 없다. 그 테이블은 **웹 OAuth 왕복**을 위한 것이라
  // clientId·clientSecret·redirectUri 삼종을 전제하는데, 애플은 네이티브 시트가
  // 신원을 증명해 오므로 로그인에 그 셋이 필요 없다(탈퇴 시 폐기에만 쓴다).
  // 그래도 provider → 사용자 필드 매핑은 한 곳에만 있어야 해서 여기서 함께 답한다.
  // 두 벌이 되면 한쪽만 고쳐진 채 조회 키가 갈린다.
  if (String(provider || "").toLowerCase() === "apple") return "socialAuth.appleId";
  const definition = PROVIDERS[String(provider || "").toLowerCase()];
  if (definition?.idPath) return definition.idPath;
  const error = new Error("지원하지 않는 소셜 로그인 방식입니다.");
  error.code = "SOCIAL_AUTH_PROVIDER_NOT_FOUND";
  throw error;
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
