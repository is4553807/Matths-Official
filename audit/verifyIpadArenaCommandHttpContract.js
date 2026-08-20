const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * iPad GOAT Arena 경기 명령 HTTP 계약 검증.
 *
 * 이 검증기가 무엇을 증명하고 무엇을 증명하지 않는지 먼저 적는다.
 *
 * 증명한다:
 *   · **정산 격리** — 새 서비스·컨트롤러 어디에도 settleArenaMatch 가 없다.
 *     이게 이 파일에서 가장 중요한 단정이다. 경기 명령 경로에서 정산이 시작되면
 *     같은 경기를 웹과 앱이 서로 다른 시점에 정산할 수 있고, 그 결과는 되돌릴 수
 *     없다. 증거 제출 흐름만 정산을 시작한다.
 *   · 문항 직렬화가 화이트리스트다 — answer·answerKey·solution 이 앱으로 나가지
 *     않는다. 정답이 기기로 내려가면 경기 자체가 무의미해진다.
 *   · 멱등키(Idempotency-Key)와 클라이언트 버전(X-Matths-Client-Version) 헤더가
 *     없으면 명령이 서비스까지 내려가지 않고 400 으로 끊긴다.
 *   · 허용하지 않은 본문 필드는 400 이다.
 *   · 7개 경로가 등록돼 있고 전부 requireApiAuth **뒤**에 있다
 *     (Bearer 없이 404 가 아니라 401).
 *
 * 증명하지 않는다(Mongo 없이는 확인 불가):
 *   · 실제 경기 진행 — 문제팩 배정, 문항 공개 순서, 문항별 마감 계산,
 *     자동 진행(만료 문항 확정), answerRevision 증가, 마지막 문항 advance 가
 *     EVIDENCE_REQUIRED 로 넘어가는지.
 *   · 같은 멱등키 재전송이 실제로 중복 저장을 막는지(정본 서비스의 idempotency
 *     레코드가 Mongo 에 있다).
 *   · 남의 경기 id 로 접근할 때 404 가 나오는지(ArenaMatch 조회가 필요하다).
 *   이 검증기가 통과했다고 "Arena 앱 경기 검증 완료" 라고 쓰지 마라.
 *   위 항목은 격리 DB 나 테스트 계정으로 따로 확인해야 한다.
 */

process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";

const mongoose = require("mongoose");
// 연결 없이 모델을 require 하므로 버퍼링을 꺼 둔다. 켜 두면 실수로 쿼리가
// 나갔을 때 조용히 매달려 타임아웃까지 기다린다.
mongoose.set("bufferCommands", false);

const OBJECT_ID = "0123456789abcdef01234567";
const CLIENT_BUILD = "1.0.0(1)";
const COMMAND_KEY = "b3f0a1c2-4d5e-6f70-8192-a3b4c5d6e7f8";

const SERVICE_PATH = path.join(
  __dirname,
  "..",
  "services",
  "goatArenaProductionCommandService.js"
);
const CONTROLLER_PATH = path.join(
  __dirname,
  "..",
  "controllers",
  "ipadGoatArenaCommandController.js"
);

/** 앱이 실제로 부르는 7개 경로. 등록 순서 확인의 기준이기도 하다. */
const COMMAND_ROUTES = [
  ["POST", "/goat-arena/matches/:matchId/start"],
  ["POST", "/goat-arena/matches/:matchId/answers"],
  ["POST", "/goat-arena/matches/:matchId/advance"],
  ["POST", "/goat-arena/matches/:matchId/heartbeat"],
  ["POST", "/goat-arena/matches/:matchId/focus"],
  ["POST", "/goat-arena/matches/:matchId/network-state"],
  ["GET", "/goat-arena/matches/:matchId/questions"],
];

/**
 * 정산 격리 회귀 방지.
 *
 * 참조 구현에서 settleArenaMatch 를 부르는 함수는 증거 제출
 * (submitParticipantEvidence) 하나뿐이었다. 그 함수를 포팅에서 통째로 뺐으므로
 * 새 파일에는 정산 관련 식별자가 하나도 남아 있으면 안 된다. 문자열로 검사하는
 * 이유는, 나중에 누가 "편의상" import 만 되살려 놓는 것까지 잡기 위해서다.
 */
