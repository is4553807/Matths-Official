const {
  createGoatArenaProductionCommandService,
} = require("../services/goatArenaProductionCommandService");
const {
  getInlineSolutionBoards,
  saveInlineSolutionBoard,
} = require("../services/arenaInlineSolutionBoardService");

/**
 * iPad GOAT Arena 경기 명령 HTTP 경계.
 *
 * 웹은 세션 쿠키 + EJS 폼으로 같은 경기를 진행한다(routes/goat-arena-routes.js).
 * 앱은 Bearer + JSON 이라 그 라우트를 그대로 부를 수 없다. 그래서 **경계만** 하나
 * 더 내고, 경기 규칙은 goatArenaProductionCommandService 를 거쳐 정본
 * arenaMatchAttemptService 로 간다. 이 파일에는 규칙이 한 줄도 없어야 한다.
 *
 * 이 계층이 실제로 하는 일은 세 가지뿐이다.
 *   ① Idempotency-Key / X-Matths-Client-Version **헤더**를 명령 인자로 바꾼다.
 *      앱은 멱등키를 헤더로 보내고 정본 서비스는 requestId 인자를 받는다.
 *      선례: controllers/ipadArenaShopController.js 의 purchaseInput.
 *   ② 본문 필드를 화이트리스트로 막는다.
 *   ③ 서비스 반환값을 앱 Codable 이 기대하는 봉투에 담는다
 *      (start/advance → 그대로, 이벤트 → {event}, 문항 → {questionPack}).
 *
 * 헤더 두 개를 **필수**로 두는 이유. 멱등키가 없으면 재전송이 곧 중복 명령이 된다
 * (같은 답이 두 번 저장되거나, 하트비트가 활동 시간을 부풀린다). 클라이언트
 * 버전은 경기 중 앱이 업데이트돼도 같은 명령을 같은 지문으로 재전송할 수 있게
 * 앱이 경기 키 저장소에 함께 고정하는 값이라, 빠지면 재전송 짝을 잃는다.
 * 그래서 둘 다 없으면 서비스까지 내려보내지 않고 여기서 400 으로 끊는다.
 */

// 멱등키 상한을 180 으로 둔 것은 앱 계약 그대로다. 정본
// arenaMatchAttemptService.normalizeOperationId 는 16~160자에
// [A-Za-z0-9._:-] 만 받으므로, 그 사이 구간은 서비스가 400 으로 되돌린다.
// 여기서 160 으로 좁히지 않는 이유는 거절 사유를 정본 한 곳에서만 정의하기
// 위해서다 — 두 곳에서 정의하면 메시지가 갈린다.
const MAX_COMMAND_KEY_LENGTH = 180;
const MAX_CLIENT_BUILD_LENGTH = 100;

class GoatArenaCommandControllerError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "GoatArenaCommandControllerError";
    this.code = code;
    // errorMiddleware 는 status 를, 일부 호출부는 statusCode 를 읽는다.
    this.statusCode = statusCode;
    this.status = statusCode;
  }
}

function fail(code, message, statusCode) {
  throw new GoatArenaCommandControllerError(code, message, statusCode);
}

function requiredHeader(req, name, maxLength) {
  const value =
    typeof req.get === "function"
      ? req.get(name)
      : req.headers?.[name.toLowerCase()];
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    // 어떤 헤더가 빠졌는지 본문에 적지 않는다. 이 경계는 인증 뒤에 있지만,
    // 명령 키 규칙을 그대로 노출하면 재전송 위조에 쓸 수 있는 힌트가 된다.
    fail(
      "GOAT_ARENA_COMMAND_HEADER_REQUIRED",
      "요청 식별 정보를 확인한 뒤 다시 시도해주세요.",
      400
    );
  }
  return value.trim();
}

