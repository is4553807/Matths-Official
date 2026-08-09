#!/usr/bin/env node

/**
 * 2016년 이후 평가원 6·9월 모의평가 수학 해설에서 출제의도를 읽어
 * GOAT Arena용 추상 유형 메타데이터를 만든다.
 *
 * 원문 문제·정답·해설 전문은 저장하지 않는다. 최종 산출물에는 공식 출처,
 * 시행 정보, 문항 위치, 추상 유형, 과목, 구조 지표와 T1~T9만 남긴다.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_FILE = path.join(
  PROJECT_ROOT,
  "dataAnalysis/arenaOfficialMockTypeCatalog2016_2026.json"
);
const CACHE_DIR = "/private/tmp/pdfs/matths-arena-official-mock-research";
const RAW_RESEARCH_FILE = "/private/tmp/matths-arena-official-mock-raw-intents.json";
const EBS_AJAX_URL = "https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperListAjax.ajax";
const EBS_DOWNLOAD_ROOT = "https://wdown.ebsi.co.kr/W61001/01exam";
const TARGET_QUESTIONS = Object.freeze([13, 14, 20, 21, 27, 28, 29, 30]);

const COURSE_LABELS = Object.freeze({
  "common-math-1": "공통수학Ⅰ",
  "common-math-2": "공통수학Ⅱ",
  algebra: "대수",
  "probability-statistics": "확률과 통계",
  "calculus-1": "미적분Ⅰ",
});

const POSITION_BASE = Object.freeze({
  13: 1.2,
  14: 1.8,
  20: 3.3,
  21: 4.1,
  27: 4.5,
  28: 5.4,
  29: 7.2,
  30: 8.2,
});

const FAMILY_RULES = Object.freeze([
  ["PS-NORMAL-SAMPLE", "probability-statistics", "정규분포·표본평균 조건 역산", /정규분포|표본평균|표본/],
  ["PS-RANDOM-VARIABLE", "probability-statistics", "확률변수의 평균·분산 조건 추론", /확률변수|확률분포|평균과 분산|기댓값|분산/],
  ["PS-CONDITIONAL", "probability-statistics", "조건부확률·독립 사건 다단계 추론", /조건부확률|독립.*확률|사건.*확률|여사건/],
  ["PS-PROBABILITY-AXIOMS", "probability-statistics", "확률의 덧셈정리·수학적 확률 조건 추론", /확률의덧셈정리|수학적확률|확률을구|확률.*조건/],
  ["PS-COUNTING", "probability-statistics", "제한 조건 순열·조합과 확률 결합", /순열|조합|경우의 수|중복조합|이항정리|이항분포/],
  ["ALG-SEQUENCE-RECURRENCE", "algebra", "점화식·귀납 수열의 분기 추론", /점화식|귀납|수열.*관계|수열.*조건/],
  ["ALG-SEQUENCE-SUM", "algebra", "수열의 합과 일반항 역추적", /수열의 합|부분합|등차수열|등비수열|일반항/],
  ["ALG-TRIG-GEOMETRY", "algebra", "삼각함수와 도형 조건 결합", /사인법칙|코사인법칙|삼각함수.*도형|삼각형.*sin|삼각형.*cos/],
  ["ALG-TRIG-GRAPH", "algebra", "삼각함수 그래프·주기·해 개수 추론", /삼각함수|sin|cos|tan/],
  ["ALG-EXP-LOG-GRAPH", "algebra", "지수·로그 그래프와 정수 조건", /지수함수|로그함수|로그.*그래프|지수.*그래프/],
  ["ALG-EXP-LOG-EQUATION", "algebra", "지수·로그 방정식과 조건 역산", /지수|로그|제곱근/],
  ["C1-INTEGRAL-DEFINED", "calculus-1", "적분으로 정의된 함수의 조건 복원", /적분.*정의|정적분.*함수|함수.*정적분/],
  ["C1-INTEGRAL-AREA", "calculus-1", "정적분·넓이·교점 조건 역문제", /넓이|정적분|부정적분|적분/],
  ["C1-VELOCITY-DISTANCE", "calculus-1", "속도 부호 변화와 이동거리 추론", /속도|거리|위치/],
  ["C1-DERIVATIVE-ROOTS", "calculus-1", "도함수 그래프와 실근 개수 추론", /도함수.*그래프|실근.*개수|방정식.*근.*개수/],
  ["C1-TANGENT-EXTREMA", "calculus-1", "접선·극값·증감 조건 결합", /접선|극값|최댓값|최솟값|증가|감소/],
  ["C1-LIMIT-CONTINUITY", "calculus-1", "극한·연속 조건의 미정계수 추론", /극한|연속|미분가능/],
  ["C1-DERIVATIVE", "calculus-1", "미분 조건을 이용한 함수 복원", /미분|도함수/],
  ["CM2-COMPOSITION-INVERSE", "common-math-2", "합성함수·역함수 조건 역추적", /합성함수|역함수|함수의 합성/],
  ["CM2-RATIONAL-RADICAL", "common-math-2", "유리·무리함수 그래프와 정수 조건", /유리함수|무리함수/],
  ["CM2-SETS-PROPOSITIONS", "common-math-2", "집합·명제의 필요충분조건 추론", /명제|진리집합|필요조건|충분조건|집합/],
  ["CM2-COORDINATE-CIRCLE", "common-math-2", "좌표도형·원·직선의 위치 관계", /원의 방정식|원과 직선|좌표|두 점|거리|자취/],
  ["CM1-MATRIX", "common-math-1", "행렬 연산과 미정 성분 조건 추론", /행렬/],
  ["CM1-POLYNOMIAL", "common-math-1", "다항식 항등식·나머지 조건 역추적", /다항식|항등식|나머지|인수분해/],
  ["CM1-EQUATION-INEQUALITY", "common-math-1", "방정식·부등식의 해 조건 결합", /방정식|부등식|근과 계수|판별식/],
  ["CM1-COUNTING", "common-math-1", "경우의 수 제한 조건과 대칭성", /경우의 수|순열|조합/],
  ["FUNCTION-GRAPH-CONDITION", "common-math-2", "함수 그래프와 조건 역추론", /함수|그래프/],
]);

const UNSUPPORTED_RULES = Object.freeze([
  ["GEOMETRY", /벡터|공간도형|공간좌표|이차곡선|평면벡터|포물선|타원|쌍곡선|직선과평면|입체도형|사면체|기하/],
  ["TRANSCENDENTAL_CALCULUS", /삼각함수.*미분|지수함수.*미분|로그함수.*미분|급수/],
]);

function compactText(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIntent(value) {
  return String(value || "")
    .replace(/[\uE000-\uF8FF]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\?+/g, "")
    .trim();
}

function parseIndexHtml(html) {
  return String(html || "")
    .split('<div class="qus_box math">')
    .slice(1)
    .map((block) => {
      const flags = [...block.matchAll(/flag_subject_col_basic">([^<]+)</g)].map((match) => compactText(match[1]));
      const title = compactText(block.match(/<div class="qus_tit">([\s\S]*?)<\/div>/)?.[1]);
      const problemPath = block.match(/goDownLoadP\('([^']+\.pdf)'/)?.[1] || "";
      const solutionPath = block.match(/goDownLoadH\('([^']+\.pdf)'/)?.[1] || "";
      if (!flags[0] || !flags[1] || !title || !solutionPath) return null;
      return {
        year: Number(flags[0]),
        month: Number(String(flags[1]).replace(/\D/g, "")),
        title,
        form: title.includes("확률과 통계")
          ? "PROBABILITY_STATISTICS"
          : title.includes("미적분")
            ? "CALCULUS"
            : title.includes("기하")
              ? "GEOMETRY"
              : title.includes("수학가형")
                ? "GA"
                : title.includes("수학나형")
                  ? "NA"
                  : "COMMON",
        problemUrl: `${EBS_DOWNLOAD_ROOT}${problemPath}`,
        solutionUrl: `${EBS_DOWNLOAD_ROOT}${solutionPath}`,
      };
    })
    .filter(Boolean);
}

async function fetchIndexPage({ currentPage = 1, yearList, monthList }) {
  const body = new URLSearchParams({
    targetCd: "D300",
    yearList,
    monthList,
    arOrd: "2",
    subjIdList: "firstEnter",
    sort: "recent",
    currentPage: String(currentPage),
  });
  const response = await fetch(EBS_AJAX_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body,
  });
  if (!response.ok) throw new Error(`EBSi 목록 요청 실패: ${response.status}`);
  return response.text();
}

async function collectOfficialForms() {
  const yearList = Array.from({ length: 11 }, (_value, index) => 2016 + index).join(",");
  const pages = await Promise.all(
    [1, 2, 3, 4].map((currentPage) => fetchIndexPage({ currentPage, yearList, monthList: "06,09" }))
  );
  const september2022 = await fetchIndexPage({ currentPage: 1, yearList: "2022", monthList: "08" });
  const all = [...pages.flatMap(parseIndexHtml), ...parseIndexHtml(september2022)];
  const deduped = [...new Map(all.map((entry) => [entry.solutionUrl, entry])).values()];
  return deduped.filter((entry) => {
    if (entry.year <= 2020) return ["GA", "NA"].includes(entry.form);
    return ["PROBABILITY_STATISTICS", "CALCULUS"].includes(entry.form);
  });
}

async function downloadPdf(url) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${createHash("sha1").update(url).digest("hex")}.pdf`);
  try {
    const stats = await fs.stat(file);
    if (stats.size > 10_000) return file;
  } catch (_error) {
    // 최초 다운로드
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PDF 다운로드 실패 ${response.status}: ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(file, data);
  return file;
}

async function readPdfText(file) {
  const data = new Uint8Array(await fs.readFile(file));
  const document = await getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages.join(" \n ");
}

function extractQuestionSections(text) {
  const normalized = normalizeIntent(text);
  const markers = [...normalized.matchAll(
    /(?:^|\s)(?:(\d{1,2})\.\s*출제의도|출제의도\s*(\d{1,2})\.)\s*:?\s*/g
  )];
  return markers.map((marker, index) => {
    const start = marker.index + marker[0].length;
    const end = markers[index + 1]?.index ?? normalized.length;
    const section = normalized.slice(start, end);
    const intent = normalizeIntent(section.split(/정답풀이\s*:/)[0]);
    const solution = normalizeIntent(section.split(/정답풀이\s*:/).slice(1).join(" "));
    return {
      questionNumber: Number(marker[1] || marker[2]),
      intent,
      solutionCharacters: solution.length,
    };
  });
}

