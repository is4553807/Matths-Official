const catalog = require("../dataAnalysis/arenaPrivateMockResearchCatalog.json");

const REQUIRED_COMPONENTS = Object.freeze([
  "problemSheet",
  "answerKey",
  "workedSolutions",
  "itemAccuracy",
]);

function sourcesById() {
  return new Map((catalog.sources || []).map((source) => [source.sourceId, source]));
}

const SOURCE_BY_ID = sourcesById();

function hasAllRequiredComponents(source) {
  return REQUIRED_COMPONENTS.every((key) => source?.components?.[key] === true);
}

function activeCalibrationSources() {
  return (catalog.sources || []).filter(
    (source) =>
      source.runtimeStatus === "ACTIVE_CALIBRATION" &&
      source.confidence === "HIGH" &&
      hasAllRequiredComponents(source) &&
      Number(source.sample?.reported || 0) >=
        Number(catalog.methodology?.activeCalibrationRequirements?.minimumCleanSampleSize || 100)
  );
}

function activeCalibrationMetrics({ slotRole = null } = {}) {
  const activeSourceIds = new Set(activeCalibrationSources().map((source) => source.sourceId));
  return (catalog.itemMetrics || [])
    .filter(
      (metric) =>
        metric.runtimeEligible === true &&
        activeSourceIds.has(metric.sourceId) &&
        (!slotRole || metric.slotRole === slotRole)
    )
    .map((metric) => ({
      ...metric,
      sourceTitle: SOURCE_BY_ID.get(metric.sourceId)?.title || metric.sourceId,
      sourceUrl: SOURCE_BY_ID.get(metric.sourceId)?.sourceUrl || "",
      sampleSize: Number(SOURCE_BY_ID.get(metric.sourceId)?.sample?.reported || 0),
      confidence: SOURCE_BY_ID.get(metric.sourceId)?.confidence || "",
    }));
}

function metricRangePercent(metric) {
  if (Array.isArray(metric?.accuracyRangePercent)) {
    return metric.accuracyRangePercent.map(Number);
  }
  const accuracy = Number(metric?.accuracyPercent);
  return [accuracy, accuracy];
}

function rangeGap(left, right) {
  const [leftMin, leftMax] = left;
  const [rightMin, rightMax] = right;
  if (leftMax < rightMin) return rightMin - leftMax;
  if (rightMax < leftMin) return leftMin - rightMax;
  return 0;
}

function calibrationEvidenceForAccuracyRange(
  targetAccuracy,
  { slotRole = "REGULAR", limit = 4 } = {}
) {
  const targetPercent = (targetAccuracy || []).map((value) => Number(value) * 100);
  if (
    targetPercent.length !== 2 ||
    targetPercent.some((value) => !Number.isFinite(value))
  ) {
    return [];
  }
  return activeCalibrationMetrics({ slotRole })
    .map((metric) => {
      const observedRangePercent = metricRangePercent(metric);
      const gapPoints = rangeGap(targetPercent, observedRangePercent);
      return {
        sourceId: metric.sourceId,
        sourceTitle: metric.sourceTitle,
        sourceUrl: metric.sourceUrl,
        questionNumber: metric.questionNumber,
        sourcePositionBand: metric.sourcePositionBand,
        slotRole: metric.slotRole,
        metricKind: metric.metricKind,
        sampleSize: metric.sampleSize,
        confidence: metric.confidence,
        observedRangePercent,
        targetRangePercent: targetPercent,
        withinTarget: gapPoints === 0,
        gapPoints: Number(gapPoints.toFixed(2)),
      };
    })
    .sort(
      (left, right) =>
        left.gapPoints - right.gapPoints ||
        right.sampleSize - left.sampleSize ||
        left.questionNumber - right.questionNumber
    )
    .slice(0, Math.max(1, Number(limit || 4)));
}

function abstractTypeEvidence({ slotRole = null, courseId = null } = {}) {
  const activeSourceIds = new Set(activeCalibrationSources().map((source) => source.sourceId));
  return (catalog.abstractTypeEvidence || []).filter(
    (evidence) =>
      evidence.runtimeEligible === true &&
      activeSourceIds.has(evidence.sourceId) &&
      (!slotRole || evidence.slotRole === slotRole) &&
      (!courseId || evidence.courseId === courseId)
  );
}

function getPrivateMockResearchSummary() {
  const statusCounts = (catalog.sources || []).reduce((counts, source) => {
    counts[source.runtimeStatus] = Number(counts[source.runtimeStatus] || 0) + 1;
    return counts;
  }, {});
  return {
    ...catalog.summary,
    schemaVersion: catalog.schemaVersion,
    generatedAt: catalog.generatedAt,
    requiredComponents: [...(catalog.methodology?.requiredComponents || [])],
    minimumCleanSampleSize: Number(
      catalog.methodology?.activeCalibrationRequirements?.minimumCleanSampleSize || 100
    ),
    statusCounts,
    sources: (catalog.sources || []).map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      sourceUrl: source.sourceUrl,
      confidence: source.confidence,
      runtimeStatus: source.runtimeStatus,
      sampleSize: Number(source.sample?.reported || 0),
      allRequiredComponents: hasAllRequiredComponents(source),
      notes: source.notes || "",
    })),
    activeMetrics: activeCalibrationMetrics(),
    activeAbstractTypeEvidence: abstractTypeEvidence(),
    generatedQuestionIntegration: catalog.generatedQuestionIntegration || {},
  };
}

module.exports = {
  REQUIRED_COMPONENTS,
  abstractTypeEvidence,
  activeCalibrationMetrics,
  activeCalibrationSources,
  calibrationEvidenceForAccuracyRange,
  getPrivateMockResearchSummary,
  hasAllRequiredComponents,
};
