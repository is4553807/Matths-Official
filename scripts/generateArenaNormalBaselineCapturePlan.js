"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildNormalBaselineCaptureManifest,
} = require("../services/arenaNormalBaselineQuestionService");

const repositoryRoot = path.resolve(__dirname, "..");
const jsonOutputPath = path.join(
  repositoryRoot,
  "audit",
  "GOAT_ARENA_NORMAL_BASELINE_CAPTURE_PLAN.json"
);
const markdownOutputPath = path.join(
  repositoryRoot,
  "audit",
  "GOAT_ARENA_NORMAL_BASELINE_63_QUESTIONS.md"
);

function formatDuration(milliseconds) {
  const totalSeconds = Math.round(Number(milliseconds || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
}

function markdownForManifest(manifest) {
  const lines = [
    "# GOAT Arena 일반전 기준 기록 손풀이 작성 목록",
    "",
    "> 운영자용 비공개 자료입니다. 이 문서의 서버 정답과 내부 가정 시간은 경기 화면에 공개하지 않습니다.",
    "",
    `- 배치: \`${manifest.batchKey}\``,
    `- 문항: 총 ${manifest.questionCount}개 · 티어별 ${manifest.questionCountPerTier}개`,
    `- 조합: 티어별 ${manifest.combinationCountPerTier}개 · 경기당 ${manifest.questionsPerMatch}문항`,
    `- 같은 5문항 조합 재사용 제한: 이후 ${manifest.exactCombinationCooldownMatches}경기`,
    "- 최근 5경기에 나온 개별 문항도 다시 출제하지 않음",
    "- 티어별 7개는 검수 초안 규모임. 연속 경기용 운영 풀은 허용 MMR 범위에서 반복 제외 후에도 5문항을 제공할 수 있어야 함(최악의 단순 수량 기준 30개)",
    "- 현재 상태: 풀이 이미지 대기 중인 초안이며 경기에는 투입되지 않음",
    "- 파일 형식: 우선 PNG 권장. 아래 파일명을 정확히 사용",
    "",
    "## 작성 방법",
    "",
    "각 문항을 아이패드 격자 풀이판에 풀고, 아래 `기준 제출 답안`으로 끝나는 전체 풀이과정을 한 장에 저장합니다. `오답`으로 지정된 문항은 의도한 계산 실수가 드러나는 풀이가 필요합니다. 63개 파일을 모두 작성한 뒤 ZIP 하나로 전달하면 파일 해시·문항 연결·운영 검수를 진행합니다.",
    "",
  ];

  const byTier = new Map();
  for (const question of manifest.questions) {
    if (!byTier.has(question.tier)) byTier.set(question.tier, []);
    byTier.get(question.tier).push(question);
  }

  for (const [tier, questions] of byTier) {
    const first = questions[0];
    lines.push(
      `## ${first.tierLabel} · ${tier} · ${first.difficultyCode} · 기준 MMR ${first.targetMmr}`,
      ""
    );
    for (const entry of questions) {
      const resultLabel = entry.baselineCorrect ? "정답" : "오답";
      lines.push(
        `### ${entry.baselineKey}`,
        "",
        entry.question.prompt,
        "",
        `- 서버 정답: \`${entry.question.answer}\``,
        `- 기준 제출 답안: \`${entry.baselineSubmittedAnswer}\` (${resultLabel})`,
        `- 기준 풀이 시간 가정: ${formatDuration(entry.baselineSolveTimeMs)}`,
        `- 원문 정답률: ${(entry.sourceAccuracyRate * 100).toFixed(1).replace(/\\.0$/, "")}%`,
        `- 원문 식별자: \`${entry.sourceReferenceId}\``,
        `- 저장 파일명: \`${entry.expectedSolutionFileName}\``,
        ""
      );
    }
  }

  lines.push(
    "## 활성화 전 남은 검증",
    "",
    ...manifest.activationRequirements.map((requirement) => `- ${requirement}`),
    "",
    "정답 패턴과 풀이 시간은 초기 데이터 캡처용 가정입니다. 시뮬레이션 승인 전에는 운영 상수나 실제 상대 기록으로 취급하지 않습니다.",
    ""
  );
  return lines.join("\n");
}

function main() {
  const manifest = buildNormalBaselineCaptureManifest();
  fs.writeFileSync(jsonOutputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownOutputPath, markdownForManifest(manifest), "utf8");
  process.stdout.write(JSON.stringify({
    ok: true,
    batchKey: manifest.batchKey,
    questionCount: manifest.questionCount,
    jsonOutputPath,
    markdownOutputPath,
  }, null, 2));
  process.stdout.write("\n");
}

if (require.main === module) main();

module.exports = { markdownForManifest };
