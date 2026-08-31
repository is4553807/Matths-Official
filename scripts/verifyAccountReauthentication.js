"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  consumeSocialProof,
  issueSocialProof,
  issueStartTicket,
  verifyStartTicket,
  _testing: { verifierChallenge },
} = require("../services/accountReauthenticationService");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function fakeGrantModel() {
  let row = null;
  return {
    async create(value) {
      row = { ...value, consumedAt: null };
    },
    findOneAndUpdate(query, update) {
      return {
        then(resolve) {
          const matches =
            row &&
            row.tokenHash === query.tokenHash &&
            row.codeChallenge === query.codeChallenge &&
            String(row.userId) === String(query.userId) &&
            row.provider === query.provider &&
            row.consumedAt === null &&
            row.expiresAt > query.expiresAt.$gt;
          if (matches) row = { ...row, ...update.$set };
          return Promise.resolve(matches ? { ...row } : null).then(resolve);
        },
      };
    },
  };
}

async function main() {
  const previousSecret = process.env.API_TOKEN_SECRET;
  process.env.API_TOKEN_SECRET = "account-reauthentication-contract-secret";
  try {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = verifierChallenge(verifier);
    const ticket = issueStartTicket({
      userId: "64b000000000000000000001",
      codeChallenge: challenge,
      provider: "google",
      now: 1_000,
    });
    assert.deepEqual(verifyStartTicket(ticket, { now: 2_000 }), {
      userId: "64b000000000000000000001",
      provider: "google",
      codeChallenge: challenge,
    });
    assert.equal(verifyStartTicket(`${ticket}x`, { now: 2_000 }), null);
    assert.equal(verifyStartTicket(ticket, { now: 5 * 60 * 1000 + 1_001 }), null);

    const model = fakeGrantModel();
    const proof = await issueSocialProof(
      {
        userId: "64b000000000000000000001",
        codeChallenge: challenge,
        provider: "google",
      },
      { GrantModel: model, now: 10_000 }
    );
    assert.equal(
      await consumeSocialProof(
        {
          proof,
          codeVerifier: verifier,
          userId: "64b000000000000000000001",
          provider: "kakao",
        },
        { GrantModel: model, now: 11_000 }
      ),
      false,
      "Google proof를 카카오 proof로 바꾸어 쓸 수 없어야 합니다."
    );
    assert.equal(
      await consumeSocialProof(
        {
          proof,
          codeVerifier: verifier,
          userId: "64b000000000000000000000",
          provider: "google",
        },
        { GrantModel: model, now: 11_000 }
      ),
      false,
      "다른 로그인 계정은 같은 Google proof를 소비할 수 없어야 합니다."
    );
    assert.equal(
      await consumeSocialProof(
        {
          proof,
          // verifier 마지막 글자가 이미 A이면 종전 변형은 원본과 같아져
          // 1/64 확률로 정상 승인을 보안 실패로 오판했다. 반드시 다른 글자로
          // 바꿔 출시 게이트가 무작위로 실패하지 않게 한다.
          codeVerifier: `${verifier.slice(0, -1)}${verifier.endsWith("A") ? "B" : "A"}`,
          userId: "64b000000000000000000001",
          provider: "google",
        },
        { GrantModel: model, now: 11_000 }
      ),
      false,
      "PKCE verifier가 다르면 거부해야 합니다."
    );
    assert.equal(
      await consumeSocialProof(
        {
          proof,
          codeVerifier: verifier,
          userId: "64b000000000000000000001",
          provider: "google",
        },
        { GrantModel: model, now: 11_000 }
      ),
      true
    );
    assert.equal(
      await consumeSocialProof(
        {
          proof,
          codeVerifier: verifier,
          userId: "64b000000000000000000001",
          provider: "google",
        },
        { GrantModel: model, now: 12_000 }
      ),
      false,
      "탈퇴 proof는 한 번만 소비되어야 합니다."
    );

    const apiRoutes = source("routes/api-routes.js");
    const webRoutes = source("routes/matths-routes.js");
    const controller = source("controllers/apiController.js");
    const socialController = source("controllers/matthsController.js");
    const grantModel = source("models/accountReauthenticationGrantModel.js");
    assert.match(apiRoutes, /"\/me\/withdrawal\/options"/);
    assert.match(apiRoutes, /"\/me\/withdrawal\/google\/start"/);
    assert.match(apiRoutes, /"\/me\/withdrawal\/kakao\/start"/);
    assert.match(webRoutes, /"\/auth\/google\/reauth"/);
    assert.match(webRoutes, /"\/auth\/kakao\/reauth"/);
    assert.match(controller, /verifyAppleIdentityToken/);
    assert.match(controller, /appleSubject:\s*claims\.subject[\s\S]*userId:\s*req\.apiUser\._id/);
    assert.match(socialController, /context\.purpose === "account-withdrawal"/);
    assert.match(socialController, /String\(providerUser\._id\) !== String\(context\.userId/);
    assert.match(grantModel, /mongoose\.models\.AccountReauthenticationGrant/);

    const router = require("../routes/api-routes");
    const protectedRoutes = new Map();
    let behindAuth = false;
    for (const layer of router.stack) {
      if ((layer.name || layer.handle?.name) === "requireApiAuth") behindAuth = true;
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        protectedRoutes.set(`${method.toUpperCase()} ${layer.route.path}`, behindAuth);
      }
    }
    for (const route of [
      "GET /me/withdrawal/options",
      "POST /me/withdrawal/google/start",
      "POST /me/withdrawal/kakao/start",
      "DELETE /me",
    ]) {
      assert.equal(protectedRoutes.get(route), true, `${route} must require Bearer auth`);
    }

    console.log("Account reauthentication verification passed.");
  } finally {
    if (previousSecret === undefined) delete process.env.API_TOKEN_SECRET;
    else process.env.API_TOKEN_SECRET = previousSecret;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
