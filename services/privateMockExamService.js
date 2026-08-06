const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const {
  randomUUID,
} = require("crypto");

const {
  AdminActionLog,
  Announcement,
  ArchiveFolder,
  ArchiveItem,
  AssessmentAttempt,
  PrivateMockExam,
  PrivateMockExamAttempt,
  PrivateMockExamEvent,
  PrivateMockAnswerCorrection,
  PrivateMockIntegrityCase,
  PrivateMockObjection,
  PrivateMockResource,
  PrivateMockWeeklyResult,
  PrivateMockUploadReminder,
  RankingProfile,
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
} = require("../models/goatArenaModel");
const {
  ARCHIVE_STORAGE_DIR,
  createArchiveItem,
  deleteArchiveItem,
  discardArchiveUpload,
  isArchiveAdmin,
  repairUploadFilename,
} = require("./archiveService");
const {
  createAnnouncement,
} = require("./adminService");
const {
  calculateRankPoint,
  calculateActualPerformance,
  ensureRankingProfile,
  findBaseTier,
  metricForAttempt,
  percentileForValue,
  processWeeklyExamMmr,
  refreshOverallRanks,
} = require("./mmrService");
const {
  buildBrandedHtml,
  DEFAULT_ADMIN_EMAIL,
  sendAdminUserEmail,
  sendEmail,
} = require("./emailService");
const {
  getRankingDisplayName,
} = require("./userIdentityService");
const {
  deliverModerationNotice,
} = require("./moderationNoticeService");
const {
  completeAdminTodoBySource,
  createAdminTodo,
} = require("./adminTodoService");
const {
  getWeeklyMockExamAccess,
} = require("./paidFeatureAccessService");
const {
  recordOperationalMetricEvent,
} = require("./operationalMetricEventService");
const {
  destroyStoredAsset,
  signedStoredAssetUrl,
  STORAGE_PURPOSES,
  storageFields,
  storeUploadedFile,
} = require("./fileStorageService");
const {
  answerCorrection:
    answerCorrectionEmail,
  evidenceRequest:
    evidenceRequestEmail,
  integrityCleared:
    integrityClearedEmail,
  integrityPenalty:
    integrityPenaltyEmail,
  objectionAccepted:
    objectionAcceptedEmail,
  objectionReceived:
    objectionReceivedEmail,
  objectionRejected:
    objectionRejectedEmail,
  uploadReminder:
    uploadReminderEmail,
} = require("../content/email/privateMock");

const WEEK_MS =
  7 * 24 * 60 * 60 * 1000;
const DAY_MS =
  24 * 60 * 60 * 1000;
const MINUTE_MS =
  60 * 1000;
const SEOUL_OFFSET_MS =
  9 * 60 * 60 * 1000;
const UPLOAD_REMINDER_LEAD_MS =
  3 * DAY_MS;
const UPLOAD_REMINDER_RETRY_MS =
  6 * 60 * 60 * 1000;
const DEFAULT_DURATION_MINUTES =
  100;
const PRIVATE_MOCK_LOBBY_MS =
  10 * MINUTE_MS;
const PRIVATE_MOCK_FORM_SCHEDULES =
  Object.freeze({
    A: {
      attemptNumber: 1,
      releaseHour: 15,
      label: "오후 3:00 ~ 오후 4:40",
    },
    B: {
      attemptNumber: 2,
      releaseHour: 18,
      label: "오후 6:00 ~ 오후 7:40",
    },
    C: {
      attemptNumber: 3,
      releaseHour: 21,
      label: "오후 9:00 ~ 오후 10:40",
    },
    CUSTOM: {
      attemptNumber: 0,
      releaseHour: null,
      label: "운영자가 날짜·시간 직접 지정",
      isTest: true,
      isCustom: true,
    },
  });
const PRIVATE_MOCK_FOLDER_NAME =
  "2026 Matths 주간 공식 모의고사 아카이브";
const PRIVATE_MOCK_FOLDER_SLUG =
  "2026-matths-private-mock-exam-archive";
const RANKABLE_INTEGRITY_STATES =
  Object.freeze([
    "NOT_REVIEWED",
    "CLEAR",
  ]);

let scheduleRunning = false;
let scheduleTimer = null;
let scheduleBackfillComplete =
  false;

function rankableIntegrityFilter() {
  return {
    $or: [
      {
        integrityStatus: {
          $exists: false,
        },
      },
      {
        integrityStatus: {
          $in:
            RANKABLE_INTEGRITY_STATES,
        },
      },
    ],
  };
}

function statusError(
  status,
  message
) {
  const error =
    new Error(message);
  error.status = status;
  return error;
}

function cleanSingleLine(
  value,
  maxLength
) {
  return String(value || "")
    .replace(
      /[\u0000-\u001f\u007f]+/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(
  value,
  maxLength
) {
  return String(value || "")
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g,
      ""
    )
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .replace(/√/g, "sqrt")
    .replace(/\s+/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function standardQuestionMode(
  questionNumber
) {
  return questionNumber <= 21
    ? "multiple-choice"
    : "short-answer";
}

function validateAnswerKeyJson(
  value
) {
  let parsed = value;

  if (
    Buffer.isBuffer(value)
  ) {
    parsed =
      value.toString("utf8");
  }

  if (
    typeof parsed === "string"
  ) {
    try {
      parsed =
        JSON.parse(parsed);
    } catch (error) {
      throw statusError(
        400,
        "답지 JSON 문법이 올바르지 않습니다."
      );
    }
  }

  let questions =
    Array.isArray(
      parsed?.questions
    )
      ? parsed.questions
      : null;

  if (
    !questions &&
    Array.isArray(
      parsed?.answers
    ) &&
    Array.isArray(
      parsed?.points
    )
  ) {
    const explanationByNumber =
      new Map(
        (
          Array.isArray(
            parsed?.explanations
          )
            ? parsed.explanations
            : []
        ).map(
          (explanation) => [
            Number(
              explanation?.number
            ),
            explanation,
          ]
        )
      );
    questions =
      parsed.answers.map(
        (answer, index) => ({
          number:
            index + 1,
          answer,
          points:
            parsed.points[
              index
            ],
          type:
            parsed.questionModes?.[
              index
            ] ||
            standardQuestionMode(
              index + 1
            ),
          explanation:
            explanationByNumber.get(
              index + 1
            ) || null,
        })
      );
  }

  if (
    !Array.isArray(
      questions
    ) ||
    questions.length !== 30
  ) {
    throw statusError(
      400,
      "답지 JSON에는 1번부터 30번까지 정확히 30문항이 있어야 합니다."
    );
  }

  const normalized =
    questions.map(
      (question, index) => {
        const number =
          Number(
            question.number
          );
        const answer =
          cleanSingleLine(
            question.answer,
            80
          )
            .normalize(
              "NFKC"
            )
            .replace(
              /\s+/g,
              ""
            );
        const points =
          Number(
            question.points
          );
        const expectedType =
          standardQuestionMode(
            index + 1
          );
        const type =
          question.type
            ? question.type ===
              "short-answer"
              ? "short-answer"
              : "multiple-choice"
            : expectedType;
        const explanationSource =
          question.explanation ||
          question.solution ||
          null;

        if (
          number !==
          index + 1
        ) {
          throw statusError(
            400,
            `${index + 1}번째 항목의 문항 번호가 순서와 다릅니다.`
          );
        }

        if (!answer) {
          throw statusError(
            400,
            `${number}번 정답이 비어 있습니다.`
          );
        }

        if (
          type !== expectedType
        ) {
          throw statusError(
            400,
            `${number}번 문항 유형은 ${expectedType === "multiple-choice" ? "객관식" : "주관식"}이어야 합니다.`
          );
        }

        if (
          type ===
            "multiple-choice" &&
          !/^[1-5]$/.test(
            answer
          )
        ) {
          throw statusError(
            400,
            `${number}번 객관식 정답은 1~5 중 하나여야 합니다.`
          );
        }

        if (
          !Number.isInteger(
            points
          ) ||
          ![2, 3, 4].includes(
            points
          )
        ) {
          throw statusError(
            400,
            `${number}번 배점은 2점, 3점, 4점 중 하나여야 합니다.`
          );
        }

        return {
          number,
          answer,
          points,
          type,
          explanation:
            explanationSource
              ? {
                  intent:
                    cleanMultiline(
                      explanationSource.intent,
                      3000
                    ),
                  concept:
                    cleanMultiline(
                      explanationSource.concept,
                      3000
                    ),
                  steps:
                    (
                      Array.isArray(
                        explanationSource.steps
                      )
                        ? explanationSource.steps
                        : []
                    )
                      .slice(0, 12)
                      .map((step) =>
                        cleanMultiline(
                          step,
                          3000
                        )
                      )
                      .filter(Boolean),
                  summary:
                    cleanMultiline(
                      explanationSource.summary,
                      5000
                    ),
                  commonMistake:
                    cleanMultiline(
                      explanationSource.commonMistake,
                      5000
                    ),
                }
              : null,
        };
      }
    );
  const totalPoints =
    normalized.reduce(
      (sum, question) =>
        sum +
        question.points,
      0
    );

  if (totalPoints !== 100) {
    throw statusError(
      400,
      `전체 배점 합계가 ${totalPoints}점입니다. 100점으로 맞춰주세요.`
    );
  }

  return {
    schemaVersion:
      "matths-answer-key-v1",
    questionCount: 30,
    totalPoints,
    questions: normalized,
  };
}

async function readAnswerKeyJsonFile(
  file
) {
  if (
    !file ||
    path
      .extname(
        file.originalname ||
          ""
      )
      .toLowerCase() !== ".json"
  ) {
    throw statusError(
      400,
      "답안지는 JSON 파일로 올려주세요."
    );
  }

  const raw =
    await fs.promises.readFile(
      file.path
    );

  return validateAnswerKeyJson(
    raw
  );
}

function getSundayReleaseAt(
  now = new Date()
) {
  const seoulClock =
    new Date(
      now.getTime() +
        SEOUL_OFFSET_MS
    );
  const day =
    seoulClock.getUTCDay();
  const daysUntilSunday =
    (7 - day) % 7;
  let releaseAt =
    new Date(
      Date.UTC(
        seoulClock.getUTCFullYear(),
        seoulClock.getUTCMonth(),
        seoulClock.getUTCDate() +
          daysUntilSunday,
        6,
        0,
        0,
        0
      )
    );

  if (
    releaseAt.getTime() <=
    now.getTime()
  ) {
    releaseAt =
      new Date(
        releaseAt.getTime() +
          WEEK_MS
      );
  }

  return releaseAt;
}

function parseSeoulReleaseAt(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(
      String(value || "")
    );

  if (!match) {
    throw statusError(
      400,
      "공개할 한국 날짜와 시간을 선택해주세요."
    );
  }

  const year = Number(match[1]);
  const month =
    Number(match[2]);
  const day = Number(match[3]);
  const hour =
    Number(match[4]);
  const minute =
    Number(match[5]);
  const releaseAt = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour - 9,
      minute,
      0,
      0
    )
  );
  const seoulClock = new Date(
    releaseAt.getTime() +
      SEOUL_OFFSET_MS
  );

  if (
    seoulClock.getUTCFullYear() !==
      year ||
    seoulClock.getUTCMonth() + 1 !==
      month ||
    seoulClock.getUTCDate() !==
      day ||
    seoulClock.getUTCHours() !==
      hour ||
    seoulClock.getUTCMinutes() !==
      minute
  ) {
    throw statusError(
      400,
      "유효한 한국 날짜와 시간을 입력해주세요."
    );
  }

  if (
    seoulClock.getUTCDay() !==
      0 ||
    ![15, 18, 21].includes(
      hour
    ) ||
    minute !== 0
  ) {
    throw statusError(
      400,
      "Matths 주간 공식 모의고사는 한국시간 기준 일요일 오후 3시·6시·9시에만 공개할 수 있습니다."
    );
  }

  return releaseAt;
}

function parsePrivateMockExamDate(
  value,
  formCodeInput,
  customReleaseAtInput = ""
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      String(value || "")
    );
  const formCode =
    String(
      formCodeInput || ""
    )
      .trim()
      .toUpperCase();
  const formSchedule =
    PRIVATE_MOCK_FORM_SCHEDULES[
      formCode
    ];

  if (!formSchedule) {
    throw statusError(
      400,
      "시험형은 A, B, C 또는 CUSTOM 중에서 선택해주세요."
    );
  }

  if (formSchedule.isCustom) {
    const customMatch =
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(
        String(customReleaseAtInput || "")
      );
    if (!customMatch) {
      throw statusError(
        400,
        "CUSTOM 회차의 한국 날짜와 공개 시간을 직접 지정해주세요."
      );
    }
    const [
      ,
      customYear,
      customMonth,
      customDay,
      customHour,
      customMinute,
    ] = customMatch.map(Number);
    const customReleaseAt = new Date(
      Date.UTC(
        customYear,
        customMonth - 1,
        customDay,
        customHour - 9,
        customMinute,
        0,
        0
      )
    );
    const customSeoulClock = new Date(
      customReleaseAt.getTime() + SEOUL_OFFSET_MS
    );
    if (
      customSeoulClock.getUTCFullYear() !== customYear ||
      customSeoulClock.getUTCMonth() + 1 !== customMonth ||
      customSeoulClock.getUTCDate() !== customDay ||
      customSeoulClock.getUTCHours() !== customHour ||
      customSeoulClock.getUTCMinutes() !== customMinute
    ) {
      throw statusError(
        400,
        "CUSTOM 회차의 유효한 한국 날짜와 시간을 입력해주세요."
      );
    }
    return {
      releaseAt: customReleaseAt,
      formCode: "CUSTOM",
      attemptNumber: 0,
      scheduleLabel: "운영자 지정 시간",
      isTest: true,
      isCustom: true,
    };
  }

  if (!match) {
    throw statusError(
      400,
      "Matths 주간 공식 모의고사를 공개할 날짜를 선택해주세요."
    );
  }

  const year = Number(match[1]);
  const month =
    Number(match[2]);
  const day = Number(match[3]);
  const releaseAt = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      formSchedule.releaseHour -
        9,
      0,
      0,
      0
    )
  );
  const seoulClock = new Date(
    releaseAt.getTime() +
      SEOUL_OFFSET_MS
  );

  if (
    seoulClock.getUTCFullYear() !==
      year ||
    seoulClock.getUTCMonth() + 1 !==
      month ||
    seoulClock.getUTCDate() !==
      day ||
    seoulClock.getUTCDay() !== 0
  ) {
    throw statusError(
      400,
      "Matths 주간 공식 모의고사 날짜는 일요일만 선택할 수 있습니다."
    );
  }

  return {
    releaseAt,
    formCode,
    attemptNumber:
      formSchedule.attemptNumber,
    scheduleLabel:
      formSchedule.label,
    isTest:
      Boolean(
        formSchedule.isTest
      ),
    isCustom:
      Boolean(
        formSchedule.isCustom
      ),
  };
}

function privateMockWeekKey(
  releaseAtInput
) {
  const seoulClock =
    new Date(
      new Date(
        releaseAtInput
      ).getTime() +
        SEOUL_OFFSET_MS
    );

  return [
    seoulClock.getUTCFullYear(),
    String(
      seoulClock.getUTCMonth() +
        1
    ).padStart(2, "0"),
    String(
      seoulClock.getUTCDate()
    ).padStart(2, "0"),
  ].join("-");
}

function privateMockWeekLabel(
  releaseAtInput
) {
  const seoulClock =
    new Date(
      new Date(
        releaseAtInput
      ).getTime() +
        SEOUL_OFFSET_MS
    );
  const weekSunday =
    new Date(
      Date.UTC(
        seoulClock.getUTCFullYear(),
        seoulClock.getUTCMonth(),
        seoulClock.getUTCDate() -
          seoulClock.getUTCDay()
      )
    );
  const month =
    weekSunday.getUTCMonth() +
    1;
  const weekOfMonth =
    Math.ceil(
      weekSunday.getUTCDate() /
        7
    );

  return `${privateMockWeekKey(releaseAtInput)} (${month}월 ${weekOfMonth}째주)`;
}

function privateMockAttemptNumber(
  releaseAtInput
) {
  const hour =
    new Date(
      new Date(
        releaseAtInput
      ).getTime() +
        SEOUL_OFFSET_MS
    ).getUTCHours();

  return {
    15: 1,
    18: 2,
    21: 3,
  }[hour] || null;
}

function privateMockFormCode(
  attemptNumber
) {
  return [
    "",
    "A",
    "B",
    "C",
  ][Number(attemptNumber)] || "";
}

function getWeekSelectionLockAt(
  releaseAtInput,
  durationMinutes =
    DEFAULT_DURATION_MINUTES
) {
  const seoulClock =
    new Date(
      new Date(
        releaseAtInput
      ).getTime() +
        SEOUL_OFFSET_MS
    );

  return new Date(
    Date.UTC(
      seoulClock.getUTCFullYear(),
      seoulClock.getUTCMonth(),
      seoulClock.getUTCDate(),
      12,
      0,
      0,
      0
    ) +
      Math.min(
        180,
        Math.max(
          10,
          Number.parseInt(
            durationMinutes,
            10
          ) ||
            DEFAULT_DURATION_MINUTES
        )
      ) *
        MINUTE_MS
  );
}

function buildPrivateMockSchedule(
  releaseAtInput,
  durationMinutes =
    DEFAULT_DURATION_MINUTES,
  {
    isTest = false,
  } = {}
) {
  const releaseAt =
    new Date(
      releaseAtInput
    );

  if (
    Number.isNaN(
      releaseAt.getTime()
    )
  ) {
    throw statusError(
      400,
      "유효한 공개 시각이 아닙니다."
    );
  }

  const seoulClock =
    new Date(
      releaseAt.getTime() +
        SEOUL_OFFSET_MS
    );

  const officialSchedule =
    seoulClock.getUTCDay() ===
      0 &&
    [15, 18, 21].includes(
      seoulClock.getUTCHours()
    ) &&
    seoulClock.getUTCMinutes() ===
      0;
  const customSchedule = isTest;

  if (
    !officialSchedule &&
    !customSchedule
  ) {
    throw statusError(
      400,
      isTest
        ? "CUSTOM 회차 공개 시각을 확인해주세요."
        : "Matths 주간 공식 모의고사 공개 시각은 일요일 오후 3시·6시·9시 중 하나여야 합니다."
    );
  }

  const duration =
    Math.min(
      180,
      Math.max(
        10,
        Number.parseInt(
          durationMinutes,
          10
        ) ||
          DEFAULT_DURATION_MINUTES
      )
    );
  const closeAt =
    new Date(
      releaseAt.getTime() +
        duration * MINUTE_MS
    );
  const isOfficialThirdForm =
    !isTest &&
    seoulClock.getUTCHours() ===
      PRIVATE_MOCK_FORM_SCHEDULES
        .C.releaseHour;
  const nextMidnight =
    new Date(
      Date.UTC(
        seoulClock.getUTCFullYear(),
        seoulClock.getUTCMonth(),
        seoulClock.getUTCDate() +
          1,
        -9,
        0,
        0,
        0
      )
    );
  const reviewPublishesAt =
    new Date(
      Date.UTC(
        seoulClock.getUTCFullYear(),
        seoulClock.getUTCMonth(),
        seoulClock.getUTCDate(),
        14,
        0,
        0,
        0
      )
    );
  const archiveAt =
    reviewPublishesAt;

  return {
    releaseAt,
    closeAt,
    aggregationStartsAt:
      isOfficialThirdForm
        ? new Date(
            closeAt.getTime() +
              MINUTE_MS
          )
        : closeAt,
    rankingPublishesAt:
      isTest
        ? new Date(
            nextMidnight.getTime() +
              11 * MINUTE_MS
          )
        : reviewPublishesAt,
    reviewPublishesAt,
    archiveAt,
  };
}

function getPrivateMockPhase(
  schedule,
  nowInput
) {
  const now =
    new Date(nowInput);

  if (
    now <
    schedule.releaseAt
  ) {
    return "scheduled";
  }

  if (
    now <
    schedule.closeAt
  ) {
    return "open";
  }

  if (
    now <
    schedule.aggregationStartsAt
  ) {
    return "locked";
  }

  if (
    now <
    schedule.rankingPublishesAt
  ) {
    return "aggregating";
  }

  if (
    now <
    schedule.archiveAt
  ) {
    return "ranked";
  }

  return "archived";
}

function formatSeoulDateTimeInput(
  date
) {
  return new Date(
    new Date(date).getTime() +
      SEOUL_OFFSET_MS
  )
    .toISOString()
    .slice(0, 16);
}

function getKoreanWeekTitle(
  releaseAt
) {
  const seoulClock =
    new Date(
      new Date(
        releaseAt
      ).getTime() +
        SEOUL_OFFSET_MS
    );
  const year =
    seoulClock.getUTCFullYear();
  const month =
    seoulClock.getUTCMonth() +
    1;
  const sundayOrder =
    Math.floor(
      (
        seoulClock.getUTCDate() -
        1
      ) /
        7
    ) + 1;
  const orderLabel = [
    "",
    "첫째",
    "둘째",
    "셋째",
    "넷째",
    "다섯째",
  ][sundayOrder] ||
    `${sundayOrder}번째`;

  return `${year}년 ${month}월 ${orderLabel}주 Matths 주간 공식 모의고사`;
}

function formatElapsed(
  elapsedMs
) {
  const totalSeconds =
    Math.max(
      0,
      Math.floor(
        Number(elapsedMs || 0) /
          1000
      )
    );
  const minutes =
    Math.floor(
      totalSeconds / 60
    );
  const seconds =
    totalSeconds % 60;

  return `${minutes}분 ${String(
    seconds
  ).padStart(2, "0")}초`;
}

function isCorrectAnswer(
  submitted,
  expected
) {
  const normalized =
    normalizeAnswer(submitted);

  if (!normalized) {
    return false;
  }

  return String(expected || "")
    .split("|")
    .map(normalizeAnswer)
    .includes(normalized);
}

