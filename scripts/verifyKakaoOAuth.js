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

  // 애플이 뒤에 붙는다. PROVIDERS 테이블(google, kakao)은 웹 OAuth 왕복 전용이라
  // 애플은 그 표에 들어가지 못하고 publicProviderStatus 가 목록에만 합류시킨다
  // (services/socialAuthService.js 주석 참조).
  //
  // 이 단언에서 apple 이 빠지면 심사지침 4.8 대응이 조용히 사라진 것이다 —
  // 제3자 소셜 로그인만 있고 동등한 대안이 없으면 반려된다. 카카오는 그 대안이
  // 되지 못한다(이름·이메일 외 수집, 이메일 가리기 없음).
  assert.deepEqual(
    publicProviderStatus().map((provider) => provider.key),
    ["google", "kakao", "apple"]
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
  assert.match(
    read("controllers/matthsController.js"),
    /socialRegistration\s*\?\.codeChallenge\s*\|\|\s*null,\s*socialRegistration\?\.provider/
  );
  assert.match(read("views/login.ejs"), /카카오로 계속하기/);
  assert.match(read("public/css/auth.css"), /\.social-auth-button\.is-kakao/);
  // .env.example 은 .gitignore 의 `.env.*` 에 막혀 저장소에 추적되지 않는다.
  // 즉 이 검사는 그 파일을 로컬에 들고 있는 사람에게만 돈다 — 새로 클론한
  // 환경(CI·다른 개발자·배포)에서는 파일이 없어 ENOENT 로 죽는다.
  //
  // 있으면 검사하고 없으면 무엇을 못 봤는지 남긴다. 조용히 통과시키지는 않는다.
  // 근본 해결은 .gitignore 에 `!.env.example` 을 넣고 파일을 커밋하는 것인데,
  // 그건 main 소유 결정이라 여기서 하지 않는다.
  if (fs.existsSync(path.join(root, ".env.example"))) {
    assert.match(
      read(".env.example"),
      /KAKAO_OAUTH_REST_API_KEY=[\s\S]*KAKAO_OAUTH_CLIENT_SECRET=[\s\S]*KAKAO_OAUTH_REDIRECT_URI=/
    );
  } else {
    console.log("  · .env.example 없음 — 환경변수 예시 검사는 건너뜀 (.gitignore 의 .env.* 에 막힘)");
  }

  console.log("Kakao web OAuth contract verified.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreEnvironment);
