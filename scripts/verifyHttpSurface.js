const assert = require("node:assert/strict");
const {
  requestInProcess,
} = require("../audit/inProcessHttpRequest");

process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";

const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);

const { server } = require("../server");

async function listenOnEphemeralPort() {
  return new Promise((resolve, reject) => {
    const listener = server.listen(0, "127.0.0.1");
    listener.once("error", reject);
    listener.once("listening", () => resolve(listener));
  });
}

async function close(listener) {
  if (!listener?.listening) return;
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  let listener;
  try {
    listener =
      await listenOnEphemeralPort();
  } catch (error) {
    if (error?.code !== "EPERM") {
      throw error;
    }
    return verifyInProcess();
  }
  const address = listener.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const live = await fetch(`${origin}/api/v1/live`, { redirect: "manual" });
    assert.equal(live.status, 200);
    assert.equal((await live.json()).status, "ok");
    assert.equal(live.headers.get("x-content-type-options"), "nosniff");
    assert.equal(live.headers.get("x-frame-options"), "DENY");
    assert.match(live.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);

    const ready = await fetch(`${origin}/api/v1/ready`, { redirect: "manual" });
    assert.equal(ready.status, 503);
    assert.equal((await ready.json()).status, "not_ready");

    const providers = await fetch(
      `${origin}/api/v1/auth/providers`,
      { redirect: "manual" }
    );
    assert.equal(providers.status, 200);
    assert.deepEqual(
      (await providers.json()).providers.map((item) => item.key),
      // 순서는 publicProviderStatus() 가 만드는 순서다 — PROVIDERS 테이블
      // (google, kakao) 뒤에 애플이 붙는다. 애플만 테이블 밖인 이유는
      // socialAuthService 주석에 있다.
      //
      // apple 이 이 목록에서 사라지는 것은 기능 회귀가 아니라 **출시 차단 사유**다.
      // 제3자 소셜 로그인만 있고 동등한 대안이 없으면 심사지침 4.8 로 반려된다.
      // 카카오는 그 대안이 되지 못한다 — 이름·이메일 외 수집, 이메일 가리기 없음.
      ["google", "kakao", "apple"]
    );

    const invalidMobileStart = await fetch(
      `${origin}/auth/google/app?code_challenge=short`,
      { redirect: "manual" }
    );
    assert.equal(invalidMobileStart.status, 302);
    assert.match(
      invalidMobileStart.headers.get("location") || "",
      /^matths:\/\/oauth\/google\?error=/
    );

    for (const path of ["/login", "/faq", "/terms"]) {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" });
      assert.equal(response.status, 200, `${path} 응답 상태가 200이 아닙니다.`);
      assert.match(response.headers.get("content-type") || "", /text\/html/);
      assert.ok((await response.text()).includes("Matths"), `${path} 화면이 렌더링되지 않았습니다.`);
    }

    const rejected = await fetch(`${origin}/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: "identifier=test&password=test",
    });
    assert.equal(rejected.status, 403);

    const missing = await fetch(`${origin}/this-page-does-not-exist`, {
      redirect: "manual",
    });
    assert.equal(missing.status, 404);

    console.log(
      "HTTP surface verified without starting schedulers or connecting to the operating database."
    );
  } finally {
    await close(listener);
  }
}

async function verifyInProcess() {
  const live =
    await requestInProcess(
      server,
      {
        path: "/api/v1/live",
      }
    );
  assert.equal(live.status, 200);
  assert.match(
    live.body,
    /"status":"ok"/
  );
  assert.equal(
    live.headers[
      "x-content-type-options"
    ],
    "nosniff"
  );
  assert.equal(
    live.headers["x-frame-options"],
    "DENY"
  );
  assert.match(
    live.headers[
      "content-security-policy"
    ] || "",
    /frame-ancestors 'none'/
  );

  const ready =
    await requestInProcess(
      server,
      {
        path: "/api/v1/ready",
      }
    );
  assert.equal(ready.status, 503);
  assert.match(
    ready.body,
    /"status":"not_ready"/
  );

  const providers =
    await requestInProcess(
      server,
      {
        path:
          "/api/v1/auth/providers",
      }
    );
  assert.equal(providers.status, 200);
  assert.match(
    providers.body,
    /"key":"google"/
  );
  assert.match(
    providers.body,
    /"key":"kakao"/
  );

  const invalidMobileStart =
    await requestInProcess(
      server,
      {
        path:
          "/auth/google/app?code_challenge=short",
      }
    );
  assert.equal(
    invalidMobileStart.status,
    302
  );
  assert.match(
    invalidMobileStart.headers
      .location || "",
    /^matths:\/\/oauth\/google\?error=/
  );

  for (const path of [
    "/login",
    "/faq",
    "/terms",
  ]) {
    const response =
      await requestInProcess(
        server,
        { path }
      );
    assert.equal(
      response.status,
      200,
      `${path} 응답 상태가 200이 아닙니다.`
    );
    assert.match(
      response.headers[
        "content-type"
      ] || "",
      /text\/html/
    );
    assert.match(
      response.body,
      /Matths/,
      `${path} 화면이 렌더링되지 않았습니다.`
    );
  }

  const rejected =
    await requestInProcess(
      server,
      {
        method: "POST",
        path: "/login",
        headers: {
          "content-type":
            "application/x-www-form-urlencoded",
          origin:
            "https://attacker.example",
          "sec-fetch-site":
            "cross-site",
        },
        body:
          "identifier=test&password=test",
      }
    );
  assert.equal(rejected.status, 403);

  const missing =
    await requestInProcess(
      server,
      {
        path:
          "/this-page-does-not-exist",
      }
    );
  assert.equal(missing.status, 404);

  console.log(
    "HTTP surface verified in-process because this environment denied local port binding; the same Express middleware, routes, headers, and rendered views were exercised."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
