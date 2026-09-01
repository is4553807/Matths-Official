// Sign in with Apple 교환 계약 검증.
//
// DB 없이 돌린다. identityToken 검증은 순수 함수이고, 계정 연결 규칙은 모델
// 메서드를 대역으로 바꿔 "무엇을 덮어쓰고 무엇을 지키는가" 만 본다 —
// verifyMobileGoogleOAuth.js 가 구글 왕복을 대역 fetch 로 확인하는 것과 같은 방식이다.
//
// 여기서 지키는 계약:
//   ① nonce 대조가 재생 공격을 막는가        ② aud 가 다른 앱 토큰을 거르는가
//   ③ 만료·위조·alg 바꿔치기를 거르는가       ④ 애플 키 회전 뒤에도 로그인이 되는가
//   ⑤ 두 번째 로그인의 nil 이름/이메일이 기존 값을 지우지 않는가
process.env.APPLE_BUNDLE_ID = "kr.matths.app";
process.env.API_TOKEN_SECRET = "local-verify-secret";

const crypto = require("crypto");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const { User } = require(path.join(ROOT, "models/matthsModel"));
const AppleAuthCredential = require(
  path.join(ROOT, "models/appleAuthCredentialModel")
);
const { ParentAccount } = require(path.join(ROOT, "models/parentModel"));
const appleAuth = require(path.join(ROOT, "services/appleAuthService"));
ParentAccount.exists = async () => null;

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256", use: "sig" };

let jwksHits = 0;
const fakeFetch = async (url) => {
  if (String(url) === appleAuth._testing.APPLE_JWKS_URL) {
    jwksHits += 1;
    return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) };
  }
  throw new Error(`예상하지 못한 외부 호출: ${url}`);
};

const b64 = (value) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const RAW_NONCE = "rHZ2m0Wm7Qm5s1tQ9nQ2bJb8xk4dQxTt";

function makeToken({ claims = {}, header = {}, sign = true } = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fullHeader = { alg: "RS256", kid: "test-kid", typ: "JWT", ...header };
  const fullClaims = {
    iss: "https://appleid.apple.com",
    aud: "kr.matths.app",
    sub: "001999.appleuser.0001",
    iat: nowSeconds - 5,
    exp: nowSeconds + 600,
    nonce: appleAuth._testing.sha256Hex(RAW_NONCE),
    email: "student@privaterelay.appleid.com",
    email_verified: "true",
    is_private_email: "true",
    ...claims,
  };
  const input = `${b64(fullHeader)}.${b64(fullClaims)}`;
  const signature = sign
    ? crypto.sign("RSA-SHA256", Buffer.from(input, "utf8"), privateKey)
    : Buffer.from("not-a-signature");
  return `${input}.${signature.toString("base64url")}`;
}

