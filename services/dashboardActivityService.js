const {
  LearningEvent,
  QuickPracticeAttempt,
  AssessmentAttempt,
  PrivateMockExamAttempt,
} = require("../models/matthsModel");

const KST_TIME_ZONE = "Asia/Seoul";
const KST_OFFSET = "+09:00";
const DAYS_PER_PERIOD = 7;
const PERIOD_COUNT = 2;
const PROBLEM_EVENT_TYPES = [
  "problem-correct",
  "problem-wrong",
];

const dateKeyFormatter = new Intl.DateTimeFormat(
  "en-CA",
  {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }
);
const weekdayFormatter =
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    weekday: "short",
  });

function asValidDate(value, label = "date") {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(
      `${label} must be a valid date`
    );
  }

  return date;
}

function getKstDateKey(value = new Date()) {
  const date = asValidDate(value);
  const parts = Object.fromEntries(
    dateKeyFormatter
      .formatToParts(date)
      .filter(
        (part) =>
          part.type !== "literal"
      )
      .map((part) => [
        part.type,
        part.value,
      ])
  );

  return [
    parts.year,
    parts.month,
    parts.day,
  ].join("-");
}

function dateFromKstDateKey(
  dateKey,
  dayOffset = 0
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      String(dateKey)
    );
  if (!match) {
    throw new TypeError(
      "dateKey must use YYYY-MM-DD"
    );
  }

  const [, year, month, day] = match;

  // 한국 정오(03:00Z)를 기준으로 움직이면 날짜 경계에서 다른 KST 날짜로
  // 흔들리지 않는다. 한국은 DST가 없지만, 명시적으로 KST 캘린더를 쓴다.
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day) + dayOffset,
      3
    )
  );
}

function createKstDateSeries(
  now = new Date(),
  length =
    DAYS_PER_PERIOD * PERIOD_COUNT
) {
  const reference = asValidDate(
    now,
    "now"
  );
  const todayKey =
    getKstDateKey(reference);

  return Array.from(
    { length },
    (_, index) => {
      const dayOffset =
        index - length + 1;
      const date =
        dateFromKstDateKey(
          todayKey,
          dayOffset
        );

      return {
        date,
        dateKey:
          getKstDateKey(date),
      };
    }
  );
}

function formatDelta(value, unit) {
  const difference =
    Number(value) || 0;

  if (difference > 0) {
    return `지난 기간보다 +${difference}${unit}`;
  }

  if (difference < 0) {
    return `지난 기간보다 ${difference}${unit}`;
  }

  return "지난 기간과 동일";
}

function correctRate({
  solvedProblems = 0,
  correctProblems = 0,
} = {}) {
  const solved = Math.max(
    0,
    Number(solvedProblems) || 0
  );
  if (!solved) {
    return 0;
  }

  return Math.round(
    Math.max(
      0,
      Number(correctProblems) || 0
    ) /
      solved *
      100
  );
}

function kstDateExpression(field) {
  return {
    $dateToString: {
      date: field,
      format: "%Y-%m-%d",
      timezone: KST_TIME_ZONE,
    },
  };
}

function countMatchingValues(
  field,
  values
) {
  return {
    $size: {
      $filter: {
        input: {
          $ifNull: [field, []],
        },
        as: "value",
        cond: {
          $in: [
            "$$value",
            values,
          ],
        },
      },
    },
  };
}