/**
 * 허용 필드만 남기고, 모르는 필드가 하나라도 있으면 400.
 *
 * 조용히 버리지 않는 이유는 경기 중 오타 난 키가 "저장된 줄 알았는데 빈 답" 으로
 * 끝나기 때문이다. 서비스 계층에도 같은 검사가 있지만, 여기서 먼저 끊어야
 * Mongo 왕복 없이 되돌아간다.
 */
function strictBody(req, allowedFields) {
  const body = req.body === undefined || req.body === null ? {} : req.body;
  if (typeof body !== "object" || Array.isArray(body)) {
    fail("GOAT_ARENA_COMMAND_BODY_INVALID", "요청 형식을 확인해주세요.", 400);
  }
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(body).filter((field) => !allowed.has(field));
  if (unexpected.length) {
    fail(
      "GOAT_ARENA_COMMAND_BODY_INVALID",
      "요청에 허용되지 않은 값이 포함되어 있습니다.",
      400
    );
  }
  return body;
}

function commandContext(req) {
  // requireApiAuth 가 이미 401 을 내지만, 미들웨어 없이 라우트가 잘못 배선되면
  // 여기서 사용자 없이 경기 명령이 실행된다. 그 경우를 401 로 못 박는다.
  if (!req.apiUser?._id) {
    fail("UNAUTHORIZED", "다시 로그인한 뒤 시도해주세요.", 401);
  }
  return { userId: req.apiUser._id };
}

/** 헤더 두 개 + 경로 파라미터를 서비스 입력으로 변환한다. */
function commandInput(req) {
  return {
    matchId: req.params.matchId,
    idempotencyKey: requiredHeader(
      req,
      "Idempotency-Key",
      MAX_COMMAND_KEY_LENGTH
    ),
    clientBuildVersion: requiredHeader(
      req,
      "X-Matths-Client-Version",
      MAX_CLIENT_BUILD_LENGTH
    ),
  };
}

