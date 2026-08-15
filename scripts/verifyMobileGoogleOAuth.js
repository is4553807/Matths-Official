"use strict";

const assert = require(
  "node:assert/strict"
);
const fs = require("node:fs");
const path = require("node:path");

const {
  beginSocialAuthorization,
  completeSocialAuthorization,
  getPendingSocialRegistration,
  publicProviderStatus,
  setPendingSocialRegistration,
} = require(
  "../services/socialAuthService"
);
const {
  issueMobileAuthGrant,
  consumeMobileAuthGrant,
  resolveMobileAuthGrantResult,
  GRANT_REPLAY_WINDOW_MS,
  _testing: {
    verifierChallenge,
  },
} = require(
  "../services/mobileSocialAuthGrantService"
);
const {
  createAccessToken,
} = require(
  "../services/mobileAuthService"
);
const authMiddleware = require(
  "../middleware/authMiddleware"
);

const root = path.resolve(
  __dirname,
  ".."
);

function source(relative) {
  return fs.readFileSync(
    path.join(root, relative),
    "utf8"
  );
}

function createGrantModel() {
  let row = null;

  return {
    current() {
      return row;
    },
    set(value) {
      row = value;
    },
    async create(value) {
      row = {
        _id: "grant-1",
        ...value,
        consumedAt: null,
        accessTokenIssuedAt: null,
        responseCiphertext: null,
      };
    },
    findOneAndUpdate(
      query,
      update
    ) {
      return {
        async select() {
          if (query._id) {
            if (
              !row ||
              row._id !== query._id ||
              row.consumedAt <=
                query.consumedAt?.$gt ||
              row.resultExpiresAt <=
                query.resultExpiresAt
                  ?.$gt ||
              (
                query.responseCiphertext ===
                  null &&
                row.responseCiphertext !==
                  null
              )
            ) {
              return null;
            }
            row = {
              ...row,
              ...update.$set,
            };
            return { ...row };
          }

          if (
            !row ||
            row.tokenHash !==
              query.tokenHash ||
            row.codeChallenge !==
              query.codeChallenge ||
            row.consumedAt ||
            row.expiresAt <= new Date()
          ) {
            return null;
          }
          row = {
            ...row,
            ...update.$set,
          };
          return {
            ...row,
            userId: "user-1",
          };
        },
      };
    },
    findOne(query) {
      return {
        async select() {
          if (query._id) {
            if (
              !row ||
              row._id !== query._id ||
              row.consumedAt <=
                query.consumedAt?.$gt ||
              row.resultExpiresAt <=
                query.resultExpiresAt
                  ?.$gt ||
              (
                query.responseCiphertext
                  ?.$ne === null &&
                row.responseCiphertext ===
                  null
              )
            ) {
              return null;
            }
            return { ...row };
          }

          if (
            !row ||
            row.tokenHash !==
              query.tokenHash ||
            row.codeChallenge !==
              query.codeChallenge ||
            !row.consumedAt ||
            row.expiresAt <= new Date()
          ) {
            return null;
          }
          if (
            query.consumedAt?.$gt &&
            row.consumedAt <=
              query.consumedAt.$gt
          ) {
            return null;
          }
          if (
            query.resultExpiresAt?.$gt &&
            row.resultExpiresAt <=
              query.resultExpiresAt.$gt
          ) {
            return null;
          }
          return {
            ...row,
            userId: "user-1",
          };
        },
      };
    },
  };
}