function buildSupplementalActivityPipelines({
  userId,
  aggregateStart,
  now,
}) {
  const submittedAt = {
    $gte: aggregateStart,
    $lte: now,
  };

  return {
    quickPractice: [
      {
        $match: {
          userId,
          submittedAt,
          status: {
            $in: [
              "correct",
              "wrong",
              "expired",
            ],
          },
        },
      },
      {
        $group: {
          _id:
            kstDateExpression(
              "$submittedAt"
            ),
          durationMs: {
            $sum: {
              $ifNull: [
                "$responseTimeMs",
                0,
              ],
            },
          },
          solvedProblems: { $sum: 1 },
          correctProblems: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "correct",
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ],
    assessment: [
      {
        $match: {
          userId,
          submittedAt,
          status: {
            $in: [
              "submitted",
              "disqualified",
            ],
          },
        },
      },
      {
        $group: {
          _id:
            kstDateExpression(
              "$submittedAt"
            ),
          durationMs: {
            $sum: {
              $ifNull: [
                "$elapsedTimeMs",
                0,
              ],
            },
          },
          solvedProblems: {
            $sum:
              countMatchingValues(
                "$questions.isCorrect",
                [true, false]
              ),
          },
          correctProblems: {
            $sum:
              countMatchingValues(
                "$questions.isCorrect",
                [true]
              ),
          },
        },
      },
    ],
    privateMock: [
      {
        $match: {
          userId,
          submittedAt,
          status: {
            $in: [
              "submitted",
              "expired",
            ],
          },
        },
      },
      {
        $group: {
          _id:
            kstDateExpression(
              "$submittedAt"
            ),
          durationMs: {
            $sum: {
              $ifNull: [
                "$elapsedMs",
                0,
              ],
            },
          },
          solvedProblems: {
            $sum:
              countMatchingValues(
                "$correctByQuestion",
                [true, false]
              ),
          },
          correctProblems: {
            $sum:
              countMatchingValues(
                "$correctByQuestion",
                [true]
              ),
          },
        },
      },
    ],
  };
}

function normalizeDailyRows(rows) {
  const byDateKey = new Map();

  for (const row of rows || []) {
    const dateKey = String(
      row?._id ||
        row?.dateKey ||
        ""
    );
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dateKey
      )
    ) {
      continue;
    }

    const current =
      byDateKey.get(dateKey) || {
        durationMs: 0,
        solvedProblems: 0,
        correctProblems: 0,
      };
    current.durationMs += Math.max(
      0,
      Number(row.durationMs) || 0
    );
    current.solvedProblems += Math.max(
      0,
      Number(row.solvedProblems) || 0
    );
    current.correctProblems += Math.max(
      0,
      Number(row.correctProblems) || 0
    );
    byDateKey.set(
      dateKey,
      current
    );
  }

  return byDateKey;
}

/**
 * Mongo 결과를 웹·iPad가 함께 쓰는 대시보드 계약으로 바꾼다.
 *
 * 중요한 규칙: durationMs를 14일 합계로 먼저 반올림하지 않는다. 기존 웹과
 * 동일하게 **날짜별로 분 반올림한 뒤** 7일 합계를 만든다.
 */
function buildDashboardActivity(
  dailyRows,
  { now = new Date() } = {}
) {
  const generatedAt =
    asValidDate(now, "now");
  const dateSeries =
    createKstDateSeries(
      generatedAt
    );
  const allowedDateKeys = new Set(
    dateSeries.map(
      ({ dateKey }) => dateKey
    )
  );
  const rowMap =
    normalizeDailyRows(
      (dailyRows || []).filter(
        (row) =>
          allowedDateKeys.has(
            String(
              row?._id ||
                row?.dateKey ||
                ""
            )
          )
      )
    );

  const periods = dateSeries.map(
    ({ date, dateKey }) => {
      const row =
        rowMap.get(dateKey) || {};

      return {
        date,
        dateKey,
        // 날짜별 반올림은 최신 웹 dashboardService가 쓰던 계약이다.
        minutes: Math.round(
          Math.max(
            0,
            Number(row.durationMs) ||
              0
          ) / 60000
        ),
        solvedProblems: Math.max(
          0,
          Number(
            row.solvedProblems
          ) || 0
        ),
        correctProblems: Math.max(
          0,
          Number(
            row.correctProblems
          ) || 0
        ),
      };
    }
  );
  const previousDays =
    periods.slice(
      0,
      DAYS_PER_PERIOD
    );
  const currentDays =
    periods.slice(
      DAYS_PER_PERIOD
    );
  const sum = (days, field) =>
    days.reduce(
      (total, day) =>
        total +
        (Number(day[field]) || 0),
      0
    );

  const previousStudyMinutes = sum(
    previousDays,
    "minutes"
  );
  const weeklyStudyMinutes = sum(
    currentDays,
    "minutes"
  );
  const previousSolvedProblems = sum(
    previousDays,
    "solvedProblems"
  );
  const weeklySolvedProblems = sum(
    currentDays,
    "solvedProblems"
  );
  const previousCorrectRate =
    correctRate({
      solvedProblems:
        previousSolvedProblems,
      correctProblems: sum(
        previousDays,
        "correctProblems"
      ),
    });
  const currentCorrectRate =
    correctRate({
      solvedProblems:
        weeklySolvedProblems,
      correctProblems: sum(
        currentDays,
        "correctProblems"
      ),
    });
  const activeStudyDays =
    currentDays.filter(
      (day) => day.minutes > 0
    ).length;
  const todayStudyMinutes =
    currentDays[
      currentDays.length - 1
    ]?.minutes || 0;
  const averageStudyMinutes =
    activeStudyDays
      ? Math.round(
          weeklyStudyMinutes /
            activeStudyDays
        )
      : 0;
  const todayKey =
    currentDays[
      currentDays.length - 1
    ]?.dateKey;
  const days = currentDays.map(
    ({ date, dateKey, minutes }) => ({
      dateKey,
      label:
        dateKey === todayKey
          ? "오늘"
          : weekdayFormatter.format(
              date
            ),
      minutes,
      isToday:
        dateKey === todayKey,
    })
  );

  return {
    generatedAt:
      generatedAt.toISOString(),
    stats: {
      weeklyStudyMinutes,
      weeklyStudyDetail:
        formatDelta(
          weeklyStudyMinutes -
            previousStudyMinutes,
          "분"
        ),
      todayStudyMinutes,
      activeStudyDays,
      averageStudyMinutes,
      weeklySolvedProblems,
      weeklySolvedDetail:
        formatDelta(
          weeklySolvedProblems -
            previousSolvedProblems,
          "문제"
        ),
      correctRate:
        currentCorrectRate,
      correctRateDetail:
        formatDelta(
          currentCorrectRate -
            previousCorrectRate,
          "%"
        ),
    },
    weeklyActivity: {
      days,
      maxMinutes: Math.max(
        10,
        ...days.map(
          (day) => day.minutes
        )
      ),
    },
  };
}

