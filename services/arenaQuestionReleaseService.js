"use strict";
const { hasRenderableArenaVisualization } = require("./arenaProblemVisualizationPolicy");

function arenaQuestionReleaseIssue(question) {
  const source = String(question?.sourceTypeId || "");
  if (source === "2024-09-KICE-CALCULUS-Q29") {
    const indices = String(question.prompt).match(/a_\{?(\d+)\}?\+a_\{?(\d+)\}?/);
    if (!indices) return "HARMONIC_PROMPT_REVIEW";
    const first = Number(indices[1]) + 1, second = Number(indices[2]) + 1;
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const numerator = first + second, denominator = first * second;
    const divisor = gcd(numerator, denominator);
    if (Number(question.answer) !== (numerator + denominator) / divisor) return "HARMONIC_ANSWER_REVIEW";
  }
  if (source === "2020-06-KICE-NA-Q26" && !String(question.prompt).includes("양의 정수")) return "SECANT_DOMAIN_REVIEW";
  if (source === "2019-10-EDUCATION_OFFICE-GA-Q28") {
    if (!hasRenderableArenaVisualization(question.visualization)) return "TILING_FIGURE_REVIEW";
    if (!String(question.prompt).includes("대각선 방향은 자유롭게")) return "TILING_STEM_REVIEW";
  }
  return null;
}

module.exports = { arenaQuestionReleaseIssue };