function verifySettlementIsolation() {
  const forbidden = [
    "settleArenaMatch",
    "arenaMatchSettlementService",
    "submitParticipantEvidence",
    "submitArenaMatchEvidence",
    "arenaMatchEvidenceService",
    "attachArenaClientReview",
  ];

  for (const file of [SERVICE_PATH, CONTROLLER_PATH]) {
    const source = fs.readFileSync(file, "utf8");
    // 주석에서 "정산을 부르지 않는다" 고 설명하는 문장까지 걸리면 안 되므로
    // 주석 줄은 걷어 내고 코드만 본다.
    const code = source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return (
          !trimmed.startsWith("*") &&
          !trimmed.startsWith("//") &&
          !trimmed.startsWith("/*")
        );
      })
      .join("\n");

    for (const identifier of forbidden) {
      assert.ok(
        !code.includes(identifier),
        `${path.basename(file)} 에 ${identifier} 가 있습니다 — ` +
          "경기 명령 경로는 정산·증거를 시작하면 안 됩니다"
      );
    }
  }

  console.log("  ✓ 정산 격리 (settleArenaMatch·증거 경로 부재)");
}

/**
 * 문항 직렬화 경계.
 *
 * Mongo 없이 확인할 수 있다. 문제팩 문서 모양을 손으로 만들고 서비스의
 * 직렬화 함수를 직접 불러, 정답·풀이가 응답 JSON 어디에도 없는지 본다.
 */
function verifyQuestionSerializerBoundary() {
  const {
    createGoatArenaProductionCommandService,
  } = require("../services/goatArenaProductionCommandService");
  const service = createGoatArenaProductionCommandService();

  const authority = {
    match: {
      _id: OBJECT_ID,
      status: "IN_PROGRESS",
      scoringVersion: "ARENA_SCORING_V1",
      timeLimitMs: 600000,
      startDeadlineAt: new Date("2026-08-20T00:00:00.000Z"),
      completionDeadlineAt: null,
    },
    attempt: {
      _id: OBJECT_ID,
      status: "IN_PROGRESS",
      currentQuestionIndex: 0,
      answerRevision: 3,
      answers: [{ questionKey: "Q-1", value: "12" }],
      startedAt: new Date("2026-08-20T00:00:00.000Z"),
      deadlineAt: new Date("2026-08-20T00:10:00.000Z"),
      submittedAt: null,
      evidenceDeadlineAt: null,
    },
    pack: {
      _id: OBJECT_ID,
      version: "ARENA-PACK-V1",
      curriculumCoverage: ["MATH-1"],
      scoringVersion: "ARENA_SCORING_V1",
      questionCount: 5,
      timeLimitMs: 600000,
      sealedAt: new Date("2026-08-19T00:00:00.000Z"),
      contentHash: "a".repeat(64),
      questions: [
        {
          questionKey: "Q-1",
          prompt: "문항 본문",
          inputMode: "short-answer",
          choices: [{ key: "1", text: "보기", explanation: "노출 금지" }],
          points: 20,
          difficultyScore: 62,
          difficultyPosition: "HIGH",
          visualization: { kind: "GRAPH" },
          answer: "42",
          answerKey: { value: "42" },
          solution: "정답 풀이 전문",
          solutionProcess: [{ step: "노출 금지" }],
          finalCheck: "노출 금지",
        },
      ],
    },
    role: "CHALLENGER",
  };

  const questionPack = service._testing.serializeQuestionPack(authority);
  const serialized = JSON.stringify(questionPack);

  for (const leaked of ["42", "정답 풀이 전문", "노출 금지"]) {
    assert.ok(
      !serialized.includes(leaked),
      `문항 응답에 ${leaked} 가 실려 나갑니다 — 직렬화는 화이트리스트여야 합니다`
    );
  }
  for (const leakedKey of [
    "answer\"",
    "answerKey",
    "solution",
    "finalCheck",
    "contentHash",
  ]) {
    assert.ok(
      !serialized.includes(leakedKey),
      `문항 응답에 ${leakedKey} 필드가 있습니다`
    );
  }

  // 앱 Codable 이 요구하는 키가 전부 있는지도 같이 본다. 빠지면 기기에서
  // 디코딩이 통째로 실패해 화면이 비어 버린다.
  const question = questionPack.questions[0];
  assert.deepEqual(
    Object.keys(question).sort(),
    [
      "advanced",
      "calibratedDifficulty",
      "choices",
      "inputMode",
      "questionVersionId",
      "savedAnswer",
      "scoreWeight",
      "slot",
      "stem",
      "targetDifficulty",
      "visualizationJSON",
    ],
    `문항 키가 앱 Codable 과 다릅니다: ${JSON.stringify(Object.keys(question))}`
  );
  assert.equal(question.inputMode, "SHORT_ANSWER");
  assert.equal(question.slot, 1);
  assert.equal(question.savedAnswer, "12");
  assert.equal(question.visualizationJSON, '{"kind":"GRAPH"}');
  assert.deepEqual(question.choices, [{ key: "1", text: "보기" }]);

  const attempt = service._testing.serializeAttempt(authority);
  // completionDeadlineAt 이 없으면 startDeadlineAt 으로 대체돼야 한다.
  // 앱 모델에서 commonSubmitsBy 는 비옵셔널 String 이라 null 이면 디코딩 실패다.
  assert.equal(attempt.commonSubmitsBy, "2026-08-20T00:00:00.000Z");
  assert.equal(attempt.evidenceRequired, false);

  console.log("  ✓ 문항 직렬화 화이트리스트 (정답·풀이 비노출 · 앱 키 일치)");
}