function gradePrivateMockAnswers({
  answers,
  answerKey,
  points,
  questionCount,
}) {
  const normalizedAnswers =
    normalizeDraftAnswers(
      answers,
      questionCount
    );
  const correctByQuestion =
    Array(
      questionCount
    ).fill(false);
  let score = 0;
  let correctCount = 0;

  normalizedAnswers.forEach(
    (answer, index) => {
      if (
        isCorrectAnswer(
          answer,
          answerKey[index]
        )
      ) {
        correctByQuestion[
          index
        ] = true;
        correctCount += 1;
        score +=
          Number(
            points[index]
          ) || 0;
      }
    }
  );

  return {
    answers:
      normalizedAnswers,
    answeredCount:
      normalizedAnswers.filter(
        Boolean
      ).length,
    score,
    correctCount,
    correctByQuestion,
    scoreBreakdown: {
      threePointCorrect:
        correctByQuestion.filter(
          (isCorrect, index) =>
            Number(
              points[index]
            ) === 3 &&
            isCorrect
        ).length,
      threePointTotal:
        points.filter(
          (point) =>
            Number(point) === 3
        ).length,
      fourPointCorrect:
        correctByQuestion.filter(
          (isCorrect, index) =>
            Number(
              points[index]
            ) === 4 &&
            isCorrect
        ).length,
      fourPointTotal:
        points.filter(
          (point) =>
            Number(point) === 4
        ).length,
      semiKillerCorrect:
        [19, 20].filter(
          (index) =>
            correctByQuestion[
              index
            ]
        ).length,
      killerCorrect:
        [27, 29].filter(
          (index) =>
            correctByQuestion[
              index
            ]
        ).length,
    },
  };
}

async function createPrivateMockExam({
  user,
  questionFile,
  answerKeyFile,
  answerSheetFile,
  title,
  examDate,
  customReleaseAt,
  formCode: formCodeInput,
}) {
  if (!isArchiveAdmin(user)) {
    throw statusError(
      403,
      "운영자만 Matths 주간 공식 모의고사를 등록할 수 있습니다."
    );
  }

  if (
    !questionFile ||
    path
      .extname(
        questionFile.originalname ||
          ""
      )
      .toLowerCase() !== ".pdf"
  ) {
    throw statusError(
      400,
      "Matths 주간 공식 모의고사 문제지는 PDF 파일로 올려주세요."
    );
  }

  if (!answerKeyFile) {
    throw statusError(
      400,
      "답안지 JSON 파일을 함께 올려주세요."
    );
  }

  if (
    answerSheetFile &&
    path
      .extname(
        answerSheetFile.originalname ||
          ""
      )
      .toLowerCase() !== ".pdf"
  ) {
    throw statusError(
      400,
      "확인용 답지는 PDF 파일로 올려주세요."
    );
  }

  const cleanTitle =
    cleanSingleLine(
      title,
      120
    );
  const parsedDate =
    parsePrivateMockExamDate(
      examDate,
      formCodeInput,
      customReleaseAt
    );
  const duration =
    DEFAULT_DURATION_MINUTES;
  const schedule =
    buildPrivateMockSchedule(
      parsedDate.releaseAt,
      duration,
      {
        isTest:
          parsedDate.isTest,
      }
    );
  const {
    releaseAt,
    closeAt,
  } = schedule;
  const weekKey =
    privateMockWeekKey(
      releaseAt
    );
  const attemptNumber =
    parsedDate.attemptNumber;
  const formCode =
    parsedDate.formCode;

  if (
    closeAt.getTime() <=
    Date.now()
  ) {
    throw statusError(
      400,
      "이미 마감된 주간 회차는 등록할 수 없습니다."
    );
  }

  if (cleanTitle.length < 2) {
    throw statusError(
      400,
      "시험 이름을 2자 이상 입력해주세요."
    );
  }

  const duplicate =
    await PrivateMockExam.exists({
      weekKey,
      attemptNumber,
      status: {
        $ne: "cancelled",
      },
    });

  if (duplicate) {
    throw statusError(
      409,
      "선택한 주의 같은 회차에는 이미 등록된 Matths 주간 공식 모의고사가 있습니다."
    );
  }

  let archiveItem = null;
  let answerSheetItem = null;
  let exam = null;

  try {
    const parsedAnswerKey =
      await readAnswerKeyJsonFile(
        answerKeyFile
      );
    const questions =
      parsedAnswerKey.questions;

    archiveItem =
      await createArchiveItem({
        user,
        file: questionFile,
        title:
          repairUploadFilename(
            questionFile.originalname
          ),
        description:
          `${cleanTitle} 비공개 문제지`,
        category: "문제지",
        folderId: null,
        isPublished: false,
        storagePurpose: STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK,
      });
    if (answerSheetFile) {
      answerSheetItem =
        await createArchiveItem({
          user,
          file: answerSheetFile,
          title:
            repairUploadFilename(
              answerSheetFile.originalname
            ),
          description:
            `${cleanTitle} 운영자 확인용 답지`,
          category: "해설",
          folderId: null,
          isPublished: false,
          storagePurpose: STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK,
        });
    }

    exam =
      await PrivateMockExam.create({
        weekKey,
        attemptNumber,
        formCode,
        isTest:
          parsedDate.isTest,
        title: cleanTitle,
        ...schedule,
        durationMinutes:
          duration,
        questionCount:
          questions.length,
        answerKey:
          questions.map(
            (question) =>
              question.answer
          ),
        points:
          questions.map(
            (question) =>
              question.points
          ),
        questionModes:
          questions.map(
            (question) =>
              question.type
          ),
        explanations:
          questions.map(
            (question) =>
              question.explanation ||
              null
          ),
        archiveItemId:
          archiveItem.id,
        answerSheetArchiveItemId:
          answerSheetItem?.id ||
          null,
        status: "scheduled",
        createdBy: user.id,
      });
    await discardArchiveUpload(
      answerKeyFile
    );
    return exam;
  } catch (error) {
    if (
      !exam &&
      (
        archiveItem?.id ||
        answerSheetItem?.id
      )
    ) {
      await ArchiveItem.deleteMany({
        _id: {
          $in: [
            archiveItem?.id,
            answerSheetItem?.id,
          ].filter(Boolean),
        },
      }).catch(() => {});
    }
    await discardArchiveUpload(
      questionFile
    );
    await discardArchiveUpload(
      answerSheetFile
    );
    await discardArchiveUpload(
      answerKeyFile
    );
    throw error;
  }
}

function normalizeBatchValue(
  value
) {
  return Array.isArray(value)
    ? value
    : [value];
}

async function createPrivateMockExamBatch({
  user,
  questionFiles,
  answerKeyFiles,
  answerSheetFiles,
  titles,
  examDates,
  customReleaseAts,
  formCodes,
}) {
  const problems =
    Array.isArray(questionFiles)
      ? questionFiles
      : [];
  const answerSheets =
    Array.isArray(answerKeyFiles)
      ? answerKeyFiles
      : [];
  const answerSheetPdfs =
    Array.isArray(
      answerSheetFiles
    )
      ? answerSheetFiles
      : [];
  const normalizedTitles =
    normalizeBatchValue(titles);
  const normalizedExamDates =
    normalizeBatchValue(
      examDates
    );
  const normalizedFormCodes =
    normalizeBatchValue(
      formCodes
    );
  const normalizedCustomReleaseAts =
    normalizeBatchValue(
      customReleaseAts
    );

  if (
    !problems.length ||
    problems.length !==
      answerSheets.length ||
    (
      answerSheetPdfs.length >
        0 &&
      problems.length !==
        answerSheetPdfs.length
    )
  ) {
    throw statusError(
      400,
      "각 회차마다 문제지 PDF와 채점용 JSON을 올려주세요. 확인용 답지 PDF를 올릴 때는 모든 회차에 하나씩 맞춰주세요."
    );
  }

  if (
    normalizedTitles.length !==
      problems.length ||
    normalizedExamDates.length !==
      problems.length ||
    normalizedFormCodes.length !==
      problems.length ||
    normalizedCustomReleaseAts.length !==
      problems.length
  ) {
    throw statusError(
      400,
      "각 회차의 시험 이름, 날짜, 시험형을 모두 입력해주세요."
    );
  }

  const created = [];

  try {
    for (
      let index = 0;
      index < problems.length;
      index += 1
    ) {
      created.push(
        await createPrivateMockExam({
          user,
          questionFile:
            problems[index],
          answerKeyFile:
            answerSheets[index],
          answerSheetFile:
            answerSheetPdfs[
              index
            ],
          title:
            normalizedTitles[index],
          examDate:
            normalizedExamDates[index],
          customReleaseAt:
            normalizedCustomReleaseAts[index],
          formCode:
            normalizedFormCodes[index],
        })
      );
    }
  } catch (error) {
    for (const exam of created) {
      const archiveItem =
        await ArchiveItem.findById(
          exam.archiveItemId
        ).lean();
      const answerSheetItem =
        exam.answerSheetArchiveItemId
          ? await ArchiveItem.findById(
              exam.answerSheetArchiveItemId
            ).lean()
          : null;
      await Promise.all([
        PrivateMockExam.deleteOne({
          _id: exam._id,
        }),
        ArchiveItem.deleteMany({
          _id: {
            $in: [
              exam.archiveItemId,
              exam.answerSheetArchiveItemId,
            ].filter(Boolean),
          },
        }),
        archiveItem?.storedName
          ? destroyStoredAsset({
              ...archiveItem,
              path: path.join(
                ARCHIVE_STORAGE_DIR,
                path.basename(archiveItem.storedName)
              ),
            }).catch(() => {})
          : Promise.resolve(),
        answerSheetItem?.storedName
          ? destroyStoredAsset({
              ...answerSheetItem,
              path: path.join(
                ARCHIVE_STORAGE_DIR,
                path.basename(answerSheetItem.storedName)
              ),
            }).catch(() => {})
          : Promise.resolve(),
      ]);
    }
    throw error;
  }

  return created;
}

async function deletePrivateMockExam({
  user,
  examId,
  now = new Date(),
}) {
  if (!isArchiveAdmin(user)) {
    throw statusError(
      403,
      "운영자만 Matths 주간 공식 모의고사를 삭제할 수 있습니다."
    );
  }

  if (
    !mongoose.isValidObjectId(
      examId
    )
  ) {
    throw statusError(
      404,
      "삭제할 Matths 주간 공식 모의고사 회차를 찾을 수 없습니다."
    );
  }

  const exam =
    await PrivateMockExam.findOne({
      _id: examId,
      $or: [
        {
          isTest: true,
        },
        {
          status: {
            $in: [
              "pending-review",
              "scheduled",
            ],
          },
          releaseAt: {
            $gt: now,
          },
        },
      ],
    }).lean();

  if (!exam) {
    throw statusError(
      409,
      "아직 공개되지 않은 예약 회차만 삭제할 수 있습니다. CUSTOM 회차는 언제든 삭제할 수 있습니다."
    );
  }

  const archiveItem =
    await ArchiveItem.findById(
      exam.archiveItemId
    ).lean();
  const answerSheetItem =
    exam.answerSheetArchiveItemId
      ? await ArchiveItem.findById(
          exam.answerSheetArchiveItemId
        ).lean()
      : null;
  const questionPath =
    archiveItem?.storedName
      ? path.join(
          ARCHIVE_STORAGE_DIR,
          path.basename(
            archiveItem.storedName
          )
        )
      : "";
  const answerSheetPath =
    answerSheetItem?.storedName
      ? path.join(
          ARCHIVE_STORAGE_DIR,
          path.basename(
            answerSheetItem.storedName
          )
        )
      : "";

  await Promise.all([
    PrivateMockExamAttempt.deleteMany({
      examId: exam._id,
    }),
    PrivateMockExam.deleteOne({
      _id: exam._id,
    }),
    ArchiveItem.deleteMany({
      _id: {
        $in: [
          exam.archiveItemId,
          exam.answerSheetArchiveItemId,
        ].filter(Boolean),
      },
    }),
    exam.announcementId
      ? Announcement.deleteOne({
          _id:
            exam.announcementId,
        })
      : Promise.resolve(),
  ]);

  if (archiveItem) {
    await destroyStoredAsset({ ...archiveItem, path: questionPath });
  }
  if (answerSheetItem) {
    await destroyStoredAsset({ ...answerSheetItem, path: answerSheetPath });
  }

  return {
    id:
      String(exam._id),
    title:
      exam.title,
  };
}

async function ensurePrivateMockFolder(
  exam
) {
  let folder =
    await ArchiveFolder.findOne({
      name:
        PRIVATE_MOCK_FOLDER_NAME,
    });

  if (folder) {
    if (
      folder.isPublished ===
      false
    ) {
      folder.isPublished =
        true;
      await folder.save();
    }
    return folder;
  }

  try {
    folder =
      await ArchiveFolder.create({
        name:
          PRIVATE_MOCK_FOLDER_NAME,
        description:
          "최종 종합 랭킹이 확정된 Matths 주간 공식 모의고사 문제지",
        slug:
          PRIVATE_MOCK_FOLDER_SLUG,
        isPublished: true,
        createdBy:
          exam.createdBy,
      });
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    folder =
      await ArchiveFolder.findOne({
        name:
          PRIVATE_MOCK_FOLDER_NAME,
      });
  }

  return folder;
}

async function sendReleaseNotice(
  exam,
  now
) {
  const claimed =
    await PrivateMockExam.findOneAndUpdate(
      {
        _id: exam._id,
        notificationSentAt:
          null,
      },
      {
        $set: {
          notificationSentAt:
            now,
        },
      },
      {
        returnDocument: "after",
      }
    );

  if (!claimed) {
    return;
  }

  try {
    const announcement =
      await createAnnouncement({
        adminUserId:
          claimed.createdBy,
        title:
          `${claimed.title} 공개`,
        content:
          `${claimed.title}이 공개되었습니다. 응시하고 최종 종합 랭킹에 반영할 성적을 만들어보세요.`,
        publishNow: true,
        href:
          "/private-mock-exams",
      });

    announcement.isPublished =
      true;
    await PrivateMockExam.updateOne(
      {
        _id: claimed._id,
      },
      {
        $set: {
          announcementId:
            announcement._id,
        },
      }
    );
  } catch (error) {
    await PrivateMockExam.updateOne(
      {
        _id: claimed._id,
        announcementId: null,
      },
      {
        $set: {
          notificationSentAt:
            null,
        },
      }
    );
    throw error;
  }
}

function buildRankingSummary(
  submitted
) {
  const attempts =
    Array.isArray(submitted)
      ? submitted
      : [];
  const scores =
    attempts
      .map((attempt) =>
        Number(
          attempt.score
        )
      )
      .filter(Number.isFinite)
      .sort(
        (left, right) =>
          left - right
      );
  const elapsed =
    attempts
      .map((attempt) =>
        Number(
          attempt.elapsedMs
        )
      )
      .filter(Number.isFinite);
  const average = (
    values
  ) =>
    values.length
      ? values.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / values.length
      : 0;
  const averageScore =
    average(scores);
  const variance =
    scores.length
      ? scores.reduce(
          (sum, score) =>
            sum +
            (
              score -
              averageScore
            ) **
              2,
          0
        ) / scores.length
      : 0;
  const middle =
    Math.floor(
      scores.length / 2
    );
  const medianScore =
    scores.length
      ? scores.length % 2
        ? scores[middle]
        : (
            scores[
              middle - 1
            ] +
            scores[middle]
          ) / 2
      : 0;

  return {
    participantCount:
      attempts.length,
    averageScore:
      Math.round(
        averageScore * 100
      ) / 100,
    medianScore:
      Math.round(
        medianScore * 100
      ) / 100,
    scoreStandardDeviation:
      Math.round(
        Math.sqrt(
          variance
        ) * 100
      ) / 100,
    averageElapsedMs:
      Math.round(
        average(elapsed)
      ),
    highestScore:
      scores.at(-1) || 0,
    lowestScore:
      scores[0] || 0,
  };
}

function calculateWeeklyMmrPerformance(
  performances
) {
  const sorted = (
    Array.isArray(performances)
      ? performances
      : []
  )
    .map(Number)
    .filter(Number.isFinite)
    .sort(
      (left, right) =>
        right - left
    );

  if (!sorted.length) {
    return null;
  }

  if (sorted.length === 1) {
    return sorted[0];
  }

  if (sorted.length === 2) {
    return (
      sorted[0] * 0.95 +
      sorted[1] * 0.05
    );
  }

  return (
    sorted[0] * 0.9 +
    sorted[1] * 0.1
  );
}

function resolveWeeklyRepresentative({
  attempts,
  selectedAttemptId,
}) {
  const submitted = Array.isArray(
    attempts
  )
    ? attempts.filter(Boolean)
    : [];

  if (!submitted.length) {
    return {
      representative: null,
      selectionReason:
        "no-submission",
    };
  }

  const selected =
    submitted.find(
      (attempt) =>
        String(attempt._id) ===
        String(
          selectedAttemptId ||
            ""
        )
    );
  const orderedByPerformance =
    [...submitted].sort(
      (left, right) =>
        Number(
          right.standardMetrics
            ?.actualPerformance
        ) -
          Number(
            left.standardMetrics
              ?.actualPerformance
          ) ||
        Number(right.score) -
          Number(left.score) ||
        Number(left.elapsedMs) -
          Number(right.elapsedMs)
    );

  return {
    representative:
      selected ||
      orderedByPerformance[0],
    selectionReason:
      selected
        ? "user-selected"
        : submitted.length === 1
          ? "only-submission"
          : "highest-standardized",
  };
}

async function refreshExamStandardMetrics(
  examInput,
  now = new Date()
) {
  const exam =
    Array.isArray(
      examInput?.points
    ) &&
    examInput.points.length
      ? examInput
      : await PrivateMockExam.findById(
          examInput?._id ||
            examInput
        )
          .select("+points")
          .lean();

  if (!exam) {
    return [];
  }

  const submittedAttempts =
    await PrivateMockExamAttempt.find({
      examId: exam._id,
      status: "submitted",
    }).lean();
  const attempts =
    await withoutExpiredArenaAttempts(
      submittedAttempts
    );
  const calibrationAttempts =
    attempts.filter(
      (attempt) =>
        !attempt.integrityStatus ||
        RANKABLE_INTEGRITY_STATES.includes(
          attempt.integrityStatus
        )
    );
  const cohortAttempts =
    calibrationAttempts.length
      ? calibrationAttempts
      : attempts;
  const points = (
    exam.points || []
  ).map(Number);
  const baseMetrics =
    attempts.map((attempt) =>
      metricForAttempt(
        attempt,
        points
      )
    );
  const cohortMetrics =
    cohortAttempts.map(
      (attempt) =>
        metricForAttempt(
          attempt,
          points
        )
    );
  const scores =
    cohortMetrics.map(
      (metric) =>
        metric.score
    );
  const advancedValues =
    cohortMetrics.map(
      (metric) =>
        metric.advancedRaw
    );
  const enriched =
    baseMetrics.map((metric) => {
      const totalPercentile =
        percentileForValue(
          metric.score,
          scores
        );
      const advancedPercentile =
        percentileForValue(
          metric.advancedRaw,
          advancedValues
        );
      const actualPerformance =
        calculateActualPerformance({
          totalPercentile,
          advancedPercentile,
          consistencyScore:
            metric.consistencyScore,
        });

      return {
        ...metric,
        totalPercentile,
        advancedPercentile,
        actualPerformance,
      };
    });

  if (enriched.length) {
    await PrivateMockExamAttempt.bulkWrite(
      enriched.map(
        (metric) => ({
          updateOne: {
            filter: {
              _id:
                metric.attempt._id,
            },
            update: {
              $set: {
                standardMetrics: {
                  totalPercentile:
                    metric
                      .totalPercentile,
                  advancedPercentile:
                    metric
                      .advancedPercentile,
                  consistencyScore:
                    metric
                      .consistencyScore,
                  actualPerformance:
                    metric
                      .actualPerformance,
                  cohortSize:
                    cohortMetrics.length,
                  calculatedAt:
                    now,
                },
              },
            },
          },
        })
      )
    );
  }

  return enriched;
}

function weeklyAttemptSummary(
  attempt
) {
  return {
    attemptId:
      attempt._id,
    examId:
      attempt.examId,
    attemptNumber:
      Number(
        attempt.attemptNumber
      ) || 1,
    formCode:
      attempt.formCode ||
      privateMockFormCode(
        attempt.attemptNumber ||
          1
      ),
    rawScore:
      Number(attempt.score) || 0,
    totalPercentile:
      Number(
        attempt.standardMetrics
          ?.totalPercentile
      ) || 0,
    advancedPercentile:
      Number(
        attempt.standardMetrics
          ?.advancedPercentile
      ) || 0,
    consistencyScore:
      Number(
        attempt.standardMetrics
          ?.consistencyScore
      ) || 0,
    actualPerformance:
      Number(
        attempt.standardMetrics
          ?.actualPerformance
      ) || 0,
    submittedAt:
      attempt.submittedAt,
  };
}

