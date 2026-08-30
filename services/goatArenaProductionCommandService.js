const mongoose = require("mongoose");

const {
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  advanceArenaMatchQuestion,
  getArenaMatchPageData,
  prepareArenaMatch,
  recordArenaMatchActivity,
  saveArenaMatchAnswers,
  startArenaMatchAttempt,
  submitArenaMatchAttempt,
} = require("./arenaMatchAttemptService");
const {
  buildArenaMatchIntegrityWatermark,
} = require("./contentProtectionWatermarkPolicy");
const {
  assertInlineSolutionBoard,
  promoteInlineSolutionBoards,
} = require("./arenaInlineSolutionBoardService");

/**
 * iPad GOAT Arena 경기 명령 어댑터.
 *
 * 무엇을 하는 계층인가. 경기 진행 규칙(문항 공개 순서·문항별 제한시간·자동 진행·
 * 최종 문항 제출·활동 신호 기록)은 전부 arenaMatchAttemptService 에 이미 있다.
 * 웹은 그 함수들을 EJS 페이지 컨트롤러에서 부르고, 앱은 Bearer + JSON 으로 부른다.
 * 이 파일은 **그 사이를 번역만** 한다. 규칙을 새로 쓰지 않는다 — 두 벌이 되는 순간
 * 같은 학생이 웹과 앱에서 다른 문항·다른 마감을 보게 된다.
 *
 * 왜 서비스 계층을 또 만드는가(컨트롤러에서 바로 부르지 않고). 앱 계약은
 * "명령 1개 = 응답 1개" 인데, 실제로는 한 명령이 두세 개의 정본 함수를 순서대로
 * 불러야 성립한다(예: start = prepare → start → 자동 진행 갱신 → 직렬화).
 * 그 조립 순서가 컨트롤러에 흩어지면 라우트마다 조금씩 달라진다.
 *
 * **정산(settlement)은 이 파일에 없다.** 정산은 증거 제출 흐름에서만 시작된다.
 * settleArenaMatch 를 여기서 부르는 순간 앱이 경기 결과를 만들 수 있게 되고,
 * 웹/앱 두 경로가 같은 경기를 서로 다른 시점에 정산할 수 있다. 그래서 증거 명령
 * (submitParticipantEvidence)과 settleArenaMatch import 는 이 포팅에서 통째로
 * 뺐다. audit/verifyIpadArenaCommandHttpContract.js 가 이 파일에
 * "settleArenaMatch" 문자열이 없는지 매번 확인한다.
 *
 * 멱등키 처리. 앱은 Idempotency-Key **헤더**로 명령 키를 보낸다. 정본 서비스는
 * requestId 인자를 받아 normalizeOperationId 로 검사한다(16~160자,
 * [A-Za-z0-9._:-]). 헤더 → requestId 변환은 컨트롤러가 하고, 이 파일은
 * idempotencyKey 라는 이름으로 받아 그대로 requestId 자리에 넣는다.
 */

const MAX_MATCH_ID_LENGTH = 160;
const MAX_IDEMPOTENCY_KEY_LENGTH = 180;
const MAX_BUILD_VERSION_LENGTH = 100;

class GoatArenaProductionCommandError extends Error {
  constructor(code, message, { statusCode = 400, details = null } = {}) {
    super(message);
    this.name = "GoatArenaProductionCommandError";
    this.code = code;
    // errorMiddleware 는 error.status 를 읽고, 일부 호출부는 statusCode 를 읽는다.
    // 둘 다 채워 두지 않으면 어느 한쪽에서 500 으로 뭉개진다.
    this.status = statusCode;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function fail(code, message, options) {
  throw new GoatArenaProductionCommandError(code, message, options);
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string") {
    fail("GOAT_ARENA_COMMAND_INPUT_INVALID", `${label} 형식을 확인해주세요.`);
  }
  // NFKC 정규화는 iOS 키보드가 넣는 호환 문자를 정본과 같은 형태로 맞추기 위한 것이다.
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > maxLength) {
    fail("GOAT_ARENA_COMMAND_INPUT_INVALID", `${label} 값을 확인해주세요.`);
  }
  return normalized;
}

function authenticatedUserId(authContext) {
  const value = authContext?.userId;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    fail("GOAT_ARENA_AUTH_REQUIRED", "다시 로그인한 뒤 시도해주세요.", {
      statusCode: 401,
    });
  }
  return new mongoose.Types.ObjectId(value);
}

