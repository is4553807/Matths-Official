"use strict";

const {
  difficultyRowsForDivision,
} = require("./arenaMatchDifficultyPlan");

const RULEBOOK_REVISION = "2.2";
const RULEBOOK_LAST_MODIFIED_AT = new Date("2026-10-12T00:00:00+09:00");

const PUBLIC_MODE_ROWS = Object.freeze([
  {
    division: "SUB",
    mode: "일반전",
    eyebrow: "NORMAL MATCH",
    href: "/goat-arena/rules/sub",
    playHref: "/goat-arena/sub",
    headline: "일반전 베타에서 검수된 기준 풀이 또는 유저와 겨룹니다.",
    rules: Object.freeze([
      "비슷한 난도의 서로 다른 5문항을 풉니다.",
      "각 문항의 제한 시간은 10분입니다.",
      "정오답, 문제 난도와 풀이 시간을 함께 반영한 내부 평가로 경기 결과를 정합니다.",
      "경기가 끝나면 양쪽 문제, 정오답, 풀이 시간과 풀이과정을 확인할 수 있습니다.",
    ]),
  },
  {
    division: "MAIN",
    mode: "경쟁전",
    eyebrow: "COMPETITIVE MATCH",
    href: "/goat-arena/rules/main",
    playHref: "/goat-arena/main",
    headline: "비슷한 실력의 유저와 티어를 겨룹니다.",
    rules: Object.freeze([
      "유효한 일반전 3경기를 완료하면 경쟁전 배치고사에 참여할 수 있습니다.",
      "배치고사는 1회부터 최대 5회까지 진행됩니다.",
      "한 경기에서 서로 다른 5문항을 문항당 10분 동안 풉니다.",
      "정답, 문제 난도와 풀이 시간을 반영한 내부 평가 지표로 경기 결과를 정합니다.",
      "경기가 확정되면 현재 도전자의 경쟁전 점수와 티어에 결과가 반영됩니다.",
    ]),
  },
]);

