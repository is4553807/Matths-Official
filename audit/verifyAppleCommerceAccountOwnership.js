const assert = require("node:assert/strict");
const path = require("node:path");
const mongoose = require("mongoose");

const root = path.join(__dirname, "..");
const modelPath = require.resolve(path.join(root, "models/goatArenaModel.js"));
const servicePath = require.resolve(
  path.join(root, "services/appleCommerceAccountTokenService.js")
);

const owners = new Map();
const tokenModel = {
  async createIndexes() {},
  findOne({ token }) {
    return {
      async lean() {
        return owners.get(token) || null;
      },
    };
  },
  async create({ userId, token }) {
    if (owners.has(token)) {
      const error = new Error("duplicate token");
      error.code = 11000;
      throw error;
    }
    const value = { userId: String(userId), token };
    owners.set(token, value);
    return value;
  },
};

require.cache[modelPath] = {
  id: modelPath,
  filename: modelPath,
  loaded: true,
  exports: { AppleCommerceAccountToken: tokenModel },
};
delete require.cache[servicePath];
const service = require(servicePath);

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function run() {
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const tokenA = "9a11c6bd-43cc-4f54-981f-758fcd5fbf33";

  const first = await service.issueAppleCommerceAccountToken({
    userId: userA,
    proposedToken: tokenA.toUpperCase(),
  });
  assert.equal(first.token, tokenA, "UUID는 소문자 정규화되어야 합니다.");

  const replay = await service.issueAppleCommerceAccountToken({
    userId: userA,
    proposedToken: tokenA,
  });
  assert.equal(replay.token, tokenA, "같은 사용자의 재등록은 멱등이어야 합니다.");

  await expectCode(
    service.issueAppleCommerceAccountToken({
      userId: userB,
      proposedToken: tokenA,
    }),
    "APPLE_APP_ACCOUNT_OWNER_CONFLICT"
  );

  await expectCode(
    service.issueAppleCommerceAccountToken({
      userId: userA,
      proposedToken: "not-a-uuid",
    }),
    "APPLE_APP_ACCOUNT_TOKEN_INVALID"
  );

  await expectCode(
    service.assertAppleCommerceAccountTokenOwner({
      userId: userA,
      token: null,
    }),
    "APPLE_APP_ACCOUNT_TOKEN_REQUIRED"
  );

  const generated = await service.issueAppleCommerceAccountToken({
    userId: userA,
  });
  assert.match(generated.token, /^[0-9a-f-]{36}$/);
  assert.notEqual(generated.token, tokenA);

  console.log("Apple commerce account-token ownership contract passed");
}

run().finally(() => {
  delete require.cache[servicePath];
  delete require.cache[modelPath];
});
