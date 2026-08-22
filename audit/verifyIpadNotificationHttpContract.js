const assert = require("node:assert/strict");

/**
 * iPad 알림함 HTTP 계약 검증.
 *
 * 이 검증기가 실제로 무엇을 증명하고 무엇을 증명하지 않는지 먼저 적는다.
 *
 * 증명한다:
 *   · 세 경로가 실제로 등록돼 있다 (404 가 아니다)
 *   · 세 경로가 전부 requireApiAuth **뒤**에 있다 (Bearer 없으면 401)
 *   · `/notifications/read-all` 이 `/notifications/:notificationId/read` 에
 *     삼켜지지 않는다 — 등록 순서가 뒤집히면 "read-all" 이 알림 id 로 잡혀
 *     전체 읽음이 조용히 404 가 된다. 이건 라우터 스택을 직접 읽어 확인한다.
 *   · 앱이 읽는 필드만 직렬화된다 (userId·createdBy 같은 내부 필드가 새지 않는다)
 *
 * 증명하지 않는다:
 *   · 실제 Mongo 문서를 넣고 빼는 흐름. 이 저장소에는 테스트 DB 도
 *     mongodb-memory-server 도 없다. 목록 내용·페이지네이션·읽음 반영은
 *     **격리 DB 나 테스트 계정으로 따로 확인해야 한다.**
 *     통과했다고 "알림함 전체 검증 완료" 라고 쓰지 마라.
 */

process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";

const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);

const { server } = require("../server");

const OBJECT_ID = "0123456789abcdef01234567";

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

/** 라우터 스택을 직접 읽어 등록 순서와 인증 경계를 확인한다. */
function verifyRouteRegistration() {
  const router = require("../routes/api-routes");
  const order = [];
  let behindAuth = false;

  for (const layer of router.stack) {
    const handleName = layer.name || layer.handle?.name;
    if (handleName === "requireApiAuth") behindAuth = true;
    if (!layer.route) continue;
    if (!layer.route.path.startsWith("/notifications")) continue;
    order.push({
      method: Object.keys(layer.route.methods)[0].toUpperCase(),
      path: layer.route.path,
      behindAuth,
    });
  }

  const paths = order.map((row) => `${row.method} ${row.path}`);
  assert.deepEqual(paths, [
    "GET /notifications",
    "POST /notifications/read-all",
    "POST /notifications/:notificationId/read",
  ], `알림 라우트 등록 순서가 계약과 다릅니다: ${JSON.stringify(paths)}`);

  for (const row of order) {
    assert.equal(
      row.behindAuth,
      true,
      `${row.method} ${row.path} 가 requireApiAuth 앞에 있습니다 — 알림함은 계정 자료입니다`
    );
  }

  const readAll = paths.indexOf("POST /notifications/read-all");
  const byId = paths.indexOf("POST /notifications/:notificationId/read");
  assert.ok(
    readAll < byId,
    "read-all 이 :notificationId 뒤에 등록되면 전체 읽음이 알림 id 로 잡혀 404 가 됩니다"
  );

  console.log("  ✓ 세 경로 등록·순서·인증 경계");
}

/** 앱으로 내보내는 필드가 화이트리스트로 묶여 있는지 확인한다. */
function verifySerializerBoundary() {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "controllers", "ipadNotificationController.js"),
    "utf8"
  );

  // 내부 필드가 응답에 실려 나가면 안 된다.
  for (const leaked of ["userId", "createdBy", "dedupeKey", "_id"]) {
    assert.ok(
      !new RegExp(`APP_FIELDS[\\s\\S]*?"${leaked}"[\\s\\S]*?\\]`).test(source),
      `APP_FIELDS 에 내부 필드 ${leaked} 가 들어 있습니다`
    );
  }
  // href 는 반드시 정제본(targetHref)을 써야 한다.
  assert.match(
    source,
    /output\.href\s*=\s*notification\.targetHref/,
    "href 는 safeInternalHref 를 거친 targetHref 를 내보내야 합니다 — 원본 href 는 외부 URL 일 수 있습니다"
  );
  // 서비스 반환값을 통째로 뿌리면 안 된다.
  assert.ok(
    !/res\.json\(\s*inbox\s*\)/.test(source),
    "서비스 반환값을 그대로 내보내면 lean 문서의 내부 필드가 앱으로 샙니다"
  );

  console.log("  ✓ 직렬화 경계 (내부 필드 비노출 · href 정제)");
}

async function verifyAuthBoundaryOverHttp(origin) {
  const cases = [
    ["GET", "/api/v1/notifications"],
    ["POST", "/api/v1/notifications/read-all"],
    ["POST", `/api/v1/notifications/${OBJECT_ID}/read`],
  ];

  for (const [method, path] of cases) {
    const response = await fetch(`${origin}${path}`, {
      method,
      redirect: "manual",
    });
    assert.notEqual(
      response.status,
      404,
      `${method} ${path} 가 404 입니다 — 라우트가 등록되지 않았습니다`
    );
    assert.equal(
      response.status,
      401,
      `${method} ${path} 는 Bearer 없이 401 이어야 합니다 (받은 값 ${response.status})`
    );
  }

  console.log("  ✓ Bearer 없는 요청 3건 전부 401");
}

async function main() {
  console.log("iPad 알림함 HTTP 계약");

  verifyRouteRegistration();
  verifySerializerBoundary();

  let listener;
  try {
    listener = await listenOnEphemeralPort();
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
    // 샌드박스가 소켓을 막으면 등록·직렬화 검사만으로 끝낸다.
    // 조용히 통과시키지 않고 무엇을 못 봤는지 남긴다.
    console.log("  · 소켓 바인딩 불가(EPERM) — HTTP 인증 경계 검사는 건너뜀");
    console.log("iPad 알림함 HTTP 계약 통과 (부분)");
    return;
  }

  try {
    const { port } = listener.address();
    await verifyAuthBoundaryOverHttp(`http://127.0.0.1:${port}`);
  } finally {
    await close(listener);
  }

  console.log("iPad 알림함 HTTP 계약 통과");
  console.log("  ⚠️ 실제 Mongo 문서 흐름(목록·페이지·읽음 반영)은 별도 확인 필요");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