async function main() {
  const webRoutes = source(
    "routes/matths-routes.js"
  );
  const apiRoutes = source(
    "routes/api-routes.js"
  );
  const apiBoundary =
    apiRoutes.indexOf(
      "router.use(requireApiAuth)"
    );

  assert.match(
    webRoutes,
    /router\.get\(\s*"\/auth\/google\/app",\s*matthsController\.socialOAuthAppStart\s*\)/
  );
  assert.match(
    webRoutes,
    /"\/auth\/google\/callback",\s*authMiddleware\s*\.isSocialOAuthCallbackAllowed/
  );
  for (const marker of [
    '"/auth/providers"',
    '"/auth/google/exchange"',
  ]) {
    const position =
      apiRoutes.indexOf(marker);
    assert.ok(
      position >= 0 &&
        position < apiBoundary,
      `${marker} must be public before requireApiAuth`
    );
  }
  assert.doesNotMatch(
    apiRoutes,
    /"\/auth\/google\/start"/
  );

  const previous = {
    clientId:
      process.env
        .GOOGLE_OAUTH_CLIENT_ID,
    secret:
      process.env
        .GOOGLE_OAUTH_CLIENT_SECRET,
    redirect:
      process.env
        .GOOGLE_OAUTH_REDIRECT_URI,
    tokenSecret:
      process.env.API_TOKEN_SECRET,
  };

  try {
    process.env.GOOGLE_OAUTH_CLIENT_ID =
      "mobile-contract-client";
    process.env.GOOGLE_OAUTH_REDIRECT_URI =
      "https://www.matths.kr/auth/google/callback";
    delete process.env
      .GOOGLE_OAUTH_CLIENT_SECRET;
    assert.equal(
      publicProviderStatus()[0]
        .configured,
      false
    );
    assert.throws(
      () =>
        beginSocialAuthorization(
          { session: {} },
          "google"
        ),
      (error) =>
        error?.code ===
        "SOCIAL_AUTH_NOT_CONFIGURED"
    );

    process.env.GOOGLE_OAUTH_CLIENT_SECRET =
      "mobile-contract-secret";
    process.env.API_TOKEN_SECRET =
      "mobile-contract-api-token-secret";
    assert.equal(
      publicProviderStatus()[0]
        .configured,
      true
    );

    const verifier =
      "mobile-pkce-verifier-that-is-long-enough-for-this-contract";
    const challenge =
      verifierChallenge(verifier);
    const request = {
      session: {},
    };
    const authorizationUrl =
      new URL(
        beginSocialAuthorization(
          request,
          "google",
          {
            mobile: true,
            codeChallenge: challenge,
          }
        )
      );
    assert.equal(
      request.session
        .socialOAuthState.context
        .mobile,
      true
    );
    assert.equal(
      request.session
        .socialOAuthState.context
        .codeChallenge,
      challenge
    );

    const fetchImpl = async (url) => ({
      ok: true,
      async json() {
        return String(url).includes(
          "token"
        )
          ? {
              access_token:
                "provider-token",
            }
          : {
              sub: "google-user",
              email:
                "student@example.com",
              email_verified: true,
              name: "학생",
            };
      },
    });
    const completed =
      await completeSocialAuthorization(
        request,
        "google",
        {
          code: "authorization-code",
          state:
            authorizationUrl
              .searchParams
              .get("state"),
        },
        fetchImpl
      );
    assert.equal(
      completed.context.mobile,
      true
    );
    assert.equal(
      completed.context
        .codeChallenge,
      challenge
    );
    assert.equal(
      completed.profile.email,
      "student@example.com"
    );

    const pendingRequest = {
      session: {},
    };
    setPendingSocialRegistration(
      pendingRequest,
      completed.profile,
      completed.context
    );
    const pending =
      getPendingSocialRegistration(
        pendingRequest
      );
    assert.equal(pending.mobile, true);
    assert.equal(
      pending.codeChallenge,
      challenge
    );

    const GrantModel =
      createGrantModel();
    const code =
      await issueMobileAuthGrant(
        "user-1",
        {
          GrantModel,
          codeChallenge: challenge,
        }
      );
    assert.equal(
      await consumeMobileAuthGrant(
        code,
        {
          GrantModel,
          codeVerifier:
            "wrong-verifier",
        }
      ),
      null
    );

    const attempts =
      await Promise.all(
        Array.from(
          { length: 20 },
          () =>
            consumeMobileAuthGrant(
              code,
              {
                GrantModel,
                codeVerifier: verifier,
              }
            )
        )
      );
    assert.equal(
      attempts.filter(
        (item) =>
          item?.replayed === false
      ).length,
      1
    );
    assert.equal(
      attempts.filter(Boolean).length,
      20
    );
    assert.equal(
      new Set(
        attempts.map(
          (item) =>
            item
              .accessTokenIssuedAtSeconds
        )
      ).size,
      1
    );

    const tokenUser = {
      _id: "user-1",
      email:
        "student@example.test",
      role: "student",
      tokenVersion: 0,
    };
    const stableCandidates =
      await Promise.all(
        attempts.map(
          (attempt, index) =>
            resolveMobileAuthGrantResult(
              attempt.grant._id,
              {
                accessToken:
                  createAccessToken(
                    tokenUser,
                    {
                      issuedAtSeconds:
                        attempt
                          .accessTokenIssuedAtSeconds,
                    }
                  ),
                winner: index,
              },
              { GrantModel }
            )
        )
      );
    assert.equal(
      new Set(
        stableCandidates.map(
          (item) =>
            JSON.stringify(item)
        )
      ).size,
      1
    );
    assert.ok(
      GrantModel.current()
        .responseCiphertext
    );
    assert.doesNotMatch(
      GrantModel.current()
        .responseCiphertext,
      /student@example/
    );

    const BoundaryGrantModel =
      createGrantModel();
    const boundaryCode =
      await issueMobileAuthGrant(
        "user-1",
        {
          GrantModel:
            BoundaryGrantModel,
          codeChallenge: challenge,
        }
      );
    const originalExpiresAt =
      new Date(Date.now() + 25);
    BoundaryGrantModel.set({
      ...BoundaryGrantModel.current(),
      expiresAt: originalExpiresAt,
    });
    const boundaryFirst =
      await consumeMobileAuthGrant(
        boundaryCode,
        {
          GrantModel:
            BoundaryGrantModel,
          codeVerifier: verifier,
        }
      );
    assert.equal(
      boundaryFirst?.replayed,
      false
    );
    assert.equal(
      BoundaryGrantModel.current()
        .expiresAt.getTime(),
      BoundaryGrantModel.current()
        .resultExpiresAt.getTime()
    );
    assert.ok(
      BoundaryGrantModel.current()
        .expiresAt > originalExpiresAt
    );
    await new Promise((resolve) =>
      setTimeout(resolve, 40)
    );
    const boundaryReplay =
      await consumeMobileAuthGrant(
        boundaryCode,
        {
          GrantModel:
            BoundaryGrantModel,
          codeVerifier: verifier,
        }
      );
    assert.equal(
      boundaryReplay?.replayed,
      true
    );

    GrantModel.set({
      ...GrantModel.current(),
      consumedAt: new Date(
        Date.now() -
          (GRANT_REPLAY_WINDOW_MS +
            1_000)
      ),
    });
    assert.equal(
      await consumeMobileAuthGrant(
        code,
        {
          GrantModel,
          codeVerifier: verifier,
        }
      ),
      null
    );

    let nextCount = 0;
    let redirectLocation = "";
    authMiddleware
      .isSocialOAuthCallbackAllowed(
        {
          session: {
            user: {
              id: "web-user",
              role: "student",
            },
            socialOAuthState: {
              context: {
                mobile: true,
              },
            },
          },
        },
        {
          redirect(location) {
            redirectLocation =
              location;
          },
        },
        () => {
          nextCount += 1;
        }
      );
    assert.equal(nextCount, 1);
    assert.equal(
      redirectLocation,
      ""
    );
  } finally {
    for (const [key, value] of [
      [
        "GOOGLE_OAUTH_CLIENT_ID",
        previous.clientId,
      ],
      [
        "GOOGLE_OAUTH_CLIENT_SECRET",
        previous.secret,
      ],
      [
        "GOOGLE_OAUTH_REDIRECT_URI",
        previous.redirect,
      ],
      [
        "API_TOKEN_SECRET",
        previous.tokenSecret,
      ],
    ]) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  console.log(
    "Mobile Google OAuth PKCE contract verified."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