function createIpadGoatArenaCommandController({
  commandService = createGoatArenaProductionCommandService(),
} = {}) {
  /**
   * 경기 자료는 절대 캐시에 남기지 않는다. 문항·마감 시각이 중간 캐시에 남으면
   * 다음 요청이 지난 문항을 되돌려 받는다.
   */
  function noStore(res) {
    res.set("Cache-Control", "no-store");
  }

  async function startMatch(req, res, next) {
    try {
      strictBody(req, []);
      const result = await commandService.startParticipantMatch(
        commandContext(req),
        commandInput(req)
      );
      noStore(res);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * GET 이지만 Idempotency-Key 를 요구한다. 앱이 그렇게 보내고 있고, 이 경로가
   * 순수 조회가 아니라 자동 진행(만료 문항 확정)을 태우기 때문이다.
   */
  async function getQuestions(req, res, next) {
    try {
      strictBody(req, []);
      const questionPack = await commandService.getParticipantQuestionPack(
        commandContext(req),
        commandInput(req)
      );
      noStore(res);
      return res.json({ questionPack });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * 이벤트 4종(답 저장·하트비트·문항 포커스·네트워크 상태)은 응답 계약이
   * {event} 하나로 같다. 경로마다 허용 본문 필드와 payload 모양만 다르므로
   * 핸들러를 찍어 내고, 분기는 서비스의 eventType 한 곳에만 둔다.
   */
  function eventHandler(eventType, allowedFields, payloadFrom) {
    return async (req, res, next) => {
      try {
        const body = strictBody(req, allowedFields);
        const event = await commandService.recordParticipantEvent(
          commandContext(req),
          {
            ...commandInput(req),
            eventType,
            payload: payloadFrom(body),
          }
        );
        noStore(res);
        return res.json({ event });
      } catch (error) {
        return next(error);
      }
    };
  }

  const heartbeat = eventHandler("HEARTBEAT", [], () => ({}));
  const saveAnswer = eventHandler(
    "ANSWER_CHANGED",
    ["questionSlot", "answer"],
    (body) => ({
      questionSlot: body.questionSlot,
      answer: body.answer,
    })
  );
  const recordQuestionFocus = eventHandler(
    "QUESTION_FOCUS",
    ["questionSlot"],
    (body) => ({ questionSlot: body.questionSlot })
  );
  const recordNetworkState = eventHandler(
    "NETWORK_STATE",
    ["networkState"],
    (body) => ({ networkState: body.networkState })
  );

  async function advanceQuestion(req, res, next) {
    try {
      const body = strictBody(req, [
        "questionSlot",
        "answer",
        "boardRevision",
        "boardSha256",
      ]);
      const result = await commandService.advanceParticipantQuestion(
        commandContext(req),
        {
          ...commandInput(req),
          questionSlot: body.questionSlot,
          answer: body.answer,
          boardRevision: body.boardRevision,
          boardSha256: body.boardSha256,
          evidenceMode: req.get("X-Matths-Evidence-Mode") || undefined,
        }
      );
      noStore(res);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }

  async function listSolutionBoards(req, res, next) {
    try {
      const boards = await getInlineSolutionBoards({
        matchId: req.params.matchId,
        userId: commandContext(req).userId,
      });
      noStore(res);
      return res.json({ boards });
    } catch (error) {
      return next(error);
    }
  }

  async function saveSolutionBoard(req, res, next) {
    try {
      if (!req.file) {
        fail("ARENA_INLINE_BOARD_FILE_REQUIRED", "풀이판 이미지를 확인해주세요.", 400);
      }
      requiredHeader(req, "Idempotency-Key", MAX_COMMAND_KEY_LENGTH);
      requiredHeader(req, "X-Matths-Client-Version", MAX_CLIENT_BUILD_LENGTH);
      const body = strictBody(req, [
        "questionSlot",
        "revision",
        "strokeCount",
        "drawingDataBase64",
      ]);
      const board = await saveInlineSolutionBoard({
        matchId: req.params.matchId,
        userId: commandContext(req).userId,
        questionSlot: body.questionSlot,
        revision: body.revision,
        strokeCount: body.strokeCount,
        drawingDataBase64: body.drawingDataBase64,
        file: req.file,
      });
      req.file = undefined;
      noStore(res);
      return res.json({ board });
    } catch (error) {
      return next(error);
    }
  }

  async function finalizeSolutionBoards(req, res, next) {
    try {
      strictBody(req, []);
      requiredHeader(req, "Idempotency-Key", MAX_COMMAND_KEY_LENGTH);
      requiredHeader(req, "X-Matths-Client-Version", MAX_CLIENT_BUILD_LENGTH);
      const result = await require("../services/arenaInlineSolutionBoardService")
        .promoteInlineSolutionBoards({
          matchId: req.params.matchId,
          userId: commandContext(req).userId,
        });
      noStore(res);
      return res.json({ finalized: true, replayed: result.replayed === true });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * 수동 제출. 앱 경기 화면의 제출 버튼과 시간 만료 자동 제출이 같은 경로를 탄다.
   *
   * 본문을 받지 않는다 — 답은 saveAnswer 가 이미 저장했고, 제출은 상태 전이만 한다.
   * 여기서 답을 함께 받으면 같은 답이 두 경로로 들어와 answerRevision 이 어긋난다.
   */
  async function submitAttempt(req, res, next) {
    try {
      strictBody(req, []);
      const result = await commandService.submitParticipantAttempt(
        commandContext(req),
        commandInput(req)
      );
      noStore(res);
      return res.json({ attempt: result });
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    advanceQuestion,
    finalizeSolutionBoards,
    getQuestions,
    heartbeat,
    listSolutionBoards,
    recordNetworkState,
    recordQuestionFocus,
    saveAnswer,
    saveSolutionBoard,
    startMatch,
    submitAttempt,
  });
}

const defaultController = createIpadGoatArenaCommandController();

module.exports = {
  GoatArenaCommandControllerError,
  createIpadGoatArenaCommandController,
  ...defaultController,
};
