const assert = require("node:assert/strict");

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
  const listener = await listenOnEphemeralPort();
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