/** 컨트롤러 핸들러를 직접 불러 헤더·본문 계약을 확인한다(Mongo 불필요). */
async function invokeHandler(handler, { headers = {}, body = {}, apiUser }) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const req = {
    params: { matchId: OBJECT_ID },
    body,
    apiUser,
    headers: normalized,
    get(name) {
      return normalized[String(name).toLowerCase()];
    },
  };
  let payload = null;
  const res = {
    set() {
      return res;
    },
    json(value) {
      payload = value;
      return res;
    },
  };
  return new Promise((resolve) => {
    handler(req, res, (error) => resolve({ error, payload: null })).then(() =>
      resolve({ error: null, payload })
    );
  });
}

/**
 * 헤더 → 명령 인자 변환 계약.
 *
 * 앱은 멱등키를 Idempotency-Key **헤더**로 보내고, 정본 서비스는 requestId
 * 인자를 받는다. 그 변환이 컨트롤러에 있고, 헤더가 없으면 서비스까지 내려가지
 * 않는다는 것을 확인한다. 서비스는 가짜로 주입해 DB 를 건드리지 않는다.
 */
async function verifyCommandHeaderContract() {
  const {
    createIpadGoatArenaCommandController,
  } = require("../controllers/ipadGoatArenaCommandController");

  const calls = [];
  const stub = {
    async startParticipantMatch(context, input) {
      calls.push({ command: "start", context, input });
      return { attempt: {}, questionPack: {} };
    },
    async getParticipantQuestionPack(context, input) {
      calls.push({ command: "questions", context, input });
      return {};
    },
    async recordParticipantEvent(context, input) {
      calls.push({ command: "event", context, input });
      return {};
    },
    async advanceParticipantQuestion(context, input) {
      calls.push({ command: "advance", context, input });
      return { attempt: {}, questionPack: {} };
    },
  };
  const controller = createIpadGoatArenaCommandController({
    commandService: stub,
  });
  const apiUser = { _id: OBJECT_ID };
  const fullHeaders = {
    "Idempotency-Key": COMMAND_KEY,
    "X-Matths-Client-Version": CLIENT_BUILD,
  };

  const handlers = [
    ["startMatch", controller.startMatch, {}],
    ["getQuestions", controller.getQuestions, {}],
    ["heartbeat", controller.heartbeat, {}],
    ["saveAnswer", controller.saveAnswer, { questionSlot: 1, answer: "12" }],
    ["recordQuestionFocus", controller.recordQuestionFocus, { questionSlot: 1 }],
    ["recordNetworkState", controller.recordNetworkState, {
      networkState: "ONLINE",
    }],
    ["advanceQuestion", controller.advanceQuestion, {
      questionSlot: 1,
      answer: "12",
    }],
  ];

  for (const [name, handler, body] of handlers) {
    calls.length = 0;

    // ① 멱등키 없음 → 400, 서비스 호출 없음
    let result = await invokeHandler(handler, {
      headers: { "X-Matths-Client-Version": CLIENT_BUILD },
      body,
      apiUser,
    });
    assert.ok(result.error, `${name}: Idempotency-Key 없이 통과했습니다`);
    assert.equal(
      result.error.status,
      400,
      `${name}: Idempotency-Key 누락은 400 이어야 합니다`
    );
    assert.equal(result.error.code, "GOAT_ARENA_COMMAND_HEADER_REQUIRED");
    assert.equal(
      calls.length,
      0,
      `${name}: 멱등키 없이 서비스가 호출됐습니다 — 재전송이 중복 명령이 됩니다`
    );

    // ② 클라이언트 버전 없음 → 400
    result = await invokeHandler(handler, {
      headers: { "Idempotency-Key": COMMAND_KEY },
      body,
      apiUser,
    });
    assert.ok(result.error, `${name}: X-Matths-Client-Version 없이 통과했습니다`);
    assert.equal(result.error.status, 400);
    assert.equal(calls.length, 0);

    // ③ 인증 사용자 없음 → 401 (라우트가 requireApiAuth 앞에 잘못 놓인 경우)
    result = await invokeHandler(handler, {
      headers: fullHeaders,
      body,
      apiUser: null,
    });
    assert.ok(result.error, `${name}: 인증 사용자 없이 통과했습니다`);
    assert.equal(result.error.status, 401);
    assert.equal(calls.length, 0);

    // ④ 허용되지 않은 본문 필드 → 400
    result = await invokeHandler(handler, {
      headers: fullHeaders,
      body: { ...body, unexpectedField: 1 },
      apiUser,
    });
    assert.ok(result.error, `${name}: 모르는 본문 필드가 통과했습니다`);
    assert.equal(result.error.status, 400);
    assert.equal(result.error.code, "GOAT_ARENA_COMMAND_BODY_INVALID");

    // ⑤ 정상 요청 → 헤더가 명령 인자로 옮겨진다
    result = await invokeHandler(handler, {
      headers: fullHeaders,
      body,
      apiUser,
    });
    assert.equal(result.error, null, `${name}: 정상 요청이 실패했습니다`);
    assert.equal(calls.length, 1, `${name}: 서비스가 정확히 한 번 불려야 합니다`);
    const [call] = calls;
    assert.equal(
      call.input.idempotencyKey,
      COMMAND_KEY,
      `${name}: Idempotency-Key 헤더가 idempotencyKey 로 옮겨지지 않았습니다`
    );
    assert.equal(call.input.clientBuildVersion, CLIENT_BUILD);
    assert.equal(call.input.matchId, OBJECT_ID);
    assert.equal(String(call.context.userId), OBJECT_ID);
  }

  // 이벤트 4종이 서로 다른 eventType 으로 갈리는지 확인한다.
  const eventTypes = [];
  for (const [name, handler, body] of handlers) {
    if (!["heartbeat", "saveAnswer", "recordQuestionFocus", "recordNetworkState"].includes(name)) {
      continue;
    }
    calls.length = 0;
    await invokeHandler(handler, { headers: fullHeaders, body, apiUser });
    eventTypes.push(calls[0].input.eventType);
  }
  assert.deepEqual(eventTypes, [
    "HEARTBEAT",
    "ANSWER_CHANGED",
    "QUESTION_FOCUS",
    "NETWORK_STATE",
  ]);

  console.log("  ✓ 헤더 → 명령 인자 변환 · 본문 화이트리스트 · eventType 분기");
}

