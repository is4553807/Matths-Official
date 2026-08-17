"use strict";

const VISUAL_MODES = Object.freeze([
  [/(그래프|좌표|곡선|함수|포물선|직선)/u, "graph"],
  [/(블록|타일|넓이|직사각형|조각)/u, "blocks"],
  [/(도형|원|벡터|점|각|공간|평면)/u, "geometry"],
  [/(자료|분포|통계|확률|표|빈도|평균)/u, "plot"],
]);

const AUTHORED_VISUAL_MODES = new Set([
  "equation",
  "blocks",
  "graph",
  "geometry",
  "plot",
]);

const FOCUS_PAIRS = Object.freeze([
  ["초점", "준선", "초점·준선"],
  ["정의역", "치역", "정의역·치역"],
  ["평균", "분산", "평균·분산"],
  ["속도", "가속도", "속도·가속도"],
  ["필요조건", "충분조건", "필요·충분조건"],
  ["비용", "수익", "비용·수익"],
]);

const FOCUS_KEYWORDS = Object.freeze([
  "조건부확률", "표준편차", "확률변수", "연립방정식", "부분적분", "치환적분",
  "삼각함수", "신뢰구간", "필요조건", "충분조건", "정규분포", "이항분포",
  "부정적분", "정적분", "도함수", "판별식", "상관관계", "인공지능",
  "포물선", "쌍곡선", "알고리즘", "표본공간", "표본", "모집단", "최적화",
  "수열", "극한", "공비", "부분합", "급수", "지수", "로그", "미분", "접선",
  "적분", "넓이", "부피", "속도", "가속도", "확률", "평균", "분산", "통계",
  "초점", "준선", "타원", "벡터", "행렬", "집합", "명제", "함수", "그래프",
  "순열", "조합", "방정식", "부등식", "데이터", "경제", "비용", "수익", "이윤",
  "가설", "회귀", "거리", "변화율", "극값", "점근선", "대칭", "좌표",
]);

