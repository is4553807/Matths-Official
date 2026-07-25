const {
  getUnitReferenceAnalysis,
  referenceIdsForTemplate,
} = require(
  "../assessmentReferences/mockExamCatalog"
);

const unitConfigs = [
  require("./algebra/exponentialLogarithmicFunctions"),
  require("./algebra/trigonometricFunctions"),
  require("./algebra/sequences"),
  require("./calculus1/limitsAndContinuity"),
  require("./calculus1/differentiation"),
  require("./calculus1/integration"),
  require("./probabilityStatistics/counting"),
  require("./probabilityStatistics/probability"),
  require("./probabilityStatistics/statistics"),
];

const configMap = new Map(
  unitConfigs.map((config) => [
    [
      config.courseId,
      config.unitId,
    ].join("/"),
    config,
  ])
);

for (const config of unitConfigs) {
  const analysis =
    getUnitReferenceAnalysis(
      config.courseId,
      config.unitId
    );

  if (!analysis) {
    throw new Error(
      `${config.courseId}/${config.unitId}: 모의고사 레퍼런스 분석이 없습니다.`
    );
  }

  config.referenceAnalysis =
    analysis;
  config.advancedTemplates =
    config.advancedTemplates.map(
      (template, index) => ({
        ...template,
        sourcePattern:
          template.sourcePattern ||
          analysis.signals[
            index %
              analysis.signals
                .length
          ],
        referenceExamIds:
          referenceIdsForTemplate(
            config.courseId,
            config.unitId,
            index,
            5
          ),
      })
    );
}

function getUnitAssessmentConfig(
  courseId,
  unitId
) {
  return (
    configMap.get(
      [
        courseId,
        unitId,
      ].join("/")
    ) || null
  );
}

function getCourseAssessmentConfigs(
  courseId
) {
  return unitConfigs.filter(
    (config) =>
      config.courseId === courseId
  );
}

function assessmentConfigsForScope({
  scopeType,
  courseId,
  unitId,
}) {
  if (scopeType === "subunit") {
    return [];
  }

  if (scopeType === "unit") {
    const config =
      getUnitAssessmentConfig(
        courseId,
        unitId
      );

    return config ? [config] : [];
  }

  return getCourseAssessmentConfigs(
    courseId
  );
}

function assertAssessmentTemplateCatalog() {
  for (const config of unitConfigs) {
    if (
      config.advancedTemplates
        .length < 20
    ) {
      throw new Error(
        `${config.courseId}/${config.unitId}: 심화 유형이 20개 미만입니다.`
      );
    }

    for (const template of
      config.advancedTemplates) {
      if (
        template.estimatedMinutes <
        10
      ) {
        throw new Error(
          `${template.id}: 예상 풀이시간이 10분 미만입니다.`
        );
      }

      if (
        template.reasoningSteps
          .length < 3
      ) {
        throw new Error(
          `${template.id}: 풀이 단계가 3개 미만입니다.`
        );
      }

      if (
        !template.referenceExamIds
          .length
      ) {
        throw new Error(
          `${template.id}: 모의고사 레퍼런스가 없습니다.`
        );
      }
    }
  }

  return true;
}

assertAssessmentTemplateCatalog();

module.exports = {
  unitConfigs,
  getUnitAssessmentConfig,
  getCourseAssessmentConfigs,
  assessmentConfigsForScope,
  assertAssessmentTemplateCatalog,
};