/**
 * 허용 필드 화이트리스트로 입력을 막는다.
 *
 * 모르는 필드를 조용히 버리지 않고 400 으로 되돌리는 이유는, 앱이 오타 난 키로
 * 답을 보내면 "저장된 줄 알았는데 빈 답" 이 되기 때문이다. 경기 중에는 그 침묵이
 * 곧 실점이다.
 */
function normalizedInput(rawInput, allowedFields) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    fail("GOAT_ARENA_COMMAND_INPUT_INVALID", "요청 형식을 확인해주세요.");
  }
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(rawInput).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    fail(
      "GOAT_ARENA_COMMAND_INPUT_INVALID",
      "요청에 허용되지 않은 값이 포함되어 있습니다.",
      { details: { fields: unexpected.sort() } }
    );
  }
  return {
    ...rawInput,
    matchId: requiredText(rawInput.matchId, "matchId", MAX_MATCH_ID_LENGTH),
    idempotencyKey: requiredText(
      rawInput.idempotencyKey,
      "idempotencyKey",
      MAX_IDEMPOTENCY_KEY_LENGTH
    ),
    clientBuildVersion: requiredText(
      rawInput.clientBuildVersion,
      "clientBuildVersion",
      MAX_BUILD_VERSION_LENGTH
    ),
  };
}