function normalize(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function sentenceList(value) {
  return normalize(value).match(/[^.!?。！？…]+(?:[.!?。！？]+|…+|$)/gu) || [];
}

function compact(value, maximum) {
  const text = normalize(value);
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

function koreanParticle(value, withBatchim, withoutBatchim) {
  const lastHangul = [...normalize(value)].reverse().find((character) => /[가-힣]/u.test(character));
  if (!lastHangul) return withoutBatchim;
  return (lastHangul.codePointAt(0) - 0xac00) % 28 === 0 ? withoutBatchim : withBatchim;
}

function quoteWithParticle(value, withBatchim, withoutBatchim) {
  return `“${value}”${koreanParticle(value, withBatchim, withoutBatchim)}`;
}

function guidedMotionBeats(scene, token, visualIdea, sentences) {
  const first = compact(sentences[0] || scene.subtitle, 62);
  const middle = compact(sentences[1] || scene.subtitle, 62);
  const conclusion = compact(sentences.at(-1) || scene.subtitle, 68);
  const target = compact(scene.subtitle || token, 48);

  return [
    {
      id: "guided-focus",
      action: "highlight",
      target: token,
      expression: compact(scene.title, 44),
      result: target,
      caption: `먼저 “${token}”부터 가리키고, 무엇을 판단할지 한 문장으로 고정합니다.`,
      durationMs: 1800,
    },
    {
      id: "guided-connect",
      action: "transform",
      target,
      expression: first,
      result: middle,
      caption: `${visualIdea}. 앞 조건과 다음 변화를 선으로 연결해 보세요.`,
      durationMs: 2000,
    },
    {
      id: "guided-verify",
      action: "verify",
      target,
      expression: token,
      result: conclusion,
      caption: `마지막으로 “${target}”에 필요한 조건과 결론을 함께 확인합니다.`,
      durationMs: 2200,
    },
  ];
}

function focusToken(scene) {
  const text = `${scene?.title || ""} ${scene?.subtitle || ""} ${scene?.narration || ""}`;
  const formulas = text.match(
    /(?:[A-Za-z][A-Za-z0-9²³ⁿ₀-₉]*|\d+(?:\.\d+)?)(?:\s*[=+−\-×÷·/<>]\s*(?:[A-Za-z0-9()²³ⁿ₀-₉+−\-×÷·/]+)){1,5}/gu,
  );
  if (formulas?.length) return normalize(formulas[0]).slice(0, 48);

  const keywordToken = (value) => {
    const source = normalize(value);
    const pair = FOCUS_PAIRS.find(([left, right]) => source.includes(left) && source.includes(right));
    if (pair) return pair[2];
    return FOCUS_KEYWORDS.find((candidate) => source.includes(candidate)) || "";
  };
  const keyword = keywordToken(scene?.title) || keywordToken(scene?.subtitle);
  if (keyword) return keyword;

  const words = normalize(scene?.title)
    .split(/[^0-9A-Za-z가-힣²³ⁿ]+/u)
    .map((word) => word.replace(/(?:에서는|으로는|이라는|라는|이면|에서|에게|까지|부터|처럼|보다|으로|로|은|는|이|가|을|를|과|와)$/u, ""))
    .filter((word) => word.length >= 2 && !/(어떻게|무엇|다시|먼저|하다|하는|입니다|모두|같은)$/u.test(word));
  return (words[0] || "핵심 관계").slice(0, 24);
}

function visualMode(text) {
  for (const [pattern, mode] of VISUAL_MODES) {
    if (pattern.test(text)) return mode;
  }
  return "equation";
}

function guidedVisualIdea(scene, token) {
  const mode = visualMode(`${scene.title} ${scene.subtitle} ${token}`);
  const descriptions = {
    graph: `${quoteWithParticle(token, "이", "가")} 바뀔 때 좌표·기준선·곡선이 함께 움직이는 과정을 추적`,
    geometry: `${quoteWithParticle(token, "과", "와")} 연결된 점·선·거리 관계를 한 단계씩 표시`,
    plot: `“${token}”의 값 변화를 축·분포·비교표에서 순서대로 표시`,
    blocks: `${quoteWithParticle(token, "을", "를")} 같은 크기의 블록으로 나누고 다시 조립`,
    equation: `${quoteWithParticle(token, "이", "가")} 식의 어느 항에서 다음 결론으로 이어지는지 밑줄과 화살표로 표시`,
  };
  return descriptions[mode];
}

function rotate(values, offset) {
  if (!values.length) return [];
  const index = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(index), ...values.slice(0, index)];
}

function authoredMotion(scene) {
  const motion = scene?.motion;
  if (
    !motion
    || motion.version !== 1
    || !AUTHORED_VISUAL_MODES.has(motion.mode)
    || !Array.isArray(motion.beats)
    || motion.beats.length < 3
  ) {
    return null;
  }

  const beats = motion.beats.map((beat, index) => ({
    id: normalize(beat.id) || `beat-${index + 1}`,
    action: normalize(beat.action) || "highlight",
    target: normalize(beat.target) || normalize(motion.focus),
    expression: normalize(beat.expression),
    result: normalize(beat.result),
    caption: normalize(beat.caption),
    durationMs: Math.max(650, Math.min(5000, Number(beat.durationMs) || 1800)),
  }));

  return {
    authored: true,
    focusToken: normalize(motion.focus),
    visualIdea: normalize(motion.instruction),
    visualMode: motion.mode,
    beats,
    mildExplanation: normalize(motion.mild?.explanation),
    spicyExplanation: normalize(
      `핵심 대상은 ${motion.focus}입니다. ${motion.spicy?.explanation || ""}`,
    ),
    check: {
      prompt: normalize(motion.check?.prompt),
      choices: (motion.check?.choices || []).map(normalize),
      answerIndex: Number(motion.check?.answerIndex),
      correctFeedback: normalize(motion.check?.correctFeedback),
      retryFeedback: normalize(motion.check?.retryFeedback),
    },
  };
}

function buildCurriculumMotionLesson(story, visualizationIdeas = []) {
  if (!story?.scenes?.length) return null;
  void visualizationIdeas;
  const subtitles = story.scenes.map((scene) => normalize(scene.subtitle));

  return {
    schemaVersion: "MATTHS_CURRICULUM_MOTION_V1",
    storyId: String(story.id || ""),
    scenes: story.scenes.map((scene, sceneIndex) => {
      const authored = authoredMotion(scene);
      if (authored) {
        return {
          id: scene.id,
          kind: scene.kind,
          title: scene.title,
          subtitle: scene.subtitle,
          ...authored,
        };
      }

      const sentences = sentenceList(scene.narration);
      const token = focusToken(scene);
      const visualIdea = guidedVisualIdea(scene, token);
      const distractors = rotate(
        subtitles.filter((subtitle) => subtitle && subtitle !== scene.subtitle),
        sceneIndex,
      ).slice(0, 2);
      const choices = rotate(
        [scene.subtitle, ...distractors].filter(Boolean),
        sceneIndex % 3,
      );

      return {
        id: scene.id,
        kind: scene.kind,
        title: scene.title,
        subtitle: scene.subtitle,
        focusToken: token,
        visualIdea,
        visualMode: visualMode(`${visualIdea} ${scene.title} ${scene.subtitle}`),
        authored: false,
        beats: guidedMotionBeats(scene, token, visualIdea, sentences),
        mildExplanation: normalize([
          scene.subtitle,
          sentences[0],
          `화면에서는 ${quoteWithParticle(token, "을", "를")} 먼저 찾고, 관련 요소를 한 단계씩 연결합니다.`,
        ].filter(Boolean).join(" ")),
        spicyExplanation: normalize([
          `핵심 대상은 ${token}입니다.`,
          sentences.at(-2),
          sentences.at(-1),
        ].filter(Boolean).join(" ")),
        check: {
          prompt: "지금 장면에서 가장 먼저 확인할 것은 무엇인가요?",
          choices,
          answerIndex: choices.indexOf(scene.subtitle),
          correctFeedback: `“${token}”부터 보세요. ${scene.subtitle}`,
          retryFeedback: `선택한 내용은 다른 장면의 핵심입니다. 지금 가리키는 대상은 “${token}”입니다. “${scene.subtitle}”를 확인합니다.`,
        },
      };
    }),
  };
}

module.exports = {
  authoredMotion,
  buildCurriculumMotionLesson,
  focusToken,
  guidedVisualIdea,
  visualMode,
};
