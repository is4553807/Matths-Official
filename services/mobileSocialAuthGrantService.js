const crypto = require("crypto");
const MobileAuthGrant = require(
  "../models/mobileAuthGrantModel"
);

const GRANT_TTL_MS =
  5 * 60 * 1000;
const GRANT_REPLAY_WINDOW_MS =
  60 * 1000;
const CODE_VERIFIER_PATTERN =
  /^[A-Za-z0-9\-._~]{43,128}$/;
const RESULT_CIPHER = "aes-256-gcm";

const digest = (value) =>
  crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");

const verifierChallenge = (value) =>
  Buffer.from(
    crypto
      .createHash("sha256")
      .update(String(value))
      .digest()
  ).toString("base64url");

function resultEncryptionKey() {
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
    .update(
      "matths-mobile-auth-grant-result-v1\0"
    )
    .update(String(secret))
    .digest();
}

function encryptResult(
  grantId,
  value
) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    RESULT_CIPHER,
    resultEncryptionKey(),
    iv
  );
  cipher.setAAD(
    Buffer.from(
      String(grantId),
      "utf8"
    )
  );
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify(value),
      "utf8"
    ),
    cipher.final(),
  ]);

  return {
    responseCiphertext:
      ciphertext.toString(
        "base64url"
      ),
    responseIv:
      iv.toString("base64url"),
    responseTag:
      cipher
        .getAuthTag()
        .toString("base64url"),
  };
}

function decryptResult(
  grantId,
  row
) {
  const decipher =
    crypto.createDecipheriv(
      RESULT_CIPHER,
      resultEncryptionKey(),
      Buffer.from(
        String(
          row.responseIv || ""
        ),
        "base64url"
      )
    );
  decipher.setAAD(
    Buffer.from(
      String(grantId),
      "utf8"
    )
  );
  decipher.setAuthTag(
    Buffer.from(
      String(
        row.responseTag || ""
      ),
      "base64url"
    )
  );
  const plaintext = Buffer.concat([
    decipher.update(
      Buffer.from(
        String(
          row.responseCiphertext || ""
        ),
        "base64url"
      )
    ),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext);
}

async function issueMobileAuthGrant(
  userId,
  {
    GrantModel = MobileAuthGrant,
    codeChallenge = null,
  } = {}
) {
  const code = crypto
    .randomBytes(32)
    .toString("base64url");

  await GrantModel.create({
    tokenHash: digest(code),
    codeChallenge:
      codeChallenge || null,
    userId,
    expiresAt: new Date(
      Date.now() + GRANT_TTL_MS
    ),
  });

  return code;
}

async function consumeMobileAuthGrant(
  code,
  {
    GrantModel = MobileAuthGrant,
    codeVerifier = null,
  } = {}
) {
  const normalized = String(
    code || ""
  ).trim();
  const verifier = String(
    codeVerifier || ""
  ).trim();

  if (
    !normalized ||
    !CODE_VERIFIER_PATTERN.test(
      verifier
    )
  ) {
    return null;
  }

  const challenge =
    verifierChallenge(verifier);
  const consumedAt = new Date();
  const resultExpiresAt = new Date(
    consumedAt.getTime() +
      GRANT_REPLAY_WINDOW_MS
  );
  const consumed =
    await GrantModel.findOneAndUpdate(
      {
        tokenHash:
          digest(normalized),
        codeChallenge: challenge,
        consumedAt: null,
        expiresAt: {
          $gt: new Date(),
        },
      },
      {
        $set: {
          consumedAt,
          accessTokenIssuedAt:
            consumedAt,
          resultExpiresAt,
          expiresAt: resultExpiresAt,
        },
      },
      { new: true }
    ).select(
      "+tokenHash +codeChallenge"
    );

  if (consumed) {
    return {
      grant: consumed,
      replayed: false,
      accessTokenIssuedAtSeconds:
        Math.floor(
          consumedAt.getTime() /
            1000
        ),
    };
  }

  const replay =
    await GrantModel.findOne({
      tokenHash: digest(normalized),
      codeChallenge: challenge,
      consumedAt: {
        $gt: new Date(
          Date.now() -
            GRANT_REPLAY_WINDOW_MS
        ),
      },
      resultExpiresAt: {
        $gt: new Date(),
      },
      expiresAt: {
        $gt: new Date(),
      },
    }).select(
      "+tokenHash +codeChallenge"
    );

  if (!replay) return null;

  const fixedIssuedAt =
    replay.accessTokenIssuedAt;
  if (
    !(fixedIssuedAt instanceof Date) ||
    !Number.isFinite(
      fixedIssuedAt.getTime()
    )
  ) {
    return null;
  }

  return {
    grant: replay,
    replayed: true,
    accessTokenIssuedAtSeconds:
      Math.floor(
        fixedIssuedAt.getTime() /
          1000
      ),
  };
}

async function resolveMobileAuthGrantResult(
  grantId,
  candidateResult,
  { GrantModel = MobileAuthGrant } = {}
) {
  if (
    !grantId ||
    !candidateResult ||
    typeof candidateResult !==
      "object"
  ) {
    return null;
  }

  const encrypted = encryptResult(
    grantId,
    candidateResult
  );
  const activeAfter = new Date(
    Date.now() -
      GRANT_REPLAY_WINDOW_MS
  );
  const stored =
    await GrantModel.findOneAndUpdate(
      {
        _id: grantId,
        consumedAt: {
          $gt: activeAfter,
        },
        resultExpiresAt: {
          $gt: new Date(),
        },
        responseCiphertext: null,
      },
      { $set: encrypted },
      { new: true }
    ).select(
      "+responseCiphertext +responseIv +responseTag"
    );

  if (stored) {
    try {
      return decryptResult(
        grantId,
        stored
      );
    } catch {
      return null;
    }
  }

  const replay =
    await GrantModel.findOne({
      _id: grantId,
      consumedAt: {
        $gt: activeAfter,
      },
      resultExpiresAt: {
        $gt: new Date(),
      },
      responseCiphertext: {
        $ne: null,
      },
    }).select(
      "+responseCiphertext +responseIv +responseTag"
    );

  if (!replay) return null;

  try {
    return decryptResult(
      grantId,
      replay
    );
  } catch {
    return null;
  }
}

module.exports = {
  issueMobileAuthGrant,
  consumeMobileAuthGrant,
  resolveMobileAuthGrantResult,
  GRANT_TTL_MS,
  GRANT_REPLAY_WINDOW_MS,
  _testing: {
    verifierChallenge,
    CODE_VERIFIER_PATTERN,
    encryptResult,
    decryptResult,
  },
};