/**
 * 웹 대시보드는 공통 KPI 외에 오늘 푼 문제 수도 유지한다. 이 값 때문에 웹이
 * 별도 컬렉션 집계를 다시 만들지 않도록, 같은 정규화 결과에서 내부 스냅샷을
 * 함께 만든다. iPad 공개 응답은 `activity`만 사용하므로 기존 JSON 계약은
 * 변하지 않는다.
 */
function buildDashboardActivitySnapshot(
  dailyRows,
  { now = new Date() } = {}
) {
  const reference =
    asValidDate(now, "now");
  const activity =
    buildDashboardActivity(
      dailyRows,
      { now: reference }
    );
  const todayKey =
    getKstDateKey(reference);
  const today =
    normalizeDailyRows(
      dailyRows
    ).get(todayKey);

  return {
    activity,
    todaySolvedProblems:
      Math.max(
        0,
        Number(
          today?.solvedProblems
        ) || 0
      ),
  };
}

function buildActivityPipeline({
  userId,
  aggregateStart,
  now,
}) {
  return [
    {
      $match: {
        userId,
        occurredAt: {
          $gte: aggregateStart,
          // 같은 KST 날짜라도 아직 오지 않은 시각의 이벤트는 집계하지 않는다.
          $lte: now,
        },
        $or: [
          {
            durationMs: {
              $ne: null,
            },
          },
          {
            eventType: {
              $in:
                PROBLEM_EVENT_TYPES,
            },
          },
        ],
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            date: "$occurredAt",
            format:
              "%Y-%m-%d",
            timezone:
              KST_TIME_ZONE,
          },
        },
        durationMs: {
          $sum: {
            $ifNull: [
              "$durationMs",
              0,
            ],
          },
        },
        solvedProblems: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$eventType",
                  PROBLEM_EVENT_TYPES,
                ],
              },
              1,
              0,
            ],
          },
        },
        correctProblems: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$eventType",
                  "problem-correct",
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ];
}

async function getDashboardActivitySnapshot(
  userId,
  { now = new Date() } = {}
) {
  const reference =
    asValidDate(now, "now");
  const dateSeries =
    createKstDateSeries(
      reference
    );
  const aggregateStart = new Date(
    `${dateSeries[0].dateKey}T00:00:00${KST_OFFSET}`
  );
  const supplemental =
    buildSupplementalActivityPipelines({
      userId,
      aggregateStart,
      now: reference,
    });
  const rowGroups =
    await Promise.all([
      LearningEvent.aggregate(
        buildActivityPipeline({
          userId,
          aggregateStart,
          now: reference,
        })
      ),
      QuickPracticeAttempt.aggregate(
        supplemental.quickPractice
      ),
      AssessmentAttempt.aggregate(
        supplemental.assessment
      ),
      PrivateMockExamAttempt.aggregate(
        supplemental.privateMock
      ),
    ]);

  return buildDashboardActivitySnapshot(
    rowGroups.flat(),
    {
      now: reference,
    }
  );
}

async function getDashboardActivity(
  userId,
  options = {}
) {
  const snapshot =
    await getDashboardActivitySnapshot(
      userId,
      options
    );
  return snapshot.activity;
}

module.exports = {
  PROBLEM_EVENT_TYPES,
  buildActivityPipeline,
  buildDashboardActivity,
  buildDashboardActivitySnapshot,
  buildSupplementalActivityPipelines,
  createKstDateSeries,
  formatDelta,
  getDashboardActivity,
  getDashboardActivitySnapshot,
  getKstDateKey,
};