async function syncPrivateMockWeeklyResult({
  userId,
  weekKey,
}) {
  const attempts =
    await PrivateMockExamAttempt.find({
      userId,
      weekKey,
      status: "submitted",
      ...rankableIntegrityFilter(),
      "standardMetrics.calculatedAt": {
        $ne: null,
      },
    })
      .sort({
        attemptNumber: 1,
      })
      .lean();
  const summaries =
    attempts.map(
      weeklyAttemptSummary
    );

  return PrivateMockWeeklyResult.findOneAndUpdate(
    {
      userId,
      weekKey,
    },
    {
      $set: {
        attempts:
          summaries,
        attemptCount:
          summaries.length,
      },
      $setOnInsert: {
        selectionState:
          "pending",
        selectionReason: "",
        status: "open",
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
}

async function selectPrivateMockWeeklyAttempt({
  userId,
  weekKey,
  attemptId,
  defer = false,
  now = new Date(),
}) {
  await assertPrivateMockEligibility(
    userId
  );

  const exams =
    await PrivateMockExam.find({
      weekKey,
      status: {
        $ne: "cancelled",
      },
    }).lean();

  if (!exams.length) {
    throw statusError(
      404,
      "선택할 주간 모의고사를 찾을 수 없습니다."
    );
  }

  if (
    now >=
    getWeekSelectionLockAt(
      exams[0].releaseAt,
      exams.find(
        (exam) =>
          Number(
            exam.attemptNumber
          ) === 3
      )?.durationMinutes ||
        DEFAULT_DURATION_MINUTES
    )
  ) {
    throw statusError(
      409,
      "3회차 시험이 종료되어 대표 성적 선택이 잠겼습니다."
    );
  }

  const weeklyResult =
    await syncPrivateMockWeeklyResult({
      userId,
      weekKey,
    });

  if (
    weeklyResult.attemptCount <
    2
  ) {
    throw statusError(
      409,
      "2회 이상 응시한 뒤 대표 성적을 선택할 수 있습니다."
    );
  }

  if (defer) {
    weeklyResult.selectedAttemptId =
      null;
    weeklyResult.selectionState =
      "deferred";
    weeklyResult.selectionReason =
      "";
  } else {
    const selected =
      weeklyResult.attempts.find(
        (attempt) =>
          String(
            attempt.attemptId
          ) ===
          String(attemptId)
      );

    if (!selected) {
      throw statusError(
        400,
        "본인이 완료한 시험 성적만 선택할 수 있습니다."
      );
    }

    weeklyResult.selectedAttemptId =
      selected.attemptId;
    weeklyResult.selectionState =
      "selected";
    weeklyResult.selectionReason =
      "user-selected";
  }

  await weeklyResult.save();

  return {
    selectionState:
      weeklyResult.selectionState,
    selectedAttemptId:
      weeklyResult
        .selectedAttemptId
        ? String(
            weeklyResult
              .selectedAttemptId
          )
        : null,
  };
}

async function getPrivateMockSelectionView({
  userId,
  weekKey,
  releaseAt,
  now = new Date(),
}) {
  const thirdExam =
    await PrivateMockExam.findOne({
      weekKey,
      attemptNumber: 3,
      status: {
        $ne: "cancelled",
      },
    })
      .select(
        "durationMinutes closeAt"
      )
      .lean();
  const attempts =
    await PrivateMockExamAttempt.find({
      userId,
      weekKey,
      status: "submitted",
      ...rankableIntegrityFilter(),
      "standardMetrics.calculatedAt": {
        $ne: null,
      },
    })
      .sort({
        attemptNumber: 1,
      })
      .lean();

  if (!attempts.length) {
    return null;
  }

  const weeklyResult =
    await syncPrivateMockWeeklyResult({
      userId,
      weekKey,
    });
  const locked =
    now >=
      (
        thirdExam?.closeAt
          ? new Date(
              thirdExam.closeAt
            )
          : getWeekSelectionLockAt(
              releaseAt,
              thirdExam
                ?.durationMinutes
            )
      ) ||
    weeklyResult.status !==
      "open";

  return {
    weekKey,
    attemptCount:
      attempts.length,
    canChoose:
      attempts.length >= 2 &&
      !locked,
    locked,
    selectionState:
      weeklyResult.selectionState,
    selectionReason:
      weeklyResult.selectionReason,
    selectedAttemptId:
      weeklyResult
        .selectedAttemptId
        ? String(
            weeklyResult
              .selectedAttemptId
          )
        : null,
    representativeAttemptId:
      weeklyResult
        .representativeAttemptId
        ? String(
            weeklyResult
              .representativeAttemptId
          )
        : null,
    attempts:
      attempts.map(
        (attempt) => ({
          id:
            String(attempt._id),
          attemptNumber:
            attempt.attemptNumber,
          formCode:
            attempt.formCode,
          rawScore:
            attempt.score,
          standardizedPerformance:
            Math.round(
              Number(
                attempt
                  .standardMetrics
                  ?.actualPerformance ||
                  0
              ) * 1000
            ) / 10,
          totalPercentile:
            Math.round(
              Number(
                attempt
                  .standardMetrics
                  ?.totalPercentile ||
                  0
              ) * 1000
            ) / 10,
          isRepresentative:
            attempt
              .isRepresentative,
        })
      ),
  };
}

async function lockPrivateMockExam(
  exam,
  now
) {
  await PrivateMockExamAttempt.updateMany(
    {
      examId: exam._id,
      status:
        "in_progress",
    },
    {
      $set: {
        status: "expired",
        elapsedMs:
          exam.durationMinutes *
          60 *
          1000,
      },
    }
  );
  await refreshExamStandardMetrics(
    exam,
    now
  );
  const submittedUserIds =
    await PrivateMockExamAttempt.distinct(
      "userId",
      {
        examId:
          exam._id,
        status:
          "submitted",
      }
    );

  if (!exam.isTest) {
    await Promise.all(
      submittedUserIds.map(
        (userId) =>
          syncPrivateMockWeeklyResult({
            userId,
            weekKey:
              exam.weekKey,
          })
      )
    );
  }
  if (exam.announcementId) {
    await Announcement.updateOne(
      {
        _id:
          exam.announcementId,
      },
      {
        $set: {
          isPublished: false,
        },
      }
    );
  }
}

async function withoutExpiredArenaAttempts(
  attempts
) {
  const source = Array.isArray(attempts)
    ? attempts
    : [];
  const userIds = [
    ...new Set(
      source
        .map((attempt) =>
          String(attempt?.userId || "")
        )
        .filter((userId) =>
          mongoose.isValidObjectId(userId)
        )
    ),
  ];
  if (!userIds.length) return source;

  const objectIds = userIds.map(
    (userId) =>
      new mongoose.Types.ObjectId(userId)
  );
  const [expiredStates, depletedCycles] =
    await Promise.all([
      ArenaAccessState.find({
        userId: { $in: objectIds },
        state:
          "SUB_ACCESS_EXPIRED_LOCKED",
      })
        .select("userId")
        .lean(),
      AccessCycle.find({
        userId: { $in: objectIds },
        availableLearningDays: 0,
        status: { $in: ["ACTIVE", "EXPIRED"] },
      })
        .select("userId")
        .lean(),
    ]);
  const excludedUserIds = new Set([
    ...expiredStates.map((state) =>
      String(state.userId)
    ),
    ...depletedCycles.map((cycle) =>
      String(cycle.userId)
    ),
  ]);
  return source.filter(
    (attempt) =>
      !excludedUserIds.has(
        String(attempt.userId)
      )
  );
}

async function lockPrivateMockWeekSelections(
  weekKey,
  now = new Date()
) {
  const exams =
    await PrivateMockExam.find({
      weekKey,
      status: {
        $ne: "cancelled",
      },
    })
      .select("+points")
      .sort({
        attemptNumber: 1,
      })
      .lean();

  for (const exam of exams) {
    await refreshExamStandardMetrics(
      exam,
      now
    );
  }

  const submittedAttempts =
    await PrivateMockExamAttempt.find({
      weekKey,
      status: "submitted",
      ...rankableIntegrityFilter(),
    })
      .sort({
        userId: 1,
        attemptNumber: 1,
      })
      .lean();
  const attempts =
    await withoutExpiredArenaAttempts(
      submittedAttempts
    );
  const byUser =
    new Map();

  for (const attempt of attempts) {
    const key =
      String(attempt.userId);
    if (!byUser.has(key)) {
      byUser.set(key, []);
    }
    byUser.get(key).push(
      attempt
    );
  }

  await PrivateMockExamAttempt.updateMany(
    {
      weekKey,
    },
    {
      $set: {
        isRepresentative: false,
        usedForWeeklyRanking:
          false,
        usedForMmrStability:
          false,
      },
    }
  );
  await PrivateMockWeeklyResult.updateMany(
    {
      weekKey,
      userId: {
        $nin: [
          ...byUser.keys(),
        ],
      },
    },
    {
      $set: {
        representativeAttemptId:
          null,
        representativePerformance:
          0,
        representativeRawScore:
          0,
        representativeElapsedMs:
          0,
        attemptCount: 0,
        rank: null,
        status: "open",
      },
    }
  );

  for (const [
    userId,
    userAttempts,
  ] of byUser) {
    const existing =
      await PrivateMockWeeklyResult.findOne({
        userId,
        weekKey,
      });
    const {
      representative,
      selectionReason,
    } = resolveWeeklyRepresentative({
      attempts:
        userAttempts,
      selectedAttemptId:
        existing
          ?.selectedAttemptId,
    });
    const summaries =
      userAttempts.map(
        weeklyAttemptSummary
      );
    const mmrPerformance =
      calculateWeeklyMmrPerformance(
        summaries.map(
          (attempt) =>
            attempt
              .actualPerformance
        )
      );

    await PrivateMockWeeklyResult.findOneAndUpdate(
      {
        userId,
        weekKey,
      },
      {
        $set: {
          attempts:
            summaries,
          selectedAttemptId:
            representative._id,
          selectionState:
            "locked",
          selectionReason,
          representativeAttemptId:
            representative._id,
          representativePerformance:
            Number(
              representative
                .standardMetrics
                ?.actualPerformance
            ) || 0,
          representativeRawScore:
            Number(
              representative.score
            ) || 0,
          representativeElapsedMs:
            Number(
              representative.elapsedMs
            ) || 0,
          mmrPerformance,
          attemptCount:
            userAttempts.length,
          status: "locked",
          lockedAt: now,
        },
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    await PrivateMockExamAttempt.updateMany(
      {
        _id: {
          $in: userAttempts.map(
            (attempt) =>
              attempt._id
          ),
        },
      },
      {
        $set: {
          usedForMmrStability:
            true,
        },
      }
    );
    await PrivateMockExamAttempt.updateOne(
      {
        _id:
          representative._id,
      },
      {
        $set: {
          isRepresentative:
            true,
          usedForWeeklyRanking:
            true,
        },
      }
    );

    if (
      selectionReason !==
        "user-selected" &&
      existing &&
      existing.selectionState !==
        "locked"
    ) {
      await UserNotification.create({
        userId,
        title:
          "주간 대표 성적이 자동 선택되었습니다",
        message:
          `${representative.formCode}형의 최고 표준화 성적이 이번 주 랭킹 대표 기록으로 자동 반영되었습니다.`,
        href:
          "/private-mock-exams",
        kind: "system",
        createdBy: null,
      });
    }
  }

  const weeklyResults =
    await PrivateMockWeeklyResult.find({
      weekKey,
      status: "locked",
      representativeAttemptId: {
        $ne: null,
      },
    })
      .sort({
        representativePerformance:
          -1,
        representativeRawScore:
          -1,
        representativeElapsedMs:
          1,
        createdAt: 1,
      });

  for (
    let index = 0;
    index <
    weeklyResults.length;
    index += 1
  ) {
    weeklyResults[index].rank =
      index + 1;
    await weeklyResults[
      index
    ].save();
  }

  return weeklyResults;
}

async function processPrivateMockWeekMmr(
  weekKey,
  now = new Date()
) {
  const exams =
    await PrivateMockExam.find({
      weekKey,
      isTest: {
        $ne: true,
      },
      status: {
        $in: [
          "aggregating",
          "ranked",
          "archived",
          "finalizing",
          "finalized",
        ],
      },
      aggregationCompletedAt: {
        $ne: null,
      },
    })
      .sort({
        attemptNumber: 1,
      })
      .lean();
  const allWeekExams =
    await PrivateMockExam.countDocuments({
      weekKey,
      isTest: {
        $ne: true,
      },
      status: {
        $ne: "cancelled",
      },
    });

  if (
    !exams.length ||
    exams.length !==
      allWeekExams
  ) {
    return null;
  }

  await lockPrivateMockWeekSelections(
    weekKey,
    now
  );

  const anchorExam =
    exams[
      exams.length - 1
    ];
  const weeklyResults =
    await PrivateMockWeeklyResult.find({
      weekKey,
      status: "locked",
      representativeAttemptId: {
        $ne: null,
      },
    }).lean();
  const representativeIds =
    weeklyResults.map(
      (result) =>
        result
          .representativeAttemptId
    );
  const representativeAttempts =
    await PrivateMockExamAttempt.find({
      _id: {
        $in:
          representativeIds,
      },
      status: "submitted",
    }).lean();
  const attemptById =
    new Map(
      representativeAttempts.map(
        (attempt) => [
          String(attempt._id),
          attempt,
        ]
      )
    );
  const seriesEntries =
    weeklyResults
      .map((result) => {
        const representativeAttempt =
          attemptById.get(
            String(
              result
                .representativeAttemptId
            )
          );
        const selectedSummary =
          result.attempts.find(
            (attempt) =>
              String(
                attempt.attemptId
              ) ===
              String(
                result
                  .representativeAttemptId
              )
          );

        if (
          !representativeAttempt ||
          !selectedSummary
        ) {
          return null;
        }

        return {
          weeklyResultId:
            result._id,
          representativeAttempt,
          rawScore:
            selectedSummary
              .rawScore,
          totalPercentile:
            selectedSummary
              .totalPercentile,
          advancedPercentile:
            selectedSummary
              .advancedPercentile,
          consistencyScore:
            selectedSummary
              .consistencyScore,
          mmrPerformance:
            result.mmrPerformance,
        };
      })
      .filter(Boolean);

  return processWeeklyExamMmr({
    exam: anchorExam,
    attempts: [],
    seriesEntries,
    now,
  });
}

async function analyzePrivateMockExam(
  exam,
  now
) {
  const submittedCandidates =
    await PrivateMockExamAttempt.find({
      examId: exam._id,
      status: "submitted",
      ...rankableIntegrityFilter(),
    })
      .sort({
        score: -1,
        elapsedMs: 1,
        submittedAt: 1,
      })
      .lean();
  const submitted =
    await withoutExpiredArenaAttempts(
      submittedCandidates
    );

  if (submitted.length) {
    await PrivateMockExamAttempt.bulkWrite(
      submitted.map(
        (attempt, index) => ({
          updateOne: {
            filter: {
              _id: attempt._id,
            },
            update: {
              $set: {
                rank:
                  index + 1,
              },
            },
          },
        })
      )
    );
  }

  await PrivateMockExam.updateOne(
    {
      _id: exam._id,
      status: "aggregating",
    },
    {
      $set: {
        aggregationCompletedAt:
          now,
        rankingSummary:
          buildRankingSummary(
            submitted
          ),
      },
    }
  );

}

async function archivePrivateMockExam(
  exam,
  now
) {
  const folder =
    await ensurePrivateMockFolder(
      exam
    );
  const archiveTitle =
    `${getKoreanWeekTitle(
      exam.releaseAt
    )} ${exam.formCode || ""}형`.trim();

  await Promise.all([
    ArchiveItem.updateOne(
      {
        _id: exam.archiveItemId,
      },
      {
        $set: {
          folderId: folder._id,
          title:
            archiveTitle,
          description:
            `${exam.title} · 시험 종료 후 공개 문제지`,
          isPublished: true,
        },
      }
    ),
    exam.answerSheetArchiveItemId
      ? ArchiveItem.updateOne(
          {
            _id:
              exam.answerSheetArchiveItemId,
          },
          {
            $set: {
              folderId:
                folder._id,
              title:
                `${archiveTitle} 정답과 해설`,
              description:
                `${exam.title} · 정답 및 해설`,
              isPublished: true,
            },
          }
        )
      : Promise.resolve(),
  ]);
  await PrivateMockExam.updateOne(
    {
      _id: exam._id,
      status: {
        $in: [
          "aggregating",
          "ranked",
        ],
      },
    },
    {
      $set: {
        status:
          exam.status ===
          "ranked"
            ? "archived"
            : exam.status,
        archivedAt: now,
      },
    }
  );
}

function getUploadReminderWindow(
  now
) {
  const releaseAt =
    getSundayReleaseAt(now);
  const reminderAt =
    new Date(
      releaseAt.getTime() -
        UPLOAD_REMINDER_LEAD_MS
    );

  return {
    releaseAt,
    reminderAt,
    shouldRemind:
      now >= reminderAt &&
      now < releaseAt,
  };
}

async function processUploadReminder(
  now
) {
  const {
    releaseAt,
    shouldRemind,
  } = getUploadReminderWindow(
    now
  );

  if (
    !shouldRemind
  ) {
    return;
  }

  const scheduledAttempts =
    await PrivateMockExam.distinct(
      "attemptNumber",
      {
      weekKey:
        privateMockWeekKey(
          releaseAt
        ),
      status: {
        $in: [
          "scheduled",
          "open",
        ],
      },
      }
    );
  const missingAttempts =
    [1, 2, 3].filter(
      (attemptNumber) =>
        !scheduledAttempts.includes(
          attemptNumber
        )
    );

  if (!missingAttempts.length) {
    return;
  }

  let reminder =
    await PrivateMockUploadReminder.findOne({
      releaseAt,
    });

  if (!reminder) {
    try {
      reminder =
        await PrivateMockUploadReminder.create({
          releaseAt,
          status: "pending",
        });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
      reminder =
        await PrivateMockUploadReminder.findOne({
          releaseAt,
        });
    }
  }

  if (
    reminder?.status ===
      "sending" &&
    reminder.lastAttemptAt &&
    reminder.lastAttemptAt <=
      new Date(
        now.getTime() -
          10 * MINUTE_MS
      )
  ) {
    await PrivateMockUploadReminder.updateOne(
      {
        _id: reminder._id,
        status: "sending",
      },
      {
        $set: {
          status: "failed",
          nextRetryAt: now,
          lastError:
            "이전 이메일 발송 작업이 중단되어 다시 시도합니다.",
        },
      }
    );
    reminder.status = "failed";
    reminder.nextRetryAt = now;
  }

  if (
    !reminder ||
    reminder.status === "sent" ||
    reminder.status === "sending" ||
    (
      reminder.nextRetryAt &&
      reminder.nextRetryAt > now
    )
  ) {
    return;
  }

  const claimed =
    await PrivateMockUploadReminder.findOneAndUpdate(
      {
        _id: reminder._id,
        status: {
          $in: [
            "pending",
            "failed",
          ],
        },
      },
      {
        $set: {
          status: "sending",
          lastAttemptAt: now,
          lastError: "",
        },
        $inc: {
          attempts: 1,
        },
      },
      {
        returnDocument: "after",
      }
    );

  if (!claimed) {
    return;
  }

  try {
    const template =
      uploadReminderEmail({
        weekKey:
          privateMockWeekKey(
            releaseAt
          ),
        missingFormLabels:
          missingAttempts.map(
            (attemptNumber) =>
              `${privateMockFormCode(attemptNumber)}형`
          ),
      });
    const delivery =
      await sendEmail({
        to:
          process.env
            .ADMIN_EMAIL ||
          DEFAULT_ADMIN_EMAIL,
        subject:
          template.subject,
        text:
          template.text,
        html:
          buildBrandedHtml(
            template
          ),
      });

    await PrivateMockUploadReminder.updateOne(
      {
        _id: claimed._id,
      },
      {
        $set: {
          status: "sent",
          sentAt: now,
          deliveryMode:
            delivery.delivered
              ? "email"
              : "preview",
          nextRetryAt: null,
        },
      }
    );
  } catch (error) {
    await PrivateMockUploadReminder.updateOne(
      {
        _id: claimed._id,
      },
      {
        $set: {
          status: "failed",
          lastError:
            String(
              error.message || ""
            ).slice(0, 500),
          nextRetryAt:
            new Date(
              now.getTime() +
                UPLOAD_REMINDER_RETRY_MS
            ),
        },
      }
    );
  }
}

async function normalizeStoredPrivateMockSchedules() {
  if (scheduleBackfillComplete) {
    return;
  }

  const exams =
    await PrivateMockExam.find({
      status: {
        $ne: "cancelled",
      },
    })
      .select(
        "releaseAt durationMinutes status archivedAt weekKey attemptNumber formCode isTest"
      )
      .lean();

  for (const exam of exams) {
    let schedule;

    try {
      schedule =
        buildPrivateMockSchedule(
          exam.releaseAt,
          exam.durationMinutes,
          {
            isTest:
              Boolean(
                exam.isTest
              ),
          }
        );
    } catch (error) {
      continue;
    }

    const status =
      exam.status ===
        "finalized" ||
      exam.archivedAt
        ? "archived"
        : exam.status ===
            "finalizing"
          ? "locked"
          : exam.status;
    const weekKey =
      exam.weekKey ||
      privateMockWeekKey(
        exam.releaseAt
      );
    const attemptNumber =
      exam.attemptNumber != null
        ? exam.attemptNumber
        : privateMockAttemptNumber(
            exam.releaseAt
          ) || 1;
    const formCode =
      exam.formCode ||
      privateMockFormCode(
        attemptNumber
      );

    await PrivateMockExam.updateOne(
      {
        _id: exam._id,
      },
      {
        $set: {
          ...schedule,
          weekKey,
          attemptNumber,
          formCode,
          status,
        },
      }
    );
    await PrivateMockExamAttempt.updateMany(
      {
        examId: exam._id,
        $or: [
          {
            weekKey: {
              $exists: false,
            },
          },
          {
            attemptNumber: {
              $exists: false,
            },
          },
          {
            formCode: {
              $exists: false,
            },
          },
        ],
      },
      {
        $set: {
          weekKey,
          attemptNumber,
          formCode,
        },
      }
    );
  }

  scheduleBackfillComplete =
    true;
}

async function processPrivateMockSchedule(
  now = new Date()
) {
  if (scheduleRunning) {
    return;
  }

  scheduleRunning = true;

  try {
    await normalizeStoredPrivateMockSchedules();
    await PrivateMockExam.updateMany(
      {
        status: "scheduled",
        releaseAt: {
          $lte: now,
        },
        closeAt: {
          $gt: now,
        },
      },
      {
        $set: {
          status: "open",
        },
      }
    );

    const released =
      await PrivateMockExam.find({
        status: "open",
        isTest: {
          $ne: true,
        },
        releaseAt: {
          $lte: now,
        },
        closeAt: {
          $gt: now,
        },
        notificationSentAt:
          null,
      });

    for (const exam of released) {
      await sendReleaseNotice(
        exam,
        now
      );
    }

    const due =
      await PrivateMockExam.find({
        status: {
          $in: [
            "scheduled",
            "open",
          ],
        },
        closeAt: {
          $lte: now,
        },
      }).lean();

    for (const exam of due) {
      const claimed =
        await PrivateMockExam.findOneAndUpdate(
          {
            _id: exam._id,
            status: {
              $in: [
                "scheduled",
                "open",
              ],
            },
          },
          {
            $set: {
              status:
                "locked",
            },
          },
          {
            returnDocument:
              "after",
          }
        )
          .select("+points")
          .lean();

      if (!claimed) {
        continue;
      }

      try {
        await lockPrivateMockExam(
          claimed,
          now
        );
      } catch (error) {
        await PrivateMockExam.updateOne(
          {
            _id: claimed._id,
            status:
              "locked",
          },
          {
            $set: {
              status:
                claimed.releaseAt <=
                  now &&
                claimed.closeAt >
                  now
                  ? "open"
                  : "scheduled",
            },
          }
        );
        throw error;
      }
    }

    const aggregationDue =
      await PrivateMockExam.find({
        status: "locked",
        isTest: {
          $ne: true,
        },
        aggregationStartsAt: {
          $lte: now,
        },
      }).lean();

    for (const exam of
      aggregationDue) {
      const claimed =
        await PrivateMockExam.findOneAndUpdate(
          {
            _id: exam._id,
            status: "locked",
          },
          {
            $set: {
              status:
                "aggregating",
              aggregationStartedAt:
                now,
            },
          },
          {
            returnDocument:
              "after",
          }
        )
          .select("+points")
          .lean();

      if (!claimed) {
        continue;
      }

      try {
        await analyzePrivateMockExam(
          claimed,
          now
        );
        if (
          Number(
            claimed.attemptNumber
          ) === 3
        ) {
          await lockPrivateMockWeekSelections(
            claimed.weekKey ||
              privateMockWeekKey(
                claimed.releaseAt
              ),
            now
          );
        }
      } catch (error) {
        await PrivateMockExam.updateOne(
          {
            _id: claimed._id,
            status:
              "aggregating",
          },
          {
            $set: {
              status: "locked",
              aggregationStartedAt:
                null,
            },
          }
        );
        throw error;
      }
    }

    const rankingPublishDue =
      await PrivateMockExam.find({
        status: "aggregating",
        isTest: {
          $ne: true,
        },
        aggregationCompletedAt: {
          $ne: null,
        },
        rankingPublishesAt: {
          $lte: now,
        },
      })
        .select(
          "weekKey releaseAt"
        )
        .lean();
    const publishedWeekKeys = [
      ...new Set(
        rankingPublishDue.map(
          (exam) =>
            exam.weekKey ||
            privateMockWeekKey(
              exam.releaseAt
            )
        )
      ),
    ];
    if (
      publishedWeekKeys.length
    ) {
      for (const weekKey of
        publishedWeekKeys) {
        await processPrivateMockWeekMmr(
          weekKey,
          now
        );
      }

      await PrivateMockExam.updateMany(
        {
          status: "aggregating",
          isTest: {
            $ne: true,
          },
          aggregationCompletedAt: {
            $ne: null,
          },
          rankingPublishesAt: {
            $lte: now,
          },
          weekKey: {
            $in:
              publishedWeekKeys,
          },
        },
        {
          $set: {
            status: "ranked",
            rankingFinalizedAt:
              now,
          },
        }
      );

      await PrivateMockWeeklyResult.updateMany(
        {
          weekKey: {
            $in:
              publishedWeekKeys,
          },
          status: "locked",
        },
        {
          $set: {
            status:
              "published",
            publishedAt:
              now,
          },
        }
      );
      const {
        syncPublishedWeeklyMockBonuses,
      } = require("./finalRankingService");
      await syncPublishedWeeklyMockBonuses({
        weekKeys: publishedWeekKeys,
        now,
      });
    }

    const archiveDue =
      await PrivateMockExam.find({
        status: {
          $in: [
            "aggregating",
            "ranked",
          ],
        },
        isTest: {
          $ne: true,
        },
        archivedAt: null,
        archiveAt: {
          $lte: now,
        },
      }).lean();

    for (const exam of
      archiveDue) {
      await archivePrivateMockExam(
        exam,
        now
      );
    }

    await PrivateMockExam.updateMany(
      {
        status: "ranked",
        archivedAt: {
          $ne: null,
        },
      },
      {
        $set: {
          status: "archived",
        },
      }
    );

    await processUploadReminder(
      now
    );
  } finally {
    scheduleRunning = false;
  }
}

function startPrivateMockExamScheduler({
  intervalMs = 30 * 1000,
} = {}) {
  if (scheduleTimer) {
    return scheduleTimer;
  }

  const run = () => require("./schedulerLeaseService").withSchedulerLease(
    { name: "PRIVATE_MOCK_EXAM_STATE", leaseMs: 10 * 60 * 1000 },
    () => processPrivateMockSchedule()
  );
  run()
    .catch((error) => {
      console.error(
        "Matths 주간 공식 모의고사 스케줄 초기화 실패:",
        error
      );
    });
  scheduleTimer =
    setInterval(() => {
      run()
        .catch((error) => {
          console.error(
            "Matths 주간 공식 모의고사 스케줄 처리 실패:",
            error
          );
        });
    }, intervalMs);
  scheduleTimer.unref?.();

  return scheduleTimer;
}

async function getWeeklyRankingEntries(
  weekKey,
  limit = 100
) {
  const results =
    await PrivateMockWeeklyResult.find({
      weekKey,
      status: "published",
      representativeAttemptId: {
        $ne: null,
      },
    })
      .sort({
        rank: 1,
        representativePerformance:
          -1,
      })
      .limit(limit)
      .populate(
        "userId",
        "name realName preferences"
      )
      .populate(
        "representativeAttemptId",
        "score elapsedMs"
      )
      .lean();

  return results.map(
    (result, index) => ({
      rank:
        result.rank ||
        index + 1,
      userId:
        String(
          result.userId?._id ||
            result.userId ||
            ""
        ),
      displayName:
        getRankingDisplayName(
          result.userId
        ),
      score:
        result
          .representativeAttemptId
          ?.score ?? null,
      standardizedPerformance:
        Math.round(
          Number(
            result
              .representativePerformance
          ) * 1000
        ) / 10,
      attemptCount:
        result.attemptCount,
      elapsedMs:
        result
          .representativeAttemptId
          ?.elapsedMs || 0,
      elapsedLabel:
        formatElapsed(
          result
            .representativeAttemptId
            ?.elapsedMs
        ),
    })
  );
}

async function getPrivateMockEligibility(
  userId
) {
  const user =
    await User.findById(
      userId
    )
      .select(
        "role email privateMockRestriction"
      );

  if (isArchiveAdmin(user)) {
    return {
      allowed: true,
      status: "admin-test",
      title:
        "운영자 시험 확인 가능",
      message:
        "운영자는 배치고사 여부와 관계없이 업로드한 회차와 OMR을 확인할 수 있습니다.",
      ctaLabel:
        "Matths 주간 공식 모의고사 입장",
      ctaHref:
        "/private-mock-exams",
    };
  }

  if (
    user?.privateMockRestriction
      ?.active
  ) {
    const restriction =
      await synchronizePrivateMockRestriction(
        user
      );

    if (restriction.active) {
      return {
        allowed: false,
        status:
          "integrity-restriction",
        title:
          "Matths 주간 공식 모의고사 응시가 제한되어 있습니다.",
        message:
          `관리자 검토 결과 이후 남은 ${restriction.remainingWeekCount}회(${restriction.remainingWeekCount}주) 동안 Matths 주간 공식 모의고사에 응시할 수 없습니다. A·B·C 시험은 한 주로 계산합니다.`,
        ctaLabel:
          "제한 내용 확인",
        ctaHref:
          "/account/private-mock-restriction",
      };
    }
  }

  const packageAccess =
    await getWeeklyMockExamAccess(userId);
  if (!packageAccess.active) {
    const deniedAt = new Date();
    const kstDayNumber = Math.floor(
      (deniedAt.getTime() + SEOUL_OFFSET_MS) / DAY_MS
    );
    await recordOperationalMetricEvent({
      eventKey: `weekly-mock-access-denied:${userId}:${kstDayNumber}`,
      eventType: "WEEKLY_MOCK_ACCESS_DENIED",
      userId,
      result: "DENIED",
      reasonCode: "PAYMENT_REQUIRED",
      occurredAt: deniedAt,
    });
    return {
      allowed: false,
      status: "payment-required",
      title: "이용 중인 패키지가 필요합니다.",
      message:
        "Matths 주간 공식 모의고사는 Matths 주간 공식 모의고사 이용권 또는 29일 학습권 패키지를 이용 중인 회원만 응시할 수 있습니다.",
      ctaLabel: "패키지 확인",
      ctaHref: "/pricing",
      availableLearningDays: 0,
    };
  }

  if (packageAccess.packageType === "MOCK_EXAM_ONLY") {
    return {
      allowed: true,
      status: "mock-exam-only-ready",
      title: "Matths 주간 공식 모의고사 응시 가능",
      message:
        "Matths 주간 공식 모의고사 이용권에서는 배치고사와 GOAT Arena를 이용할 수 없지만, 공식 모의고사 결과로 내부 실력 지표를 계속 계산해 저장합니다.",
      ctaLabel: "Matths 주간 공식 모의고사 입장",
      ctaHref: "/private-mock-exams",
      packageType: "MOCK_EXAM_ONLY",
    };
  }

  const placement =
    await AssessmentAttempt.findOne({
      userId,
      scopeType: "placement",
      status: "submitted",
    })
      .sort({
        submittedAt: -1,
      })
      .select(
        "placementResult.verification.result"
      )
      .lean();

  if (!placement) {
    return {
      allowed: false,
      status:
        "placement-required",
      title:
        "입단 배치고사를 먼저 완료해주세요.",
      message:
        "Matths 주간 공식 모의고사는 배치고사로 초기 실력을 확인한 회원만 응시할 수 있습니다.",
      ctaLabel:
        "배치고사 보러 가기",
      ctaHref:
        "/war-of-masters",
    };
  }

  if (
    placement.placementResult
      ?.verification?.result ===
    "pending"
  ) {
    return {
      allowed: false,
      status:
        "verification-required",
      title:
        "추가 실력 확인 4문항을 완료해주세요.",
      message:
        "배치 결과에 추가 확인이 필요합니다. 준킬러 2문항과 킬러 2문항을 마치고 초기 GP와 티어가 확정되면 입장할 수 있습니다.",
      ctaLabel:
        "추가 문제 풀기",
      ctaHref:
        `/war-of-masters/placement/${placement._id}`,
    };
  }

  const rankingProfile =
    await ensureRankingProfile(
      userId
    );

  if (!rankingProfile) {
    return {
      allowed: false,
      status: "ranking-pending",
      title:
        "초기 GP를 확정하고 있습니다.",
      message:
        "배치 결과와 추가 확인 기록을 바탕으로 초기 티어와 GP가 생성되면 Matths 주간 공식 모의고사에 입장할 수 있습니다.",
      ctaLabel:
        "War of GOAT으로",
      ctaHref:
        "/war-of-masters",
    };
  }

  return {
    allowed: true,
    status: "ready",
    title:
      "Matths 주간 공식 모의고사 응시 가능",
    message:
      "배치고사와 초기 GP 확정이 완료되었습니다.",
    ctaLabel:
      "Matths 주간 공식 모의고사 입장",
    ctaHref:
      "/private-mock-exams",
  };
}

function summarizePrivateMockRestrictionWeeks({
  exams,
  now = new Date(),
  totalWeeks = 3,
}) {
  const weekMap =
    new Map();
  (exams || []).forEach(
    (exam) => {
      const weekKey =
        exam.weekKey ||
        privateMockWeekKey(
          exam.releaseAt
        );
      const existing =
        weekMap.get(
          weekKey
        ) || {
          weekKey,
          closeAt:
            new Date(0),
          examIds: [],
        };
      const closeAt =
        new Date(
          exam.closeAt
        );
      if (
        closeAt >
        existing.closeAt
      ) {
        existing.closeAt =
          closeAt;
      }
      existing.examIds.push(
        exam._id
      );
      weekMap.set(
        weekKey,
        existing
      );
    }
  );
  const orderedWeeks = [
    ...weekMap.values(),
  ].sort(
    (left, right) =>
      left.closeAt -
      right.closeAt
  );
  const completedWeeks =
    orderedWeeks
      .filter(
        (week) =>
          week.closeAt <= now
      )
      .slice(
        0,
        totalWeeks
      );
  const servedWeekKeys =
    completedWeeks.map(
      (week) =>
        week.weekKey
    );
  const servedExamIds =
    completedWeeks.flatMap(
      (week) =>
        week.examIds
    );
  const remainingWeekCount =
    Math.max(
      0,
      totalWeeks -
        servedWeekKeys.length
    );
  const active =
    remainingWeekCount > 0;
  let expectedReleaseAt = null;

  if (active) {
    const upcomingWeeks =
      orderedWeeks.filter(
        (week) =>
          week.closeAt > now
      );
    if (
      upcomingWeeks.length >=
      remainingWeekCount
    ) {
      expectedReleaseAt =
        upcomingWeeks[
          remainingWeekCount - 1
        ].closeAt;
    }
  }

  return {
    active,
    remainingExamCount:
      remainingWeekCount,
    remainingWeekCount,
    servedExamIds,
    servedWeekKeys,
    expectedReleaseAt,
  };
}

async function synchronizePrivateMockRestriction(
  user,
  now = new Date()
) {
  const restriction =
    user?.privateMockRestriction;
  if (!restriction?.active) {
    return {
      active: false,
      remainingExamCount: 0,
      remainingWeekCount: 0,
      servedExamIds: [],
      servedWeekKeys: [],
      expectedReleaseAt: null,
    };
  }

  const imposedAt =
    restriction.imposedAt
      ? new Date(
          restriction.imposedAt
        )
      : now;
  const restrictedExams =
    await PrivateMockExam.find({
      isTest: { $ne: true },
      status: {
        $ne: "cancelled",
      },
      releaseAt: {
        $gt: imposedAt,
      },
    })
      .sort({ closeAt: 1 })
      .select(
        "_id weekKey releaseAt closeAt"
      )
      .lean();
  const summary =
    summarizePrivateMockRestrictionWeeks({
      exams:
        restrictedExams,
      now,
      totalWeeks: 3,
    });
  const {
    active,
    remainingWeekCount,
    servedExamIds,
    servedWeekKeys,
    expectedReleaseAt,
  } = summary;

  const update = {
    "privateMockRestriction.active":
      active,
    "privateMockRestriction.remainingExamCount":
      remainingWeekCount,
    "privateMockRestriction.remainingWeekCount":
      remainingWeekCount,
    "privateMockRestriction.servedExamIds":
      servedExamIds,
    "privateMockRestriction.servedWeekKeys":
      servedWeekKeys,
  };
  if (!active) {
    update[
      "privateMockRestriction.clearedAt"
    ] = now;
  }

  await User.updateOne(
    { _id: user._id },
    { $set: update }
  );

  restriction.active = active;
  restriction.remainingExamCount =
    remainingWeekCount;
  restriction.remainingWeekCount =
    remainingWeekCount;
  restriction.servedExamIds =
    servedExamIds;
  restriction.servedWeekKeys =
    servedWeekKeys;
  if (!active) {
    restriction.clearedAt = now;
  }

  return summary;
}

async function getPrivateMockRestrictionData(
  userId,
  now = new Date()
) {
  const user =
    await User.findById(userId)
      .select(
        "name realName email warningCount school schoolGrade privateMockRestriction"
      );
  if (!user) {
    throw statusError(
      404,
      "사용자 정보를 찾을 수 없습니다."
    );
  }

  const synchronized =
    await synchronizePrivateMockRestriction(
      user,
      now
    );
  const sourceCaseId =
    user.privateMockRestriction
      ?.sourceIntegrityCaseId;
  const integrityCase =
    sourceCaseId
      ? await PrivateMockIntegrityCase.findOne({
          _id: sourceCaseId,
          userId: user._id,
        })
          .select(
            "requestedQuestionNumbers reviewStatus penaltyDecision decision createdAt updatedAt"
          )
          .lean()
      : null;

  return {
    user: {
      id: String(user._id),
      name: user.name,
      realName:
        user.realName || user.name,
      email: user.email,
      warningCount:
        Number(
          user.warningCount
        ) || 0,
      school:
        user.school || null,
      schoolGrade:
        user.schoolGrade || null,
    },
    restriction: {
      active:
        synchronized.active,
      remainingExamCount:
        synchronized
          .remainingWeekCount,
      remainingWeekCount:
        synchronized
          .remainingWeekCount,
      imposedAt:
        user.privateMockRestriction
          ?.imposedAt || null,
      reason:
        user.privateMockRestriction
          ?.reason ||
        integrityCase?.decision
          ?.reason ||
        "운영 정책 위반 검토 결과에 따라 이용 제한이 적용되었습니다.",
      clearedAt:
        user.privateMockRestriction
          ?.clearedAt || null,
      expectedReleaseAt:
        synchronized
          .expectedReleaseAt,
    },
    integrityCase: integrityCase
      ? {
          id: String(
            integrityCase._id
          ),
          requestedQuestionNumbers:
            integrityCase
              .requestedQuestionNumbers ||
            [],
          reviewStatus:
            integrityCase
              .reviewStatus,
          penaltyDecision:
            integrityCase
              .penaltyDecision,
          decidedAt:
            integrityCase.decision
              ?.decidedAt || null,
        }
      : null,
    serverNow:
      now.toISOString(),
  };
}

async function assertPrivateMockEligibility(
  userId
) {
  const eligibility =
    await getPrivateMockEligibility(
      userId
    );

  if (!eligibility.allowed) {
    const error =
      statusError(
        403,
        eligibility.message
      );
    error.eligibility =
      eligibility;
    throw error;
  }

  return eligibility;
}

async function getPrivateMockExamPageData(
  userId,
  now = new Date()
) {
  const eligibility =
    await getPrivateMockEligibility(
      userId
    );

  if (!eligibility.allowed) {
    return {
      eligibility,
      serverNow:
        now.toISOString(),
      nextReleaseAt:
        getSundayReleaseAt(
          now
        ).toISOString(),
      weeklyRanking: [],
      rankingRules: [],
      rankingTitle:
        "이번 주 랭킹",
      rankingFinalized: false,
      rankingPending: null,
      rankingSummary: null,
      durationMinutes:
        DEFAULT_DURATION_MINUTES,
    };
  }

  await processPrivateMockSchedule(
    now
  );

  const currentExam =
    await PrivateMockExam.findOne({
      status: "open",
      releaseAt: {
        $lte: now,
      },
      closeAt: {
        $gt: now,
      },
    })
      .sort({
        releaseAt: -1,
      })
      .lean();
  const latestRanked =
    await PrivateMockExam.findOne({
      isTest: {
        $ne: true,
      },
      status: {
        $in: [
          "ranked",
          "archived",
          "finalized",
        ],
      },
    })
      .sort({
        releaseAt: -1,
      })
      .lean();
  const rankingPending =
    await PrivateMockExam.findOne({
      isTest: {
        $ne: true,
      },
      status: {
        $in: [
          "locked",
          "aggregating",
        ],
      },
    })
      .sort({
        releaseAt: -1,
      })
      .lean();
  const nextScheduled =
    await PrivateMockExam.findOne({
      status: "scheduled",
      releaseAt: {
        $gt: now,
      },
    })
      .sort({
        releaseAt: 1,
      })
      .lean();
  const roomExam =
    currentExam ||
    nextScheduled;
  const lobbyOpensAt =
    roomExam
      ? new Date(
          new Date(
            roomExam.releaseAt
          ).getTime() -
            PRIVATE_MOCK_LOBBY_MS
        )
      : null;
  const [
    currentAttempt,
    weeklyRanking,
  ] = await Promise.all([
    roomExam
      ? PrivateMockExamAttempt.findOne({
          examId:
            roomExam._id,
          userId,
        })
          .select(
            "status score correctCount answeredCount standardMetrics attemptNumber formCode"
          )
          .lean()
      : null,
    latestRanked
      ? getWeeklyRankingEntries(
          latestRanked.weekKey ||
            privateMockWeekKey(
              latestRanked
                .releaseAt
            )
        )
      : [],
  ]);
  const nextReleaseAt =
    roomExam?.releaseAt ||
    getSundayReleaseAt(now);
  const focusExam =
    currentExam ||
    rankingPending ||
    nextScheduled ||
    latestRanked;
  const focusWeekKey =
    focusExam
      ? focusExam.weekKey ||
        privateMockWeekKey(
          focusExam.releaseAt
        )
      : null;
  const weekExams =
    focusWeekKey
      ? await PrivateMockExam.find({
          weekKey:
            focusWeekKey,
          status: {
            $ne: "cancelled",
          },
        })
          .sort({
            attemptNumber: 1,
          })
          .lean()
      : [];
  const userWeekAttempts =
    focusWeekKey
      ? await PrivateMockExamAttempt.find({
          weekKey:
            focusWeekKey,
          userId,
        }).lean()
      : [];
  const attemptByExam =
    new Map(
      userWeekAttempts.map(
        (attempt) => [
          String(
            attempt.examId
          ),
          attempt,
        ]
      )
    );
  const selection =
    focusWeekKey &&
    !focusExam?.isTest &&
    userWeekAttempts.some(
      (attempt) =>
        attempt.status ===
        "submitted"
    )
      ? await getPrivateMockSelectionView({
          userId,
          weekKey:
            focusWeekKey,
          releaseAt:
            weekExams[0]
              ?.releaseAt ||
            focusExam.releaseAt,
          now,
        })
      : null;
  const weeklyStandardScores =
    weeklyRanking
      .map(
        (entry) =>
          Number(
            entry
              .standardizedPerformance
          )
      )
      .filter(Number.isFinite);
  const averageStandardScore =
    weeklyStandardScores.length
      ? weeklyStandardScores.reduce(
          (sum, score) =>
            sum + score,
          0
        ) /
        weeklyStandardScores.length
      : 0;

  return {
    eligibility,
    serverNow:
      now.toISOString(),
    nextReleaseAt:
      new Date(
        nextReleaseAt
      ).toISOString(),
    latestReleaseAt:
      latestRanked
        ? new Date(
            latestRanked.releaseAt
          ).toISOString()
        : new Date(
            nextReleaseAt.getTime() -
              WEEK_MS
          ).toISOString(),
    scheduleLabel:
      "매주 일요일 오후 3시·6시·9시, 최대 3회 응시",
    durationMinutes:
      roomExam
        ?.durationMinutes ||
      DEFAULT_DURATION_MINUTES,
    currentExam:
      roomExam
        ? {
            id:
              String(
                roomExam._id
              ),
            title:
              roomExam.title,
            formCode:
              roomExam.formCode,
            attemptNumber:
              roomExam.attemptNumber,
            isTest:
              Boolean(
                roomExam.isTest
              ),
            questionCount:
              roomExam.questionCount,
            releaseAt:
              roomExam.releaseAt,
            closeAt:
              roomExam.closeAt,
            href:
              `/private-mock-exams/${roomExam._id}`,
            status:
              roomExam.status,
            lobbyOpensAt,
            canEnterRoom:
              Boolean(
                currentExam
              ) ||
              (
                lobbyOpensAt &&
                now >=
                  lobbyOpensAt
              ),
            canStart:
              now >=
                new Date(
                  roomExam.releaseAt
                ) &&
              now <
                new Date(
                  roomExam.closeAt
                ),
            attemptStatus:
              currentAttempt?.status ||
              "new",
            answeredCount:
              currentAttempt?.answeredCount ||
              0,
            score:
              currentAttempt?.score ??
              null,
          }
        : null,
    weeklyExams:
      weekExams.map((exam) => {
        const attempt =
          attemptByExam.get(
            String(exam._id)
          );
        return {
          id:
            String(exam._id),
          title:
            exam.title,
          formCode:
            exam.formCode,
          attemptNumber:
            exam.attemptNumber,
          isTest:
            Boolean(
              exam.isTest
            ),
          releaseAt:
            exam.releaseAt,
          closeAt:
            exam.closeAt,
          status:
            exam.status,
          href:
            `/private-mock-exams/${exam._id}`,
          attemptStatus:
            attempt?.status ||
            "new",
          standardizedPerformance:
            attempt?.status ===
              "submitted" &&
            attempt
              .standardMetrics
              ?.calculatedAt
              ? Math.round(
                  Number(
                    attempt
                      .standardMetrics
                      ?.actualPerformance ||
                      0
                  ) * 1000
                ) / 10
              : null,
        };
      }),
    selection,
    rankingTitle:
      latestRanked
        ? `${getKoreanWeekTitle(latestRanked.releaseAt)} 대표 성적`
        :
      "이번 주 랭킹",
    rankingFinalized:
      Boolean(latestRanked),
    rankingPending:
      rankingPending
        ? {
            title:
              rankingPending.title,
            status:
              rankingPending.status,
            publishesAt:
              rankingPending
                .rankingPublishesAt,
          }
        : null,
    rankingSummary:
      weeklyRanking.length
        ? {
            participantCount:
              weeklyRanking.length,
            averageScore:
              Math.round(
                averageStandardScore *
                  10
              ) / 10,
          }
        : null,
    weeklyRanking,
    rankingRules: [
      "A·B·C형 가운데 학생이 선택한 표준화 성적을 최종 종합 랭킹에 반영합니다.",
      "선택을 미루고 3회차 종료까지 확정하지 않으면 완료한 시험 중 최고 표준화 성적을 자동 선택합니다.",
      "장기 GP는 최고 성적 중심에 약한 안정성 보정을 적용합니다. 세 시험 모두 미응시하면 연속 1·2주는 GP가 -5, 3주째부터 GP가 -10 적용됩니다.",
    ],
  };
}

async function getPrivateMockAttemptData({
  userId,
  examId,
  now = new Date(),
}) {
  await assertPrivateMockEligibility(
    userId
  );

  if (
    !mongoose.isValidObjectId(
      examId
    )
  ) {
    throw statusError(
      404,
      "Matths 주간 공식 모의고사 회차를 찾을 수 없습니다."
    );
  }

  await processPrivateMockSchedule(
    now
  );
  const exam =
    await PrivateMockExam.findOne({
      _id: examId,
      status: {
        $ne:
          "cancelled",
      },
    })
      .select(
        "+answerKey +points +explanations"
      )
      .lean();

  if (!exam) {
    throw statusError(
      404,
      "현재 응시할 수 없는 회차입니다."
    );
  }

  const lobbyOpensAt =
    new Date(
      new Date(
        exam.releaseAt
      ).getTime() -
        PRIVATE_MOCK_LOBBY_MS
    );

  if (
    now <
    lobbyOpensAt
  ) {
    throw statusError(
      404,
      "시험장은 공개 10분 전부터 입장할 수 있습니다."
    );
  }

  const attempt =
    await PrivateMockExamAttempt.findOne({
      examId: exam._id,
      userId,
    });

  if (!attempt) {
    if (
      now >=
      new Date(
        exam.closeAt
      )
    ) {
      throw statusError(
        410,
        "응시하지 않은 회차는 종료 후 입장할 수 없습니다."
      );
    }

    const hasFormulaResource =
      Boolean(
        await PrivateMockResource.exists({
          resourceType:
            "formula-pdf",
          isActive: true,
        })
      );

    return {
      submitted: false,
      notStarted: true,
      serverNow:
        now.toISOString(),
      releaseAt:
        new Date(
          exam.releaseAt
        ).toISOString(),
      canStart:
        now >=
        new Date(
          exam.releaseAt
        ),
      lobbyTools: {
        quickPracticeHref:
          "/quick-practice",
        formulaHref:
          hasFormulaResource
            ? "/private-mock-exams/resources/formula/file"
            : null,
      },
      exam: {
        id:
          String(exam._id),
        title: exam.title,
        weekKey:
          exam.weekKey,
        formCode:
          exam.formCode,
        attemptNumber:
          exam.attemptNumber,
        isTest:
          Boolean(
            exam.isTest
          ),
        questionCount:
          exam.questionCount,
        durationMinutes:
          exam.durationMinutes,
        fileHref:
          `/private-mock-exams/${exam._id}/file`,
      },
    };
  }

  if (
    attempt.status ===
    "submitted"
  ) {
    const weekKey =
      attempt.weekKey ||
      exam.weekKey ||
      privateMockWeekKey(
        exam.releaseAt
      );
    const scoreReady =
      now >=
        new Date(
          exam.closeAt
        ) &&
      Boolean(
        attempt
          .standardMetrics
          ?.calculatedAt
      );
    const reviewAvailable =
      exam.isTest
        ? now >=
          new Date(
            exam.closeAt
          )
        : now >=
          new Date(
            exam.reviewPublishesAt ||
              exam.archiveAt
          );
    const review =
      reviewAvailable
        ? Array.from(
            {
              length:
                exam.questionCount,
            },
            (_, index) => ({
              number:
                index + 1,
              mode:
                exam
                  .questionModes?.[
                  index
                ] ||
                standardQuestionMode(
                  index + 1
                ),
              submittedAnswer:
                attempt.answers?.[
                  index
                ] || "",
              correctAnswer:
                exam.answerKey?.[
                  index
                ] || "",
              isCorrect:
                Boolean(
                  attempt
                    .correctByQuestion?.[
                    index
                  ]
                ),
              points:
                Number(
                  exam.points?.[
                    index
                  ] || 0
                ),
              explanation:
                exam
                  .explanations?.[
                  index
                ] || null,
            })
          )
        : [];
    return {
      submitted: true,
      integrityReview:
        attempt
          .integrityStatus ===
          "PENDING_INTEGRITY_REVIEW" &&
        attempt
          .integrityCaseId
          ? {
              status:
                "PENDING_INTEGRITY_REVIEW",
              href:
                `/integrity/cases/${attempt.integrityCaseId}`,
            }
          : null,
      pendingAggregation:
        !scoreReady,
      resultsAvailableAt:
        new Date(
          exam.closeAt
        ).toISOString(),
      serverNow:
        now.toISOString(),
      reviewAvailable,
      reviewPublishesAt:
        new Date(
          exam.reviewPublishesAt ||
            exam.archiveAt
        ).toISOString(),
      review,
      exam: {
        id: String(exam._id),
        title: exam.title,
        formCode:
          exam.formCode,
        attemptNumber:
          exam.attemptNumber,
        isTest:
          Boolean(
            exam.isTest
          ),
      },
      result: {
        standardizedPerformance:
          scoreReady
            ? Math.round(
                Number(
                  attempt
                    .standardMetrics
                    ?.actualPerformance ||
                    0
                ) * 1000
              ) / 10
            : null,
        totalPercentile:
          scoreReady
            ? Math.round(
                Number(
                  attempt
                    .standardMetrics
                    ?.totalPercentile ||
                    0
                ) * 1000
              ) / 10
            : null,
        rawScore:
          reviewAvailable
            ? attempt.score
            : null,
        correctCount:
          reviewAvailable
            ? attempt.correctCount
            : null,
        questionCount:
          exam.questionCount,
        elapsedLabel:
          formatElapsed(
            attempt.elapsedMs
          ),
      },
      selection:
        exam.isTest ||
        !scoreReady
          ? null
          : await getPrivateMockSelectionView({
              userId,
              weekKey,
              releaseAt:
                exam.releaseAt,
              now,
            }),
    };
  }

  const personalDeadline =
    new Date(
      attempt.startedAt.getTime() +
        exam.durationMinutes *
          60 *
          1000
    );
  const deadline =
    new Date(
      Math.min(
        personalDeadline.getTime(),
        new Date(
          exam.closeAt
        ).getTime()
      )
    );

  if (
    deadline.getTime() <=
    now.getTime()
  ) {
    attempt.status =
      "expired";
    attempt.elapsedMs =
      exam.durationMinutes *
      60 *
      1000;
    await attempt.save();
    throw statusError(
      410,
      "제한 시간이 지나 이번 회차 응시가 종료되었습니다."
    );
  }

  return {
    submitted: false,
    serverNow:
      now.toISOString(),
    deadline:
      deadline.toISOString(),
    exam: {
      id: String(exam._id),
      title: exam.title,
      weekKey:
        exam.weekKey,
      formCode:
        exam.formCode,
      attemptNumber:
        exam.attemptNumber,
      isTest:
        Boolean(
          exam.isTest
        ),
      questionCount:
        exam.questionCount,
      questionModes:
        Array.from(
          {
            length:
              exam.questionCount,
          },
          (_, index) =>
            exam.questionModes?.[
              index
            ] ||
            "short-answer"
        ),
      durationMinutes:
        exam.durationMinutes,
      fileHref:
        `/private-mock-exams/${exam._id}/file`,
    },
    attempt: {
      id:
        String(
          attempt._id
        ),
      answers:
        Array.from(
          {
            length:
              exam.questionCount,
          },
          (
            _,
            index
          ) =>
            attempt.answers?.[
              index
            ] || ""
        ),
      answeredCount:
        attempt.answeredCount,
    },
  };
}

async function getPrivateMockExamFile({
  userId,
  examId,
  now = new Date(),
}) {
  await assertPrivateMockEligibility(
    userId
  );

  if (
    !userId ||
    !mongoose.isValidObjectId(
      examId
    )
  ) {
    throw statusError(
      404,
      "문제지를 찾을 수 없습니다."
    );
  }

  await processPrivateMockSchedule(
    now
  );

  const exam =
    await PrivateMockExam.findOne({
      _id: examId,
      status: {
        $in: [
          "open",
          "archived",
          "finalized",
        ],
      },
    }).lean();

  if (!exam) {
    throw statusError(
      404,
      "문제지를 찾을 수 없습니다."
    );
  }

  if (
    exam.status === "open" &&
    (
      now <
        new Date(
          exam.releaseAt
        ) ||
      now >=
        new Date(
          exam.closeAt
        )
    )
  ) {
    throw statusError(
      403,
      "문제지는 시험 시작 시각부터 열 수 있습니다."
    );
  }

  const attempt =
    exam.status === "open"
      ? await PrivateMockExamAttempt.findOne({
          examId: exam._id,
          userId,
          status: {
            $in: [
              "in_progress",
              "submitted",
            ],
          },
        })
          .select("_id")
          .lean()
      : null;

  if (
    exam.status === "open" &&
    !attempt
  ) {
    throw statusError(
      403,
      "시험 시작 버튼을 눌러 응시를 시작해주세요."
    );
  }

  if (
    attempt &&
    !await PrivateMockExamEvent.exists({
      attemptId:
        attempt._id,
      eventType:
        "PDF_ACCESSED",
    })
  ) {
    await PrivateMockExamEvent.create({
      examId: exam._id,
      attemptId:
        attempt._id,
      userId,
      eventType:
        "PDF_ACCESSED",
      serverAt: now,
    });
  }

  const item =
    await ArchiveItem.findById(
      exam.archiveItemId
    ).lean();

  if (!item) {
    throw statusError(
      404,
      "문제지 파일을 찾을 수 없습니다."
    );
  }

  const cloudUrl = await signedStoredAssetUrl(item, {
    download: false,
    originalName: item.originalName,
  });
  const filePath = ["CLOUDINARY", "R2"].includes(item.storageProvider)
    ? null
    : path.join(ARCHIVE_STORAGE_DIR, path.basename(item.storedName));

  if (!cloudUrl && (!filePath || !fs.existsSync(filePath))) {
    throw statusError(
      404,
      "문제지 파일을 찾을 수 없습니다."
    );
  }

  return {
    path: filePath,
    cloudUrl,
    name:
      repairUploadFilename(
        item.originalName
      ),
    mimeType:
      item.mimeType,
    sourceRecord: item,
    sourceId: String(item._id),
    examId: String(exam._id),
  };
}

async function getAdminPrivateMockPdfFile({
  examId,
  fileType,
}) {
  if (
    !mongoose.isValidObjectId(
      examId
    )
  ) {
    throw statusError(
      404,
      "Matths 주간 공식 모의고사 PDF를 찾을 수 없습니다."
    );
  }

  if (
    ![
      "problem",
      "answer-sheet",
    ].includes(fileType)
  ) {
    throw statusError(
      404,
      "Matths 주간 공식 모의고사 PDF 종류를 찾을 수 없습니다."
    );
  }

  const exam =
    await PrivateMockExam.findById(
      examId
    )
      .select(
        "archiveItemId answerSheetArchiveItemId"
      )
      .lean();
  const itemId =
    fileType ===
    "answer-sheet"
      ? exam
          ?.answerSheetArchiveItemId
      : exam
          ?.archiveItemId;

  if (!itemId) {
    throw statusError(
      404,
      fileType ===
        "answer-sheet"
        ? "확인용 답지 PDF가 등록되지 않았습니다."
        : "문제지 PDF를 찾을 수 없습니다."
    );
  }

  const item =
    await ArchiveItem.findById(
      itemId
    ).lean();

  if (!item) {
    throw statusError(
      404,
      "Matths 주간 공식 모의고사 PDF를 찾을 수 없습니다."
    );
  }

  const cloudUrl = await signedStoredAssetUrl(item, {
    download: false,
    originalName: item.originalName,
  });
  const filePath = ["CLOUDINARY", "R2"].includes(item.storageProvider)
    ? null
    : path.join(ARCHIVE_STORAGE_DIR, path.basename(item.storedName));

  if (!cloudUrl && (!filePath || !fs.existsSync(filePath))) {
    throw statusError(
      404,
      "Matths 주간 공식 모의고사 PDF 파일을 찾을 수 없습니다."
    );
  }

  return {
    path: filePath,
    cloudUrl,
    name:
      repairUploadFilename(
        item.originalName
      ),
    mimeType:
      item.mimeType ||
      "application/pdf",
  };
}

async function startPrivateMockAttempt({
  userId,
  examId,
  now = new Date(),
}) {
  await assertPrivateMockEligibility(
    userId
  );
  await processPrivateMockSchedule(
    now
  );

  const exam =
    await PrivateMockExam.findOne({
      _id: examId,
      status: "open",
      releaseAt: {
        $lte: now,
      },
      closeAt: {
        $gt: now,
      },
    }).lean();

  if (!exam) {
    throw statusError(
      409,
      "현재 시작할 수 없는 회차입니다."
    );
  }

  const attempt =
    await PrivateMockExamAttempt.findOneAndUpdate(
      {
        examId: exam._id,
        userId,
      },
      {
        $setOnInsert: {
          weekKey:
            exam.weekKey ||
            privateMockWeekKey(
              exam.releaseAt
            ),
          attemptNumber:
            exam.attemptNumber,
          formCode:
            exam.formCode,
          answers:
            Array(
              exam.questionCount
            ).fill(""),
          answeredCount: 0,
          status:
            "in_progress",
          startedAt: now,
        },
      },
      {
        upsert: true,
        returnDocument:
          "after",
        setDefaultsOnInsert:
          true,
      }
    );

  if (
    attempt.status !==
    "in_progress"
  ) {
    throw statusError(
      409,
      "이미 제출하거나 종료된 회차입니다."
    );
  }

  await PrivateMockExamEvent.create({
    examId: exam._id,
    attemptId:
      attempt._id,
    userId,
    eventType:
      "EXAM_STARTED",
    serverAt: now,
  });

  return {
    started: true,
    attemptId:
      String(attempt._id),
  };
}

function normalizeDraftAnswers(
  answers,
  questionCount
) {
  const source =
    Array.isArray(answers)
      ? answers
      : [];

  return Array.from(
    {
      length:
        questionCount,
    },
    (_, index) =>
      cleanSingleLine(
        source[index],
        80
      )
  );
}

function normalizeTelemetryEvents(
  events
) {
  return (
    Array.isArray(events)
      ? events
      : []
  )
    .slice(-200)
    .map((event) => {
      const eventType =
        cleanSingleLine(
          event?.eventType ||
            event?.type,
          60
        ).toUpperCase();
      const questionNumber =
        Number(
          event?.questionNumber
        );
      const clientAt =
        event?.clientAt
          ? new Date(
              event.clientAt
            )
          : null;

      if (!eventType) {
        return null;
      }

      return {
        eventType,
        questionNumber:
          Number.isInteger(
            questionNumber
          ) &&
          questionNumber >= 1 &&
          questionNumber <= 60
            ? questionNumber
            : null,
        clientAt:
          clientAt &&
          !Number.isNaN(
            clientAt.getTime()
          )
            ? clientAt
            : null,
        metadata: {
          visibility:
            cleanSingleLine(
              event?.visibility,
              20
            ),
          answerLength:
            Math.max(
              0,
              Math.min(
                80,
                Number(
                  event?.answerLength
                ) || 0
              )
            ),
        },
      };
    })
    .filter(Boolean);
}

async function recordPrivateMockEvents({
  exam,
  attempt,
  userId,
  events,
  now,
}) {
  const normalized =
    normalizeTelemetryEvents(
      events
    );

  if (!normalized.length) {
    return 0;
  }

  await PrivateMockExamEvent.insertMany(
    normalized.map(
      (event) => ({
        examId:
          exam._id,
        attemptId:
          attempt._id,
        userId,
        ...event,
        serverAt: now,
      })
    ),
    {
      ordered: false,
    }
  );

  return normalized.length;
}

function getIntegrityEvidenceDeadline(
  {
    releaseAt,
    requestedAt =
      new Date(),
    source = "automatic",
  }
) {
  const baseDate =
    source ===
      "automatic"
      ? new Date(
          releaseAt
        )
      : new Date(
          requestedAt
        );
  const seoulClock =
    new Date(
      baseDate.getTime() +
        SEOUL_OFFSET_MS
    );

  return new Date(
    Date.UTC(
      seoulClock.getUTCFullYear(),
      seoulClock.getUTCMonth(),
      seoulClock.getUTCDate() +
        3,
      14,
      59,
      59,
      999
    )
  );
}

async function detectIntegrityEvidenceMimeType(
  filePath
) {
  const handle =
    await fs.promises.open(
      filePath,
      "r"
    );
  const header =
    Buffer.alloc(32);

  try {
    await handle.read(
      header,
      0,
      header.length,
      0
    );
  } finally {
    await handle.close();
  }

  if (
    header
      .subarray(0, 5)
      .toString("ascii") ===
      "%PDF-"
  ) {
    return "application/pdf";
  }
  if (
    header
      .subarray(0, 3)
      .equals(
        Buffer.from([
          0xff,
          0xd8,
          0xff,
        ])
      )
  ) {
    return "image/jpeg";
  }
  if (
    header
      .subarray(0, 8)
      .equals(
        Buffer.from([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a,
        ])
      )
  ) {
    return "image/png";
  }
  if (
    header
      .subarray(0, 4)
      .toString("ascii") ===
      "RIFF" &&
    header
      .subarray(8, 12)
      .toString("ascii") ===
      "WEBP"
  ) {
    return "image/webp";
  }
  if (
    header
      .subarray(4, 8)
      .toString("ascii") ===
      "ftyp" &&
    [
      "heic",
      "heix",
      "hevc",
      "hevx",
      "mif1",
      "msf1",
    ].includes(
      header
        .subarray(8, 12)
        .toString("ascii")
    )
  ) {
    return "image/heic";
  }

  return null;
}

function normalizeIntegrityQuestionNumbers(
  value,
  fallback = []
) {
  const source =
    Array.isArray(value)
      ? value
      : String(value || "")
          .split(
            /[\s,]+/
          );
  const normalized = [
    ...new Set(
      source
        .map(Number)
        .filter(
          (number) =>
            Number.isInteger(
              number
            ) &&
            number >= 1 &&
            number <= 30
        )
    ),
  ].sort(
    (left, right) =>
      left - right
  );

  if (normalized.length) {
    return normalized;
  }

  return [
    ...new Set(
      (
        Array.isArray(
          fallback
        )
          ? fallback
          : []
      )
        .map(Number)
        .filter(
          (number) =>
            Number.isInteger(
              number
            ) &&
            number >= 1 &&
            number <= 30
        )
    ),
  ].sort(
    (left, right) =>
      left - right
  );
}

async function createPrivateMockIntegrityRequest({
  exam,
  attempt,
  requestedBy = null,
  requestedQuestionNumbers,
  instructions,
  riskScore = 0,
  suspicionSignals = [],
  source = "automatic",
  now = new Date(),
}) {
  const existing =
    await PrivateMockIntegrityCase.findOne({
      attemptId:
        attempt._id,
    });

  if (existing) {
    return {
      integrityCase:
        existing,
      created: false,
    };
  }

  const cleanInstructions =
    cleanMultiline(
      instructions,
      1000
    ) ||
    "지정 문항의 전체 풀이과정을 사진 또는 PDF로 제출해주세요.";
  const questionNumbers =
    normalizeIntegrityQuestionNumbers(
      requestedQuestionNumbers,
      [28, 30]
    );
  let integrityCase;

  try {
    integrityCase =
      await PrivateMockIntegrityCase.create({
        userId:
          attempt.userId,
        examId:
          exam._id,
        attemptId:
          attempt._id,
        weekKey:
          attempt.weekKey ||
          exam.weekKey,
        riskScore:
          Math.max(
            0,
            Number(
              riskScore
            ) || 0
          ),
        suspicionSignals,
        requestedQuestionNumbers:
          questionNumbers,
        evidenceRequest: {
          requestedAt: now,
          requestedBy:
            requestedBy?._id ||
            requestedBy ||
            null,
          deadlineAt:
            getIntegrityEvidenceDeadline(
              {
                releaseAt:
                  exam.releaseAt,
                requestedAt:
                  now,
                source,
              }
            ),
          instructions:
            cleanInstructions,
        },
      });
  } catch (error) {
    if (error.code === 11000) {
      return {
        integrityCase:
          await PrivateMockIntegrityCase.findOne({
            attemptId:
              attempt._id,
          }),
        created: false,
      };
    }
    throw error;
  }

  await Promise.all([
    PrivateMockExamAttempt.updateOne(
      {
        _id: attempt._id,
      },
      {
        $set: {
          integrityStatus:
            "PENDING_INTEGRITY_REVIEW",
          integrityCaseId:
            integrityCase._id,
          usedForWeeklyRanking:
            false,
          usedForMmrStability:
            false,
        },
      }
    ),
    PrivateMockExamEvent.create({
      examId:
        exam._id,
      attemptId:
        attempt._id,
      userId:
        attempt.userId,
      eventType:
        "INTEGRITY_EVIDENCE_REQUESTED",
      serverAt: now,
      metadata: {
        source,
        requestedQuestionNumbers:
          questionNumbers,
      },
    }),
  ]);
  const user =
    await User.findById(
      attempt.userId
    ).lean();

  if (user) {
    const deadlineLabel =
      new Intl.DateTimeFormat(
        "ko-KR",
        {
          timeZone:
            "Asia/Seoul",
          dateStyle: "long",
          timeStyle: "short",
        }
    ).format(
        integrityCase
          .evidenceRequest
          .deadlineAt
      );
    const notice =
      evidenceRequestEmail({
        questionNumbers,
        deadlineLabel,
        instructions:
          cleanInstructions,
      });
    const delivery =
      await deliverModerationNotice({
        user,
        title:
          notice.title,
        message:
          notice.inboxMessage,
        kind: "integrity",
        href:
          `/integrity/cases/${integrityCase._id}`,
        createdBy:
          requestedBy?._id ||
          requestedBy ||
          null,
        emailSubject:
          notice.emailSubject,
        emailMessage:
          notice.emailMessage,
      });
    integrityCase.notificationId =
      delivery.notification._id;
    await integrityCase.save();
  }

  return {
    integrityCase,
    created: true,
  };
}

async function evaluatePrivateMockIntegrity({
  exam,
  attempt,
  now,
}) {
  if (
    exam.isTest ||
    !attempt
      .usedForIntegrityAnalysis
  ) {
    return null;
  }

  const [
    events,
    previousAttempts,
  ] = await Promise.all([
    PrivateMockExamEvent.find({
      attemptId:
        attempt._id,
    })
      .sort({
        serverAt: 1,
      })
      .lean(),
    PrivateMockExamAttempt.find({
      userId:
        attempt.userId,
      _id: {
        $ne: attempt._id,
      },
      status: "submitted",
    })
      .sort({
        submittedAt: -1,
      })
      .limit(5)
      .select("score")
      .lean(),
  ]);
  const signals = [];
  const hiddenCount =
    events.filter(
      (event) =>
        [
          "VISIBILITY_HIDDEN",
          "WINDOW_BLUR",
        ].includes(
          event.eventType
        )
    ).length;

  if (hiddenCount >= 3) {
    signals.push({
      code:
        "REPEATED_WINDOW_EXIT",
      score: 2,
      metadata: {
        count:
          hiddenCount,
      },
    });
  }

  const finalMinuteAt =
    new Date(
      now.getTime() -
        MINUTE_MS
    );
  const finalMinuteAnswers =
    events.filter(
      (event) =>
        event.eventType ===
          "ANSWER_CHANGED" &&
        event.serverAt >=
          finalMinuteAt
    ).length;

  if (
    finalMinuteAnswers >= 8
  ) {
    signals.push({
      code:
        "BULK_ANSWERS_BEFORE_SUBMIT",
      score: 2,
      metadata: {
        count:
          finalMinuteAnswers,
      },
    });
  }

  const answeredEvents =
    events.filter(
      (event) =>
        event.eventType ===
        "ANSWER_CHANGED"
    ).length;

  if (
    attempt.answeredCount >=
      10 &&
    answeredEvents <
      Math.ceil(
        attempt.answeredCount /
          3
      )
  ) {
    signals.push({
      code:
        "LOW_INTERACTION_ACTIVITY",
      score: 1,
      metadata: {
        answeredCount:
          attempt.answeredCount,
        eventCount:
          answeredEvents,
      },
    });
  }

  const killerCorrect =
    [27, 29].filter(
      (index) =>
        attempt
          .correctByQuestion?.[
          index
        ]
    ).length;

  if (
    killerCorrect >= 1 &&
    attempt.elapsedMs <
      45 * MINUTE_MS
  ) {
    signals.push({
      code:
        "ABNORMALLY_FAST_HARD_CORRECT",
      score: 2,
      metadata: {
        killerCorrect,
        elapsedMs:
          attempt.elapsedMs,
      },
    });
  }

  if (
    attempt.score >= 85 &&
    attempt.elapsedMs <
      35 * MINUTE_MS
  ) {
    signals.push({
      code:
        "FAST_HIGH_SCORE",
      score: 2,
      metadata: {
        score:
          attempt.score,
        elapsedMs:
          attempt.elapsedMs,
      },
    });
  }

  if (
    previousAttempts.length >=
      2
  ) {
    const previousAverage =
      previousAttempts.reduce(
        (sum, previous) =>
          sum +
          Number(
            previous.score || 0
          ),
        0
      ) /
      previousAttempts.length;

    if (
      attempt.score -
        previousAverage >=
      30
    ) {
      signals.push({
        code:
          "EXTREME_SCORE_JUMP",
        score: 2,
        metadata: {
          score:
            attempt.score,
          previousAverage:
            Math.round(
              previousAverage *
                10
            ) / 10,
        },
      });
    }
  }

  const riskScore =
    signals.reduce(
      (sum, signal) =>
        sum +
        Number(
          signal.score || 0
        ),
      0
    );
  await PrivateMockExamAttempt.updateOne(
    {
      _id: attempt._id,
    },
    {
      $set: {
        integritySummary: {
          riskScore,
          signalCodes:
            signals.map(
              (signal) =>
                signal.code
            ),
          analyzedAt: now,
        },
      },
    }
  );

  if (
    riskScore < 4 ||
    signals.length < 2
  ) {
    return null;
  }

  const requestedQuestionNumbers =
    [20, 21, 28, 30].filter(
      (questionNumber) =>
        attempt
          .correctByQuestion?.[
          questionNumber - 1
        ]
    );
  const admin =
    await User.findOne({
      role: "admin",
      isActive: true,
    })
      .sort({
        createdAt: 1,
      })
      .lean();
  const request =
    await createPrivateMockIntegrityRequest({
      exam,
      attempt,
      requestedBy:
        admin,
      requestedQuestionNumbers:
        requestedQuestionNumbers
          .length
          ? requestedQuestionNumbers
          : [28, 30],
      instructions:
        "지정 문항의 전체 풀이과정을 사진 또는 PDF로 제출해주세요.",
      riskScore,
      suspicionSignals:
        signals,
      source:
        "automatic",
      now,
    });

  return request.integrityCase;
}

async function requestPrivateMockIntegrityEvidenceByAdmin({
  adminUserId,
  examId,
  attemptId,
  requestedQuestionNumbers,
  instructions,
  now = new Date(),
}) {
  if (
    !mongoose.isValidObjectId(
      adminUserId
    ) ||
    !mongoose.isValidObjectId(
      examId
    ) ||
    !mongoose.isValidObjectId(
      attemptId
    )
  ) {
    throw statusError(
      404,
      "소명 요청 대상 응시 기록을 찾을 수 없습니다."
    );
  }

  const [
    admin,
    exam,
    attempt,
  ] = await Promise.all([
    User.findOne({
      _id: adminUserId,
      role: "admin",
      isActive: true,
    }).lean(),
    PrivateMockExam.findById(
      examId
    ).lean(),
    PrivateMockExamAttempt.findOne({
      _id: attemptId,
      examId,
      status: "submitted",
    }).lean(),
  ]);

  if (
    !admin ||
    !exam ||
    !attempt
  ) {
    throw statusError(
      404,
      "소명 요청 대상 응시 기록을 찾을 수 없습니다."
    );
  }

  if (
    await PrivateMockIntegrityCase.exists({
      attemptId:
        attempt._id,
    })
  ) {
    throw statusError(
      409,
      "이미 이 응시 기록에 소명 자료를 요청했습니다."
    );
  }

  const incorrectNumbers =
    Array.from(
      {
        length:
          exam.questionCount,
      },
      (_, index) =>
        attempt
          .correctByQuestion?.[
          index
        ]
          ? null
          : index + 1
    ).filter(Boolean);
  const questionNumbers =
    normalizeIntegrityQuestionNumbers(
      requestedQuestionNumbers,
      incorrectNumbers.length
        ? incorrectNumbers
        : [20, 21, 28, 30]
    );
  const result =
    await createPrivateMockIntegrityRequest({
      exam,
      attempt,
      requestedBy:
        admin,
      requestedQuestionNumbers:
        questionNumbers,
      instructions:
        instructions ||
        "관리자가 지정한 문항의 전체 풀이과정을 사진 또는 PDF로 제출해주세요.",
      riskScore: 0,
      suspicionSignals: [
        {
          code:
            "ADMIN_MANUAL_REVIEW",
          score: 0,
          metadata: {
            requestedBy:
              String(
                admin._id
              ),
          },
        },
      ],
      source:
        "admin-manual",
      now,
    });

  return {
    caseId:
      String(
        result
          .integrityCase
          ._id
      ),
    requestedQuestionNumbers:
      questionNumbers,
  };
}

async function getWritableAttempt({
  userId,
  examId,
  now,
  includeAnswerKey = false,
}) {
  await assertPrivateMockEligibility(
    userId
  );

  const examQuery =
    PrivateMockExam.findOne({
      _id: examId,
      status: "open",
      releaseAt: {
        $lte: now,
      },
      closeAt: {
        $gt: now,
      },
    });

  if (includeAnswerKey) {
    examQuery.select(
      "+answerKey +points"
    );
  }

  const [
    exam,
    attempt,
  ] = await Promise.all([
    examQuery,
    PrivateMockExamAttempt.findOne({
      examId,
      userId,
      status:
        "in_progress",
    }),
  ]);

  if (!exam || !attempt) {
    throw statusError(
      409,
      "저장할 수 있는 응시 기록이 없습니다."
    );
  }

  const deadline =
    Math.min(
      new Date(
        exam.closeAt
      ).getTime(),
      attempt.startedAt.getTime() +
        exam.durationMinutes *
          60 *
          1000
    );

  if (
    now.getTime() >= deadline
  ) {
    attempt.status =
      "expired";
    attempt.elapsedMs =
      exam.durationMinutes *
      60 *
      1000;
    await attempt.save();
    throw statusError(
      410,
      "제한 시간이 지나 응시가 종료되었습니다."
    );
  }

  return {
    exam,
    attempt,
  };
}

async function savePrivateMockDraft({
  userId,
  examId,
  answers,
  telemetryEvents,
  now = new Date(),
}) {
  const {
    exam,
    attempt,
  } = await getWritableAttempt({
    userId,
    examId,
    now,
  });
  const normalized =
    normalizeDraftAnswers(
      answers,
      exam.questionCount
    );

  attempt.answers =
    normalized;
  attempt.answeredCount =
    normalized.filter(Boolean)
      .length;
  attempt.lastSavedAt =
    now;
  await Promise.all([
    attempt.save(),
    recordPrivateMockEvents({
      exam,
      attempt,
      userId,
      events:
        telemetryEvents,
      now,
    }),
  ]);

  return {
    answeredCount:
      attempt.answeredCount,
    savedAt:
      now.toISOString(),
  };
}

async function submitPrivateMockAttempt({
  userId,
  examId,
  answers,
  telemetryEvents,
  now = new Date(),
}) {
  const {
    exam,
    attempt,
  } = await getWritableAttempt({
    userId,
    examId,
    now,
    includeAnswerKey:
      true,
  });
  const grading =
    gradePrivateMockAnswers({
      answers,
      answerKey:
        exam.answerKey,
      points:
        exam.points,
      questionCount:
        exam.questionCount,
    });

  attempt.answers =
    grading.answers;
  attempt.answeredCount =
    grading.answeredCount;
  attempt.score =
    grading.score;
  attempt.correctCount =
    grading.correctCount;
  attempt.correctByQuestion =
    grading.correctByQuestion;
  attempt.scoreBreakdown =
    grading.scoreBreakdown;
  attempt.elapsedMs =
    Math.max(
      0,
      now.getTime() -
        attempt.startedAt.getTime()
    );
  attempt.status =
    "submitted";
  attempt.submittedAt =
    now;
  attempt.lastSavedAt =
    now;
  await Promise.all([
    attempt.save(),
    recordPrivateMockEvents({
      exam,
      attempt,
      userId,
      events:
        [
          ...(
            Array.isArray(
              telemetryEvents
            )
              ? telemetryEvents
              : []
          ),
          {
            eventType:
              "EXAM_SUBMITTED",
            clientAt:
              now.toISOString(),
          },
        ],
      now,
    }),
  ]);
  const weekKey =
    attempt.weekKey ||
    exam.weekKey ||
    privateMockWeekKey(
      exam.releaseAt
    );
  await evaluatePrivateMockIntegrity({
    exam,
    attempt,
    now,
  });
  return {
    elapsedMs:
      attempt.elapsedMs,
    elapsedLabel:
      formatElapsed(
        attempt.elapsedMs
      ),
    standardizedPerformance:
      null,
    totalPercentile: null,
    pendingAggregation:
      true,
    resultsAvailableAt:
      new Date(
        exam.closeAt
      ).toISOString(),
    attemptNumber:
      attempt.attemptNumber,
    formCode:
      attempt.formCode,
    isTest:
      Boolean(
        exam.isTest
      ),
    weekKey,
    weeklyAttemptCount: 0,
    canSelectRepresentative:
      false,
  };
}

async function createPrivateMockFormulaResource({
  user,
  file,
  versionLabel,
}) {
  if (!isArchiveAdmin(user)) {
    throw statusError(
      403,
      "운영자만 공식 자료를 등록할 수 있습니다."
    );
  }

  if (
    !file ||
    path
      .extname(
        file.originalname || ""
      )
      .toLowerCase() !== ".pdf"
  ) {
    throw statusError(
      400,
      "공식 암기 자료는 PDF로 올려주세요."
    );
  }

  let item;

  try {
    item =
      await createArchiveItem({
        user,
        file,
        title:
          repairUploadFilename(
            file.originalname
          ),
        description:
          "Matths 주간 공식 모의고사 입장 대기실 공식 암기 자료",
        category:
          "개념 자료",
        folderId: null,
        isPublished: false,
        storagePurpose: STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK,
      });
    await PrivateMockResource.updateMany(
      {
        resourceType:
          "formula-pdf",
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      }
    );
    return PrivateMockResource.create({
      resourceType:
        "formula-pdf",
      archiveItemId:
        item.id,
      versionLabel:
        cleanSingleLine(
          versionLabel,
          80
        ),
      isActive: true,
      createdBy:
        user.id ||
        user._id,
    });
  } catch (error) {
    if (!item) {
      await discardArchiveUpload(
        file
      );
    }
    throw error;
  }
}

async function deletePrivateMockFormulaResource({
  user,
  resourceId,
}) {
  if (
    !isArchiveAdmin(user) ||
    !mongoose.isValidObjectId(
      resourceId
    )
  ) {
    throw statusError(
      404,
      "공식 자료를 찾을 수 없습니다."
    );
  }

  const resource =
    await PrivateMockResource.findById(
      resourceId
    );

  if (!resource) {
    throw statusError(
      404,
      "공식 자료를 찾을 수 없습니다."
    );
  }

  await deleteArchiveItem({
    itemId:
      resource.archiveItemId,
    user,
  });
  await resource.deleteOne();

  return {
    deleted: true,
  };
}

async function getPrivateMockFormulaFile({
  userId,
}) {
  const [
    user,
    resource,
  ] = await Promise.all([
    User.findOne({
      _id: userId,
      isActive: true,
    }).lean(),
    PrivateMockResource.findOne({
      resourceType:
        "formula-pdf",
      isActive: true,
    })
      .sort({
        createdAt: -1,
      })
      .populate(
        "archiveItemId"
      )
      .lean(),
  ]);

  if (
    !user ||
    !resource
      ?.archiveItemId
  ) {
    throw statusError(
      404,
      "현재 등록된 공식 암기 자료가 없습니다."
    );
  }

  const item =
    resource.archiveItemId;
  const filePath =
    path.join(
      ARCHIVE_STORAGE_DIR,
      path.basename(
        item.storedName
      )
    );

  if (!fs.existsSync(filePath)) {
    throw statusError(
      404,
      "공식 암기 자료 파일을 찾을 수 없습니다."
    );
  }

  return {
    path: filePath,
    name:
      repairUploadFilename(
        item.originalName
      ),
    mimeType:
      item.mimeType,
  };
}

async function getUserIntegrityCase({
  userId,
  caseId,
}) {
  if (
    !mongoose.isValidObjectId(
      caseId
    )
  ) {
    throw statusError(
      404,
      "풀이과정 제출 요청을 찾을 수 없습니다."
    );
  }

  const integrityCase =
    await PrivateMockIntegrityCase.findOne({
      _id: caseId,
      userId,
    })
      .populate(
        "examId",
        "title formCode releaseAt"
      )
      .lean();

  if (!integrityCase) {
    throw statusError(
      404,
      "풀이과정 제출 요청을 찾을 수 없습니다."
    );
  }

  return {
    ...integrityCase,
    id:
      String(
        integrityCase._id
      ),
    canSubmit:
      [
        "EVIDENCE_REQUIRED",
        "INSUFFICIENT_EVIDENCE",
      ].includes(
        integrityCase.status
      ) &&
      new Date(
        integrityCase
          .evidenceRequest
          .deadlineAt
      ) > new Date(),
  };
}

async function submitPrivateMockIntegrityEvidence({
  userId,
  caseId,
  files,
  note,
  now = new Date(),
}) {
  const integrityCase =
    await PrivateMockIntegrityCase.findOne({
      _id: caseId,
      userId,
      status: {
        $in: [
          "EVIDENCE_REQUIRED",
          "INSUFFICIENT_EVIDENCE",
        ],
      },
      "evidenceRequest.deadlineAt": {
        $gt: now,
      },
    });
  const uploadFiles =
    Array.isArray(files)
      ? files
      : [];

  if (!integrityCase) {
    throw statusError(
      409,
      "현재 제출할 수 있는 풀이과정 요청이 아닙니다."
    );
  }

  if (
    !uploadFiles.length ||
    uploadFiles.length > 10
  ) {
    throw statusError(
      400,
      "풀이과정 파일을 1개 이상 10개 이하로 올려주세요."
    );
  }

  if (
    uploadFiles.some(
      (file) =>
        Number(
          file.size
        ) >
          10 *
            1024 *
            1024
    )
  ) {
    throw statusError(
      400,
      "풀이과정은 JPG, PNG, WEBP, HEIC 또는 PDF로, 파일당 10MB 이하로 올려주세요."
    );
  }

  const detectedTypes =
    await Promise.all(
      uploadFiles.map(
        (file) =>
          detectIntegrityEvidenceMimeType(
            file.path
          )
      )
    );

  if (
    detectedTypes.some(
      (mimeType) =>
        !mimeType
    )
  ) {
    throw statusError(
      400,
      "파일 확장자가 아니라 실제 내용을 검사한 결과 지원하지 않는 파일이 포함되어 있습니다."
    );
  }

  const createdItems = [];

  try {
    for (const file of uploadFiles) {
      const asset = await storeUploadedFile(file, {
        folder: "matths/private-mock-integrity",
        purpose: STORAGE_PURPOSES.USER_PRIVATE_MOCK_INTEGRITY,
      });
      const item =
        await ArchiveItem.create({
          folderId: null,
          title:
            repairUploadFilename(
              file.originalname
            ),
          description:
            `부정행위 소명자료 · ${integrityCase._id}`,
          category: "기타",
          originalName:
            repairUploadFilename(
              file.originalname
            ),
          storedName:
            asset?.storedName || path.basename(file.filename || file.path),
          mimeType:
            detectedTypes[
              uploadFiles.indexOf(
                file
              )
            ],
          sizeBytes:
            file.size,
          uploadedBy:
            userId,
          isPublished: false,
          backupStatus: "NOT_CONFIGURED",
          ...storageFields(asset),
        });
      createdItems.push(
        item
      );
    }

    const receiptId =
      randomUUID();
    integrityCase.evidenceSubmissions.push({
      receiptId,
      files:
        createdItems.map(
          (item) => ({
            archiveItemId:
              item._id,
            originalName:
              item.originalName,
            mimeType:
              item.mimeType,
            sizeBytes:
              item.sizeBytes,
            uploadedAt: now,
          })
        ),
      note:
        cleanMultiline(
          note,
          2000
        ),
      submittedAt: now,
    });
    integrityCase.status =
      "SUBMITTED";
    integrityCase.reviewStatus =
      "unreviewed";
    await integrityCase.save();

    await createAdminTodo({
      category: "integrity",
      title:
        "Matths 주간 공식 모의고사 소명 자료 검토",
      description:
        `요청 문항 ${integrityCase.requestedQuestionNumbers.join(", ")}번 · 접수번호 ${receiptId}`,
      href:
        `/admin/private-mock-exams/${integrityCase.examId}#integrity-${integrityCase._id}`,
      targetUserId: userId,
      actorUserId: userId,
      sourceType:
        "PrivateMockIntegrityCase",
      sourceId:
        integrityCase._id,
      metadata: {
        receiptId,
      },
    });

    return {
      submitted: true,
      receiptId,
      submittedAt:
        now.toISOString(),
    };
  } catch (error) {
    await Promise.all(
      uploadFiles.map(
        (file) =>
          discardArchiveUpload(
            file
          )
      )
    );
    await ArchiveItem.deleteMany({
      _id: {
        $in:
          createdItems.map(
            (item) =>
              item._id
          ),
      },
    }).catch(() => {});
    throw error;
  }
}

async function reviewPrivateMockIntegrityCase({
  adminUserId,
  examId,
  caseId,
  reviewStatus,
  penaltyDecision,
  reason,
  now = new Date(),
}) {
  const normalizedReview =
    String(reviewStatus || "");
  const normalizedPenalty =
    String(penaltyDecision || "");
  const cleanReason =
    cleanMultiline(reason, 2000);
  if (
    ![
      "unreviewed",
      "reviewing",
      "completed",
    ].includes(normalizedReview) ||
    ![
      "pending",
      "no_penalty",
      "penalty",
    ].includes(normalizedPenalty)
  ) {
    throw statusError(
      400,
      "검토 상태와 페널티 부여 여부를 선택해주세요."
    );
  }
  if (
    normalizedPenalty ===
      "penalty" &&
    cleanReason.length < 5
  ) {
    throw statusError(
      400,
      "페널티 사유를 5자 이상 입력해주세요."
    );
  }
  if (
    normalizedReview ===
      "completed" &&
    normalizedPenalty ===
      "pending"
  ) {
    throw statusError(
      400,
      "검토 완료 전 페널티 부여 여부를 결정해주세요."
    );
  }

  const integrityCase =
    await PrivateMockIntegrityCase.findOne({
      _id: caseId,
      examId,
    });
  if (!integrityCase) {
    throw statusError(
      404,
      "소명 검토 건을 찾을 수 없습니다."
    );
  }

  integrityCase.reviewStatus =
    normalizedReview;
  integrityCase.penaltyDecision =
    normalizedPenalty;
  if (
    normalizedReview ===
    "reviewing"
  ) {
    integrityCase.status =
      "UNDER_REVIEW";
  } else if (
    normalizedReview ===
    "completed"
  ) {
    integrityCase.status =
      normalizedPenalty ===
      "penalty"
        ? "CONFIRMED_CHEATING"
        : "CLEARED";
    integrityCase.decision = {
      result:
        normalizedPenalty,
      reason: cleanReason,
      decidedAt: now,
      decidedBy:
        adminUserId,
    };
  }

  const user =
    await User.findById(
      integrityCase.userId
    );
  if (!user) {
    throw statusError(
      404,
      "소명 대상 사용자를 찾을 수 없습니다."
    );
  }

  if (
    normalizedReview ===
      "completed" &&
    normalizedPenalty ===
      "no_penalty"
  ) {
    const restrictionBelongsToCase =
      user
        .privateMockRestriction
        ?.active &&
      String(
        user
          .privateMockRestriction
          ?.sourceIntegrityCaseId ||
          ""
      ) ===
        String(
          integrityCase._id
        );
    const revokeWarning =
      Boolean(
        integrityCase
          .warningAppliedAt
      ) &&
      !integrityCase
        .warningRevokedAt;
    const revokePenalty =
      Boolean(
        integrityCase
          .penaltyAppliedAt
      ) &&
      !integrityCase
        .penaltyRevokedAt;
    const userUpdate = {};

    if (
      revokePenalty
    ) {
      integrityCase.penaltyRevokedAt =
        now;
    }

    if (
      restrictionBelongsToCase
    ) {
      userUpdate.$set = {
        "privateMockRestriction.active":
          false,
        "privateMockRestriction.remainingExamCount":
          0,
        "privateMockRestriction.remainingWeekCount":
          0,
        "privateMockRestriction.clearedAt":
          now,
      };
      user.privateMockRestriction.active =
        false;
      user.privateMockRestriction.remainingExamCount =
        0;
      user.privateMockRestriction.remainingWeekCount =
        0;
      user.privateMockRestriction.clearedAt =
        now;
    }

    if (
      revokeWarning
    ) {
      const currentWarningCount =
        Number(
          user.warningCount
        ) || 0;
      if (
        currentWarningCount > 0
      ) {
        userUpdate.$inc = {
          warningCount: -1,
        };
        user.warningCount =
          currentWarningCount -
          1;
      }
      integrityCase.warningRevokedAt =
        now;
    }

    if (
      Object.keys(
        userUpdate
      ).length
    ) {
      await User.updateOne(
        {
          _id: user._id,
        },
        userUpdate
      );
    }

    await UserNotification.updateMany(
      {
        userId:
          user._id,
        kind: "warning",
        href:
          "/account/private-mock-restriction",
        ...(integrityCase
          .penaltyAppliedAt
          ? {
              createdAt: {
                $gte:
                  integrityCase
                    .penaltyAppliedAt,
              },
            }
          : {}),
      },
      {
        $set: {
          readAt: now,
          dashboardDismissedAt:
            now,
        },
      }
    );
  }

  if (
    normalizedReview ===
      "completed" &&
    normalizedPenalty ===
      "penalty"
  ) {
    const applyRestriction =
      !integrityCase
        .penaltyAppliedAt ||
      Boolean(
        integrityCase
          .penaltyRevokedAt
      );
    const applyWarning =
      !integrityCase
        .warningAppliedAt ||
      Boolean(
        integrityCase
          .warningRevokedAt
      );
    const userUpdate = {};

    if (applyRestriction) {
      const restriction = {
        active: true,
        remainingExamCount: 3,
        remainingWeekCount: 3,
        imposedAt: now,
        reason: cleanReason,
        imposedBy:
          adminUserId,
        sourceIntegrityCaseId:
          integrityCase._id,
        servedExamIds: [],
        servedWeekKeys: [],
        clearedAt: null,
      };
      userUpdate.$set = {
        privateMockRestriction:
          restriction,
      };
      user.privateMockRestriction =
        restriction;
      integrityCase.penaltyAppliedAt =
        now;
      integrityCase.penaltyRevokedAt =
        null;
    }

    if (applyWarning) {
      userUpdate.$inc = {
        warningCount: 1,
      };
      user.warningCount =
        (Number(
          user.warningCount
        ) || 0) + 1;
      integrityCase.warningAppliedAt =
        now;
      integrityCase.warningRevokedAt =
        null;
    }

    if (
      applyRestriction ||
      applyWarning
    ) {
      await User.updateOne(
        { _id: user._id },
        userUpdate
      );
    }

    const shouldSendDecisionNotice =
      integrityCase
        .decisionNoticeResult !==
      "penalty";
    if (
      shouldSendDecisionNotice
    ) {
      const remainingWeekCount =
        Number(
          user
            .privateMockRestriction
            ?.remainingWeekCount ||
          user
            .privateMockRestriction
            ?.remainingExamCount
        ) || 3;
      const notice =
        integrityPenaltyEmail({
          reason:
            cleanReason,
          warningCount:
            user.warningCount ||
            0,
          remainingWeekCount,
        });
      await deliverModerationNotice({
        user,
        title:
          notice.title,
        message:
          notice.inboxMessage,
        href:
          "/account/private-mock-restriction",
        kind: "warning",
        createdBy:
          adminUserId,
        emailSubject:
          notice.title,
        emailMessage:
          notice.emailMessage,
      });
      integrityCase
        .decisionNoticeSentAt =
        now;
      integrityCase
        .decisionNoticeResult =
        "penalty";
    }
  }

  if (
    normalizedReview ===
      "completed" &&
    normalizedPenalty ===
      "no_penalty" &&
    integrityCase
      .decisionNoticeResult !==
      "no_penalty"
  ) {
    const notice =
      integrityClearedEmail({
        reason:
          cleanReason,
      });
    await deliverModerationNotice({
      user,
      title:
        notice.title,
      message:
        notice.inboxMessage,
      href:
        `/integrity/cases/${integrityCase._id}`,
      kind: "integrity",
      createdBy:
        adminUserId,
      emailSubject:
        notice.title,
      emailMessage:
        notice.emailMessage,
    });
    integrityCase
      .decisionNoticeSentAt =
      now;
    integrityCase
      .decisionNoticeResult =
      "no_penalty";
  }

  await integrityCase.save();
  await PrivateMockExamAttempt.updateOne(
    {
      _id:
        integrityCase.attemptId,
    },
    {
      $set: {
        integrityStatus:
          normalizedReview ===
            "completed"
            ? normalizedPenalty ===
              "penalty"
              ? "INVALIDATED"
              : "CLEAR"
            : "PENDING_INTEGRITY_REVIEW",
        usedForWeeklyRanking:
          normalizedReview ===
            "completed" &&
          normalizedPenalty ===
            "no_penalty",
        usedForMmrStability:
          normalizedReview ===
            "completed" &&
          normalizedPenalty ===
            "no_penalty",
      },
    }
  );

  if (
    normalizedReview ===
    "completed"
  ) {
    const examForRegrade =
      await PrivateMockExam.findById(
        examId
      ).select(
        "+answerKey +points +explanations"
      );
    if (
      examForRegrade &&
      new Date(
        examForRegrade.closeAt
      ) <= now
    ) {
      await regradePrivateMockExam({
        exam:
          examForRegrade,
        now,
      });
    }
  }

  await AdminActionLog.create({
    adminUserId,
    targetUserId:
      integrityCase.userId,
    action:
      normalizedPenalty ===
      "penalty"
        ? "private-mock.integrity-penalty"
        : "private-mock.integrity-review",
    detail:
      cleanReason ||
      `검토 상태 ${normalizedReview}`,
    metadata: {
      integrityCaseId:
        String(
          integrityCase._id
        ),
      examId:
        String(examId),
      reviewStatus:
        normalizedReview,
      penaltyDecision:
        normalizedPenalty,
    },
  });

  if (
    normalizedReview ===
    "completed"
  ) {
    await completeAdminTodoBySource({
      sourceType:
        "PrivateMockIntegrityCase",
      sourceId:
        integrityCase._id,
      adminUserId,
    });
  }
  return integrityCase;
}

async function getAdminPrivateMockIntegrityEvidenceFile({
  caseId,
  archiveItemId,
}) {
  if (
    !mongoose.isValidObjectId(
      caseId
    ) ||
    !mongoose.isValidObjectId(
      archiveItemId
    )
  ) {
    throw statusError(
      404,
      "소명 자료 파일을 찾을 수 없습니다."
    );
  }

  const integrityCase =
    await PrivateMockIntegrityCase.findById(
      caseId
    ).lean();
  const belongsToCase =
    integrityCase
      ?.evidenceSubmissions
      ?.some(
        (submission) =>
          submission.files?.some(
            (file) =>
              String(
                file.archiveItemId
              ) ===
              String(
                archiveItemId
              )
          )
      );

  if (!belongsToCase) {
    throw statusError(
      404,
      "소명 자료 파일을 찾을 수 없습니다."
    );
  }

  const item =
    await ArchiveItem.findById(
      archiveItemId
    ).lean();
  const allowedTypes =
    new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ]);

  if (
    !item ||
    !allowedTypes.has(
      item.mimeType
    )
  ) {
    throw statusError(
      415,
      "브라우저에서 안전하게 열람할 수 없는 소명 자료입니다."
    );
  }

  const cloudUrl = await signedStoredAssetUrl(item, {
    download: false,
    originalName: item.originalName,
  });
  const filePath = ["CLOUDINARY", "R2"].includes(item.storageProvider)
    ? null
    : path.join(ARCHIVE_STORAGE_DIR, path.basename(item.storedName));

  if (!cloudUrl && (!filePath || !fs.existsSync(filePath))) {
    throw statusError(
      404,
      "소명 자료 파일을 찾을 수 없습니다."
    );
  }
  const detectedMimeType = filePath
    ? await detectIntegrityEvidenceMimeType(filePath)
    : item.mimeType;

  if (
    !detectedMimeType ||
    detectedMimeType !==
      item.mimeType
  ) {
    throw statusError(
      415,
      "파일 내용과 저장된 형식이 일치하지 않아 안전 열람을 차단했습니다."
    );
  }

  return {
    path: filePath,
    cloudUrl,
    name:
      repairUploadFilename(
        item.originalName
      ),
    mimeType:
      detectedMimeType,
  };
}

async function resetAndRecalculatePrivateMockMmr(
  now = new Date()
) {
  const profiles =
    await RankingProfile.find({
      datasetOnly: {
        $ne: true,
      },
    });

  for (const profile of profiles) {
    const history =
      Array.isArray(
        profile.mmrHistory
      )
        ? profile.mmrHistory
        : [];
    let baseIndex = -1;
    history.forEach(
      (entry, index) => {
        if (
          [
            "placement",
            "season-reset",
          ].includes(
            entry.eventType
          )
        ) {
          baseIndex = index;
        }
      }
    );
    const retainedHistory =
      baseIndex >= 0
        ? history.slice(
            0,
            baseIndex + 1
          )
        : [];
    const baseMmr =
      baseIndex >= 0
        ? Number(
            history[baseIndex]
              .newMmr
          ) || 1000
        : 1000;
    const baseTier =
      findBaseTier(baseMmr);

    profile.mmr =
      baseMmr;
    profile.tier =
      baseTier.name;
    profile.rankPoint =
      calculateRankPoint({
        mmr: baseMmr,
        tier: baseTier,
      });
    profile.status =
      "PROVISIONAL";
    profile.weeklyExamsUntilConfirmed =
      2;
    profile.recentPerformances =
      [];
    profile.lastAdvancedPerformance =
      0;
    profile.lastRawScore =
      Number(
        profile.placementScore
      ) || 0;
    profile.reachedCurrentMmrAt =
      now;
    profile.participation = {
      weeklyExamCount: 0,
      consecutiveAbsences: 0,
      lastExamAt: null,
    };
    profile.demotionProtection = {
      active: false,
      consecutiveBelowThreshold:
        0,
      thresholdMmr: null,
    };
    profile.mmrHistory =
      retainedHistory;
    await profile.save();
  }

  await Promise.all([
    PrivateMockExamAttempt.updateMany(
      {},
      {
        $set: {
          mmrResult: {
            previousMmr: null,
            newMmr: null,
            deltaMmr: null,
            totalPercentile:
              null,
            advancedPercentile:
              null,
            consistencyScore:
              null,
            actualPerformance:
              null,
            expectedPerformance:
              null,
            kFactor: null,
            growthBonus: 0,
            tier: "",
            rankPoint: null,
          },
          isRepresentative:
            false,
          usedForWeeklyRanking:
            false,
          usedForMmrStability:
            false,
        },
      }
    ),
    PrivateMockWeeklyResult.updateMany(
      {},
      {
        $set: {
          representativeAttemptId:
            null,
          representativePerformance:
            null,
          representativeRawScore:
            null,
          representativeElapsedMs:
            null,
          mmrPerformance:
            null,
          rank: null,
          status: "open",
          lockedAt: null,
          publishedAt: null,
          mmrResult: {
            previousMmr: null,
            newMmr: null,
            deltaMmr: null,
            expectedPerformance:
              null,
            kFactor: null,
            growthBonus: 0,
            tier: "",
            rankPoint: null,
          },
        },
      }
    ),
  ]);

  const completedExams =
    await PrivateMockExam.find({
      isTest: {
        $ne: true,
      },
      status: {
        $ne: "cancelled",
      },
      aggregationCompletedAt: {
        $ne: null,
      },
    })
      .sort({
        releaseAt: 1,
      })
      .lean();
  const orderedWeeks = [
    ...new Map(
      completedExams.map(
        (exam) => [
          exam.weekKey,
          exam.releaseAt,
        ]
      )
    ).entries(),
  ]
    .sort(
      (left, right) =>
        new Date(
          left[1]
        ) -
        new Date(
          right[1]
        )
    )
    .map(
      ([weekKey]) =>
        weekKey
    );

  const newlyPublishedWeeks = [];
  for (const weekKey of
        orderedWeeks) {
    const weekExamCount =
      await PrivateMockExam.countDocuments({
        weekKey,
        isTest: {
          $ne: true,
        },
        status: {
          $ne: "cancelled",
        },
      });
    const completedCount =
      await PrivateMockExam.countDocuments({
        weekKey,
        isTest: {
          $ne: true,
        },
        status: {
          $ne: "cancelled",
        },
        aggregationCompletedAt: {
          $ne: null,
        },
      });
    if (
      weekExamCount > 0 &&
      weekExamCount ===
        completedCount
    ) {
      await processPrivateMockWeekMmr(
        weekKey,
        now
      );
      await PrivateMockWeeklyResult.updateMany(
        {
          weekKey,
          status: "locked",
        },
        {
          $set: {
            status:
              "published",
            publishedAt:
              now,
          },
        }
      );
      newlyPublishedWeeks.push(weekKey);
    }
  }

  if (newlyPublishedWeeks.length) {
    const {
      syncPublishedWeeklyMockBonuses,
    } = require("./finalRankingService");
    await syncPublishedWeeklyMockBonuses({
      weekKeys: newlyPublishedWeeks,
      now,
    });
  }

  await refreshOverallRanks();
}

async function regradePrivateMockExam({
  exam,
  now = new Date(),
}) {
  const attempts =
    await PrivateMockExamAttempt.find({
      examId: exam._id,
      status: "submitted",
    });

  for (const attempt of
    attempts) {
    const grading =
      gradePrivateMockAnswers({
        answers:
          attempt.answers,
        answerKey:
          exam.answerKey,
        points:
          exam.points,
        questionCount:
          exam.questionCount,
      });
    attempt.answeredCount =
      grading.answeredCount;
    attempt.score =
      grading.score;
    attempt.correctCount =
      grading.correctCount;
    attempt.correctByQuestion =
      grading.correctByQuestion;
    attempt.scoreBreakdown =
      grading.scoreBreakdown;
    attempt.rank = null;
    await attempt.save();
  }

  await refreshExamStandardMetrics(
    exam,
    now
  );
  const ordered =
    await PrivateMockExamAttempt.find({
      examId: exam._id,
      status: "submitted",
      ...rankableIntegrityFilter(),
    })
      .sort({
        score: -1,
        elapsedMs: 1,
        submittedAt: 1,
      });
  for (
    let index = 0;
    index < ordered.length;
    index += 1
  ) {
    ordered[index].rank =
      index + 1;
    await ordered[index].save();
  }

  exam.rankingSummary =
    buildRankingSummary(
      ordered
    );
  exam.aggregationCompletedAt =
    exam.aggregationCompletedAt ||
    now;
  await exam.save();

  if (!exam.isTest) {
    await resetAndRecalculatePrivateMockMmr(
      now
    );
  }

  return attempts.length;
}

function normalizeCorrectionInput(
  corrections
) {
  const raw =
    Array.isArray(corrections)
      ? corrections
      : [];
  const seen = new Set();
  return raw.map(
    (correction) => {
      const questionNumber =
        Number.parseInt(
          correction
            ?.questionNumber,
          10
        );
      const questionContent =
        cleanMultiline(
          correction
            ?.questionContent,
          3000
        );
      const newAnswer =
        cleanSingleLine(
          correction
            ?.newAnswer,
          80
        );
      if (
        !Number.isInteger(
          questionNumber
        ) ||
        seen.has(
          questionNumber
        ) ||
        !questionContent ||
        !newAnswer
      ) {
        throw statusError(
          400,
          "정정 문항 번호, 문제 내용, 새 정답을 빠짐없이 입력해주세요."
        );
      }
      seen.add(
        questionNumber
      );
      return {
        questionNumber,
        questionContent,
        newAnswer,
      };
    }
  );
}

async function correctPrivateMockAnswers({
  adminUserId,
  examId,
  corrections,
  reason,
  sourceObjectionId = null,
  now = new Date(),
}) {
  const cleanReason =
    cleanMultiline(
      reason,
      2000
    );
  const normalized =
    normalizeCorrectionInput(
      corrections
    );
  if (
    cleanReason.length < 5 ||
    !normalized.length
  ) {
    throw statusError(
      400,
      "정정 사유와 한 개 이상의 정정 문항을 입력해주세요."
    );
  }

  const exam =
    await PrivateMockExam.findById(
      examId
    ).select(
      "+answerKey +points +explanations"
    );
  if (!exam) {
    throw statusError(
      404,
      "정정할 Matths 주간 공식 모의고사를 찾을 수 없습니다."
    );
  }
  if (
    new Date(
      exam.closeAt
    ) > now
  ) {
    throw statusError(
      409,
      "시험이 종료된 뒤에만 정답을 정정할 수 있습니다."
    );
  }

  const finalized =
    normalized.map(
      (correction) => {
        if (
          correction.questionNumber >
          exam.questionCount
        ) {
          throw statusError(
            400,
            `${correction.questionNumber}번은 이 시험에 없는 문항입니다.`
          );
        }
        const mode =
          exam.questionModes?.[
            correction
              .questionNumber -
              1
          ] ||
          standardQuestionMode(
            correction
              .questionNumber
          );
        if (
          mode ===
            "multiple-choice" &&
          !/^[1-5]$/.test(
            normalizeAnswer(
              correction.newAnswer
            )
          )
        ) {
          throw statusError(
            400,
            `${correction.questionNumber}번 객관식 정답은 1~5 중 하나여야 합니다.`
          );
        }
        const oldAnswer =
          String(
            exam.answerKey[
              correction
                .questionNumber -
                1
            ] || ""
          );
        if (
          normalizeAnswer(
            oldAnswer
          ) ===
          normalizeAnswer(
            correction.newAnswer
          )
        ) {
          throw statusError(
            400,
            `${correction.questionNumber}번의 새 정답이 기존 정답과 같습니다.`
          );
        }
        return {
          ...correction,
          oldAnswer,
        };
      }
    );

  finalized.forEach(
    (correction) => {
      exam.answerKey[
        correction
          .questionNumber - 1
      ] =
        correction.newAnswer;
    }
  );
  exam.markModified(
    "answerKey"
  );
  await exam.save();

  const affectedAttemptCount =
    await regradePrivateMockExam({
      exam,
      now,
    });
  const correctionRecord =
    await PrivateMockAnswerCorrection.create({
      examId:
        exam._id,
      corrections:
        finalized,
      reason:
        cleanReason,
      createdBy:
        adminUserId,
      sourceObjectionId,
      affectedAttemptCount,
    });
  const participants =
    await User.find({
      _id: {
        $in:
          await PrivateMockExamAttempt.distinct(
            "userId",
            {
              examId:
                exam._id,
              status:
                "submitted",
            }
          ),
      },
    }).lean();
  const template =
    answerCorrectionEmail({
      examTitle:
        exam.title,
      corrections:
        finalized,
      reason:
        cleanReason,
    });
  let delivered = 0;
  let failed = 0;

  for (const user of
    participants) {
    await UserNotification.create({
      userId: user._id,
      title:
        "Matths 주간 공식 모의고사 정답 정정 및 재채점 안내",
      message:
        `${exam.title}의 ${finalized.map((item) => `${item.questionNumber}번`).join(", ")} 정답이 정정되어 성적·랭킹·GP를 다시 계산했습니다.`,
      href:
        `/private-mock-exams/${exam._id}`,
      kind: "system",
      createdBy:
        adminUserId,
    });
    try {
      const delivery =
        await sendAdminUserEmail({
          to: user.email,
          subject:
            template.subject,
          message:
            template.message,
        });
      if (
        delivery.delivered
      ) {
        delivered += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(
        "[private-mock-correction] 이메일 발송 실패",
        {
          userId:
            String(user._id),
          error:
            error?.message ||
            "",
        }
      );
    }
  }
  correctionRecord.notificationStats = {
    recipientCount:
      participants.length,
    emailDeliveredCount:
      delivered,
    emailFailedCount:
      failed,
  };
  await correctionRecord.save();
  await AdminActionLog.create({
    adminUserId,
    action:
      "private-mock.answer-correction",
    detail:
      cleanReason,
    metadata: {
      examId:
        String(exam._id),
      correctionId:
        String(
          correctionRecord._id
        ),
      questions:
        finalized.map(
          (item) =>
            item.questionNumber
        ),
      affectedAttemptCount,
    },
  });

  return correctionRecord;
}

async function getPrivateMockObjectionFormData({
  userId,
}) {
  const user =
    await User.findById(
      userId
    )
      .select(
        "realName name email"
      )
      .lean();
  if (!user) {
    throw statusError(
      404,
      "사용자 정보를 찾을 수 없습니다."
    );
  }
  const exams =
    await PrivateMockExam.find({
      isTest: {
        $ne: true,
      },
      archivedAt: {
        $ne: null,
      },
      status: {
        $ne: "cancelled",
      },
    })
      .sort({
        releaseAt: -1,
      })
      .populate(
        "archiveItemId",
        "title originalName isPublished"
      )
      .lean();
  return {
    user,
    exams:
      exams
        .filter(
          (exam) =>
            exam.archiveItemId
              ?.isPublished
        )
        .map(
          (exam) => ({
            id:
              String(
                exam._id
              ),
            title:
              exam
                .archiveItemId
                ?.title ||
              exam.title,
            formCode:
              exam.formCode,
            questionCount:
              exam.questionCount,
            releaseAt:
              exam.releaseAt,
          })
        ),
  };
}

async function createPrivateMockObjection({
  userId,
  examId,
  questionNumber,
  issueDetail,
}) {
  const cleanDetail =
    cleanMultiline(
      issueDetail,
      5000
    );
  const number =
    Number.parseInt(
      questionNumber,
      10
    );
  if (
    cleanDetail.length < 10 ||
    !Number.isInteger(number)
  ) {
    throw statusError(
      400,
      "문항 번호와 문제가 있다고 판단한 부분을 10자 이상 입력해주세요."
    );
  }
  const [
    user,
    exam,
  ] = await Promise.all([
    User.findById(
      userId
    ).lean(),
    PrivateMockExam.findOne({
      _id: examId,
      isTest: {
        $ne: true,
      },
      archivedAt: {
        $ne: null,
      },
      status: {
        $ne: "cancelled",
      },
    })
      .populate(
        "archiveItemId",
        "title isPublished"
      )
      .lean(),
  ]);
  if (
    !user ||
    !exam ||
    !exam.archiveItemId
      ?.isPublished ||
    number >
      exam.questionCount
  ) {
    throw statusError(
      404,
      "선택한 시험지 또는 문항을 확인할 수 없습니다."
    );
  }
  const objection =
    await PrivateMockObjection.create({
      userId:
        user._id,
      examId:
        exam._id,
      archiveItemId:
        exam.archiveItemId._id,
      examTitle:
        exam.archiveItemId
          .title ||
        exam.title,
      questionNumber:
        number,
      issueDetail:
        cleanDetail,
    });
  await createAdminTodo({
    category: "other",
    title:
      `Matths 주간 공식 모의고사 ${number}번 이의신청`,
    description:
      `${objection.examTitle} · ${cleanDetail}`,
    href:
      `/admin/private-mock-objections/${objection._id}`,
    targetUserId:
      user._id,
    actorUserId:
      user._id,
    sourceType:
      "PrivateMockObjection",
    sourceId:
      objection._id,
  });
  const template =
    objectionReceivedEmail({
      objectionId:
        String(
          objection._id
        ),
      user,
      examTitle:
        objection.examTitle,
      questionNumber:
        number,
      issueDetail:
        cleanDetail,
    });
  try {
    await sendEmail({
      to:
        process.env
          .ADMIN_EMAIL ||
        DEFAULT_ADMIN_EMAIL,
      replyTo:
        user.email,
      subject:
        template.subject,
      text:
        template.text,
      html:
        buildBrandedHtml({
          kicker:
            "MATTHS OPERATIONS",
          heading:
            "새 문제 이의신청이 접수되었습니다.",
          body:
            template.text,
        }),
    });
  } catch (error) {
    console.error(
      "[private-mock-objection] 관리자 이메일 발송 실패",
      error?.message ||
        ""
    );
  }
  return objection;
}

async function getAdminPrivateMockObjection({
  objectionId,
}) {
  if (
    !mongoose.isValidObjectId(
      objectionId
    )
  ) {
    throw statusError(
      404,
      "이의신청을 찾을 수 없습니다."
    );
  }
  const objection =
    await PrivateMockObjection.findById(
      objectionId
    )
      .populate(
        "userId",
        "realName name email"
      )
      .populate(
        "examId",
        "title formCode releaseAt questionCount answerKey"
      )
      .lean();
  if (!objection) {
    throw statusError(
      404,
      "이의신청을 찾을 수 없습니다."
    );
  }
  const exam =
    await PrivateMockExam.findById(
      objection.examId
        ?._id ||
        objection.examId
    )
      .select("+answerKey")
      .lean();
  return {
    ...objection,
    id:
      String(
        objection._id
      ),
    currentAnswer:
      exam?.answerKey?.[
        objection
          .questionNumber - 1
      ] || "",
  };
}

async function rejectPrivateMockObjection({
  adminUserId,
  objectionId,
  reason,
  now = new Date(),
}) {
  const cleanReason =
    cleanMultiline(
      reason,
      2000
    );
  if (
    cleanReason.length < 5
  ) {
    throw statusError(
      400,
      "반려 사유를 5자 이상 입력해주세요."
    );
  }
  const objection =
    await PrivateMockObjection.findOne({
      _id:
        objectionId,
      status: {
        $in: [
          "pending",
          "reviewing",
        ],
      },
    });
  if (!objection) {
    throw statusError(
      409,
      "이미 처리했거나 찾을 수 없는 이의신청입니다."
    );
  }
  const user =
    await User.findById(
      objection.userId
    );
  const notice =
    objectionRejectedEmail({
      examTitle:
        objection.examTitle,
      questionNumber:
        objection.questionNumber,
      reason:
        cleanReason,
    });
  await deliverModerationNotice({
    user,
    title:
      notice.title,
    message:
      notice.message,
    href:
      "/war-of-masters/objections/new",
    kind: "system",
    createdBy:
      adminUserId,
    emailSubject:
      notice.title,
    emailMessage:
      notice.message,
  });
  objection.status =
    "rejected";
  objection.reviewReason =
    cleanReason;
  objection.reviewedBy =
    adminUserId;
  objection.reviewedAt =
    now;
  await objection.save();
  await completeAdminTodoBySource({
    sourceType:
      "PrivateMockObjection",
    sourceId:
      objection._id,
    adminUserId,
  });
  return objection;
}

function seoulDateInput(
  value
) {
  const clock =
    new Date(
      value.getTime() +
        SEOUL_OFFSET_MS
    );
  return [
    clock.getUTCFullYear(),
    String(
      clock.getUTCMonth() +
        1
    ).padStart(2, "0"),
    String(
      clock.getUTCDate()
    ).padStart(2, "0"),
  ].join("-");
}

async function acceptPrivateMockObjection({
  adminUserId,
  objectionId,
  newAnswer,
  questionContent,
  reason,
  now = new Date(),
}) {
  const objection =
    await PrivateMockObjection.findOne({
      _id:
        objectionId,
      status: {
        $in: [
          "pending",
          "reviewing",
        ],
      },
    });
  if (!objection) {
    throw statusError(
      409,
      "이미 처리했거나 찾을 수 없는 이의신청입니다."
    );
  }
  const correction =
    await correctPrivateMockAnswers({
      adminUserId,
      examId:
        objection.examId,
      corrections: [
        {
          questionNumber:
            objection
              .questionNumber,
          questionContent,
          newAnswer,
        },
      ],
      reason,
      sourceObjectionId:
        objection._id,
      now,
    });
  const user =
    await User.findById(
      objection.userId
    );
  const notice =
    objectionAcceptedEmail({
      examTitle:
        objection.examTitle,
      questionNumber:
        objection.questionNumber,
      reason:
        cleanMultiline(
          reason,
          2000
        ),
    });
  await deliverModerationNotice({
    user,
    title:
      notice.title,
    message:
      notice.message,
    href:
      "/private-mock-exams",
    kind: "system",
    createdBy:
      adminUserId,
    emailSubject:
      notice.title,
    emailMessage:
      notice.message,
  });
  const nextRelease =
    getSundayReleaseAt(
      now
    );
  const announcementEnd =
    new Date(
      nextRelease.getTime() -
        15 * 60 * 60 *
          1000 -
        1
    );
  const announcement =
    await createAnnouncement({
      adminUserId,
      title:
        "Matths 주간 공식 모의고사 정답 정정 안내",
      content:
        `${objection.examTitle} ${objection.questionNumber}번 문항의 정답을 정정했습니다. 해당 시험의 성적·랭킹·GP를 다시 계산했으니 결과를 확인해주세요.`,
      publishNow: true,
      href:
        "/private-mock-exams",
      dashboardEndDate:
        seoulDateInput(
          announcementEnd
        ),
    });
  objection.status =
    "accepted";
  objection.reviewReason =
    cleanMultiline(
      reason,
      2000
    );
  objection.reviewedBy =
    adminUserId;
  objection.reviewedAt =
    now;
  objection.correctionId =
    correction._id;
  objection.announcementId =
    announcement._id;
  await objection.save();
  await completeAdminTodoBySource({
    sourceType:
      "PrivateMockObjection",
    sourceId:
      objection._id,
    adminUserId,
  });
  return objection;
}

async function getAdminPrivateMockExamDetailData({
  examId,
}) {
  if (
    !mongoose.isValidObjectId(
      examId
    )
  ) {
    throw statusError(
      404,
      "Matths 주간 공식 모의고사 회차를 찾을 수 없습니다."
    );
  }

  const exam =
    await PrivateMockExam.findById(
      examId
    )
      .select(
        "+answerKey +points +explanations"
      )
      .lean();

  if (!exam) {
    throw statusError(
      404,
      "Matths 주간 공식 모의고사 회차를 찾을 수 없습니다."
    );
  }

  const attempts =
    await PrivateMockExamAttempt.find({
      examId:
        exam._id,
    })
      .sort({
        submittedAt: -1,
        startedAt: -1,
      })
      .populate(
        "userId",
        "name realName email school"
      )
      .lean();
  const attemptIds =
    attempts.map(
      (attempt) =>
        attempt._id
    );
  const [
    events,
    integrityCases,
  ] = await Promise.all([
    PrivateMockExamEvent.find({
      attemptId: {
        $in: attemptIds,
      },
    })
      .sort({
        serverAt: 1,
      })
      .lean(),
    PrivateMockIntegrityCase.find({
      attemptId: {
        $in: attemptIds,
      },
    }).lean(),
  ]);
  const eventsByAttempt =
    new Map();

  events.forEach((event) => {
    const key =
      String(
        event.attemptId
      );
    if (
      !eventsByAttempt.has(
        key
      )
    ) {
      eventsByAttempt.set(
        key,
        []
      );
    }
    eventsByAttempt
      .get(key)
      .push(event);
  });
  const caseByAttempt =
    new Map(
      integrityCases.map(
        (integrityCase) => [
          String(
            integrityCase
              .attemptId
          ),
          integrityCase,
        ]
      )
    );

  return {
    exam: {
      ...exam,
      id:
        String(exam._id),
    },
    attempts:
      attempts.map(
        (attempt) => ({
          ...attempt,
          id:
            String(
              attempt._id
            ),
          incorrectQuestionNumbers:
            Array.from(
              {
                length:
                  exam.questionCount,
              },
              (_, index) =>
                attempt
                  .correctByQuestion?.[
                  index
                ]
                  ? null
                  : index + 1
            ).filter(Boolean),
          events:
            eventsByAttempt.get(
              String(
                attempt._id
              )
            ) || [],
          integrityCase:
            caseByAttempt.get(
              String(
                attempt._id
              )
            ) || null,
          review:
            Array.from(
              {
                length:
                  exam.questionCount,
              },
              (_, index) => ({
                number:
                  index + 1,
                mode:
                  exam
                    .questionModes?.[
                    index
                  ] ||
                  standardQuestionMode(
                    index + 1
                  ),
                submittedAnswer:
                  attempt
                    .answers?.[
                    index
                  ] || "",
                correctAnswer:
                  exam
                    .answerKey?.[
                    index
                  ] || "",
                isCorrect:
                  Boolean(
                    attempt
                      .correctByQuestion?.[
                      index
                    ]
                  ),
                points:
                  Number(
                    exam.points?.[
                      index
                    ] || 0
                  ),
                explanation:
                  exam
                    .explanations?.[
                    index
                  ] || null,
              })
            ),
        })
      ),
  };
}

async function getAdminPrivateMockExamData(
  now = new Date()
) {
  await processPrivateMockSchedule(
    now
  );
  const exams =
    await PrivateMockExam.find()
      .sort({
        releaseAt: -1,
      })
      .limit(30)
      .populate(
        "archiveItemId",
        "originalName isPublished"
      )
      .populate(
        "answerSheetArchiveItemId",
        "originalName isPublished"
      )
      .lean();
  const examIds =
    exams.map(
      (exam) =>
        exam._id
    );
  const [
    attemptCounts,
    integrityCounts,
    formulaResources,
  ] = await Promise.all([
    PrivateMockExamAttempt.aggregate([
      {
        $match: {
          examId: {
            $in: examIds,
          },
        },
      },
      {
        $group: {
          _id: "$examId",
          count: {
            $sum: 1,
          },
        },
      },
    ]),
    PrivateMockIntegrityCase.aggregate([
      {
        $match: {
          examId: {
            $in: examIds,
          },
        },
      },
      {
        $group: {
          _id: "$examId",
          count: {
            $sum: 1,
          },
        },
      },
    ]),
    PrivateMockResource.find({
      resourceType:
        "formula-pdf",
    })
      .sort({
        createdAt: -1,
      })
      .populate(
        "archiveItemId",
        "originalName"
      )
      .lean(),
  ]);
  const attemptCountByExam =
    new Map(
      attemptCounts.map(
        (entry) => [
          String(entry._id),
          entry.count,
        ]
      )
    );
  const integrityCountByExam =
    new Map(
      integrityCounts.map(
        (entry) => [
          String(entry._id),
          entry.count,
        ]
      )
    );

  return {
    nextSunday:
      getSundayReleaseAt(now)
        .toISOString()
        .slice(0, 10),
    defaultExamDate:
      privateMockWeekKey(
        getSundayReleaseAt(now)
      ),
    formSchedules:
      Object.entries(
        PRIVATE_MOCK_FORM_SCHEDULES
      ).map(
        ([
          formCode,
          schedule,
        ]) => ({
          formCode,
          attemptNumber:
            schedule.attemptNumber,
          label:
            schedule.label,
          fixedDate:
            schedule.fixedDate ||
            null,
          isTest:
            Boolean(
              schedule.isTest
            ),
          isCustom:
            Boolean(
              schedule.isCustom
            ),
        })
      ),
    defaultDurationMinutes:
      DEFAULT_DURATION_MINUTES,
    formulaResources:
      formulaResources.map(
        (resource) => ({
          id:
            String(
              resource._id
            ),
          versionLabel:
            resource.versionLabel ||
            "",
          isActive:
            resource.isActive,
          originalName:
            repairUploadFilename(
              resource
                .archiveItemId
                ?.originalName
            ),
          createdAt:
            resource.createdAt,
        })
      ),
    exams: exams.map(
      (exam) => ({
        id:
          String(exam._id),
        title:
          exam.title,
        weekKey:
          exam.weekKey,
        weekLabel:
          privateMockWeekLabel(
            exam.releaseAt
          ),
        attemptNumber:
          exam.attemptNumber,
        formCode:
          exam.formCode,
        isTest:
          Boolean(
            exam.isTest
          ),
        releaseAt:
          exam.releaseAt,
        closeAt:
          exam.closeAt,
        aggregationStartsAt:
          exam.aggregationStartsAt,
        rankingPublishesAt:
          exam.rankingPublishesAt,
        archiveAt:
          exam.archiveAt,
        status:
          exam.status,
        questionCount:
          exam.questionCount,
        notificationSentAt:
          exam.notificationSentAt,
        rankingFinalizedAt:
          exam.rankingFinalizedAt,
        archivedAt:
          exam.archivedAt,
        rankingSummary:
          exam.rankingSummary,
        attemptCount:
          attemptCountByExam.get(
            String(exam._id)
          ) || 0,
        integrityCaseCount:
          integrityCountByExam.get(
            String(exam._id)
          ) || 0,
        detailHref:
          `/admin/private-mock-exams/${exam._id}`,
        problemFileHref:
          `/admin/private-mock-exams/${exam._id}/files/problem`,
        answerSheetFileHref:
          exam
            .answerSheetArchiveItemId
            ?._id
            ? `/admin/private-mock-exams/${exam._id}/files/answer-sheet`
            : null,
        canDelete:
          exam.isTest ||
          (
            [
              "pending-review",
              "scheduled",
            ].includes(
              exam.status
            ) &&
            new Date(
              exam.releaseAt
            ) > now
          ),
        originalName:
          repairUploadFilename(
            exam.archiveItemId
              ?.originalName
          ),
        answerSheetId:
          exam
            .answerSheetArchiveItemId
            ?._id
            ? String(
                exam
                  .answerSheetArchiveItemId
                  ._id
              )
            : null,
        answerSheetName:
          repairUploadFilename(
            exam
              .answerSheetArchiveItemId
              ?.originalName
          ),
      })
    ),
  };
}

module.exports = {
  DEFAULT_DURATION_MINUTES,
  PRIVATE_MOCK_FORM_SCHEDULES,
  PRIVATE_MOCK_LOBBY_MS,
  PRIVATE_MOCK_FOLDER_NAME,
  buildPrivateMockSchedule,
  calculateWeeklyMmrPerformance,
  acceptPrivateMockObjection,
  createPrivateMockExam,
  createPrivateMockExamBatch,
  createPrivateMockFormulaResource,
  createPrivateMockObjection,
  correctPrivateMockAnswers,
  deletePrivateMockExam,
  deletePrivateMockFormulaResource,
  getAdminPrivateMockPdfFile,
  getAdminPrivateMockIntegrityEvidenceFile,
  getAdminPrivateMockExamData,
  getAdminPrivateMockExamDetailData,
  getAdminPrivateMockObjection,
  getKoreanWeekTitle,
  getPrivateMockAttemptData,
  getPrivateMockExamFile,
  getPrivateMockFormulaFile,
  getPrivateMockEligibility,
  getPrivateMockExamPageData,
  getPrivateMockRestrictionData,
  getPrivateMockObjectionFormData,
  getPrivateMockPhase,
  getIntegrityEvidenceDeadline,
  getUserIntegrityCase,
  getSundayReleaseAt,
  getWeekSelectionLockAt,
  getUploadReminderWindow,
  parseSeoulReleaseAt,
  parsePrivateMockExamDate,
  privateMockAttemptNumber,
  privateMockWeekKey,
  privateMockWeekLabel,
  processPrivateMockSchedule,
  requestPrivateMockIntegrityEvidenceByAdmin,
  rejectPrivateMockObjection,
  reviewPrivateMockIntegrityCase,
  resolveWeeklyRepresentative,
  selectPrivateMockWeeklyAttempt,
  savePrivateMockDraft,
  startPrivateMockAttempt,
  startPrivateMockExamScheduler,
  summarizePrivateMockRestrictionWeeks,
  submitPrivateMockIntegrityEvidence,
  submitPrivateMockAttempt,
  validateAnswerKeyJson,
};
