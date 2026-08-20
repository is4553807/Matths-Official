const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const environmentKeys = [
  "NODE_ENV",
  "KAKAO_OAUTH_REST_API_KEY",
  "KAKAO_OAUTH_CLIENT_SECRET",
  "KAKAO_OAUTH_REDIRECT_URI",
];
const savedEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
);

function restoreEnvironment() {
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function main() {
  process.env.NODE_ENV = "test";
  process.env.KAKAO_OAUTH_REST_API_KEY = "kakao-rest-api-key";
  process.env.KAKAO_OAUTH_CLIENT_SECRET = "kakao-client-secret";
  process.env.KAKAO_OAUTH_REDIRECT_URI =
    "https://www.matths.kr/auth/kakao/callback";

  const {
    beginSocialAuthorization,
    completeSocialAuthorization,
    publicProviderStatus,
    socialIdPath,
  } = require("../services/socialAuthService");

  assert.deepEqual(
    publicProviderStatus().map((provider) => provider.key),
    ["google", "kakao"]
  );
  assert.equal(
    publicProviderStatus().find((provider) => provider.key === "kakao")
      .configured,
    true
  );
  assert.equal(socialIdPath("kakao"), "socialAuth.kakaoId");
  const { User } = require("../models/matthsModel");
  const kakaoIndex = User.schema.indexes().find(
    ([fields]) => fields["socialAuth.kakaoId"] === 1
  );
  assert.ok(kakaoIndex, "카카오 계정 식별자 인덱스가 없습니다.");
  assert.equal(kakaoIndex[1].unique, true);
  assert.deepEqual(kakaoIndex[1].partialFilterExpression, {
    "socialAuth.kakaoId": { $type: "string" },
  });

  const request = { session: {} };
  const authorizationUrl = new URL(
    beginSocialAuthorization(request, "kakao")
  );
  assert.equal(authorizationUrl.origin, "https://kauth.kakao.com");
  assert.equal(authorizationUrl.pathname, "/oauth/authorize");
  assert.equal(
    authorizationUrl.searchParams.get("client_id"),
    "kakao-rest-api-key"
  );
  assert.equal(
    authorizationUrl.searchParams.get("redirect_uri"),
    "https://www.matths.kr/auth/kakao/callback"
  );
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizationUrl.searchParams.get("scope"), "account_email");
  assert.ok(authorizationUrl.searchParams.get("state"));
  assert.equal(authorizationUrl.searchParams.has("prompt"), false);

  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/oauth/token")) {
      return {
        ok: true,
        async json() {
          return { access_token: "kakao-access-token" };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {
          id: 123456789,
          kakao_account: {
            email_needs_agreement: false,
            is_email_valid: true,
            is_email_verified: true,
            email: "Student@Example.com",
            profile: { nickname: "카카오학생" },
          },
        };
      },
    };
  };

  const completed = await completeSocialAuthorization(
    request,
    "kakao",
    {
      code: "authorization-code",
      state: authorizationUrl.searchParams.get("state"),
    },
    fetchImpl
  );
  assert.deepEqual(completed.profile, {
    provider: "kakao",
    providerUserId: "123456789",
    email: "student@example.com",
    emailVerified: true,
    displayName: "카카오학생",
  });
  assert.equal(calls.length, 2);
  const tokenBody = new URLSearchParams(calls[0].options.body);
  assert.equal(tokenBody.get("grant_type"), "authorization_code");
  assert.equal(tokenBody.get("client_id"), "kakao-rest-api-key");
  assert.equal(tokenBody.get("client_secret"), "kakao-client-secret");
  assert.equal(tokenBody.get("code"), "authorization-code");
  assert.equal(
    calls[1].options.headers.authorization,
    "Bearer kakao-access-token"
  );

  const unverifiedRequest = { session: {} };
  const unverifiedUrl = new URL(
    beginSocialAuthorization(unverifiedRequest, "kakao")
  );
  await assert.rejects(
    completeSocialAuthorization(
      unverifiedRequest,
      "kakao",
      {
        code: "authorization-code",
        state: unverifiedUrl.searchParams.get("state"),
      },
      async (url) => ({
        ok: true,
        async json() {
          return String(url).includes("/oauth/token")
            ? { access_token: "kakao-access-token" }
            : {
                id: 987654321,
                kakao_account: {
                  email_needs_agreement: true,
                  is_email_valid: true,
                  is_email_verified: true,
                  email: "hidden@example.com",
                },
              };
        },
      })
    ),
    (error) => error?.code === "SOCIAL_AUTH_EMAIL_REQUIRED"
  );

  const root = path.resolve(__dirname, "..");
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  assert.match(read("routes/matths-routes.js"), /"\/auth\/kakao"/);
  assert.match(
    read("routes/matths-routes.js"),
    /"\/auth\/kakao\/callback"/
  );
  assert.match(read("models/matthsModel.js"), /socialAuth\.kakaoId/);
  assert.match(read("views/login.ejs"), /카카오로 계속하기/);
  assert.match(read("public/css/auth.css"), /\.social-auth-button\.is-kakao/);
  assert.match(
    read(".env.example"),
    /KAKAO_OAUTH_REST_API_KEY=[\s\S]*KAKAO_OAUTH_CLIENT_SECRET=[\s\S]*KAKAO_OAUTH_REDIRECT_URI=/
  );

  console.log("Kakao web OAuth contract verified.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreEnvironment);
