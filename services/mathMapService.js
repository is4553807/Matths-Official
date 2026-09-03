const mongoose = require("mongoose");
const { Problem, ProblemAttempt } = require("../models/matthsModel");
const { loadCurriculum } = require("./curriculumService");
const {
  CALCULUS_1_EDGES,
  GRAPH_VERSION,
  MASTERY_MODEL_NAME,
  MASTERY_MODEL_VERSION,
} = require("./mathMapGraphCatalog");

const MAX_VALID_ATTEMPTS = 20;
const MIN_VALID_ATTEMPTS = 5;
const HIGH_CONFIDENCE_TYPE_COUNT = 3;
const RETRY_RECOVERY_MULTIPLIER = 0.75;
const MIN_RECENCY_MULTIPLIER = 0.65;

const CORRECT_DIFFICULTY_WEIGHTS = Object.freeze([0, 0.8, 0.9, 1, 1.1, 1.2]);
const WRONG_DIFFICULTY_WEIGHTS = Object.freeze([0, 1.2, 1.1, 1, 0.9, 0.8]);

const STATUS_LABELS = Object.freeze({
  MASTERED: "숙달",
  DEVELOPING: "성장 중",
  WEAK: "보완 필요",
  UNKNOWN: "데이터 부족",
});

const CONFIDENCE_LABELS = Object.freeze({
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
  UNKNOWN: "판단 전",
});

let graphCache = null;
let graphCacheCurriculum = null;

function uniqueObjectIds(values) {
  const ids = [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
  return ids.map((id) => {
    if (!mongoose.isValidObjectId(id)) throw new TypeError("studentUserIds must contain valid ObjectIds");
    return new mongoose.Types.ObjectId(id);
  });
}

function round(value, digits = 0) {
  if (!Number.isFinite(Number(value))) return null;
  const multiplier = 10 ** digits;
  return Math.round(Number(value) * multiplier) / multiplier;
}

function average(values, digits = 0) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  if (!valid.length) return null;
  return round(valid.reduce((sum, value) => sum + Number(value), 0) / valid.length, digits);
}

function clampDifficulty(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : 1;
}

function buildGraph() {
  const curriculum = loadCurriculum();
  // curriculumService returns the same parsed object until its cache is
  // explicitly cleared. Key this derived cache by that identity so a reload
  // still rebuilds the graph while normal requests avoid reconstructing it.
  if (graphCache && graphCacheCurriculum === curriculum) return graphCache;
  const nodes = [];
  const nodeById = new Map();

  curriculum.courses.forEach((course, courseIndex) => {
    course.units.forEach((unit, unitIndex) => {
      unit.concepts.forEach((concept, conceptIndex) => {
        const node = Object.freeze({
          id: concept.id,
          title: concept.title,
          standardCode: concept.standardCode || null,
          achievementStandard: concept.achievementStandard || null,
          curriculumId: curriculum.curriculum.id,
          courseId: course.id,
          courseTitle: course.officialTitle,
          unitId: unit.id,
          unitTitle: unit.title,
          order: [courseIndex + 1, Number(unit.order) || unitIndex + 1, Number(concept.order) || conceptIndex + 1],
          sourceFile: course.sourceFile,
          source: {
            type: "national-curriculum",
            publisher: "교육부",
            title: "교육부 고시 제2022-33호 [별책 8] 수학과 교육과정",
            sourceFile: course.sourceFile,
          },
          editorialStatus: "verified",
        });
        nodes.push(node);
        nodeById.set(node.id, node);
      });
    });
  });

  const edges = CALCULUS_1_EDGES.filter((edge) => edge.reviewStatus === "verified");
  const incomingById = new Map();
  const outgoingById = new Map();
  edges.forEach((edge) => {
    if (!incomingById.has(edge.to)) incomingById.set(edge.to, []);
    if (!outgoingById.has(edge.from)) outgoingById.set(edge.from, []);
    incomingById.get(edge.to).push(edge);
    outgoingById.get(edge.from).push(edge);
  });

  graphCacheCurriculum = curriculum;
  graphCache = { curriculum, nodes, nodeById, edges, incomingById, outgoingById };
  return graphCache;
}

