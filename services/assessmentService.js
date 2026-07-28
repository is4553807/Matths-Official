const {
  randomUUID,
} = require("crypto");
const mongoose = require("mongoose");

const {
  AssessmentAttempt,
  ConceptProgress,
  Problem,
  ProblemAttempt,
} = require("../models/matthsModel");
const {
  loadCurriculum,
} = require("./curriculumService");
const {
  EXAM_COURSES,
} = require("./examBankSource");
const {
  getProblemGenerator,
} = require("./problemGenerators");
const {
  generateValidProblem,
  validateGeneratedProblem,
} = require("./problemGenerators/utils");
const {
  assessmentConfigsForScope,
} = require("./assessmentTemplates");
const {
  selectDeepestLearnedStage,
} = require(
  "./assessmentTemplates/shared"
);
const {
  referenceIdsForTemplate,
} = require(
  "./assessmentReferences/mockExamCatalog"
);
const {
  answersEquivalent,
} = require("./mathAnswerService");

const PASS_SCORE = 80;
const TIME_LIMIT_MS = {
  subunit: 10 * 60 * 1000,
  unit: 30 * 60 * 1000,
  course: 60 * 60 * 1000,
};

function assessmentTimeLimitMs(
  scopeType
) {
  return (
    TIME_LIMIT_MS[scopeType] ||
    TIME_LIMIT_MS.subunit
  );
}

function attemptTimeLimitMs(
  attempt
) {
  return (
    Number(
      attempt.timeLimitMs
    ) ||
    assessmentTimeLimitMs(
      attempt.scopeType
    )
  );
}

function attemptDeadlineMs(attempt) {
  return (
    new Date(
      attempt.startedAt
    ).getTime() +
    attemptTimeLimitMs(attempt)
  );
}

function assessmentIsOverdue(
  attempt,
  now = Date.now()
) {
  return (
    attempt.status ===
      "in-progress" &&
    now >=
      attemptDeadlineMs(
        attempt
      )
  );
}

/*
 * 사용자가 제공한 문제은행의 sub 단위를 현재 교육과정의
 * 개념 id에 연결합니다. 한 sub 평가에는 여기에 적힌 개념만
 * 들어가므로 아직 배우지 않은 다른 단원의 내용이 섞이지 않습니다.
 */
const ASSESSMENT_CATALOG = [
  {
    courseId: "algebra",
    bankCourseId: "algebra",
    units: [
      {
        unitId:
          "exponential-logarithmic-functions",
        bankUnitId: "explog",
        subunits: [
          {
            id: "radical",
            conceptIds: [
              "algebra-01-01",
              "algebra-01-02",
              "algebra-01-03",
            ],
          },
          {
            id: "log",
            conceptIds: [
              "algebra-01-04",
              "algebra-01-05",
            ],
          },
          {
            id: "graph",
            conceptIds: [
              "algebra-01-06",
              "algebra-01-07",
            ],
          },
          {
            id: "eq",
            conceptIds: [
              "algebra-01-08",
            ],
          },
        ],
      },
      {
        unitId: "trigonometric-functions",
        bankUnitId: "trig",
        subunits: [
          {
            id: "radian",
            conceptIds: [
              "algebra-02-01",
            ],
          },
          {
            id: "trigfun",
            conceptIds: [
              "algebra-02-02",
            ],
          },
          {
            id: "laws",
            conceptIds: [
              "algebra-02-03",
            ],
          },
        ],
      },
      {
        unitId: "sequences",
        bankUnitId: "seq",
        subunits: [
          {
            id: "arith",
            conceptIds: [
              "algebra-03-01",
              "algebra-03-02",
            ],
          },
          {
            id: "geom",
            conceptIds: [
              "algebra-03-03",
            ],
          },
          {
            id: "sigma",
            conceptIds: [
              "algebra-03-04",
              "algebra-03-05",
            ],
          },
          {
            id: "recur",
            conceptIds: [
              "algebra-03-06",
              "algebra-03-07",
            ],
          },
        ],
      },
    ],
  },
  {
    courseId: "calculus-1",
    bankCourseId: "calculus",
    units: [
      {
        unitId: "limits-and-continuity",
        bankUnitId: "limit",
        subunits: [
          {
            id: "lim",
            conceptIds: [
              "calculus-1-01-01",
              "calculus-1-01-02",
            ],
          },
          {
            id: "cont",
            conceptIds: [
              "calculus-1-01-03",
              "calculus-1-01-04",
            ],
          },
        ],
      },
      {
        unitId: "differentiation",
        bankUnitId: "diff",
        subunits: [
          {
            id: "deriv",
            conceptIds: [
              "calculus-1-02-01",
              "calculus-1-02-02",
              "calculus-1-02-03",
              "calculus-1-02-04",
            ],
          },
          {
            id: "tangent",
            conceptIds: [
              "calculus-1-02-05",
              "calculus-1-02-06",
            ],
          },
          {
            id: "extrema",
            conceptIds: [
              "calculus-1-02-07",
              "calculus-1-02-08",
            ],
          },
          {
            id: "apply",
            conceptIds: [
              "calculus-1-02-09",
              "calculus-1-02-10",
            ],
          },
        ],
      },
      {
        unitId: "integration",
        bankUnitId: "integral",
        subunits: [
          {
            id: "antider",
            conceptIds: [
              "calculus-1-03-01",
              "calculus-1-03-02",
            ],
          },
          {
            id: "defint",
            conceptIds: [
              "calculus-1-03-03",
              "calculus-1-03-04",
            ],
          },
          {
            id: "area",
            conceptIds: [
              "calculus-1-03-05",
              "calculus-1-03-06",
            ],
          },
        ],
      },
    ],
  },
  {
    courseId: "probability-statistics",
    bankCourseId: "probstat",
    units: [
      {
        unitId: "counting",
        bankUnitId: "counting",
        subunits: [
          {
            id: "perm",
            conceptIds: [
              "probability-statistics-01-01",
            ],
          },
          {
            id: "hcomb",
            conceptIds: [
              "probability-statistics-01-02",
            ],
          },
          {
            id: "binom",
            conceptIds: [
              "probability-statistics-01-03",
            ],
          },
        ],
      },
      {
        unitId: "probability",
        bankUnitId: "probability",
        subunits: [
          {
            id: "prob",
            conceptIds: [
              "probability-statistics-02-01",
              "probability-statistics-02-02",
              "probability-statistics-02-03",
            ],
          },
          {
            id: "cond",
            conceptIds: [
              "probability-statistics-02-04",
            ],
          },
          {
            id: "indep",
            conceptIds: [
              "probability-statistics-02-05",
              "probability-statistics-02-06",
            ],
          },
        ],
      },
      {
        unitId: "statistics",
        bankUnitId: "statistics",
        subunits: [
          {
            id: "rv",
            conceptIds: [
              "probability-statistics-03-01",
              "probability-statistics-03-02",
            ],
          },
          {
            id: "binorm",
            conceptIds: [
              "probability-statistics-03-03",
              "probability-statistics-03-04",
            ],
          },
          {
            id: "sample",
            conceptIds: [
              "probability-statistics-03-05",
              "probability-statistics-03-06",
              "probability-statistics-03-07",
            ],
          },
        ],
      },
    ],
  },
];