function positionBand(questionNumber) {
  if ([13, 14].includes(questionNumber)) return "Q13_14";
  if ([20, 21].includes(questionNumber)) return "Q20_21";
  if ([27, 28].includes(questionNumber)) return "Q27_28";
  return "Q29_30_KILLER";
}

function familyFor(intent) {
  const normalized = normalizeIntent(intent);
  const compact = normalized.replace(/\s+/g, "");
  for (const [reason, pattern] of UNSUPPORTED_RULES) {
    if (pattern.test(normalized) || pattern.test(compact)) {
      return { status: "EXCLUDED", exclusionReason: reason, courseId: "", familyId: "", familyLabel: "" };
    }
  }
  for (const [familyId, courseId, familyLabel, pattern] of FAMILY_RULES) {
    if (pattern.test(normalized) || pattern.test(compact)) {
      return { status: "ACTIVE_REFERENCE", exclusionReason: "", courseId, familyId, familyLabel };
    }
  }
  return {
    status: "REVIEW_REQUIRED",
    exclusionReason: "UNCLASSIFIED_INTENT",
    courseId: "",
    familyId: "UNCLASSIFIED",
    familyLabel: "수동 분류 필요",
  };
}

function difficultyFor({ questionNumber, intent, solutionCharacters }) {
  const text = normalizeIntent(intent);
  let score = Number(POSITION_BASE[questionNumber] || 4);
  const structuralSignals = [
    /조건|모든|항상|존재|개수|정수|자연수/,
    /그래프|교점|구간|범위|영역/,
    /최댓값|최솟값|극값|필요충분/,
    /합성|역함수|점화식|정규분포|조건부/,
  ];
  score += structuralSignals.filter((pattern) => pattern.test(text)).length * 0.35;
  score += Math.min(1.1, Math.max(0, Number(solutionCharacters || 0) - 500) / 1800);
  const tierNumber = Math.max(1, Math.min(9, Math.round(score)));
  return {
    difficultyTier: `T${tierNumber}`,
    difficultyScore: Number(score.toFixed(2)),
    difficultyBasis: "POSITION_INTENT_STRUCTURE_SOLUTION_LENGTH",
  };
}