function isoString(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function participantRole(match, userId) {
  if (String(match?.challenger?.userId) === String(userId)) return "CHALLENGER";
  if (String(match?.defender?.userId) === String(userId)) return "DEFENDER";
  // 참가자가 아니면 "권한 없음(403)" 이 아니라 404 다. 403 은 "그 경기가 있다" 는
  // 사실을 알려 주기 때문에, 남의 경기 id 를 훑어 존재 여부를 캐낼 수 있다.
  fail("GOAT_ARENA_MATCH_NOT_FOUND", "GOAT Arena match was not found", {
    statusCode: 404,
  });
}

function createGoatArenaProductionCommandService(options = {}) {
  const models = {
    ArenaMatch: options.models?.ArenaMatch || ArenaMatch,
    ArenaMatchAttempt: options.models?.ArenaMatchAttempt || ArenaMatchAttempt,
    ArenaMatchAttemptEvent:
      options.models?.ArenaMatchAttemptEvent || ArenaMatchAttemptEvent,
    ArenaProblemPack: options.models?.ArenaProblemPack || ArenaProblemPack,
  };
  // 정본 함수를 주입 가능하게 열어 두는 이유는 검증 스크립트가 Mongo 없이
  // 조립 순서만 확인할 수 있게 하려는 것이다. 기본값은 항상 정본이다.
  const commands = {
    advanceArenaMatchQuestion:
      options.commands?.advanceArenaMatchQuestion || advanceArenaMatchQuestion,
    getArenaMatchPageData:
      options.commands?.getArenaMatchPageData || getArenaMatchPageData,
    prepareArenaMatch: options.commands?.prepareArenaMatch || prepareArenaMatch,
    recordArenaMatchActivity:
      options.commands?.recordArenaMatchActivity || recordArenaMatchActivity,
    saveArenaMatchAnswers:
      options.commands?.saveArenaMatchAnswers || saveArenaMatchAnswers,
    startArenaMatchAttempt:
      options.commands?.startArenaMatchAttempt || startArenaMatchAttempt,
    submitArenaMatchAttempt:
      options.commands?.submitArenaMatchAttempt || submitArenaMatchAttempt,
    assertInlineSolutionBoard:
      options.commands?.assertInlineSolutionBoard || assertInlineSolutionBoard,
    promoteInlineSolutionBoards:
      options.commands?.promoteInlineSolutionBoards || promoteInlineSolutionBoards,
  };
  const now = typeof options.now === "function" ? options.now : () => new Date();

  /**
   * 경기·내 시도·문제팩을 한 번에 읽는다.
   *
   * ArenaMatch 조회 조건에 challenger/defender userId 를 함께 거는 것이 이 계층의
   * 유일한 권한 검사다. 컨트롤러가 따로 소유권을 확인하지 않는 이유이기도 하다 —
   * 조건을 밖으로 빼면 "먼저 읽고 나중에 검사" 가 되어 검사 누락이 생긴다.
   *
   * questions·contentHash 는 스키마에서 select:false 다. 정답과 풀이가 들어 있어
   * 기본 조회로는 절대 나오지 않게 막혀 있고, 여기서만 명시적으로 켠다.
   */
  async function loadParticipantAuthority(matchId, userId) {
    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      fail("GOAT_ARENA_MATCH_NOT_FOUND", "GOAT Arena match was not found", {
        statusCode: 404,
      });
    }
    const match = await models.ArenaMatch.findOne({
      _id: new mongoose.Types.ObjectId(matchId),
      $or: [
        { "challenger.userId": userId },
        { "defender.userId": userId },
      ],
    }).lean();
    if (!match) {
      fail("GOAT_ARENA_MATCH_NOT_FOUND", "GOAT Arena match was not found", {
        statusCode: 404,
      });
    }
    const role = participantRole(match, userId);
    const [attempt, pack] = await Promise.all([
      models.ArenaMatchAttempt.findOne({ matchId: match._id, userId }).lean(),
      match.problemPackId
        ? models.ArenaProblemPack.findById(match.problemPackId)
            .select("+questions +contentHash")
            .lean()
        : null,
    ]);
    return { match, attempt, pack, role };
  }

  function currentQuestion(authority) {
    if (!authority.attempt || !authority.pack) return null;
    const index = Number(authority.attempt.currentQuestionIndex || 0);
    return authority.pack.questions?.[index] || null;
  }

  /**
   * 앱으로 나가는 문항 필드 화이트리스트.
   *
   * 문제팩 문서에는 answer·answerKey·solution·solutionProcess·finalCheck 가 함께
   * 들어 있다. 여기서 필드를 골라 담지 않고 문서를 그대로 넘기면 **정답이 기기로
   * 내려간다.** 그래서 새 필드가 필요하면 반드시 이 함수에 한 줄씩 추가해야 하고,
   * 스프레드(...question)는 쓰지 않는다.
   *
   * 키 이름은 앱의 ServerAPI.GoatArenaQuestionPack.Question 과 1:1 이다.
   */
  function serializeQuestion(question, slot) {
    const visualizationJSON = question.visualization
      ? JSON.stringify(question.visualization)
      : null;
    return {
      slot,
      questionVersionId: question.questionKey,
      stem: question.prompt,
      choices: (question.choices || []).map((choice) => ({
        key: choice.key,
        text: choice.text,
      })),
      // 스키마 enum 은 "short-answer" 하나뿐이고 앱은 대문자 스네이크를 읽는다.
      inputMode:
        question.inputMode === "short-answer"
          ? "SHORT_ANSWER"
          : question.inputMode,
      scoreWeight: Number(question.points || 0),
      targetDifficulty: Number(question.difficultyScore || 0),
      calibratedDifficulty: Number(question.difficultyScore || 0),
      advanced: question.difficultyPosition === "HIGH",
      visualizationJSON,
      savedAnswer: "",
    };
  }

  /**
   * 현재 공개 문항 하나만 담은 questionPack.
   *
   * 5문항을 한꺼번에 내리지 않는 이유는 문항별 제한시간 때문이다. 뒤 문항을 미리
   * 보내면 기기에서 먼저 풀어 두고 시간만 소비한 척할 수 있다. 그래서 questions 는
   * 항상 0개(진행 중이 아닐 때) 또는 1개다.
   */
  function serializeQuestionPack(authority) {
    const { match, attempt, pack, role } = authority;
    if (!pack) {
      fail(
        "GOAT_ARENA_QUESTION_PACK_NOT_READY",
        "participant question pack is not ready",
        { statusCode: 409 }
      );
    }
    const index = Number(attempt?.currentQuestionIndex || 0);
    const question =
      attempt?.status === "IN_PROGRESS" ? currentQuestion(authority) : null;
    const savedAnswer = question
      ? (attempt.answers || []).find(
          (answer) => answer.questionKey === question.questionKey
        )?.value || ""
      : "";
    const integrityWatermark = attempt
      ? buildArenaMatchIntegrityWatermark({
          matchId: match._id,
          userId: attempt.userId,
          attemptId: attempt._id,
          matchType: match.matchType,
          role,
        })
      : null;
    return {
      questionPackId: String(pack._id),
      matchId: String(match._id),
      participantRole: role,
      packVersion: pack.version,
      curriculumVersion: (pack.curriculumCoverage || []).join(","),
      questionVersion: question?.questionKey || pack.version,
      scoringPolicyVersion: match.scoringVersion || pack.scoringVersion,
      questionCount: Number(pack.questionCount || 5),
      currentQuestionNumber: Math.min(
        Number(pack.questionCount || 5),
        index + 1
      ),
      timeLimitSeconds: Math.round(
        Number(pack.timeLimitMs || match.timeLimitMs) / 1000
      ),
      integrityWatermark,
      questions: question
        ? [
            {
              ...serializeQuestion(question, index + 1),
              savedAnswer,
            },
          ]
        : [],
      sealedAt: isoString(pack.sealedAt || pack.createdAt),
    };
  }

  /** 앱의 ServerAPI.GoatArenaAttempt 와 1:1. */
  function serializeAttempt(authority) {
    const { match, attempt, pack, role } = authority;
    if (!attempt || !pack) {
      fail("GOAT_ARENA_ATTEMPT_NOT_READY", "participant attempt is not ready", {
        statusCode: 409,
      });
    }
    return {
      attemptId: String(attempt._id),
      matchId: String(match._id),
      participantRole: role,
      questionPackId: String(pack._id),
      questionPackVersion: pack.version,
      scoringPolicyVersion: match.scoringVersion || pack.scoringVersion,
      timingPolicyVersion: "ARENA_CURRENT_QUESTION_10M_V1",
      status: attempt.status,
      questionCount: Number(pack.questionCount || 5),
      currentQuestionNumber: Math.min(
        Number(pack.questionCount || 5),
        Number(attempt.currentQuestionIndex || 0) + 1
      ),
      timeLimitSeconds: Math.round(
        Number(pack.timeLimitMs || match.timeLimitMs) / 1000
      ),
      startedAt: isoString(attempt.startedAt),
      endsAt: isoString(attempt.deadlineAt),
      // 공통 마감은 경기 전체의 마감이다. completionDeadlineAt 이 아직 없으면
      // startDeadlineAt(스키마 required)이 대신 들어간다 — 앱 모델이 String
      // 비옵셔널이라 null 이 되면 디코딩 자체가 실패한다.
      commonSubmitsBy: isoString(
        match.completionDeadlineAt || match.startDeadlineAt
      ),
      networkReconnectGraceMs: null,
      recognizedHeartbeatActiveMs: 0,
      submittedAt: isoString(attempt.submittedAt),
      evidenceDeadlineAt: isoString(attempt.evidenceDeadlineAt),
      evidenceRequired: attempt.status === "EVIDENCE_REQUIRED",
    };
  }

  function serializeStart(authority) {
    return {
      attempt: serializeAttempt(authority),
      questionPack: serializeQuestionPack(authority),
    };
  }

  /**
   * POST /matches/:matchId/start
   *
   * 상태에 따라 필요한 정본 함수만 골라 부르고, 매번 다시 읽어 확정된 상태로
   * 직렬화한다. 세 단계를 한 요청에서 처리하는 이유는 앱이 재접속할 때
   * (앱 강제 종료·기기 재부팅) 어느 단계에서 끊겼는지 모르기 때문이다.
   * 각 단계는 이미 지난 단계면 건너뛰므로 같은 명령을 여러 번 보내도 안전하다.
   *
   *   MATCHED + 팩 없음  → prepareArenaMatch (문제팩 배정·시도 문서 생성)
   *   시도 READY         → startArenaMatchAttempt (시작 시각·마감 확정)
   *   시도 IN_PROGRESS   → getArenaMatchPageData
   *
   * 마지막 getArenaMatchPageData 호출은 화면 데이터를 쓰려는 게 아니라, 만료된
   * 현재 문항을 서버 시각으로 확정하고 다음 문항만 공개하는 **자동 진행**을
   * 태우기 위한 것이다. 브라우저와 iPad 가 같은 자동 진행 함수를 공유해야
   * 오프라인 동안 흐른 시간이 두 경로에서 같게 계산된다.
   */
  async function startParticipantMatch(authContext, rawInput) {
    const userId = authenticatedUserId(authContext);
    const input = normalizedInput(rawInput, [
      "matchId",
      "idempotencyKey",
      "clientBuildVersion",
    ]);
    let authority = await loadParticipantAuthority(input.matchId, userId);
    if (!authority.pack && authority.match.status === "MATCHED") {
      await commands.prepareArenaMatch({
        matchId: input.matchId,
        userId,
        now: new Date(now()),
      });
      authority = await loadParticipantAuthority(input.matchId, userId);
    }
    if (authority.attempt?.status === "READY") {
      await commands.startArenaMatchAttempt({
        matchId: input.matchId,
        userId,
        requestId: input.idempotencyKey,
        now: new Date(now()),
      });
      authority = await loadParticipantAuthority(input.matchId, userId);
    }
    if (authority.attempt?.status === "IN_PROGRESS") {
      await commands.getArenaMatchPageData({
        matchId: input.matchId,
        userId,
        now: new Date(now()),
      });
      authority = await loadParticipantAuthority(input.matchId, userId);
    }
    return serializeStart(authority);
  }

  /**
   * GET /matches/:matchId/questions
   *
   * 읽기처럼 보이지만 getArenaMatchPageData 를 먼저 태운다. 앱이 백그라운드에서
   * 돌아왔을 때 화면에 남아 있던 문항이 이미 만료됐을 수 있는데, 그 상태로
   * 답을 받으면 지난 문항에 답을 쓰게 된다. 자동 진행을 먼저 확정한 뒤 읽는다.
   */
  async function getParticipantQuestionPack(authContext, rawInput) {
    const userId = authenticatedUserId(authContext);
    const input = normalizedInput(rawInput, [
      "matchId",
      "idempotencyKey",
      "clientBuildVersion",
    ]);
    await commands.getArenaMatchPageData({
      matchId: input.matchId,
      userId,
      now: new Date(now()),
    });
    const authority = await loadParticipantAuthority(input.matchId, userId);
    return serializeQuestionPack(authority);
  }

  /**
   * POST /matches/:matchId/{answers,heartbeat,focus,network-state}
   *
   * 네 경로가 한 함수로 모이는 이유는 응답 계약(GoatArenaEvent)이 하나이기
   * 때문이다. 다만 답 저장만 다른 정본 함수로 간다 — 답은 채점 대상 자료라
   * saveArenaMatchAnswers 의 개정(answerRevision) 경로를 타야 하고, 나머지는
   * 활동 신호라 recordArenaMatchActivity 로 간다.
   *
   * questionSlot 을 서버가 계산한 현재 슬롯과 대조해 어긋나면 409 로 되돌린다.
   * 앱이 늦게 보낸 답이 다음 문항에 덮어써지는 것을 막는 유일한 방어다.
   */
  async function recordParticipantEvent(authContext, rawInput) {
    const userId = authenticatedUserId(authContext);
    const input = normalizedInput(rawInput, [
      "matchId",
      "idempotencyKey",
      "clientBuildVersion",
      "eventType",
      "payload",
    ]);
    const authority = await loadParticipantAuthority(input.matchId, userId);
    const question = currentQuestion(authority);
    const slot = Number(authority.attempt?.currentQuestionIndex || 0) + 1;
    const payload = input.payload || {};
    let answerStored = false;

    if (input.eventType === "ANSWER_CHANGED") {
      if (Number(payload.questionSlot) !== slot || !question) {
        fail(
          "GOAT_ARENA_QUESTION_SEQUENCE_REQUIRED",
          "current question is required",
          { statusCode: 409 }
        );
      }
      await commands.saveArenaMatchAnswers({
        matchId: input.matchId,
        userId,
        requestId: input.idempotencyKey,
        changes: [
          {
            questionKey: question.questionKey,
            value: payload.answer,
            clientAt: new Date(now()),
          },
        ],
        now: new Date(now()),
      });
      answerStored = true;
    } else {
      const signals = [];
      if (input.eventType === "HEARTBEAT") {
        signals.push({ type: "HEARTBEAT", clientAt: new Date(now()) });
      } else if (input.eventType === "QUESTION_FOCUS") {
        if (Number(payload.questionSlot) !== slot || !question) {
          fail(
            "GOAT_ARENA_QUESTION_SEQUENCE_REQUIRED",
            "current question is required",
            { statusCode: 409 }
          );
        }
        signals.push({
          type: "QUESTION_FOCUSED",
          questionKey: question.questionKey,
          clientAt: new Date(now()),
        });
      } else if (input.eventType === "NETWORK_STATE") {
        // 앱의 네트워크/전면 상태를 정본이 아는 두 신호로만 접는다. 새 신호
        // 종류를 여기서 만들면 무결성 판정이 웹과 달라진다.
        const state = String(payload.networkState || "").toUpperCase();
        signals.push({
          type: ["BACKGROUND", "OFFLINE", "DISCONNECTED"].includes(state)
            ? "FOCUS_LOST"
            : "FOCUS_GAINED",
          clientAt: new Date(now()),
        });
      } else {
        fail("GOAT_ARENA_EVENT_TYPE_INVALID", "event type is not supported");
      }
      await commands.recordArenaMatchActivity({
        matchId: input.matchId,
        userId,
        requestId: input.idempotencyKey,
        signals,
        now: new Date(now()),
      });
    }

    const refreshed = await loadParticipantAuthority(input.matchId, userId);
    return {
      // eventId 와 clientEventId 를 같은 값으로 둔다. 앱은 재전송 시 같은 키를
      // 다시 보내므로, 서버가 새 id 를 만들면 앱의 재시도 기록과 짝이 안 맞는다.
      eventId: input.idempotencyKey,
      attemptId: String(refreshed.attempt._id),
      matchId: String(refreshed.match._id),
      eventType: input.eventType,
      clientEventId: input.idempotencyKey,
      serverSequence: Number(refreshed.attempt.answerRevision || 0),
      serverOccurredAt: isoString(new Date(now())),
      questionSlot: ["ANSWER_CHANGED", "QUESTION_FOCUS"].includes(
        input.eventType
      )
        ? slot
        : null,
      networkState:
        input.eventType === "NETWORK_STATE"
          ? String(payload.networkState || "")
          : null,
      recognizedActiveIntervalMs: 0,
      answerStored,
    };
  }

  /**
   * POST /matches/:matchId/advance
   *
   * 현재 문항을 확정하고 다음 한 문항을 연다. 마지막 문항에서 advance 하면
   * 정본이 시도를 EVIDENCE_REQUIRED 로 넘기며 제출까지 처리한다 — 그래서 앱에는
   * 별도 제출 명령이 없어도 경기가 끝난다. **정산은 여기서 일어나지 않는다.**
   *
   * 응답은 start 와 같은 {attempt, questionPack} 이다. 다음 문항을 받기 위해
   * 앱이 곧바로 questions 를 한 번 더 부르지 않아도 되게 하려는 것이다.
   */
  /**
   * 학생이 **제출 버튼을 직접 누르는** 경로.
   *
   * 왜 이것도 여는가 — 앱의 경기 화면(GoatArenaMatchPlayScreen)에 수동 제출 버튼이
   * 있고 시간 만료 자동 제출도 같은 함수를 탄다. 이 경로가 없으면 그 버튼만 404 로
   * 죽는데, 학생 눈에는 "제출이 안 된다" 로 보인다. 마지막 문항에서 advance 하면
   * 정본이 제출까지 처리하지만, 그건 **끝까지 푼 경우**뿐이다.
   *
   * 정산 안전성 — submitArenaMatchAttempt 는 시도를 EVIDENCE_REQUIRED 로 넘길 뿐
   * 정산하지 않는다. 근거는 파일 단위다: arenaMatchAttemptService.js 전체에
   * settleArenaMatch · ParticipantLock · StandingChangeLedger · LearningDayLedger ·
   * AccessCycle 참조가 **한 건도 없다**(실측). 그 파일의 어떤 함수도 정산에 닿을 수 없다.
   *
   * changes: [] 인 이유 — 답 저장은 saveAnswer 가 이미 했다. 제출은 상태 전이만 한다.
   * 여기서 답을 함께 실으면 같은 답이 두 경로로 들어와 answerRevision 이 어긋난다.
   */
  async function submitParticipantAttempt(authContext, rawInput) {
    const userId = authenticatedUserId(authContext);
    const input = normalizedInput(rawInput, [
      "matchId",
      "idempotencyKey",
      "clientBuildVersion",
    ]);
    await commands.submitArenaMatchAttempt({
      matchId: input.matchId,
      userId,
      requestId: input.idempotencyKey,
      changes: [],
      submissionMode: "MANUAL",
      now: new Date(now()),
    });
    const authority = await loadParticipantAuthority(input.matchId, userId);
    const answerCount = (authority.attempt.answers || []).filter(
      (answer) => String(answer.value || "").trim()
    ).length;
    return {
      submissionRecordId: `${authority.attempt._id}:submission`,
      attemptId: String(authority.attempt._id),
      matchId: String(authority.match._id),
      participantRole: authority.role,
      questionPackId: String(authority.pack._id),
      submissionId: input.idempotencyKey,
      submittedAt: isoString(authority.attempt.submittedAt),
      evidenceDeadlineAt: isoString(authority.attempt.evidenceDeadlineAt),
      evidenceRequired: authority.attempt.status === "EVIDENCE_REQUIRED",
      lastAcceptedServerSequence: Number(authority.attempt.answerRevision || 0),
      recognizedHeartbeatActiveMs: 0,
      answerCount,
    };
  }

  async function advanceParticipantQuestion(authContext, rawInput) {
    const userId = authenticatedUserId(authContext);
    const input = normalizedInput(rawInput, [
      "matchId",
      "idempotencyKey",
      "clientBuildVersion",
      "questionSlot",
      "answer",
      "boardRevision",
      "boardSha256",
      "evidenceMode",
    ]);
    const authority = await loadParticipantAuthority(input.matchId, userId);
    const expectedSlot =
      Number(authority.attempt?.currentQuestionIndex || 0) + 1;
    if (Number(input.questionSlot) !== expectedSlot) {
      // 앱이 advance 응답을 받기 전에 연결이 끊기면 같은 멱등키와 직전 slot을
      // 재전송한다. 이미 다음 문항으로 넘어간 상태에서 slot만 먼저 검사하면 정본의
      // 멱등 재생까지 도달하지 못하고 409가 된다. 참가자 소유권을 확인한 뒤 정확히
      // 같은 attempt·operation 이벤트가 존재할 때만 현재 확정 상태를 재응답한다.
      const replay =
        Number(input.questionSlot) === expectedSlot - 1 && authority.attempt
        ? await models.ArenaMatchAttemptEvent.findOne({
            attemptId: authority.attempt._id,
            idempotencyKey:
              `ARENA_ADVANCE:${authority.attempt._id}:${input.idempotencyKey}`,
            eventType: "QUESTION_ADVANCED",
          })
            .select("_id")
            .lean()
        : null;
      if (replay) {
        if (
          input.evidenceMode === "INLINE_BOARD_V1" &&
          authority.attempt?.status === "EVIDENCE_REQUIRED"
        ) {
          await commands.promoteInlineSolutionBoards({
            matchId: input.matchId,
            userId,
            now: new Date(now()),
          });
          return serializeStart(
            await loadParticipantAuthority(input.matchId, userId)
          );
        }
        return serializeStart(authority);
      }
      fail(
        "GOAT_ARENA_QUESTION_SEQUENCE_REQUIRED",
        "current question is required",
        { statusCode: 409 }
      );
    }
    if (input.evidenceMode === "INLINE_BOARD_V1") {
      await commands.assertInlineSolutionBoard({
        matchId: input.matchId,
        userId,
        questionSlot: input.questionSlot,
        expectedRevision: input.boardRevision,
        expectedSha256: input.boardSha256,
      });
    }
    await commands.advanceArenaMatchQuestion({
      matchId: input.matchId,
      userId,
      requestId: input.idempotencyKey,
      value: input.answer,
      submissionMode: "MANUAL",
      now: new Date(now()),
    });
    let refreshed = await loadParticipantAuthority(input.matchId, userId);
    if (
      input.evidenceMode === "INLINE_BOARD_V1" &&
      refreshed.attempt?.status === "EVIDENCE_REQUIRED"
    ) {
      await commands.promoteInlineSolutionBoards({
        matchId: input.matchId,
        userId,
        now: new Date(now()),
      });
      refreshed = await loadParticipantAuthority(input.matchId, userId);
    }
    return serializeStart(refreshed);
  }

  return Object.freeze({
    advanceParticipantQuestion,
    getParticipantQuestionPack,
    recordParticipantEvent,
    startParticipantMatch,
    submitParticipantAttempt,
    _testing: {
      loadParticipantAuthority,
      serializeAttempt,
      serializeQuestionPack,
      serializeStart,
    },
  });
}

module.exports = {
  GoatArenaProductionCommandError,
  createGoatArenaProductionCommandService,
};
