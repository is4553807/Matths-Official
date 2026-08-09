const { loadCurriculum } = require("../../../services/curriculumService");
const { buildCommonMathLessonDefinitions } = require("../../../services/commonMathLearningCatalog");

module.exports = buildCommonMathLessonDefinitions(loadCurriculum());
