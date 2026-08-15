const assert = require("node:assert/strict");

const { ParentAccount } = require("../models/parentModel");
const {
  isParentLoggedIn,
  isParentLoggedOut,
} = require("../middleware/parentAuthMiddleware");

function request(parent = null, originalUrl = "/parent/payments") {
  const session = {
    ...(parent ? { parent } : {}),
    save(callback) {
      this.saved = true;
      callback(null);
    },
  };
  return { session, originalUrl };
}

function response() {
  return {
    redirectTarget: "",
    redirect(value) {
      this.redirectTarget = value;
      return value;
    },
  };
}

async function invoke(middleware, req, res) {
  let nextCalled = false;
  let nextError = null;
  await middleware(req, res, (error) => {
    nextCalled = true;
    nextError = error || null;
  });
  return { nextCalled, nextError };
}

async function run() {
  const originalFindOne = ParentAccount.findOne;
  try {
    ParentAccount.findOne = () => ({
      select() { return this; },
      async lean() { return null; },
    });
    const inactiveRequest = request({ id: "64b000000000000000000001" });
    const inactiveResponse = response();
    const inactiveResult = await invoke(isParentLoggedIn, inactiveRequest, inactiveResponse);
    assert.equal(inactiveResult.nextCalled, false);
    assert.equal(inactiveResponse.redirectTarget, "/parent/login?next=%2Fparent%2Fpayments");
    assert.equal(inactiveRequest.session.parent, undefined);
    assert.equal(inactiveRequest.session.saved, true);

    const staleLoginRequest = request({ id: "64b000000000000000000001" }, "/parent/login");
    const staleLoginResponse = response();
    const staleLoginResult = await invoke(isParentLoggedOut, staleLoginRequest, staleLoginResponse);
    assert.equal(staleLoginResult.nextCalled, true);
    assert.equal(staleLoginResult.nextError, null);
    assert.equal(staleLoginResponse.redirectTarget, "");
    assert.equal(staleLoginRequest.session.parent, undefined);

    ParentAccount.findOne = () => ({
      select() { return this; },
      async lean() { return { _id: "64b000000000000000000001" }; },
    });
    const activeRequest = request({ id: "64b000000000000000000001" });
    const activeResponse = response();
    const activeResult = await invoke(isParentLoggedIn, activeRequest, activeResponse);
    assert.equal(activeResult.nextCalled, true);
    assert.equal(activeResult.nextError, null);
    assert.equal(activeResponse.redirectTarget, "");

    const activeLoginResponse = response();
    const activeLoginResult = await invoke(isParentLoggedOut, activeRequest, activeLoginResponse);
    assert.equal(activeLoginResult.nextCalled, false);
    assert.equal(activeLoginResponse.redirectTarget, "/parent");

    const invalidRequest = request({ id: "not-an-object-id" });
    const invalidResponse = response();
    await invoke(isParentLoggedIn, invalidRequest, invalidResponse);
    assert.equal(invalidRequest.session.parent, undefined);
    assert.equal(invalidResponse.redirectTarget, "/parent/login?next=%2Fparent%2Fpayments");
  } finally {
    ParentAccount.findOne = originalFindOne;
  }
  console.log("Parent authorization revocation verified: active sessions pass, inactive/deleted/invalid sessions are cleared, and login is reachable again.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