const DETAIL_SECTIONS = Object.freeze({
  SUB: Object.freeze([
    {
      title: "경기 상대와 매칭",
      body: Object.freeze([
        "현재 실력과 문제 난도가 비슷한 유저와 겨루며, 일반전 베타에서는 검수된 기준 풀이가 상대가 될 수 있습니다.",
        "기준 풀이의 정오답은 검증한 값이고 풀이 시간은 추정값입니다.",
        "같은 상대가 지나치게 반복되지 않도록 경기 상대를 고릅니다.",
        "내가 푼 문제와 상대 풀이로 본 문제는 일반전·경쟁전 합산 다음 10경기 동안 다시 배정하지 않습니다.",
        "이전 경기 결과를 다시 열면 그 시점부터 제외 기간이 갱신됩니다.",
        "상대 연결이 끝나면 바로 경기를 시작할 수 있습니다.",
      ]),
    },
    {
      title: "문제 풀이와 풀이과정 제출",
      body: Object.freeze([
        "한 경기에서 5문항을 한 문제씩 풀며 각 문항의 제한 시간은 10분입니다.",
        "다음 문항으로 이동하면 현재 답안과 풀이과정이 확정됩니다.",
        "컴퓨터에서는 풀이 파일을 올리고, 태블릿과 휴대폰에서는 문제 아래 격자 풀이판에 직접 작성합니다.",
        "답안과 다섯 문항의 풀이과정을 모두 제출하면 경기 결과를 확인할 수 있습니다.",
      ]),
    },
    {
      title: "승패 결정 방식",
      body: Object.freeze([
        "정오답과 각 문항의 난도를 함께 반영한 내부 성취 지표를 비교합니다.",
        "내부 성취 지표가 근소하면 풀이 시간이 짧은 쪽이 승리합니다.",
        "서로 다른 문제 세트도 같은 기준으로 비교할 수 있도록 문항별 난도 차이를 반영합니다.",
      ]),
    },
    {
      title: "경기 결과와 기록",
      body: Object.freeze([
        "양쪽의 다섯 문제와 각 문항의 정오답을 확인할 수 있습니다.",
        "총 정답 수, 풀이 시간과 제출한 전체 풀이과정을 함께 확인할 수 있습니다.",
        "유효하게 완료한 일반전은 기존 XP 규칙과 경쟁전 참가 조건에 반영됩니다.",
        "유효한 일반전 3경기를 완료하면 경쟁전 배치고사 참가 조건을 충족합니다.",
      ]),
    },
    {
      title: "공정한 경기와 이용 시간",
      body: Object.freeze([
        "GOAT Arena 경기는 요일과 관계없이 이용할 수 있습니다.",
        "풀이과정은 경기 결과와 복습을 위해 보존합니다.",
        "답안과 풀이과정을 모두 제출하면 결과를 바로 확인합니다. 감지 신호가 있는 기록은 사용자 불이익 없이 상대 기록 풀에서만 운영 검토를 기다립니다.",
      ]),
    },
  ]),
  MAIN: Object.freeze([
    {
      title: "참가 조건과 배치고사",
      body: Object.freeze([
        "유효한 일반전 3경기를 완료하면 경쟁전 배치고사에 참여할 수 있습니다.",
        "배치고사는 1회부터 최대 5회까지 진행하며 완료한 유효 결과로 첫 경쟁전 점수와 티어를 정합니다.",
        "적은 횟수로 배치를 확정하면 실력 추정의 불확실성이 더 크게 설정되어 초반 경기 결과에 빠르게 반응합니다.",
        "실력 추정의 불확실성은 특정 경기 수 경계 없이 경기마다 점차 안정됩니다.",
        "배치가 끝난 뒤 비슷한 실력의 유저와 경쟁전을 진행합니다.",
      ]),
    },
    {
      title: "경기 상대와 문제 배정",
      body: Object.freeze([
        "현재 실력이 가까운 유저를 우선 연결합니다.",
        "두 참가자는 서로 다른 다섯 문제를 받을 수 있으며 비슷한 난도 구성을 사용합니다.",
        "같은 상대가 지나치게 반복되지 않도록 경기 상대를 고릅니다.",
        "내가 푼 문제와 상대 풀이로 본 문제는 일반전·경쟁전 합산 다음 10경기 동안 다시 배정하지 않습니다.",
        "이전 경기 결과를 다시 열면 그 시점부터 제외 기간이 갱신됩니다.",
        "상대 연결이 끝나면 바로 경기를 시작할 수 있습니다.",
      ]),
    },
    {
      title: "문제 풀이와 풀이과정 제출",
      body: Object.freeze([
        "한 경기에서 5문항을 한 문제씩 풀며 각 문항의 제한 시간은 10분입니다.",
        "다음 문항으로 이동하면 현재 답안과 풀이과정이 확정됩니다.",
        "컴퓨터에서는 풀이 파일을 올리고, 태블릿과 휴대폰에서는 문제 아래 격자 풀이판에 직접 작성합니다.",
        "답안과 다섯 문항의 풀이과정을 모두 제출하면 경기 결과를 확인할 수 있습니다.",
      ]),
    },
    {
      title: "승패와 경쟁전 점수",
      body: Object.freeze([
        "정답, 문제 난도와 풀이 시간을 반영한 내부 평가로 승패를 정합니다.",
        "경기가 최종 확정될 때 내 경쟁전 점수를 한 번 업데이트합니다.",
        "변경된 점수 구간에 맞춰 현재 티어가 표시됩니다.",
        "상대의 이미 확정된 점수와 전적은 그대로 유지됩니다.",
      ]),
    },
    {
      title: "경기 결과와 기록",
      body: Object.freeze([
        "양쪽의 다섯 문제와 각 문항의 정오답을 확인할 수 있습니다.",
        "총 정답 수, 풀이 시간과 제출한 전체 풀이과정을 함께 확인할 수 있습니다.",
        "경기 결과 화면에서 승패와 경쟁전 점수·티어 변화를 확인할 수 있습니다.",
      ]),
    },
    {
      title: "공정한 경기와 이용 시간",
      body: Object.freeze([
        "GOAT Arena 경기는 요일과 관계없이 이용할 수 있습니다.",
        "제출된 답안과 풀이과정은 기존 공정성 확인 절차를 거칩니다.",
        "추가 확인이 필요한 경기는 검토 상태와 최종 결과를 경기 화면에서 안내합니다.",
      ]),
    },
  ]),
});