const DIFFICULTY_LABELS = {
  "mid-high": "중상",
  applied: "응용",
  advanced: "심화",
};

const PAPER_PLANS = {
  subunit: {
    counts: {
      "mid-high": 10,
      applied: 0,
      advanced: 0,
    },
    questionCount: 10,
  },
  unit: {
    counts: {
      "mid-high": 7,
      applied: 8,
      advanced: 5,
    },
    questionCount: 20,
  },
  course: {
    counts: {
      "mid-high": 14,
      applied: 16,
      advanced: 10,
    },
    questionCount: 40,
  },
};

function shuffle(values) {
  const result = values.slice();

  for (
    let index = result.length - 1;
    index > 0;
    index -= 1
  ) {
    const next = Math.floor(
      Math.random() * (index + 1)
    );
    [
      result[index],
      result[next],
    ] = [
      result[next],
      result[index],
    ];
  }

  return result;
}

const CHOICE_MARKERS = [
  "①",
  "②",
  "③",
  "④",
  "⑤",
  "⑥",
  "⑦",
  "⑧",
  "⑨",
  "⑩",
];

function choiceMarker(index) {
  return (
    CHOICE_MARKERS[index] ||
    `${index + 1}번`
  );
}

function normalizeExamTex(value) {
  return String(value)
    .replace(
      /(^|[^\\A-Za-z])lim(?=\s*[_({])/g,
      "$1\\lim"
    )
    .replace(
      /(?:\\displaystyle\s*)?\\lim(?=\s*[_({]|$)/g,
      "\\displaystyle\\lim"
    );
}

function normalizeExamMath(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\$\$/g, "$")
    .replace(
      /\$([^$]+)\$/g,
      (_, math) =>
        `\\(${normalizeExamTex(
          math
        )}\\)`
    )
    .replace(
      /\\\[([\s\S]*?)\\\]/g,
      (_, math) =>
        `\\[${normalizeExamTex(
          math
        )}\\]`
    )
    .replace(
      /\\\(([\s\S]*?)\\\)/g,
      (_, math) =>
        `\\(${normalizeExamTex(
          math
        )}\\)`
    )
    .replace(
      /\\\)(?=[가-힣])/g,
      "\\) "
    )
    .replace(
      /([가-힣])(?=\\\()/g,
      "$1 "
    );
}

function assessmentKey({
  scopeType,
  courseId,
  unitId = "",
  subunitId = "",
}) {
  return [
    scopeType,
    courseId,
    unitId || "",
    subunitId || "",
  ].join("/");
}

function findCatalogCourse(courseId) {
  return ASSESSMENT_CATALOG.find(
    (course) =>
      course.courseId === courseId
  );
}

function findBankCourse(bankCourseId) {
  return EXAM_COURSES.find(
    (course) =>
      course.id === bankCourseId
  );
}

function getCatalogTarget({
  scopeType,
  courseId,
  unitId,
  subunitId,
}) {
  const course =
    findCatalogCourse(courseId);
  const bankCourse = course
    ? findBankCourse(course.bankCourseId)
    : null;
  const unit = course?.units.find(
    (item) =>
      item.unitId === unitId
  );
  const bankUnit = unit
    ? bankCourse?.units.find(
        (item) =>
          item.id === unit.bankUnitId
      )
    : null;
  const subunit = unit?.subunits.find(
    (item) =>
      item.id === subunitId
  );
  const bankSubunit = subunit
    ? bankUnit?.subs.find(
        (item) =>
          item.id === subunit.id
      )
    : null;

  if (
    !course ||
    !bankCourse ||
    (scopeType !== "course" &&
      (!unit || !bankUnit)) ||
    (scopeType === "subunit" &&
      (!subunit || !bankSubunit))
  ) {
    return null;
  }

  return {
    course,
    bankCourse,
    unit,
    bankUnit,
    subunit,
    bankSubunit,
  };
}

function generatorRecordsForTarget(
  target,
  scopeType
) {
  const bankUnits =
    scopeType === "course"
      ? target.bankCourse.units
      : [target.bankUnit];
  const allowedSubunitIds =
    scopeType === "subunit"
      ? new Set([
          target.bankSubunit.id,
        ])
      : null;

  const bankRecords = bankUnits.flatMap(
    (bankUnit) => {
      const unitConfig =
        target.course.units.find(
          (item) =>
            item.bankUnitId ===
            bankUnit.id
        );

      return bankUnit.subs
        .filter(
          (bankSubunit) =>
            !allowedSubunitIds ||
            allowedSubunitIds.has(
              bankSubunit.id
            )
        )
        .flatMap((bankSubunit) =>
          bankSubunit.gens.map(
            (generator) => {
              const sourceSubunit =
                unitConfig?.subunits.find(
                  (item) =>
                    item.id ===
                    bankSubunit.id
                );

              return {
                generator,
                bankUnit,
                bankSubunit,
                sourceUnitId:
                  unitConfig?.unitId ||
                  "",
                sourceConceptId:
                  sourceSubunit
                    ?.conceptIds?.[0] ||
                  "",
                practiceTypeId: "",
              };
            }
          )
        );
    }
  );

  const unitConfigs =
    scopeType === "course"
      ? target.course.units
      : [target.unit];
  const localRecords =
    unitConfigs.flatMap(
      (unitConfig) => {
        const bankUnit =
          target.bankCourse.units.find(
            (item) =>
              item.id ===
              unitConfig.bankUnitId
          );
        const subunitConfigs =
          scopeType === "subunit"
            ? [
                target.subunit,
              ]
            : unitConfig.subunits;

        return subunitConfigs.flatMap(
          (subunitConfig) => {
            const bankSubunit =
              bankUnit.subs.find(
                (item) =>
                  item.id ===
                  subunitConfig.id
              );

            return subunitConfig.conceptIds.flatMap(
              (conceptId) => {
                const generator =
                  getProblemGenerator({
                    courseId:
                      target.course.courseId,
                    unitId:
                      unitConfig.unitId,
                    conceptId,
                  });

                return (
                  generator
                    ?.problemTypes || []
                ).map(
                  (problemType) => ({
                    generator: {
                      id:
                        `local-${conceptId}-${problemType.id}`,
                      /*
                       * 기존 개념 문제 중 난도 1~2는 중상 풀 보강,
                       * 난도 3은 응용 풀 보강에만 사용합니다.
                       */
                      points:
                        Number(
                          problemType.difficulty
                        ) >= 3
                          ? 4
                          : 3,
                      difficulty:
                        Number(
                          problemType.difficulty
                        ) || 1,
                      generate() {
                        return generateValidProblem(
                          problemType
                        );
                      },
                    },
                    bankUnit,
                    bankSubunit,
                    sourceUnitId:
                      unitConfig.unitId,
                    sourceConceptId:
                      conceptId,
                    practiceTypeId:
                      problemType.id,
                  })
                );
              }
            );
          }
        );
      }
    );

  return [
    ...bankRecords,
    ...localRecords,
  ];
}

function generateFromRecord(record) {
  let lastError = null;

  for (
    let attempt = 0;
    attempt < 40;
    attempt += 1
  ) {
    const problem =
      record.generator.generate();

    if (!problem) continue;

    try {
      validateGeneratedProblem(
        {
          ...problem,
          hintText:
            problem.hintText ||
            "조건을 식으로 옮긴 뒤 계산 결과를 원래 조건에 대입해 확인하세요.",
        },
        {
          id:
            record.generator.id,
        }
      );

      return {
        record,
        problem,
      };
    } catch (error) {
      if (
        error?.name !==
        "InvalidGeneratedProblemError"
      ) {
        throw error;
      }

      lastError = error;
    }
  }

  const error = new Error(
    `${record.generator.id}: 검산을 통과한 평가 문제를 생성하지 못했습니다.`
  );
  error.cause = lastError;
  error.status = 503;
  throw error;
}

function makeSingleQuestion({
  generated,
  difficulty,
  points,
}) {
  const {
    record,
    problem,
  } = generated;

  return {
    questionId: randomUUID(),
    typeId:
      `bank:${record.generator.id}`,
    sourceTypeIds: [
      `bank:${record.generator.id}`,
    ],
    difficulty,
    sourceCourseId: "",
    sourceUnitId:
      record.sourceUnitId,
    sourceSubunitId:
      record.bankSubunit.id,
    sourceConceptId:
      record.sourceConceptId ||
      "",
    retryTypeId:
      record.practiceTypeId ||
      "",
    prompt: normalizeExamMath(
      problem.prompt
    ),
    inputMode: problem.inputMode,
    choices: (
      problem.choices || []
    ).map((choice) => ({
      key: String(choice.key),
      text: normalizeExamMath(
        choice.text
      ),
    })),
    answer: problem.answer,
    solution: normalizeExamMath(
      problem.solution
    ),
    points,
  };
}

function chooseRecord({
  records,
  preferredPoints,
  typeUseCount,
  scopeUseCount,
  avoidedTypeIds,
  usedRecordIds,
}) {
  const unusedRecords = records.filter(
    (record) =>
      !usedRecordIds.has(
        `bank:${record.generator.id}`
      )
  );
  const preferred = unusedRecords.filter(
    (record) =>
      preferredPoints.includes(
        Number(record.generator.points)
      )
  );
  const candidates =
    preferred.length
      ? preferred
      : unusedRecords;

  if (!candidates.length) {
    return null;
  }

  return shuffle(candidates).sort(
    (left, right) => {
      const leftId =
        `bank:${left.generator.id}`;
      const rightId =
        `bank:${right.generator.id}`;
      const leftScope = [
        left.bankUnit.id,
        left.bankSubunit.id,
      ].join("/");
      const rightScope = [
        right.bankUnit.id,
        right.bankSubunit.id,
      ].join("/");
      const leftAvoided =
        avoidedTypeIds.has(leftId)
          ? 1
          : 0;
      const rightAvoided =
        avoidedTypeIds.has(rightId)
          ? 1
          : 0;

      return (
        (scopeUseCount.get(
          leftScope
        ) || 0) -
          (scopeUseCount.get(
            rightScope
          ) || 0) ||
        leftAvoided -
          rightAvoided ||
        (typeUseCount.get(leftId) ||
          0) -
          (typeUseCount.get(rightId) ||
            0)
      );
    }
  )[0];
}

function drawSingleQuestions({
  records,
  count,
  difficulty,
  points,
  typeUseCount,
  scopeUseCount,
  seenPrompts,
  avoidedTypeIds,
  usedRecordIds,
}) {
  const questions = [];
  const preferredPoints =
    difficulty === "mid-high"
      ? [3]
      : [4];
  let guard = 0;

  while (
    questions.length < count &&
    guard < count * 100
  ) {
    guard += 1;

    const record = chooseRecord({
      records,
      /*
       * 우선 목표 난도 풀에서 뽑되, 고정 발문 유형 때문에
       * 중복 없는 문항 수가 부족하면 전체 풀로 넓힙니다.
       */
      preferredPoints:
        guard < count * 40
          ? preferredPoints
          : [],
      typeUseCount,
      scopeUseCount,
      avoidedTypeIds,
      usedRecordIds,
    });

    if (!record) break;

    const generated =
      generateFromRecord(record);

    if (
      !generated ||
      seenPrompts.has(
        generated.problem.prompt
      )
    ) {
      continue;
    }

    const question =
      makeSingleQuestion({
        generated,
        difficulty,
        points,
      });

    seenPrompts.add(
      generated.problem.prompt
    );
    usedRecordIds.add(
      `bank:${record.generator.id}`
    );
    typeUseCount.set(
      question.typeId,
      (typeUseCount.get(
        question.typeId
      ) || 0) + 1
    );
    const scopeKey = [
      record.bankUnit.id,
      record.bankSubunit.id,
    ].join("/");
    scopeUseCount.set(
      scopeKey,
      (scopeUseCount.get(
        scopeKey
      ) || 0) + 1
    );
    questions.push(question);
  }

  if (questions.length !== count) {
    throw new Error(
      "평가 문항을 충분히 생성하지 못했습니다."
    );
  }

  return questions;
}

function appliedCandidates({
  records,
  target,
  configs,
}) {
  return configs.flatMap(
    (config) => {
      const unitConfig =
        target.course.units.find(
          (item) =>
            item.unitId ===
            config.unitId
        );
      const bankUnitId =
        unitConfig?.bankUnitId;
      const candidates = records
        .filter(
          (record) =>
            record.bankUnit.id ===
            bankUnitId
        )
        .filter((record) => {
          const local =
            record.generator.id.startsWith(
              "local-"
            );

          if (!local) {
            return Boolean(
              config.appliedPolicy
                ?.includeBankTypes
            );
          }

          return (
            Number(
              record.generator
                .difficulty
            ) >=
            Number(
              config.appliedPolicy
                ?.minimumLocalDifficulty ||
                3
            )
          );
        });

      if (
        candidates.length <
        config.minimumAppliedPoolSize
      ) {
        throw new Error(
          `${config.courseId}/${config.unitId}: 응용 유형 풀이 ${config.minimumAppliedPoolSize}개보다 적습니다.`
        );
      }

      return candidates.map(
        (record, index) => ({
          config,
          record,
          index,
          typeId:
            `applied:${record.generator.id}`,
          referenceExamIds:
            referenceIdsForTemplate(
              config.courseId,
              config.unitId,
              index,
              5
            ),
          sourcePattern:
            config.referenceAnalysis
              .signals[
              index %
                config
                  .referenceAnalysis
                  .signals.length
            ],
        })
      );
    });
}

function drawAppliedQuestions({
  records,
  target,
  configs,
  count,
  points,
  typeUseCount,
  scopeUseCount,
  seenPrompts,
  avoidedTypeIds,
  usedRecordIds,
}) {
  if (count === 0) return [];

  const questions = [];
  const candidates =
    appliedCandidates({
      records,
      target,
      configs,
    });
  const configUseCount = new Map();
  let guard = 0;

  while (
    questions.length < count &&
    guard < count * 120
  ) {
    guard += 1;

    const candidate = shuffle(
      candidates.filter(
        (item) =>
          !usedRecordIds.has(
            `bank:${item.record.generator.id}`
          )
      )
    ).sort((left, right) => {
      const leftAvoided =
        avoidedTypeIds.has(
          left.typeId
        )
          ? 1
          : 0;
      const rightAvoided =
        avoidedTypeIds.has(
          right.typeId
        )
          ? 1
          : 0;
      const leftUsed =
        configUseCount.get(
          left.config.unitId
        ) || 0;
      const rightUsed =
        configUseCount.get(
          right.config.unitId
        ) || 0;

      return (
        leftAvoided -
          rightAvoided ||
        leftUsed - rightUsed ||
        Number(
          right.record.generator.points
        ) -
          Number(
            left.record.generator.points
          )
      );
    })[0];

    if (!candidate) break;

    const generated =
      generateFromRecord(
        candidate.record
      );

    if (
      !generated ||
      seenPrompts.has(
        generated.problem.prompt
      )
    ) {
      continue;
    }

    const question =
      makeSingleQuestion({
        generated,
        difficulty: "applied",
        points,
      });

    question.typeId =
      candidate.typeId;
    question.sourceTypeIds = [
      candidate.typeId,
    ];
    question.sourceUnitId =
      candidate.config.unitId;
    question.referenceExamIds =
      candidate.referenceExamIds;
    question.sourcePattern =
      candidate.sourcePattern;
    question.referenceArchetypeId =
      candidate.record.generator.id;
    question.estimatedMinutes = 5;
    question.reasoningSteps = [
      "문제의 조건을 해당 단원 개념으로 번역합니다.",
      "모의고사형 핵심 관계식을 세웁니다.",
      "수치를 계산하고 원래 조건에 대입해 검산합니다.",
    ];
    question.adaptationStage =
      "learned-concepts-only";

    seenPrompts.add(
      generated.problem.prompt
    );
    usedRecordIds.add(
      `bank:${candidate.record.generator.id}`
    );
    typeUseCount.set(
      candidate.typeId,
      (
        typeUseCount.get(
          candidate.typeId
        ) || 0
      ) + 1
    );
    const scopeKey = [
      candidate.record.bankUnit.id,
      candidate.record.bankSubunit.id,
    ].join("/");
    scopeUseCount.set(
      scopeKey,
      (
        scopeUseCount.get(
          scopeKey
        ) || 0
      ) + 1
    );
    configUseCount.set(
      candidate.config.unitId,
      (
        configUseCount.get(
          candidate.config.unitId
        ) || 0
      ) + 1
    );
    questions.push(question);
  }

  if (questions.length !== count) {
    throw new Error(
      "응용 평가 문항을 충분히 생성하지 못했습니다."
    );
  }

  return questions;
}

function drawAdvancedTemplateQuestions({
  configs,
  count,
  points,
  seenPrompts,
  avoidedTypeIds,
  learnedConceptIds,
}) {
  if (count === 0) return [];

  const learned = new Set(
    learnedConceptIds
  );
  const candidates =
    configs.flatMap((config) =>
      config.advancedTemplates.map(
        (template) => {
          const stage =
            selectDeepestLearnedStage(
              template.stages,
              learnedConceptIds
            );

          return {
            config,
            template,
            stage,
            typeId:
              `advanced:${template.id}`,
          };
        }
      )
    ).filter(
      (candidate) =>
        candidate.stage &&
        candidate.stage
          .requiredConceptIds.every(
            (conceptId) =>
              learned.has(conceptId)
          )
    );
  const questions = [];
  const usedTypeIds = new Set();
  const configUseCount = new Map();
  let guard = 0;

  while (
    questions.length < count &&
    guard < count * 120
  ) {
    guard += 1;

    const candidate = shuffle(
      candidates.filter(
        (item) =>
          !usedTypeIds.has(
            item.typeId
          )
      )
    ).sort((left, right) => {
      const leftAvoided =
        avoidedTypeIds.has(
          left.typeId
        )
          ? 1
          : 0;
      const rightAvoided =
        avoidedTypeIds.has(
          right.typeId
        )
          ? 1
          : 0;

      return (
        leftAvoided -
          rightAvoided ||
        (
          configUseCount.get(
            left.config.unitId
          ) || 0
        ) -
          (
            configUseCount.get(
              right.config.unitId
            ) || 0
          )
      );
    })[0];

    if (!candidate) break;

    const problem =
      generateValidProblem(
        {
          ...candidate.template,
          generate:
            candidate.stage
              .generate,
        },
        60
      );

    if (
      seenPrompts.has(
        problem.prompt
      )
    ) {
      continue;
    }

    const question = {
      questionId: randomUUID(),
      typeId: candidate.typeId,
      sourceTypeIds: [
        candidate.typeId,
      ],
      difficulty: "advanced",
      sourceCourseId:
        candidate.config.courseId,
      sourceUnitId:
        candidate.config.unitId,
      sourceSubunitId:
        "integrated",
      sourceConceptId:
        candidate.stage
          .requiredConceptIds[
          candidate.stage
            .requiredConceptIds
            .length - 1
        ] || "",
      retryTypeId: "",
      prompt: normalizeExamMath(
        problem.prompt
      ),
      inputMode:
        problem.inputMode,
      choices: (
        problem.choices || []
      ).map((choice) => ({
        key: String(choice.key),
        text: normalizeExamMath(
          choice.text
        ),
      })),
      answer: problem.answer,
      solution: normalizeExamMath(
        problem.solution
      ),
      points,
      referenceExamIds:
        candidate.template
          .referenceExamIds,
      sourcePattern:
        candidate.template
          .sourcePattern,
      referenceArchetypeId:
        candidate.template
          .referenceArchetypeId,
      estimatedMinutes:
        candidate.template
          .estimatedMinutes,
      reasoningSteps:
        candidate.template
          .reasoningSteps,
      adaptationStage:
        candidate.stage.id,
    };

    seenPrompts.add(
      problem.prompt
    );
    usedTypeIds.add(
      candidate.typeId
    );
    configUseCount.set(
      candidate.config.unitId,
      (
        configUseCount.get(
          candidate.config.unitId
        ) || 0
      ) + 1
    );
    questions.push(question);
  }

  if (questions.length !== count) {
    throw new Error(
      "심화 평가 문항을 충분히 생성하지 못했습니다."
    );
  }

  return questions;
}

function defaultLearnedConceptIds(
  target,
  scopeType
) {
  const units =
    scopeType === "course"
      ? target.course.units
      : target.course.units.slice(
          0,
          target.course.units.findIndex(
            (unit) =>
              unit.unitId ===
              target.unit?.unitId
          ) + 1
        );

  return units.flatMap((unit) =>
    unit.subunits.flatMap(
      (subunit) =>
        subunit.conceptIds
    )
  );
}

function buildAssessmentPaper({
  scopeType,
  courseId,
  unitId,
  subunitId,
  avoidedTypeIds = new Set(),
  learnedConceptIds = null,
}) {
  const plan = PAPER_PLANS[scopeType];
  const target = getCatalogTarget({
    scopeType,
    courseId,
    unitId,
    subunitId,
  });

  if (!plan || !target) {
    const error = new Error(
      "지원하지 않는 평가 범위입니다."
    );
    error.status = 404;
    throw error;
  }

  const records =
    generatorRecordsForTarget(
      target,
      scopeType
    );

  if (!records.length) {
    const error = new Error(
      "평가 문제 유형이 등록되지 않았습니다."
    );
    error.status = 404;
    throw error;
  }

  const points =
    100 / plan.questionCount;
  const typeUseCount = new Map();
  const scopeUseCount = new Map();
  const seenPrompts = new Set();
  const usedRecordIds = new Set();
  const templateConfigs =
    assessmentConfigsForScope({
      scopeType,
      courseId,
      unitId,
    });
  const availableConceptIds =
    learnedConceptIds === null
      ? defaultLearnedConceptIds(
          target,
          scopeType
        )
      : learnedConceptIds;
  const appliedQuestions =
    drawAppliedQuestions({
      records,
      target,
      configs: templateConfigs,
      count: plan.counts.applied,
      points,
      typeUseCount,
      scopeUseCount,
      seenPrompts,
      avoidedTypeIds,
      usedRecordIds,
    });
  const midHighQuestions =
    drawSingleQuestions({
      records,
      count:
        plan.counts["mid-high"],
      difficulty: "mid-high",
      points,
      typeUseCount,
      scopeUseCount,
      seenPrompts,
      avoidedTypeIds,
      usedRecordIds,
    });
  const advancedQuestions =
    drawAdvancedTemplateQuestions({
      configs: templateConfigs,
      count:
        plan.counts.advanced,
      points,
      seenPrompts,
      avoidedTypeIds,
      learnedConceptIds:
        availableConceptIds,
    });
  const questions = [
    ...midHighQuestions,
    ...appliedQuestions,
    ...advancedQuestions,
  ];

  const sourceTypeIds = questions.flatMap(
    (question) =>
      question.sourceTypeIds || [
        question.typeId,
      ]
  );

  if (
    sourceTypeIds.length !==
    new Set(sourceTypeIds).size
  ) {
    throw new Error(
      "한 평가 안에 같은 문제 유형이 중복되었습니다."
    );
  }

  questions.forEach((question) => {
    question.sourceCourseId =
      courseId;
    question.sourceUnitId =
      question.sourceUnitId ||
      unitId ||
      "";
  });

  const title =
    scopeType === "subunit"
      ? `${target.bankSubunit.label} 중간평가`
      : scopeType === "unit"
        ? `${target.bankUnit.label} 기말평가`
        : `${target.bankCourse.label} 과목 종합평가`;
  const subtitle =
    scopeType === "subunit"
      ? "10문항 · 개념평가보다 한 단계 높은 중상 난이도"
      : scopeType === "unit"
        ? "20문항 · 중상 7 · 응용 8 · 심화 5"
        : "40문항 · 중상 14 · 응용 16 · 심화 10";

  return {
    paperId: randomUUID(),
    scopeType,
    curriculumId: "kr-2022",
    courseId,
    unitId:
      scopeType === "course"
        ? null
        : unitId,
    subunitId:
      scopeType === "subunit"
        ? subunitId
        : null,
    title,
    subtitle,
    passScore: PASS_SCORE,
    timeLimitMs:
      assessmentTimeLimitMs(
        scopeType
      ),
    questions,
    totalPoints: 100,
  };
}

function progressIsCompleted(progress) {
  return Boolean(
    progress &&
      (
        progress.status ===
          "completed" ||
        progress.completionPercent >=
          100 ||
        progress.masteryGate
          ?.userCompleted
      )
  );
}

function answerHasContent(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return false;
  }

  return String(value).trim() !== "";
}

function answeredQuestionCount(attempt) {
  return (
    attempt.questions || []
  ).filter((question) =>
    answerHasContent(
      question.submittedAnswer
    )
  ).length;
}

function assessmentScopeFilter({
  userId,
  scopeType,
  courseId,
  unitId,
  subunitId,
}) {
  return {
    userId,
    scopeType,
    courseId,
    unitId:
      scopeType === "course"
        ? null
        : unitId,
    subunitId:
      scopeType === "subunit"
        ? subunitId
        : null,
  };
}

function passedAttemptMap(attempts) {
  const map = new Map();

  for (const attempt of attempts) {
    const key = assessmentKey(
      attempt
    );
    const current = map.get(key) || {
      passed: false,
      bestScore: null,
      attempts: 0,
      latestAttemptId: null,
      activeAttemptId: null,
      hasEmptyAttempt: false,
    };

    if (
      attempt.status ===
      "in-progress"
    ) {
      if (
        answeredQuestionCount(
          attempt
        ) > 0
      ) {
        current.activeAttemptId ||=
          String(attempt._id);
      } else {
        current.hasEmptyAttempt =
          true;
      }
      map.set(key, current);
      continue;
    }

    current.attempts += 1;
    current.passed ||=
      Boolean(attempt.passed);
    current.bestScore = Math.max(
      current.bestScore ?? 0,
      Number(
        attempt.scorePercent
      ) || 0
    );

    if (!current.latestAttemptId) {
      current.latestAttemptId =
        String(attempt._id);
    }

    map.set(key, current);
  }

  return map;
}

function assessmentState(
  attemptMap,
  key
) {
  return (
    attemptMap.get(key) || {
      passed: false,
      bestScore: null,
      attempts: 0,
      latestAttemptId: null,
      activeAttemptId: null,
      hasEmptyAttempt: false,
    }
  );
}

async function getAssessmentCenterData(
  userId
) {
  await expireOverdueAssessments(
    userId
  );

  const curriculumData =
    loadCurriculum();
  const [progressDocuments, attempts] =
    await Promise.all([
      ConceptProgress.find({
        userId,
        curriculumId: "kr-2022",
      }).lean(),
      AssessmentAttempt.find({
        userId,
        status: {
          $in: [
            "submitted",
            "in-progress",
            "disqualified",
          ],
        },
      })
        .sort({
          updatedAt: -1,
          submittedAt: -1,
        })
        .select(
          "scopeType courseId unitId subunitId status passed scorePercent questions.submittedAnswer"
        )
        .lean(),
    ]);
  const progressMap = new Map(
    progressDocuments.map(
      (progress) => [
        [
          progress.courseId,
          progress.unitId,
          progress.conceptId,
        ].join("/"),
        progress,
      ]
    )
  );
  const attemptMap =
    passedAttemptMap(attempts);

  const courses =
    ASSESSMENT_CATALOG.map(
      (courseConfig) => {
        const curriculumCourse =
          curriculumData.courses.find(
            (course) =>
              course.id ===
              courseConfig.courseId
          );
        const bankCourse =
          findBankCourse(
            courseConfig.bankCourseId
          );

        const units =
          courseConfig.units.map(
            (unitConfig) => {
              const curriculumUnit =
                curriculumCourse?.units.find(
                  (unit) =>
                    unit.id ===
                    unitConfig.unitId
                );
              const bankUnit =
                bankCourse?.units.find(
                  (unit) =>
                    unit.id ===
                    unitConfig.bankUnitId
                );

              const subunits =
                unitConfig.subunits.map(
                  (subunitConfig) => {
                    const bankSubunit =
                      bankUnit?.subs.find(
                        (subunit) =>
                          subunit.id ===
                          subunitConfig.id
                      );
                    const concepts =
                      subunitConfig.conceptIds.map(
                        (conceptId) => {
                          const concept =
                            curriculumUnit?.concepts.find(
                              (item) =>
                                item.id ===
                                conceptId
                            );
                          const progress =
                            progressMap.get(
                              [
                                courseConfig.courseId,
                                unitConfig.unitId,
                                conceptId,
                              ].join("/")
                            );

                          return {
                            id: conceptId,
                            title:
                              concept?.title ||
                              conceptId,
                            completed:
                              progressIsCompleted(
                                progress
                              ),
                          };
                        }
                      );
                    const state =
                      assessmentState(
                        attemptMap,
                        assessmentKey({
                          scopeType:
                            "subunit",
                          courseId:
                            courseConfig.courseId,
                          unitId:
                            unitConfig.unitId,
                          subunitId:
                            subunitConfig.id,
                        })
                      );
                    const unlocked =
                      concepts.length > 0 &&
                      concepts.every(
                        (concept) =>
                          concept.completed
                      );

                    return {
                      id:
                        subunitConfig.id,
                      title:
                        bankSubunit?.label ||
                        subunitConfig.id,
                      concepts,
                      unlocked:
                        unlocked ||
                        state.passed,
                      lockReason: unlocked
                        ? null
                        : "이 소단원에 연결된 개념을 모두 완료하면 열립니다.",
                      ...state,
                    };
                  }
                );

              const unitConcepts =
                curriculumUnit?.concepts ||
                [];
              const conceptsCompleted =
                unitConcepts.length >
                  0 &&
                unitConcepts.every(
                  (concept) =>
                    progressIsCompleted(
                      progressMap.get(
                        [
                          courseConfig.courseId,
                          unitConfig.unitId,
                          concept.id,
                        ].join("/")
                      )
                    )
                );
              const midtermsPassed =
                subunits.every(
                  (subunit) =>
                    subunit.passed
                );
              const state =
                assessmentState(
                  attemptMap,
                  assessmentKey({
                    scopeType: "unit",
                    courseId:
                      courseConfig.courseId,
                    unitId:
                      unitConfig.unitId,
                  })
                );
              const unlocked =
                conceptsCompleted &&
                midtermsPassed;

              return {
                id:
                  unitConfig.unitId,
                title:
                  curriculumUnit?.title ||
                  bankUnit?.label ||
                  unitConfig.unitId,
                bankUnitId:
                  unitConfig.bankUnitId,
                subunits,
                conceptsCompleted,
                midtermsPassed,
                final: {
                  unlocked:
                    unlocked ||
                    state.passed,
                  lockReason:
                    !conceptsCompleted
                      ? "대단원의 개념을 모두 완료해야 합니다."
                      : !midtermsPassed
                        ? "소단원 중간평가를 모두 통과해야 합니다."
                        : null,
                  ...state,
                },
              };
            }
          );
        const state =
          assessmentState(
            attemptMap,
            assessmentKey({
              scopeType: "course",
              courseId:
                courseConfig.courseId,
            })
          );
        const unitFinalsPassed =
          units.every(
            (unit) =>
              unit.final.passed
          );
        const courseFinal = {
          unlocked:
            unitFinalsPassed ||
            state.passed,
          lockReason:
            unitFinalsPassed
              ? null
              : "모든 대단원 기말평가를 통과해야 합니다.",
          ...state,
        };
        const unlockedAssessmentCount =
          units.reduce(
            (sum, unit) =>
              sum +
              unit.subunits.filter(
                (subunit) =>
                  subunit.unlocked
              ).length +
              Number(
                unit.final.unlocked
              ),
            0
          ) +
          Number(
            courseFinal.unlocked
          );

        return {
          id:
            courseConfig.courseId,
          title:
            curriculumCourse
              ?.officialTitle ||
            bankCourse?.label ||
            courseConfig.courseId,
          units,
          courseFinal,
          available:
            unlockedAssessmentCount >
            0,
          unlockedAssessmentCount,
          lockReason:
            unlockedAssessmentCount >
            0
              ? null
              : "이 과목의 개념을 모두 학습하면 소단원 평가부터 차례로 열립니다.",
        };
      }
    );

  const visibleCourses =
    courses.filter(
      (course) =>
        course.available
    );
  const totalAssessments =
    courses.reduce(
      (sum, course) =>
        sum +
        course.units.reduce(
          (
            unitSum,
            unit
          ) =>
            unitSum +
            unit.subunits.length +
            1,
          0
        ) +
        1,
      0
    );
  const visibleAssessments =
    courses.reduce(
      (sum, course) =>
        sum +
        course.units.reduce(
          (
            unitSum,
            unit
          ) =>
            unitSum +
            unit.subunits.filter(
              (subunit) =>
                subunit.unlocked
            ).length +
            Number(
              unit.final.unlocked
            ),
          0
        ) +
        Number(
          course.courseFinal
            .unlocked
        ),
      0
    );

  return {
    passScore: PASS_SCORE,
    courses,
    visibleCourses,
    lockedCount: Math.max(
      0,
      totalAssessments -
        visibleAssessments
    ),
  };
}

function findCenterTarget(
  center,
  {
    scopeType,
    courseId,
    unitId,
    subunitId,
  }
) {
  const course =
    center.courses.find(
      (item) =>
        item.id === courseId
    );

  if (!course) return null;

  if (scopeType === "course") {
    return course.courseFinal;
  }

  const unit = course.units.find(
    (item) =>
      item.id === unitId
  );

  if (!unit) return null;

  if (scopeType === "unit") {
    return unit.final;
  }

  return unit.subunits.find(
    (item) =>
      item.id === subunitId
  );
}

async function createAssessmentAttempt({
  userId,
  scopeType,
  courseId,
  unitId,
  subunitId,
}) {
  const center =
    await getAssessmentCenterData(
      userId
    );
  const centerTarget =
    findCenterTarget(center, {
      scopeType,
      courseId,
      unitId,
      subunitId,
    });

  if (!centerTarget) {
    const error = new Error(
      "평가 범위를 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  if (!centerTarget.unlocked) {
    const error = new Error(
      centerTarget.lockReason ||
        "아직 응시할 수 없는 평가입니다."
    );
    error.status = 403;
    throw error;
  }

  const scopeFilter =
    assessmentScopeFilter({
      userId,
      scopeType,
      courseId,
      unitId,
      subunitId,
    });
  const inProgressAttempts =
    await AssessmentAttempt.find({
      ...scopeFilter,
      status: "in-progress",
    }).sort({
      updatedAt: -1,
      createdAt: -1,
    });
  const resumableAttempt =
    inProgressAttempts.find(
      (attempt) =>
        answeredQuestionCount(
          attempt
        ) > 0
    );

  if (resumableAttempt) {
    await AssessmentAttempt.updateMany(
      {
        ...scopeFilter,
        status: "in-progress",
        _id: {
          $ne:
            resumableAttempt._id,
        },
      },
      {
        $set: {
          status: "abandoned",
        },
      }
    );

    return resumableAttempt;
  }

  if (inProgressAttempts.length) {
    await AssessmentAttempt.updateMany(
      {
        ...scopeFilter,
        status: "in-progress",
      },
      {
        $set: {
          status: "abandoned",
        },
      }
    );
  }

  const recentAttempts =
    await AssessmentAttempt.find({
      ...scopeFilter,
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .select(
        "questions.typeId questions.sourceTypeIds"
      )
      .lean();
  const avoidedTypeIds = new Set(
    recentAttempts.flatMap(
      (attempt) =>
        attempt.questions.flatMap(
          (question) =>
            question.sourceTypeIds?.length
              ? question.sourceTypeIds
              : [question.typeId]
        )
    )
  );
  const centerCourse =
    center.courses.find(
      (course) =>
        course.id === courseId
    );
  const learnedConceptIds =
    centerCourse?.units.flatMap(
      (unit) =>
        unit.subunits.flatMap(
          (subunit) =>
            subunit.concepts
              .filter(
                (concept) =>
                  concept.completed
              )
              .map(
                (concept) =>
                  concept.id
              )
        )
    ) || [];
  const paper =
    buildAssessmentPaper({
      scopeType,
      courseId,
      unitId,
      subunitId,
      avoidedTypeIds,
      learnedConceptIds,
    });

  return AssessmentAttempt.create({
    userId,
    ...paper,
  });
}

function isCorrectAssessmentAnswer(
  expected,
  submitted
) {
  return answersEquivalent(
    expected,
    submitted
  );
}

function applyAssessmentAnswers(
  attempt,
  answers = {}
) {
  for (const question of
    attempt.questions) {
    if (
      Object.prototype.hasOwnProperty.call(
        answers,
        question.questionId
      )
    ) {
      question.submittedAnswer =
        answers[question.questionId];
    }
  }
}

async function disqualifyAssessmentDocument(
  attempt,
  answers = {}
) {
  if (
    attempt.status !==
    "in-progress"
  ) {
    return attempt;
  }

  applyAssessmentAnswers(
    attempt,
    answers
  );

  const timeLimitMs =
    attemptTimeLimitMs(attempt);
  const deadline = new Date(
    attemptDeadlineMs(attempt)
  );

  attempt.timeLimitMs =
    timeLimitMs;
  attempt.earnedPoints = 0;
  attempt.scorePercent = 0;
  attempt.passed = false;
  attempt.status =
    "disqualified";
  attempt.disqualifiedReason =
    "time-limit";
  attempt.submittedAt =
    deadline;
  attempt.elapsedTimeMs =
    timeLimitMs;
  attempt.lastSavedAt =
    new Date();

  await attempt.save();
  return attempt;
}

async function expireOverdueAssessments(
  userId
) {
  const attempts =
    await AssessmentAttempt.find({
      userId,
      status: "in-progress",
    });
  const now = Date.now();

  for (const attempt of
    attempts) {
    if (
      assessmentIsOverdue(
        attempt,
        now
      )
    ) {
      await disqualifyAssessmentDocument(
        attempt
      );
    }
  }
}

async function saveAssessmentDraft({
  userId,
  attemptId,
  answers = {},
}) {
  if (
    !mongoose.isValidObjectId(
      attemptId
    )
  ) {
    const error = new Error(
      "평가 기록을 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  const attempt =
    await AssessmentAttempt.findOne({
      _id: attemptId,
      userId,
    });

  if (!attempt) {
    const error = new Error(
      "저장할 수 있는 진행 중 평가를 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  if (
    attempt.status !==
    "in-progress"
  ) {
    return {
      status: attempt.status,
      expired:
        attempt.status ===
        "disqualified",
      redirectUrl:
        `/assessments/${attempt._id}`,
    };
  }

  if (
    assessmentIsOverdue(
      attempt
    )
  ) {
    await disqualifyAssessmentDocument(
      attempt,
      answers
    );

    return {
      status:
        attempt.status,
      expired: true,
      redirectUrl:
        `/assessments/${attempt._id}`,
      elapsedTimeMs:
        attempt.elapsedTimeMs,
    };
  }

  applyAssessmentAnswers(
    attempt,
    answers
  );

  const serverElapsed = Math.max(
    0,
    Date.now() -
      new Date(
        attempt.startedAt
      ).getTime()
  );

  attempt.elapsedTimeMs = Math.max(
    Number(
      attempt.elapsedTimeMs
    ) || 0,
    Math.min(
      serverElapsed,
      attemptTimeLimitMs(
        attempt
      )
    )
  );
  attempt.lastSavedAt = new Date();
  await attempt.save();

  return {
    savedAt:
      attempt.lastSavedAt,
    elapsedTimeMs:
      attempt.elapsedTimeMs,
  };
}

async function expireAssessmentAttempt({
  userId,
  attemptId,
  answers = {},
}) {
  if (
    !mongoose.isValidObjectId(
      attemptId
    )
  ) {
    const error = new Error(
      "평가 기록을 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  const attempt =
    await AssessmentAttempt.findOne({
      _id: attemptId,
      userId,
    });

  if (!attempt) {
    const error = new Error(
      "평가 기록을 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  if (
    attempt.status !==
    "in-progress"
  ) {
    return attempt;
  }

  if (
    !assessmentIsOverdue(
      attempt
    )
  ) {
    const error = new Error(
      "아직 제한 시간이 남아 있습니다."
    );
    error.status = 409;
    error.remainingTimeMs =
      Math.max(
        0,
        attemptDeadlineMs(
          attempt
        ) - Date.now()
      );
    throw error;
  }

  return disqualifyAssessmentDocument(
    attempt,
    answers
  );
}

async function recordAssessmentWrongAnswers(
  attempt
) {
  const wrongQuestions =
    attempt.questions.filter(
      (question) =>
        question.isCorrect === false
    );

  for (const question of
    wrongQuestions) {
    const conceptId =
      question.sourceConceptId ||
      `${attempt.courseId}-assessment`;
    const unitId =
      question.sourceUnitId ||
      attempt.unitId ||
      "assessment";
    const problem =
      await Problem.findOneAndUpdate(
        {
          externalId:
            `assessment:${attempt.paperId}:${question.questionId}`,
        },
        {
          $set: {
            curriculumId:
              attempt.curriculumId,
            courseId:
              attempt.courseId,
            unitId,
            conceptIds: [
              conceptId,
            ],
            primaryConceptId:
              conceptId,
            source: {
              type: "custom",
            },
            questionType:
              question.inputMode ===
              "multiple-choice"
                ? "multiple-choice"
                : "short-answer",
            stem: question.prompt,
            choices:
              question.choices || [],
            correctAnswer:
              question.answer,
            difficulty:
              question.difficulty ===
              "advanced"
                ? 5
                : question.difficulty ===
                    "applied"
                  ? 4
                  : 3,
            estimatedTimeSeconds:
              Number(
                question.estimatedMinutes
              )
                ? Number(
                    question.estimatedMinutes
                  ) * 60
                : 180,
            score:
              Number(
                question.points
              ) || 0,
            tags: [
              "assessment",
              attempt.scopeType,
              question.difficulty,
            ],
            isPublished: true,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        }
      );
    const attemptNumber =
      (
        await ProblemAttempt.countDocuments({
          userId:
            attempt.userId,
          problemId: problem._id,
        })
      ) + 1;

    await ProblemAttempt.create({
      userId: attempt.userId,
      problemId: problem._id,
      curriculumId:
        attempt.curriculumId,
      courseId: attempt.courseId,
      unitId,
      conceptId,
      attemptNumber,
      submittedAnswer:
        question.submittedAnswer ===
          undefined ||
        question.submittedAnswer ===
          null ||
        question.submittedAnswer ===
          ""
          ? "미응답"
          : question.submittedAnswer,
      problemSnapshot: {
        typeId:
          question.retryTypeId ||
          null,
        stem: question.prompt,
        choices:
          question.choices || [],
        solution:
          question.solution || "",
        difficulty:
          question.difficulty ===
          "advanced"
            ? 5
            : question.difficulty ===
                "applied"
              ? 4
              : 3,
      },
      isCorrect: false,
      score: 0,
      maxScore:
        Number(
          question.points
        ) || 0,
      responseTimeMs:
        Math.round(
          (
            Number(
              attempt.elapsedTimeMs
            ) || 0
          ) /
            Math.max(
              1,
              attempt.questions.length
            )
        ),
      errorAnalysis: {
        errorType: "unknown",
        relatedConceptId:
          conceptId,
      },
      review: {
        status: "pending",
      },
      submittedAt:
        attempt.submittedAt ||
        new Date(),
    });
  }
}

async function submitAssessmentAttempt({
  userId,
  attemptId,
  answers = {},
}) {
  if (
    !mongoose.isValidObjectId(
      attemptId
    )
  ) {
    const error = new Error(
      "평가 기록을 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  const attempt =
    await AssessmentAttempt.findOne({
      _id: attemptId,
      userId,
    });

  if (!attempt) {
    const error = new Error(
      "평가 기록을 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  if (
    attempt.status ===
      "submitted" ||
    attempt.status ===
      "disqualified"
  ) {
    return attempt;
  }

  if (
    assessmentIsOverdue(
      attempt
    )
  ) {
    return disqualifyAssessmentDocument(
      attempt,
      answers
    );
  }

  let earnedPoints = 0;

  for (const question of
    attempt.questions) {
    const hasSubmitted =
      Object.prototype.hasOwnProperty.call(
        answers,
        question.questionId
      );
    const submitted = hasSubmitted
      ? answers[
          question.questionId
        ]
      : question.submittedAnswer;
    const correct =
      isCorrectAssessmentAnswer(
        question.answer,
        submitted
      );

    question.submittedAnswer =
      submitted === undefined
        ? ""
        : submitted;
    question.isCorrect = correct;

    if (correct) {
      earnedPoints +=
        Number(question.points) ||
        0;
    }
  }

  attempt.earnedPoints =
    Math.round(
      earnedPoints * 100
    ) / 100;
  attempt.scorePercent =
    attempt.totalPoints
      ? Math.round(
          (attempt.earnedPoints /
            attempt.totalPoints) *
            100
        )
      : 0;
  attempt.passed =
    attempt.scorePercent >=
    attempt.passScore;
  attempt.status = "submitted";
  attempt.submittedAt = new Date();
  attempt.elapsedTimeMs =
    Math.min(
      attemptTimeLimitMs(
        attempt
      ),
      Math.max(
        0,
        attempt.submittedAt.getTime() -
          new Date(
            attempt.startedAt
          ).getTime()
      )
    );
  attempt.lastSavedAt =
    attempt.submittedAt;

  await attempt.save();
  await recordAssessmentWrongAnswers(
    attempt
  );
  return attempt;
}

async function getAssessmentAttempt({
  userId,
  attemptId,
}) {
  if (
    !mongoose.isValidObjectId(
      attemptId
    )
  ) {
    const error = new Error(
      "평가 기록을 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  let attempt =
    await AssessmentAttempt.findOne({
      _id: attemptId,
      userId,
    });

  if (!attempt) {
    const error = new Error(
      "평가 기록을 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  if (
    assessmentIsOverdue(
      attempt
    )
  ) {
    attempt =
      await disqualifyAssessmentDocument(
        attempt
      );
  }

  attempt = attempt.toObject();
  attempt.timeLimitMs =
    attemptTimeLimitMs(
      attempt
    );
  attempt.deadlineAt =
    new Date(
      attemptDeadlineMs(
        attempt
      )
    );

  attempt.questions = (
    attempt.questions || []
  ).map((question) => ({
    ...question,
    prompt: normalizeExamMath(
      question.prompt
    ),
    choices: (
      question.choices || []
    ).map((choice) => ({
      ...choice,
      text: normalizeExamMath(
        choice.text
      ),
    })),
    solution: normalizeExamMath(
      question.solution
    ),
  }));

  return attempt;
}

function applyAssessmentGatesToLearningData(
  learningData,
  attempts = []
) {
  const attemptMap =
    passedAttemptMap(attempts);
  const supportedCourseIds =
    new Set(
      ASSESSMENT_CATALOG.map(
        (course) =>
          course.courseId
      )
    );

  for (const course of
    learningData.courses || []) {
    if (
      !supportedCourseIds.has(
        course.id
      )
    ) {
      continue;
    }

    for (const unit of
      course.units || []) {
      const state =
        assessmentState(
          attemptMap,
          assessmentKey({
            scopeType: "unit",
            courseId: course.id,
            unitId: unit.id,
          })
        );
      const conceptProgress =
        unit.progress;

      unit.conceptProgress =
        conceptProgress;
      unit.assessmentPassed =
        state.passed;
      unit.isCompleted =
        conceptProgress >= 100 &&
        state.passed;
      unit.assessmentRequired =
        conceptProgress >= 100 &&
        !state.passed;

      if (
        conceptProgress >= 100 &&
        !state.passed
      ) {
        unit.progress = 95;
      }
    }

    const state =
      assessmentState(
        attemptMap,
        assessmentKey({
          scopeType: "course",
          courseId: course.id,
        })
      );
    const conceptProgress =
      course.progress;

    course.conceptProgress =
      conceptProgress;
    course.assessmentPassed =
      state.passed;
    course.isCompleted =
      conceptProgress >= 100 &&
      state.passed;
    course.assessmentRequired =
      conceptProgress >= 100 &&
      !state.passed;

    if (
      conceptProgress >= 100 &&
      !state.passed
    ) {
      course.progress = 95;
    }
  }

  return learningData;
}

module.exports = {
  PASS_SCORE,
  ASSESSMENT_CATALOG,
  DIFFICULTY_LABELS,
  PAPER_PLANS,
  CHOICE_MARKERS,
  choiceMarker,
  assessmentKey,
  normalizeExamMath,
  buildAssessmentPaper,
  isCorrectAssessmentAnswer,
  getAssessmentCenterData,
  createAssessmentAttempt,
  expireAssessmentAttempt,
  submitAssessmentAttempt,
  saveAssessmentDraft,
  getAssessmentAttempt,
  applyAssessmentGatesToLearningData,
};