async function attempt(label, args) {
  try {
    const claims = await appleAuth.verifyAppleIdentityToken(args, {
      fetchImpl: fakeFetch,
    });
    return { label, ok: true, claims };
  } catch (error) {
    return {
      label,
      ok: false,
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }
}

function line(result) {
  return result.ok
    ? `  통과: sub=${result.claims.subject} email=${result.claims.email || "(없음)"}`
    : `  거부: HTTP ${result.status} ${result.code} — ${result.message}`;
}

(async () => {
  let failures = 0;
  const expect = (condition, description) => {
    if (!condition) {
      failures += 1;
      console.log(`  ✗ 기대 어긋남: ${description}`);
    }
  };

  console.log("[0] 정상 토큰 (대조군)");
  let r = await attempt("valid", { identityToken: makeToken(), nonce: RAW_NONCE });
  console.log(line(r));
  expect(r.ok, "정상 토큰은 통과해야 한다");

  console.log("[1] nonce 불일치 (앱이 보낸 원본이 토큰 안 해시와 다름)");
  r = await attempt("nonce", {
    identityToken: makeToken(),
    nonce: "다른-요청의-nonce-0000000000000000",
  });
  console.log(line(r));
  expect(!r.ok && r.code === "APPLE_AUTH_NONCE_MISMATCH", "nonce 불일치는 거부");

  console.log("[1-b] 토큰에 nonce 자체가 없음 (구버전/위조)");
  r = await attempt("nonce-missing", {
    identityToken: makeToken({ claims: { nonce: undefined } }),
    nonce: RAW_NONCE,
  });
  console.log(line(r));
  expect(!r.ok && r.code === "APPLE_AUTH_NONCE_MISMATCH", "nonce 없음도 거부");

  console.log("[2] aud 가 다른 앱 (남의 앱에서 받은 토큰 재사용)");
  r = await attempt("aud", {
    identityToken: makeToken({ claims: { aud: "com.other.app" } }),
    nonce: RAW_NONCE,
  });
  console.log(line(r));
  expect(!r.ok && r.code === "APPLE_AUTH_AUDIENCE_INVALID", "aud 불일치는 거부");

  console.log("[3] 만료된 토큰 (1시간 전 만료)");
  const past = Math.floor(Date.now() / 1000) - 3600;
  r = await attempt("expired", {
    identityToken: makeToken({ claims: { iat: past - 600, exp: past } }),
    nonce: RAW_NONCE,
  });
  console.log(line(r));
  expect(!r.ok && r.code === "APPLE_AUTH_TOKEN_EXPIRED", "만료 토큰은 거부");

  console.log("[3-b] 서명 위조 / alg 바꿔치기");
  r = await attempt("forged", {
    identityToken: makeToken({ sign: false }),
    nonce: RAW_NONCE,
  });
  console.log(line(r));
  expect(!r.ok && r.code === "APPLE_AUTH_SIGNATURE_INVALID", "위조 서명은 거부");
  r = await attempt("alg-none", {
    identityToken: makeToken({ header: { alg: "none" } }),
    nonce: RAW_NONCE,
  });
  console.log(line(r));
  expect(!r.ok && r.code === "APPLE_AUTH_ALG_UNSUPPORTED", "alg 바꿔치기는 거부");

  console.log("[3-c] iss 가 애플이 아님");
  r = await attempt("iss", {
    identityToken: makeToken({ claims: { iss: "https://evil.example" } }),
    nonce: RAW_NONCE,
  });
  console.log(line(r));
  expect(!r.ok && r.code === "APPLE_AUTH_ISSUER_INVALID", "iss 불일치는 거부");

  console.log(`[3-d] JWKS 호출 횟수(캐시 동작): ${jwksHits}회`);
  expect(jwksHits === 1, "JWKS 는 한 번만 받아야 한다");

  console.log("[3-e] 애플이 서명 키를 교체한 날 (모르는 kid → 재조회)");
  const rotated = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rotatedJwk = {
    ...rotated.publicKey.export({ format: "jwk" }),
    kid: "rotated-kid",
    alg: "RS256",
    use: "sig",
  };
  const beforeRotation = jwksHits;
  // 방금 받아 온 캐시라 최소 간격이 걸린다 — 위조 토큰 폭주가 외부 호출이 되지 않는다.
  r = await attempt("rotated-too-soon", {
    identityToken: makeToken({ header: { kid: "rotated-kid" } }),
    nonce: RAW_NONCE,
  });
  console.log(
    `  최소 간격 안: ${r.code} / 재조회 ${jwksHits - beforeRotation}회`
  );
  expect(jwksHits === beforeRotation, "최소 간격 안에서는 재조회하지 않는다");

  // 간격이 지난 뒤에는 새 키를 받아 와야 한다. 안 그러면 키 교체 당일 전원이 막힌다.
  appleAuth._testing.expireJwksCache();
  jwk.kid = "old-kid";
  const rotatedFetch = async (url) => {
    if (String(url) === appleAuth._testing.APPLE_JWKS_URL) {
      jwksHits += 1;
      return { ok: true, status: 200, json: async () => ({ keys: [jwk, rotatedJwk] }) };
    }
    throw new Error(`예상하지 못한 외부 호출: ${url}`);
  };
  const rotatedInput = (() => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", kid: "rotated-kid", typ: "JWT" };
    const claims = {
      iss: "https://appleid.apple.com",
      aud: "kr.matths.app",
      sub: "001999.appleuser.0001",
      iat: nowSeconds - 5,
      exp: nowSeconds + 600,
      nonce: appleAuth._testing.sha256Hex(RAW_NONCE),
    };
    const input = `${b64(header)}.${b64(claims)}`;
    return `${input}.${crypto
      .sign("RSA-SHA256", Buffer.from(input, "utf8"), rotated.privateKey)
      .toString("base64url")}`;
  })();
  try {
    const claims = await appleAuth.verifyAppleIdentityToken(
      { identityToken: rotatedInput, nonce: RAW_NONCE },
      { fetchImpl: rotatedFetch }
    );
    console.log(`  간격 경과 후: 통과 sub=${claims.subject} / 총 JWKS ${jwksHits}회`);
    expect(true, "");
  } catch (error) {
    console.log(`  간격 경과 후: 거부 ${error.code}`);
    expect(false, "키 회전 뒤 새 kid 는 통과해야 한다");
  }
  appleAuth._testing.resetJwksCache();

  // ── [4] fullName·email 이 없을 때 기존 값이 지워지지 않는가 ───────────────
  console.log("[4] 두 번째 로그인: fullName/email 이 nil 로 와도 기존 값 보존");

  const stored = {
    _id: "u-1",
    realName: "김수빈",
    email: "subin@example.com",
    emailVerifiedAt: new Date("2026-01-01"),
    lastLoginAt: new Date("2026-01-01"),
    set() {},
    async save() {},
  };
  const before = JSON.stringify({
    realName: stored.realName,
    email: stored.email,
  });

  User.findById = async () => stored;
  User.findOne = async () => null;
  AppleAuthCredential.findOne = () => ({
    select: async () => ({ _id: "c-1", userId: "u-1", appleSubject: "001999.appleuser.0001" }),
  });
  AppleAuthCredential.updateOne = async () => ({ acknowledged: true });
  AppleAuthCredential.deleteOne = async () => ({ acknowledged: true });

  const linked = await appleAuth._testing.linkAppleIdentity({
    claims: {
      subject: "001999.appleuser.0001",
      email: "",
      emailVerified: false,
      isPrivateEmail: false,
    },
    fullName: null,
    email: null,
  });

  const after = JSON.stringify({
    realName: linked.user.realName,
    email: linked.user.email,
  });
  console.log(`  로그인 전: ${before}`);
  console.log(`  로그인 후: ${after}`);
  expect(before === after, "nil 로 기존 값을 덮지 않아야 한다");
  expect(linked.created === false, "기존 계정을 다시 만들지 않아야 한다");

  console.log("[4-b] 최초 승인분이 비어 있던 realName 은 채운다");
  const empty = {
    _id: "u-2",
    realName: "",
    email: "new@example.com",
    emailVerifiedAt: null,
    set() {},
    async save() {},
  };
  User.findById = async () => empty;
  const filled = await appleAuth._testing.linkAppleIdentity({
    claims: {
      subject: "001999.appleuser.0001",
      email: "new@example.com",
      emailVerified: true,
      isPrivateEmail: false,
    },
    fullName: "김수빈",
    email: "new@example.com",
  });
  console.log(
    `  realName="${filled.user.realName}" emailVerifiedAt=${filled.user.emailVerifiedAt ? "설정됨" : "없음"}`
  );
  expect(filled.user.realName === "김수빈", "빈 realName 은 채워야 한다");

  console.log("[4-c] 자리표시자 이메일은 이후 검증된 relay 이메일로 복구한다");
  const relayEmail = "recovered@privaterelay.appleid.com";
  let recoveredSaved = false;
  const placeholderUser = {
    _id: "u-placeholder",
    realName: "",
    email: appleAuth._testing.placeholderEmail("001999.appleuser.0001"),
    emailVerifiedAt: null,
    lastLoginAt: new Date("2026-01-01"),
    set() {},
    async save() { recoveredSaved = true; },
  };
  User.findById = async () => placeholderUser;
  User.findOne = async () => null;
  const recovered = await appleAuth._testing.linkAppleIdentity({
    claims: {
      subject: "001999.appleuser.0001",
      email: relayEmail,
      emailVerified: true,
      isPrivateEmail: true,
    },
    fullName: null,
  });
  console.log(`  ${recovered.user.email} / 저장=${recoveredSaved}`);
  expect(recovered.user.email === relayEmail, "자리표시자를 relay 이메일로 교체해야 한다");
  expect(Boolean(recovered.user.emailVerifiedAt), "복구 이메일을 검증 완료로 기록해야 한다");
  expect(recoveredSaved, "복구한 사용자 문서를 저장해야 한다");

  console.log("[4-d] 이미 다른 계정이 쓰는 relay 이메일로는 복구하지 않는다");
  const conflictedPlaceholder = {
    ...placeholderUser,
    email: appleAuth._testing.placeholderEmail("001999.appleuser.0001"),
    emailVerifiedAt: null,
    async save() {},
  };
  User.findById = async () => conflictedPlaceholder;
  User.findOne = async () => ({ _id: "other-user" });
  try {
    await appleAuth._testing.linkAppleIdentity({
      claims: {
        subject: "001999.appleuser.0001",
        email: relayEmail,
        emailVerified: true,
        isPrivateEmail: true,
      },
      fullName: null,
    });
    expect(false, "다른 계정 이메일 충돌은 거부해야 한다");
  } catch (error) {
    console.log(`  거부: ${error.code}`);
    expect(error.code === "SOCIAL_AUTH_ACCOUNT_CONFLICT", "이메일 충돌 코드를 반환해야 한다");
  }

  console.log("[5] 이메일을 주지 않은 애플 계정의 자리표시자 이메일");
  console.log(`  ${appleAuth._testing.placeholderEmail("001999.appleuser.0001")}`);

  console.log("[6] 폐기 설정이 없을 때 로그인 가용성 / 폐기 가능 여부");
  console.log(
    `  configured=${appleAuth.isAppleLoginConfigured()} revocable=${appleAuth.isAppleRevokeConfigured()}`
  );
  expect(appleAuth.isAppleLoginConfigured(), "번들 ID 만 있어도 로그인은 가능해야 한다");
  expect(!appleAuth.isAppleRevokeConfigured(), "폐기 키가 없으면 revocable 은 false");

  console.log("[7] client_secret(ES256) 서명 — 폐기 설정이 있을 때만");
  const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY1234567";
  process.env.APPLE_PRIVATE_KEY = ec.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .replace(/\n/g, "\\n");
  const secret = appleAuth._testing.appleClientSecret({
    clientId: "kr.matths.app",
    teamId: "TEAM123456",
    keyId: "KEY1234567",
    privateKey: ec.privateKey.export({ type: "pkcs8", format: "pem" }),
  });
  const [h, p, s] = secret.split(".");
  const secretValid = crypto.verify(
    "sha256",
    Buffer.from(`${h}.${p}`, "utf8"),
    { key: ec.publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(s, "base64url")
  );
  console.log(
    `  header=${Buffer.from(h, "base64url")} 서명검증=${secretValid} revocable=${appleAuth.isAppleRevokeConfigured()}`
  );
  expect(secretValid, "client_secret 은 P-256 R||S 서명이어야 한다");

  console.log("[7-b] 네이티브 Bundle ID와 웹 Services ID 코드 교환 분리");
  process.env.APPLE_SERVICES_ID = "kr.matths.web";
  const nativeConfig = appleAuth._testing.appleRevokeConfig("kr.matths.app");
  const webConfig = appleAuth._testing.appleRevokeConfig("kr.matths.web");
  expect(nativeConfig.clientId === "kr.matths.app", "앱 코드는 Bundle ID로 교환해야 한다");
  expect(webConfig.clientId === "kr.matths.web", "웹 코드는 Services ID로 교환해야 한다");
  let tokenRequestBody;
  const exchanged = await appleAuth._testing.exchangeAuthorizationCode(
    "web-authorization-code",
    {
      clientId: "kr.matths.web",
      redirectUri: "https://www.matths.kr/auth/apple/callback",
      fetchImpl: async (_url, options) => {
        tokenRequestBody = new URLSearchParams(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ refresh_token: "web-refresh-token" }),
        };
      },
    }
  );
  console.log(
    `  native=${nativeConfig.clientId} web=${webConfig.clientId} redirect=${tokenRequestBody.get("redirect_uri")}`
  );
  expect(exchanged.refreshToken === "web-refresh-token", "웹 코드는 refresh token으로 교환해야 한다");
  expect(tokenRequestBody.get("client_id") === "kr.matths.web", "웹 token 요청 client_id가 달라지면 안 된다");
  expect(
    tokenRequestBody.get("redirect_uri") ===
      "https://www.matths.kr/auth/apple/callback",
    "웹 token 요청은 등록한 redirect_uri를 포함해야 한다"
  );

  console.log("[8] 자격 증명 봉인/해제 왕복");
  const sealed = appleAuth._testing.seal("c-auth-code-0001");
  console.log(
    `  저장형태=${sealed.slice(0, 24)}… 복원=${appleAuth._testing.open(sealed)}`
  );
  expect(
    appleAuth._testing.open(sealed) === "c-auth-code-0001",
    "봉인한 값은 그대로 복원되어야 한다"
  );

  console.log("[9] 웹 Services ID audience 검증");
  appleAuth._testing.resetJwksCache();
  jwk.kid = "test-kid";
  r = await attempt("web-audience", {
    identityToken: makeToken({ claims: { aud: "kr.matths.web" } }),
    nonce: RAW_NONCE,
  });
  expect(r.ok, "Services ID audience로 서명된 웹 identity token도 검증해야 한다");

  console.log(
    failures === 0 ? "\n결과: 전부 기대대로" : `\n결과: ${failures}건 기대 어긋남`
  );
  process.exit(failures === 0 ? 0 : 1);
})();