function compositionLabel(slots = []) {
  const counts = new Map();
  for (const slot of slots) {
    counts.set(slot.label, (counts.get(slot.label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => `${label} ${count}문항`)
    .join(" · ");
}

function publicDifficulty(division) {
  const competitive = division === "MAIN";
  const rows = difficultyRowsForDivision(division).map((row) => ({
    stage: row.stage,
    tierLabel: row.tierLabel,
    slots: row.slots.map((slot) => ({
      order: slot.order,
      label: slot.label,
    })),
    compositionLabel: compositionLabel(row.slots),
  }));
  return {
    codeRange: competitive ? "R1~R9" : "U1~U9",
    title: "티어별 문제 난이도",
    headline: competitive
      ? "티어가 올라갈수록 상위 일반, 준킬러와 킬러 문항이 단계적으로 포함됩니다."
      : "티어가 올라갈수록 일반 문항에서 상위 일반과 준킬러 입문까지 단계적으로 올라갑니다.",
    notes: competitive
      ? [
          "브론즈부터 골드까지는 일반과 상위 일반 중심으로 구성합니다.",
          "플래티넘부터 다이아몬드까지는 상위 일반과 준킬러를 함께 구성합니다.",
          "마스터부터 챌린저까지는 준킬러와 킬러를 함께 구성합니다.",
        ]
      : [
          "브론즈부터 골드까지는 기초 일반과 일반 중심으로 구성합니다.",
          "플래티넘부터 다이아몬드까지는 일반과 상위 일반 중심으로 구성합니다.",
          "마스터부터 챌린저까지는 상위 일반과 준킬러 입문으로 구성합니다.",
        ],
    rows,
    curriculum: ["대수", "미적분Ⅰ", "확률과 통계"],
  };
}

function detailRulebook(division, now) {
  const mode = PUBLIC_MODE_ROWS.find((item) => item.division === division);
  const otherMode = PUBLIC_MODE_ROWS.find((item) => item.division !== division);
  return {
    schemaVersion: "GOAT_ARENA_RULEBOOK_2_2",
    revision: RULEBOOK_REVISION,
    generatedAt: new Date(now).toISOString(),
    lastModifiedAt: new Date(RULEBOOK_LAST_MODIFIED_AT),
    view: "DETAIL",
    division,
    mode: { ...mode, rules: [...mode.rules] },
    otherMode: { ...otherMode, rules: [...otherMode.rules] },
    title: `${mode.mode} 경기 규정`,
    eyebrow: `${mode.eyebrow} · RULEBOOK`,
    intro: mode.headline,
    summary: [...mode.rules],
    sections: DETAIL_SECTIONS[division].map((section) => ({
      ...section,
      body: [...section.body],
    })),
    difficulty: publicDifficulty(division),
    questionCount: 5,
    timeLimitSecondsPerQuestion: 10 * 60,
    timeLimitScope: "PER_QUESTION",
  };
}

function getGoatArenaV22Rulebook(now = new Date(), division = null) {
  const normalizedDivision = String(division || "").trim().toUpperCase();
  if (["SUB", "MAIN"].includes(normalizedDivision)) {
    return detailRulebook(normalizedDivision, now);
  }
  return {
    schemaVersion: "GOAT_ARENA_RULEBOOK_2_2",
    revision: RULEBOOK_REVISION,
    generatedAt: new Date(now).toISOString(),
    lastModifiedAt: new Date(RULEBOOK_LAST_MODIFIED_AT),
    view: "OVERVIEW",
    title: "GOAT Arena 경기 규정",
    eyebrow: "GOAT ARENA · GAME GUIDE",
    intro: "일반전과 경쟁전 중 확인할 경기 규정을 선택하세요.",
    summary: [
      "모든 경기는 5문항으로 진행됩니다.",
      "각 문항의 제한 시간은 10분입니다.",
      "컴퓨터에서는 풀이 파일을 올리고, 태블릿과 휴대폰에서는 격자 풀이판에 직접 작성합니다.",
      "경기 결과에서 문제, 정오답, 풀이 시간과 양쪽 풀이과정을 확인할 수 있습니다.",
    ],
    questionCount: 5,
    timeLimitSecondsPerQuestion: 10 * 60,
    timeLimitScope: "PER_QUESTION",
    publicModes: PUBLIC_MODE_ROWS.map((mode) => ({
      ...mode,
      rules: [...mode.rules],
    })),
  };
}

module.exports = {
  RULEBOOK_LAST_MODIFIED_AT,
  RULEBOOK_REVISION,
  getGoatArenaV22Rulebook,
};