function shouldKeepCurrentQuestion(form, questionNumber, year) {
  if (year <= 2020) return true;
  if ([13, 14, 20, 21].includes(questionNumber)) {
    return form === "PROBABILITY_STATISTICS";
  }
  return ["PROBABILITY_STATISTICS", "CALCULUS"].includes(form);
}

function selectTargetSections(form, sections) {
  const target = sections.filter((question) => TARGET_QUESTIONS.includes(question.questionNumber));
  if (form.year <= 2020) {
    const selected = TARGET_QUESTIONS.flatMap((questionNumber) =>
      target.find((question) => question.questionNumber === questionNumber) || []
    );
    // 2020년 6월 가형 21번은 EBS 해설 PDF의 2단 편집 때문에 PDF 텍스트
    // 항목 순서가 뒤섞여 자동 marker가 소실된다. 해당 페이지를 직접 검수한
    // 추상 출제의도만 보완하며 원문 문제·해설은 저장하지 않는다.
    if (
      form.year === 2020 &&
      form.month === 6 &&
      form.form === "GA" &&
      !selected.some((question) => question.questionNumber === 21)
    ) {
      selected.push({
        questionNumber: 21,
        intent: "로그의 성질과 시그마 조건을 결합하여 자연수 해를 추론한다",
        solutionCharacters: 1400,
      });
    }
    return selected.sort((left, right) => left.questionNumber - right.questionNumber);
  }
  const selectionIndex = form.form === "CALCULUS" ? 1 : 0;
  return TARGET_QUESTIONS.flatMap((questionNumber) => {
    const matches = target.filter((question) => question.questionNumber === questionNumber);
    if ([13, 14, 20, 21].includes(questionNumber)) return matches.slice(0, 1);
    const selected = matches.length > selectionIndex ? matches[selectionIndex] : matches[0];
    return selected ? [selected] : [];
  });
}