function validateMathMapGraph() {
  const graph = buildGraph();
  const errors = [];

  graph.nodes.forEach((node, index) => {
    const prefix = `node[${index}] ${node.id || "(missing id)"}`;
    if (!node.id || !node.title || !node.curriculumId || !node.courseId || !node.unitId) {
      errors.push(`${prefix}: required identity metadata is missing`);
    }
    if (!node.standardCode || !node.achievementStandard) {
      errors.push(`${prefix}: achievement standard metadata is missing`);
    }
    if (!node.source?.type || !node.source?.publisher || node.editorialStatus !== "verified") {
      errors.push(`${prefix}: source or editorial verification metadata is missing`);
    }
  });

  graph.edges.forEach((edge, index) => {
    const prefix = `edge[${index}] ${edge.from} -> ${edge.to}`;
    if (!graph.nodeById.has(edge.from)) errors.push(`${prefix}: from node is missing`);
    if (!graph.nodeById.has(edge.to)) errors.push(`${prefix}: to node is missing`);
    if (edge.from === edge.to) errors.push(`${prefix}: self edge is not allowed`);
    if (!edge.rationale) errors.push(`${prefix}: rationale is missing`);
    if (!edge.evidence?.length) errors.push(`${prefix}: evidence is missing`);
    if (!edge.reviewedBy || !edge.reviewedAt) errors.push(`${prefix}: review metadata is missing`);
    if (!["hard-prerequisite", "supporting-prerequisite", "recommended-sequence", "related"].includes(edge.type)) {
      errors.push(`${prefix}: unsupported edge type`);
    }
  });

  const hardEdges = graph.edges.filter((edge) => edge.type === "hard-prerequisite");
  const hardOutgoing = new Map();
  hardEdges.forEach((edge) => {
    if (!hardOutgoing.has(edge.from)) hardOutgoing.set(edge.from, []);
    hardOutgoing.get(edge.from).push(edge.to);
  });
  const visiting = new Set();
  const visited = new Set();
  function visit(nodeId) {
    if (visiting.has(nodeId)) {
      errors.push(`hard-prerequisite cycle includes ${nodeId}`);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    (hardOutgoing.get(nodeId) || []).forEach(visit);
    visiting.delete(nodeId);
    visited.add(nodeId);
  }
  graph.nodes.forEach((node) => visit(node.id));

  return {
    valid: errors.length === 0,
    errors,
    graphVersion: GRAPH_VERSION,
    nodeCount: graph.nodes.length,
    verifiedEdgeCount: graph.edges.length,
  };
}

function recencyMultiplier(index, length) {
  if (length <= 1) return 1;
  return 1 - ((1 - MIN_RECENCY_MULTIPLIER) * index) / (length - 1);
}

function confidenceFor(attemptCount, typeCount) {
  if (attemptCount < MIN_VALID_ATTEMPTS) return "UNKNOWN";
  if (attemptCount < 10) return "LOW";
  if (attemptCount < MAX_VALID_ATTEMPTS) return "MEDIUM";
  return typeCount >= HIGH_CONFIDENCE_TYPE_COUNT ? "HIGH" : "MEDIUM";
}

function confidenceScore(confidence) {
  return { UNKNOWN: 0, LOW: 0.35, MEDIUM: 0.65, HIGH: 1 }[confidence] || 0;
}

function statusFor(mastery, attemptCount) {
  if (attemptCount < MIN_VALID_ATTEMPTS || mastery === null) return "UNKNOWN";
  if (mastery >= 80) return "MASTERED";
  if (mastery >= 50) return "DEVELOPING";
  return "WEAK";
}

function calculateConceptMastery(attempts, problemById) {
  const validAttempts = attempts.slice(0, MAX_VALID_ATTEMPTS);
  let positiveEvidence = 0;
  let negativeEvidence = 0;
  let correctCount = 0;
  let retryAttemptedCount = 0;
  let retryRecoveredCount = 0;
  let totalResponseTimeMs = 0;
  let responseTimeCount = 0;
  const problemTypes = new Set();
  const difficulty = {
    low: { total: 0, correct: 0 },
    high: { total: 0, correct: 0 },
  };

  validAttempts.forEach((attempt, index) => {
    const problem = problemById.get(String(attempt.problemId));
    const level = clampDifficulty(attempt.problemSnapshot?.difficulty ?? problem?.difficulty);
    const typeId = String(
      attempt.problemSnapshot?.typeId || problem?.tags?.[0] || problem?.questionType || "generic"
    );
    const recency = recencyMultiplier(index, validAttempts.length);
    problemTypes.add(typeId);
    if (Number(attempt.responseTimeMs) > 0) {
      totalResponseTimeMs += Number(attempt.responseTimeMs);
      responseTimeCount += 1;
    }

    const bucket = level <= 2 ? difficulty.low : difficulty.high;
    bucket.total += 1;
    if (attempt.isCorrect) {
      correctCount += 1;
      bucket.correct += 1;
      positiveEvidence += CORRECT_DIFFICULTY_WEIGHTS[level] * recency;
    } else {
      negativeEvidence += WRONG_DIFFICULTY_WEIGHTS[level] * recency;
    }

    if (attempt.retryAttempted) retryAttemptedCount += 1;
    if (attempt.retrySucceeded) {
      retryRecoveredCount += 1;
      positiveEvidence += RETRY_RECOVERY_MULTIPLIER * recency;
    }
  });

  const rawMastery = round(
    (100 * (2 + positiveEvidence)) / (4 + positiveEvidence + negativeEvidence),
    1
  );
  const confidence = confidenceFor(validAttempts.length, problemTypes.size);
  const mastery = validAttempts.length >= MIN_VALID_ATTEMPTS ? rawMastery : null;
  const status = statusFor(mastery, validAttempts.length);

  return {
    mastery,
    status,
    statusLabel: STATUS_LABELS[status],
    confidence,
    confidenceLabel: CONFIDENCE_LABELS[confidence],
    confidenceScore: confidenceScore(confidence),
    evidence: {
      attemptCount: validAttempts.length,
      correctCount,
      incorrectCount: validAttempts.length - correctCount,
      firstAttemptAccuracy: validAttempts.length ? round((correctCount / validAttempts.length) * 100) : null,
      positiveEvidence: round(positiveEvidence, 2),
      negativeEvidence: round(negativeEvidence, 2),
      problemTypeCount: problemTypes.size,
      retryAttemptedCount,
      retryRecoveredCount,
      averageResponseTimeMs: responseTimeCount ? Math.round(totalResponseTimeMs / responseTimeCount) : null,
      lowDifficulty: difficulty.low,
      highDifficulty: difficulty.high,
      lastStudiedAt: validAttempts[0]?.submittedAt || null,
      maxAttemptWindow: MAX_VALID_ATTEMPTS,
    },
  };
}

async function loadAttemptGroups(userIds) {
  if (!userIds.length) return [];
  const groups = await ProblemAttempt.aggregate([
    {
      $match: {
        userId: { $in: userIds },
        reviewSourceAttemptId: null,
        attemptNumber: 1,
        conceptId: { $type: "string", $ne: "" },
      },
    },
    { $sort: { submittedAt: -1, _id: -1 } },
    {
      $group: {
        _id: { userId: "$userId", conceptId: "$conceptId" },
        attempts: {
          $push: {
            _id: "$_id",
            problemId: "$problemId",
            // Mastery only consumes these two snapshot fields. Stems, solutions
            // and visualizations must not be transferred for every historical attempt.
            problemSnapshot: {
              typeId: "$problemSnapshot.typeId",
              difficulty: "$problemSnapshot.difficulty",
            },
            isCorrect: "$isCorrect",
            responseTimeMs: "$responseTimeMs",
            submittedAt: "$submittedAt",
          },
        },
      },
    },
    { $project: { attempts: { $slice: ["$attempts", MAX_VALID_ATTEMPTS] } } },
  ]);

  const attemptIds = groups.flatMap((group) => group.attempts.map((attempt) => attempt._id));
  const problemIds = [...new Map(groups.flatMap((group) =>
    group.attempts.map((attempt) => [String(attempt.problemId), attempt.problemId])
  )).values()];
  const [retryRows, problems] = await Promise.all([
    attemptIds.length
      ? ProblemAttempt.aggregate([
          { $match: { reviewSourceAttemptId: { $in: attemptIds } } },
          {
            $group: {
              _id: "$reviewSourceAttemptId",
              succeeded: { $max: { $cond: ["$isCorrect", 1, 0] } },
            },
          },
        ])
      : [],
    problemIds.length
      ? Problem.find({ _id: { $in: problemIds } })
          .select("difficulty tags questionType primaryConceptId")
          .lean()
      : [],
  ]);
  const retriedIds = new Set(retryRows.map((row) => String(row._id)));
  const successfulRetryIds = new Set(retryRows.filter((row) => row.succeeded).map((row) => String(row._id)));
  const problemById = new Map(problems.map((problem) => [String(problem._id), problem]));

  groups.forEach((group) => {
    group.attempts = group.attempts.filter((attempt) => {
      const problem = problemById.get(String(attempt.problemId));
      return !problem?.primaryConceptId || problem.primaryConceptId === String(group._id.conceptId);
    });
    group.attempts.forEach((attempt) => {
      attempt.retryAttempted = retriedIds.has(String(attempt._id));
      attempt.retrySucceeded = successfulRetryIds.has(String(attempt._id));
    });
  });
  return { groups: groups.filter((group) => group.attempts.length), problemById };
}

function decorateConcept(node, mastery, graph) {
  const prerequisites = (graph.incomingById.get(node.id) || []).map((edge) => ({
    ...edge,
    concept: graph.nodeById.get(edge.from),
  }));
  const unlocks = (graph.outgoingById.get(node.id) || []).map((edge) => ({
    ...edge,
    concept: graph.nodeById.get(edge.to),
  }));
  return { ...node, ...mastery, prerequisites, unlocks };
}

function findBottlenecks(concepts) {
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  return concepts
    .filter((concept) => concept.status === "WEAK" && concept.confidence !== "UNKNOWN" && concept.unlocks.length)
    .map((concept) => {
      const affected = concept.unlocks
        .map((edge) => ({ edge, concept: byId.get(edge.to) }))
        .filter(({ concept: target }) => target && ["WEAK", "DEVELOPING"].includes(target.status));
      const impact = affected.reduce((sum, item) => sum + Number(item.edge.weight || 0), 0);
      const score = round(
        (1 - Number(concept.mastery || 0) / 100) * concept.confidenceScore * Math.log2(1 + impact),
        3
      );
      return {
        conceptId: concept.id,
        conceptTitle: concept.title,
        mastery: concept.mastery,
        confidence: concept.confidence,
        confidenceLabel: concept.confidenceLabel,
        score,
        affectedConcepts: affected.map(({ edge, concept: target }) => ({
          id: target.id,
          title: target.title,
          status: target.status,
          edgeType: edge.type,
        })),
      };
    })
    .filter((item) => item.affectedConcepts.length)
    .sort((left, right) => right.score - left.score);
}

function recommendedProblemMix(mastery) {
  if (mastery === null) {
    return { total: 6, diagnostic: true, difficulties: [{ level: 1, count: 2 }, { level: 2, count: 2 }, { level: 3, count: 2 }], retryCount: 0 };
  }
  if (mastery < 40) {
    return { total: 15, diagnostic: false, difficulties: [{ level: 1, count: 8 }, { level: 2, count: 5 }, { level: 3, count: 2 }], retryCount: 0 };
  }
  if (mastery < 60) {
    return { total: 15, diagnostic: false, difficulties: [{ level: 1, count: 3 }, { level: 2, count: 6 }, { level: 3, count: 4 }], retryCount: 2 };
  }
  if (mastery < 80) {
    return { total: 15, diagnostic: false, difficulties: [{ level: 2, count: 4 }, { level: 3, count: 6 }, { level: 4, count: 3 }], retryCount: 2 };
  }
  return { total: 15, diagnostic: false, difficulties: [{ level: 3, count: 5 }, { level: 4, count: 5 }, { level: 5, count: 3 }], retryCount: 2 };
}

function buildStudentRecommendation(concepts, bottlenecks) {
  const bottleneckIds = new Set(bottlenecks.map((item) => item.conceptId));
  let weak = null;
  let developingWithErrors = null;
  let unknown = null;
  // Only each category's first sorted result is consumed. Select it in one pass
  // using the same comparators, retaining the first input on exact ties.
  for (const candidate of concepts) {
    if (candidate.status === "WEAK" && candidate.confidence !== "UNKNOWN") {
      if (!weak || (
        Number(bottleneckIds.has(weak.id)) - Number(bottleneckIds.has(candidate.id)) ||
        candidate.mastery - weak.mastery
      ) < 0) weak = candidate;
    } else if (candidate.status === "DEVELOPING" && candidate.evidence.incorrectCount >= 2) {
      if (!developingWithErrors || (
        developingWithErrors.evidence.incorrectCount - candidate.evidence.incorrectCount ||
        candidate.mastery - developingWithErrors.mastery
      ) < 0) developingWithErrors = candidate;
    } else if (candidate.status === "UNKNOWN") {
      if (!unknown || candidate.evidence.attemptCount > unknown.evidence.attemptCount) unknown = candidate;
    }
  }
  const concept = weak || developingWithErrors || unknown;
  if (!concept) return null;

  const reasonType = concept.status === "UNKNOWN"
    ? "DIAGNOSTIC"
    : bottleneckIds.has(concept.id)
      ? "BOTTLENECK"
      : concept.status === "WEAK"
        ? "WEAK"
        : "REPEATED_ERRORS";
  const reasons = concept.status === "UNKNOWN"
    ? [`유효 풀이가 ${concept.evidence.attemptCount}개여서 진단 표본이 더 필요합니다.`]
    : [
        `현재 숙달도 ${concept.mastery}% · Confidence ${concept.confidenceLabel}`,
        `최근 유효 풀이 ${concept.evidence.attemptCount}개 중 ${concept.evidence.correctCount}개 정답`,
      ];
  if (bottleneckIds.has(concept.id)) {
    reasons.push(`검수된 후속 개념 ${concept.unlocks.length}개와 연결되어 있습니다.`);
  }
  if (concept.evidence.retryAttemptedCount) {
    reasons.push(`재도전 ${concept.evidence.retryAttemptedCount}개 중 ${concept.evidence.retryRecoveredCount}개에서 정답 회복이 확인됐습니다.`);
  }
  return {
    conceptId: concept.id,
    conceptTitle: concept.title,
    mastery: concept.mastery,
    confidence: concept.confidence,
    reasonType,
    reasons,
    problemMix: recommendedProblemMix(concept.mastery),
  };
}

function buildStudentMap(userId, groupRows, problemById, graph) {
  const concepts = groupRows
    .map((group) => {
      const conceptId = String(group._id.conceptId);
      const node = graph.nodeById.get(conceptId);
      if (!node) return null;
      return decorateConcept(node, calculateConceptMastery(group.attempts, problemById), graph);
    })
    .filter(Boolean)
    .sort((left, right) => left.order[0] - right.order[0] || left.order[1] - right.order[1] || left.order[2] - right.order[2]);

  const analyzed = concepts.filter((concept) => concept.status !== "UNKNOWN");
  const courseGroups = new Map();
  concepts.forEach((concept) => {
    if (!courseGroups.has(concept.courseId)) {
      courseGroups.set(concept.courseId, { id: concept.courseId, title: concept.courseTitle, concepts: [] });
    }
    courseGroups.get(concept.courseId).concepts.push(concept);
  });
  const courses = [...courseGroups.values()].map((course) => {
    const assessed = course.concepts.filter((concept) => concept.mastery !== null);
    return {
      id: course.id,
      title: course.title,
      conceptCount: course.concepts.length,
      analyzedCount: assessed.length,
      mastery: average(assessed.map((concept) => concept.mastery), 1),
    };
  });
  // Strict comparisons retain the first concept on ties, as the stable sorts did.
  let topStrength = null;
  let topPriority = null;
  for (const concept of analyzed) {
    if (!topStrength || concept.mastery > topStrength.mastery) topStrength = concept;
    if (!topPriority || concept.mastery < topPriority.mastery) topPriority = concept;
  }

  const bottlenecks = findBottlenecks(concepts);
  return {
    userId: String(userId),
    graphVersion: GRAPH_VERSION,
    modelName: MASTERY_MODEL_NAME,
    modelVersion: MASTERY_MODEL_VERSION,
    calculatedAt: new Date(),
    overallMastery: average(analyzed.map((concept) => concept.mastery), 1),
    analyzedConceptCount: analyzed.length,
    unknownConceptCount: concepts.length - analyzed.length,
    attemptedConceptCount: concepts.length,
    topStrength,
    topPriority,
    bottlenecks,
    recommendation: buildStudentRecommendation(concepts, bottlenecks),
    courses,
    concepts,
  };
}

async function getStudentMathMaps({ studentUserIds }) {
  const userIds = uniqueObjectIds(studentUserIds);
  const graph = buildGraph();
  const byUserId = new Map(userIds.map((id) => [String(id), []]));
  if (!userIds.length) return byUserId;
  const { groups, problemById } = await loadAttemptGroups(userIds);
  groups.forEach((group) => {
    const userId = String(group._id.userId);
    if (byUserId.has(userId)) byUserId.get(userId).push(group);
  });
  for (const userId of userIds) {
    byUserId.set(String(userId), buildStudentMap(userId, byUserId.get(String(userId)) || [], problemById, graph));
  }
  return byUserId;
}

async function getStudentMathMap({ studentUserId }) {
  const maps = await getStudentMathMaps({ studentUserIds: [studentUserId] });
  return maps.get(String(studentUserId));
}

async function getClassMathMap({ studentUserIds }) {
  const userIds = uniqueObjectIds(studentUserIds);
  const maps = await getStudentMathMaps({ studentUserIds: userIds });
  const graph = buildGraph();
  const conceptIds = new Set();
  const conceptsByStudent = new Map();
  maps.forEach((map, userId) => {
    const byId = new Map();
    map.concepts.forEach((concept) => {
      conceptIds.add(concept.id);
      // Preserve Array.find's first-match semantics even for duplicate IDs.
      if (!byId.has(concept.id)) byId.set(concept.id, concept);
    });
    conceptsByStudent.set(userId, byId);
  });

  const concepts = [...conceptIds]
    .map((conceptId) => {
      const node = graph.nodeById.get(conceptId);
      const studentResults = userIds.map((userId) => {
        const concept = conceptsByStudent.get(String(userId)).get(conceptId);
        return {
          userId: String(userId),
          mastery: concept?.mastery ?? null,
          status: concept?.status || "UNKNOWN",
          statusLabel: concept?.statusLabel || STATUS_LABELS.UNKNOWN,
          confidence: concept?.confidence || "UNKNOWN",
          attemptCount: concept?.evidence?.attemptCount || 0,
        };
      });
      const analyzed = studentResults.filter((result) => result.status !== "UNKNOWN");
      const statusCounts = { MASTERED: 0, DEVELOPING: 0, WEAK: 0, UNKNOWN: 0 };
      studentResults.forEach((result) => { statusCounts[result.status] += 1; });
      const mastery = average(analyzed.map((result) => result.mastery), 1);
      const status = statusFor(mastery, analyzed.length ? MIN_VALID_ATTEMPTS : 0);
      return {
        ...node,
        mastery,
        status,
        statusLabel: STATUS_LABELS[status],
        analyzedCount: analyzed.length,
        unknownCount: userIds.length - analyzed.length,
        totalStudents: userIds.length,
        statusCounts,
        studentResults,
        unlocks: graph.outgoingById.get(conceptId) || [],
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.status === "UNKNOWN" && right.status !== "UNKNOWN") return 1;
      if (right.status === "UNKNOWN" && left.status !== "UNKNOWN") return -1;
      return Number(left.mastery ?? 101) - Number(right.mastery ?? 101);
    });

  const eligibleBottlenecks = concepts
    .filter((concept) => concept.analyzedCount >= 3 && concept.statusCounts.WEAK / concept.analyzedCount >= 0.5 && concept.unlocks.length)
    .map((concept) => ({
      conceptId: concept.id,
      conceptTitle: concept.title,
      mastery: concept.mastery,
      analyzedCount: concept.analyzedCount,
      weakCount: concept.statusCounts.WEAK,
      affectedConceptCount: concept.unlocks.length,
      score: round((concept.statusCounts.WEAK / concept.analyzedCount) * (1 - concept.mastery / 100) * Math.log2(1 + concept.unlocks.length), 3),
    }))
    .sort((left, right) => right.score - left.score);
  const classPriority = eligibleBottlenecks[0] || concepts.find((concept) => concept.status === "WEAK" && concept.analyzedCount >= 1) || null;

  return {
    graphVersion: GRAPH_VERSION,
    modelName: MASTERY_MODEL_NAME,
    modelVersion: MASTERY_MODEL_VERSION,
    calculatedAt: new Date(),
    totalStudents: userIds.length,
    overallMastery: average(concepts.map((concept) => concept.mastery), 1),
    analyzedConceptCount: concepts.filter((concept) => concept.status !== "UNKNOWN").length,
    concepts,
    bottlenecks: eligibleBottlenecks,
    recommendation: classPriority
      ? {
          conceptId: classPriority.conceptId || classPriority.id,
          conceptTitle: classPriority.conceptTitle || classPriority.title,
          mastery: classPriority.mastery,
          reason: eligibleBottlenecks.length
            ? `분석 학생 중 보완 필요 비율이 높고 ${classPriority.affectedConceptCount}개 후속 개념과 연결되어 있습니다.`
            : "현재 분석 가능한 개념 중 평균 숙달도가 낮습니다.",
          problemMix: recommendedProblemMix(classPriority.mastery),
        }
      : null,
    studentMaps: maps,
    heatmap: concepts.map((concept) => ({
      conceptId: concept.id,
      conceptTitle: concept.title,
      courseId: concept.courseId,
      courseTitle: concept.courseTitle,
      unitId: concept.unitId,
      unitTitle: concept.unitTitle,
      mastery: concept.mastery,
      accuracy: concept.mastery,
      analyzedCount: concept.analyzedCount,
      unknownCount: concept.unknownCount,
      totalStudents: concept.totalStudents,
      status: concept.status,
      statusLabel: concept.statusLabel,
    })),
  };
}

module.exports = {
  CONFIDENCE_LABELS,
  STATUS_LABELS,
  calculateConceptMastery,
  getClassMathMap,
  getStudentMathMap,
  getStudentMathMaps,
  validateMathMapGraph,
};