/** 라우터 스택을 직접 읽어 등록 여부와 인증 경계를 확인한다. */
function verifyRouteRegistration() {
  const router = require("../routes/api-routes");
  const found = new Map();
  let behindAuth = false;

  for (const layer of router.stack) {
    const handleName = layer.name || layer.handle?.name;
    if (handleName === "requireApiAuth") behindAuth = true;
    if (!layer.route) continue;
    const routePath = layer.route.path;
    if (!/^\/goat-arena\/matches\/:matchId\//.test(routePath)) continue;
    for (const method of Object.keys(layer.route.methods)) {
      found.set(`${method.toUpperCase()} ${routePath}`, behindAuth);
    }
  }

  const missing = COMMAND_ROUTES.filter(
    ([method, routePath]) => !found.has(`${method} ${routePath}`)
  );
  assert.deepEqual(
    missing,
    [],
    "다음 경로가 routes/api-routes.js 에 등록되지 않았습니다: " +
      `${JSON.stringify(missing)} — requireApiAuth(router.use) 뒤, ` +
      '기존 "/goat-arena/matches/:matchId" GET 블록 다음에 배선하세요'
  );

  for (const [method, routePath] of COMMAND_ROUTES) {
    assert.equal(
      found.get(`${method} ${routePath}`),
      true,
      `${method} ${routePath} 가 requireApiAuth 앞에 있습니다 — ` +
        "경기 명령은 계정 자료입니다"
    );
  }

  console.log("  ✓ 7개 경로 등록 · 전부 Bearer 뒤");
}

async function listenOnEphemeralPort(server) {
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

/**
 * 실제 서버를 임시 포트에 띄워 Bearer 없는 요청이 401 인지 본다.
 *
 * 404 가 아니라 401 이어야 한다는 것이 핵심이다. 404 면 라우트가 아예 없다는
 * 뜻이고, 200 이면 인증 경계 밖에 있다는 뜻이다. requireApiAuth 는 토큰이 없으면
 * Mongo 를 건드리기 전에 401 을 내므로 DB 없이 확인할 수 있다.
 */
async function verifyAuthBoundaryOverHttp(origin) {
  for (const [method, routePath] of COMMAND_ROUTES) {
    const requestPath = `/api/v1${routePath.replace(":matchId", OBJECT_ID)}`;
    const response = await fetch(`${origin}${requestPath}`, {
      method,
      redirect: "manual",
      headers: {
        "Idempotency-Key": COMMAND_KEY,
        "X-Matths-Client-Version": CLIENT_BUILD,
      },
    });
    assert.notEqual(
      response.status,
      404,
      `${method} ${requestPath} 가 404 입니다 — 라우트가 등록되지 않았습니다`
    );
    assert.equal(
      response.status,
      401,
      `${method} ${requestPath} 는 Bearer 없이 401 이어야 합니다 ` +
        `(받은 값 ${response.status})`
    );
  }

  console.log("  ✓ Bearer 없는 요청 7건 전부 401");
}

async function main() {
  console.log("iPad GOAT Arena 경기 명령 HTTP 계약");

  verifySettlementIsolation();
  verifyQuestionSerializerBoundary();
  await verifyCommandHeaderContract();
  verifyRouteRegistration();

  const { server } = require("../server");
  let listener;
  try {
    listener = await listenOnEphemeralPort(server);
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
    // 샌드박스가 소켓을 막으면 나머지 검사만으로 끝낸다. 조용히 통과시키지 않고
    // 무엇을 못 봤는지 남긴다.
    console.log("  · 소켓 바인딩 불가(EPERM) — HTTP 인증 경계 검사는 건너뜀");
    console.log("iPad GOAT Arena 경기 명령 HTTP 계약 통과 (부분)");
    return;
  }

  try {
    const { port } = listener.address();
    await verifyAuthBoundaryOverHttp(`http://127.0.0.1:${port}`);
  } finally {
    await close(listener);
  }

  console.log("iPad GOAT Arena 경기 명령 HTTP 계약 통과");
  console.log(
    "  ⚠️ 실제 경기 흐름(문제팩 배정·자동 진행·멱등 재전송·최종 문항 제출)은 " +
      "Mongo 가 필요해 확인하지 않았습니다 — 격리 DB 로 따로 확인하세요"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