function makeAbstractRecord(form, question) {
  const family = familyFor(question.intent);
  const difficulty = difficultyFor({ ...question });
  const sourceId = [form.year, String(form.month).padStart(2, "0"), form.form, `Q${question.questionNumber}`].join("-");
  return {
    sourceId,
    sourceAuthority: "KICE",
    archiveProvider: "EBSI",
    year: form.year,
    sessionMonth: form.month === 8 && form.year === 2022 ? 9 : form.month,
    administeredMonth: form.month,
    form: form.form,
    questionNumber: question.questionNumber,
    sourcePositionBand: positionBand(question.questionNumber),
    finalSlotInfluence: [29, 30].includes(question.questionNumber),
    status: family.status,
    exclusionReason: family.exclusionReason,
    courseId: family.courseId,
    courseLabel: COURSE_LABELS[family.courseId] || "",
    familyId: family.familyId,
    familyLabel: family.familyLabel,
    ...difficulty,
    structureMetrics: {
      solutionCharacterBand: question.solutionCharacters >= 1800
        ? "LONG"
        : question.solutionCharacters >= 900
          ? "MEDIUM"
          : "SHORT",
      // 공식 해설의 풀이에 그래프 사고가 등장할 수 있다는 조사 표식이다.
      // 문제 본문에 그래프가 실제로 제시됐다는 뜻이 아니며 런타임 렌더링에
      // 사용해서는 안 된다.
      solutionMayUseGraph: /그래프|교점|영역/.test(question.intent),
      hasCaseSignal: /경우|개수|범위|구간|모든/.test(question.intent),
      hasInverseConditionSignal: /조건|구하여라|만족/.test(question.intent),
    },
    problemUrl: form.problemUrl,
    solutionUrl: form.solutionUrl,
  };
}

function summarize(records, forms) {
  const active = records.filter((record) => record.status === "ACTIVE_REFERENCE");
  const countBy = (items, key) => Object.fromEntries(
    [...new Set(items.map((record) => record[key]).filter(Boolean))]
      .sort()
      .map((value) => [value, items.filter((record) => record[key] === value).length])
  );
  return {
    researchWindow: "2016-2026",
    excludedExamType: "CSAT",
    sessions: [...new Set(forms.map((form) => `${form.year}-${String(form.month === 8 && form.year === 2022 ? 9 : form.month).padStart(2, "0")}`))].length,
    sourceForms: forms.length,
    targetQuestionReferences: records.length,
    activeReferences: records.filter((record) => record.status === "ACTIVE_REFERENCE").length,
    excludedReferences: records.filter((record) => record.status === "EXCLUDED").length,
    reviewRequired: records.filter((record) => record.status === "REVIEW_REQUIRED").length,
    byCourse: countBy(active, "courseId"),
    byDifficulty: countBy(active, "difficultyTier"),
    byFamily: countBy(active, "familyId"),
    byPositionBand: countBy(active, "sourcePositionBand"),
  };
}

async function main() {
  const forms = await collectOfficialForms();
  const raw = [];
  for (const [index, form] of forms.entries()) {
    process.stdout.write(`[${index + 1}/${forms.length}] ${form.year} ${form.month} ${form.form}\n`);
    const file = await downloadPdf(form.solutionUrl);
    const text = await readPdfText(file);
    const sections = selectTargetSections(form, extractQuestionSections(text)).filter((question) =>
      shouldKeepCurrentQuestion(form.form, question.questionNumber, form.year)
    );
    raw.push({ ...form, questions: sections });
  }
  await fs.writeFile(RAW_RESEARCH_FILE, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  const records = raw.flatMap((form) => form.questions.map((question) => makeAbstractRecord(form, question)));
  const payload = {
    schemaVersion: "ARENA_OFFICIAL_MOCK_RESEARCH_V1",
    generatedAt: new Date().toISOString(),
    sourceNotice: "평가원 6·9월 모의평가의 공식 EBSi 해설에서 출제의도만 분석하고 원문 문제·정답·해설은 저장하지 않음",
    methodology: {
      targetYears: [2016, 2026],
      targetQuestions: TARGET_QUESTIONS,
      sourcePositionsAreAuxiliary: true,
      difficultySignals: ["문항 위치", "출제의도 구조", "조건 신호", "풀이 구조 길이"],
      fifthSlotRule: "Q29_30_KILLER",
    },
    summary: summarize(records, forms),
    records,
  };
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${OUTPUT_FILE}\n${JSON.stringify(payload.summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
