#!/usr/bin/env node

/**
 * 2016년 이후 고3 전국연합학력평가·모의평가의 수학 전 문항 해설과
 * EBSi 자체분석 문항 정답률을 결합해 GOAT Arena용 추상 유형·난이도
 * 메타데이터를 만든다.
 *
 * 원문 문제·정답·해설 전문은 저장하지 않는다. 최종 산출물에는 공식 출처,
 * 시행 정보, 추상 유형, 과목, 정답률 근거와 보수적 난이도 구간만 남긴다.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import accuracyPolicy from "../services/arenaAccuracyDifficultyPolicy.js";

const {
  ARENA_ACCURACY_DIFFICULTY_POLICY_VERSION,
  classifyAccuracyEvidence,
  sourceBandForDifficultyClass,
} = accuracyPolicy;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_FILE = path.join(
  PROJECT_ROOT,
  "dataAnalysis/arenaOfficialMockTypeCatalog2016_2026.json"
);
const CACHE_DIR = "/private/tmp/pdfs/matths-arena-official-mock-research";
const RAW_RESEARCH_FILE = "/private/tmp/matths-arena-official-mock-raw-intents.json";
const EBS_AJAX_URL = "https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperListAjax.ajax";
const EBS_DOWNLOAD_ROOT = "https://wdown.ebsi.co.kr/W61001/01exam";
const EBS_WRONG_ANSWER_ROOT = "https://www.ebsi.co.kr/ebs/xip/xipa";
const TARGET_QUESTIONS = Object.freeze(
  Array.from({ length: 30 }, (_unused, index) => index + 1)
);
// 월을 미리 선별하지 않는다. EBSi 고3 목록에 존재하는 2016~2026 전월을
// 조회한 뒤 실제 수능 제목만 제외해 월별 모의고사를 빠뜨리지 않는다.
const TARGET_MONTHS = Object.freeze(
  Array.from({ length: 12 }, (_unused, index) => index + 1)
);
const TARGET_MONTH_LIST = TARGET_MONTHS.map((month) => String(month).padStart(2, "0")).join(",");
let pdfDocumentLoader = null;

function installPdfTextExtractionPolyfills() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(values = [1, 0, 0, 1, 0, 0]) {
        const source = Array.isArray(values) || ArrayBuffer.isView(values)
          ? [...values]
          : [1, 0, 0, 1, 0, 0];
        [this.a, this.b, this.c, this.d, this.e, this.f] = [
          Number(source[0] ?? 1),
          Number(source[1] ?? 0),
          Number(source[2] ?? 0),
          Number(source[3] ?? 1),
          Number(source[4] ?? 0),
          Number(source[5] ?? 0),
        ];
      }

      multiplySelf(other) {
        const right = other instanceof globalThis.DOMMatrix
          ? other
          : new globalThis.DOMMatrix(other);
        const { a, b, c, d, e, f } = this;
        this.a = a * right.a + c * right.b;
        this.b = b * right.a + d * right.b;
        this.c = a * right.c + c * right.d;
        this.d = b * right.c + d * right.d;
        this.e = a * right.e + c * right.f + e;
        this.f = b * right.e + d * right.f + f;
        return this;
      }

      preMultiplySelf(other) {
        const left = new globalThis.DOMMatrix(other);
        left.multiplySelf(this);
        Object.assign(this, left);
        return this;
      }

      translate(tx = 0, ty = 0) {
        return new globalThis.DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f])
          .multiplySelf(new globalThis.DOMMatrix([1, 0, 0, 1, tx, ty]));
      }

      scale(value = 1) {
        return new globalThis.DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f])
          .multiplySelf(new globalThis.DOMMatrix([value, 0, 0, value, 0, 0]));
      }

      inverse() {
        const determinant = this.a * this.d - this.b * this.c;
        if (!determinant) return new globalThis.DOMMatrix();
        return new globalThis.DOMMatrix([
          this.d / determinant,
          -this.b / determinant,
          -this.c / determinant,
          this.a / determinant,
          (this.c * this.f - this.d * this.e) / determinant,
          (this.b * this.e - this.a * this.f) / determinant,
        ]);
      }
    };
  }
  if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = class ImageData {};
  }
  if (typeof globalThis.Path2D === "undefined") {
    globalThis.Path2D = class Path2D {};
  }
}

async function getPdfDocumentLoader() {
  if (pdfDocumentLoader) return pdfDocumentLoader;
  installPdfTextExtractionPolyfills();
  ({ getDocument: pdfDocumentLoader } = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  ));
  return pdfDocumentLoader;
}

const COURSE_LABELS = Object.freeze({
  "common-math-1": "공통수학Ⅰ",
  "common-math-2": "공통수학Ⅱ",
  algebra: "대수",
  "probability-statistics": "확률과 통계",
  "calculus-1": "미적분Ⅰ",
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
  const pages = [];
  for (let currentPage = 1; currentPage <= 30; currentPage += 1) {
    const html = await fetchIndexPage({ currentPage, yearList, monthList: TARGET_MONTH_LIST });
    const entries = parseIndexHtml(html);
    if (!entries.length) break;
    pages.push(entries);
  }
  // EBSi에서 2022년 9월 자료가 시행월 8월로 분류된 예외를 보완한다.
  const september2022 = await fetchIndexPage({ currentPage: 1, yearList: "2022", monthList: "08" });
  const all = [...pages.flat(), ...parseIndexHtml(september2022)];
  const deduped = [...new Map(all.map((entry) => [entry.solutionUrl, entry])).values()];
  return deduped.filter((entry) => {
    const sessionMonth = entry.month === 8 && entry.year === 2022 ? 9 : entry.month;
    if (!TARGET_MONTHS.includes(sessionMonth)) return false;
    if (/대학수학능력시험|\b수능\b/.test(entry.title)) return false;
    if (entry.year <= 2020) return ["GA", "NA"].includes(entry.form);
    return ["PROBABILITY_STATISTICS", "CALCULUS"].includes(entry.form);
  });
}

async function postEbsiJson(pathname, data = {}) {
  const response = await fetch(`${EBS_WRONG_ANSWER_ROOT}/${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams(data),
  });
  if (!response.ok) {
    throw new Error(`EBSi 정답률 요청 실패 ${response.status}: ${pathname}`);
  }
  return response.json();
}

async function postEbsiHtml(pathname, data = {}) {
  const response = await fetch(`${EBS_WRONG_ANSWER_ROOT}/${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams(data),
  });
  if (!response.ok) {
    throw new Error(`EBSi 정답률 표 요청 실패 ${response.status}: ${pathname}`);
  }
  return response.text();
}

function accuracyFormForSubject(subjectLabel) {
  const compact = compactText(subjectLabel).replace(/\s+/g, "");
  if (compact.includes("확률과통계")) return "PROBABILITY_STATISTICS";
  if (compact.includes("미적분")) return "CALCULUS";
  if (compact.includes("수학가형")) return "GA";
  if (compact.includes("수학나형")) return "NA";
  return "";
}

function parseWrongAnswerRows(html) {
  return [...String(html || "").matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((match) => {
      const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
        .map((cell) => compactText(cell[1]));
      if (cells.length < 5) return null;
      const rank = Number(cells[0]);
      const questionNumber = Number(cells[1]);
      const wrongRatePercent = Number(cells[2]);
      const itemId = Number(match[1].match(/itemView\((\d+)\)/)?.[1] || 0);
      if (
        !Number.isInteger(rank) ||
        !TARGET_QUESTIONS.includes(questionNumber) ||
        !Number.isFinite(wrongRatePercent)
      ) {
        return null;
      }
      return {
        rank,
        questionNumber,
        wrongRatePercent,
        correctRatePercent: Number((100 - wrongRatePercent).toFixed(1)),
        points: Number(cells[3]) || null,
        itemId: itemId || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.questionNumber - right.questionNumber);
}

function normalizedSessionMonth(year, month) {
  return Number(year) === 2022 && Number(month) === 8 ? 9 : Number(month);
}

async function collectOfficialAccuracyPapers() {
  const papers = [];
  for (let year = 2016; year <= 2026; year += 1) {
    const monthPayload = await postEbsiJson(
      "retrieveWrongAnswerRateMonthList.ajax",
      { year: String(year), targetCd: "D300" }
    );
    for (const monthEntry of monthPayload.result || []) {
      const month = Number(monthEntry.value);
      const sessionMonth = normalizedSessionMonth(year, month);
      if (!TARGET_MONTHS.includes(sessionMonth)) continue;
      const subjectPayload = await postEbsiJson(
        "retrieveWrongAnswerRateSubjList.ajax",
        {
          year: String(year),
          targetCd: "D300",
          irecord: String(monthEntry.code),
          arOrd: "2",
        }
      );
      for (const subject of subjectPayload.result || []) {
        const form = accuracyFormForSubject(subject.value);
        if (!form) continue;
        const paperId = String(subject.code || "");
        const html = await postEbsiHtml("retrieveWrongAnswerRateList.ajax", {
          paperId,
        });
        const rows = parseWrongAnswerRows(html);
        if (!rows.length) continue;
        papers.push({
          year,
          sessionMonth,
          administeredMonth: month,
          irecord: String(monthEntry.code),
          form,
          subjectLabel: compactText(subject.value),
          paperId,
          rows,
          top15WrongRateCutoffPercent: Math.min(
            ...rows.map((row) => row.wrongRatePercent)
          ),
          sourceUrl:
            "https://www.ebsi.co.kr/ebs/xip/xipa/retrievePastGrdCutWrongAnswerRate.ebs?tab=2",
        });
      }
    }
  }
  return papers;
}

function accuracyPaperKey({ year, sessionMonth, form }) {
  return `${year}:${sessionMonth}:${form}`;
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
  const getDocument = await getPdfDocumentLoader();
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
    /(?:^|\s)(?:(\d{1,2})\.\s*(?:\[\s*)?출제의도(?:\s*\])?|(?:\[\s*)?출제의도(?:\s*\])?\s*(\d{1,2})\.)\s*:?\s*/g
  )];
  return markers.map((marker, index) => {
    const start = marker.index + marker[0].length;
    const end = markers[index + 1]?.index ?? normalized.length;
    const section = normalized.slice(start, end);
    const parts = section.split(/정답풀이\s*:/);
    const isEducationOfficeFormat = /\[\s*출제의도\s*\]/.test(marker[0]);
    // 교육청 해설지는 출제의도 바로 뒤에 풀이를 이어 쓰므로 별도
    // `정답풀이:` 표지가 없다. 유형 분류에는 앞부분만 사용하고,
    // 풀이 구조 길이는 해당 문항 구간 전체에서 계산한다.
    const intent = isEducationOfficeFormat
      ? normalizeIntent(parts[0]).slice(0, 220)
      : normalizeIntent(parts[0]);
    const solution = isEducationOfficeFormat
      ? normalizeIntent(section)
      : normalizeIntent(parts.slice(1).join(" "));
    return {
      questionNumber: Number(marker[1] || marker[2]),
      intent,
      solutionCharacters: solution.length,
    };
  });
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

function conservativeTierForAccuracy({
  correctRatePercent,
  correctRateLowerBoundPercent,
  difficultyClass,
} = {}) {
  if (difficultyClass === "UNRESOLVED") return "";
  const hasExact =
    correctRatePercent !== null &&
    correctRatePercent !== undefined &&
    correctRatePercent !== "";
  const percent = hasExact && Number.isFinite(Number(correctRatePercent))
    ? Number(correctRatePercent)
    : Number(correctRateLowerBoundPercent);
  if (!Number.isFinite(percent)) return "";
  if (percent >= 90) return "T1";
  if (percent >= 80) return "T2";
  if (percent >= 70) return "T3";
  if (percent >= 60) return "T4";
  if (percent >= 50) return "T5";
  if (percent >= 40) return "T6";
  if (percent >= 30) return "T7";
  if (percent >= 15) return "T8";
  return "T9";
}

function accuracyEvidenceForQuestion(accuracyPaper, questionNumber) {
  if (!accuracyPaper) {
    return {
      metricKind: "UNAVAILABLE",
      runtimeEligible: false,
      correctRatePercent: null,
      correctRateLowerBoundPercent: null,
      correctRateUpperBoundPercent: null,
      wrongRatePercent: null,
      wrongRateUpperBoundPercent: null,
      paperId: "",
      itemId: null,
      sourceUrl: "",
    };
  }
  const exact = accuracyPaper.rows.find(
    (row) => row.questionNumber === questionNumber
  );
  if (exact) {
    return {
      metricKind: "EBSI_OBSERVED_TOP15",
      runtimeEligible: true,
      correctRatePercent: exact.correctRatePercent,
      correctRateLowerBoundPercent: exact.correctRatePercent,
      correctRateUpperBoundPercent: exact.correctRatePercent,
      wrongRatePercent: exact.wrongRatePercent,
      wrongRateUpperBoundPercent: exact.wrongRatePercent,
      points: exact.points,
      paperId: accuracyPaper.paperId,
      itemId: exact.itemId,
      sourceUrl: accuracyPaper.sourceUrl,
    };
  }
  const lowerBound = Number(
    (100 - accuracyPaper.top15WrongRateCutoffPercent).toFixed(1)
  );
  return {
    metricKind: "EBSI_TOP15_CENSORED_LOWER_BOUND",
    runtimeEligible: true,
    correctRatePercent: null,
    correctRateLowerBoundPercent: lowerBound,
    correctRateUpperBoundPercent: 100,
    wrongRatePercent: null,
    wrongRateUpperBoundPercent: accuracyPaper.top15WrongRateCutoffPercent,
    points: null,
    paperId: accuracyPaper.paperId,
    itemId: null,
    sourceUrl: accuracyPaper.sourceUrl,
  };
}

function selectTargetSections(form, sections) {
  const target = sections.filter((question) => TARGET_QUESTIONS.includes(question.questionNumber));
  const selected = TARGET_QUESTIONS.flatMap((questionNumber) =>
    target.find((question) => question.questionNumber === questionNumber) || []
  );
  if (form.year <= 2020) {
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
  // 2021학년도 이후 공통 1~22번은 확률과 통계 응시 집단의 정답률을
  // 대표값으로 한 번만 저장하고, 미적분 파일에서는 선택 23~30번만 남긴다.
  return form.form === "CALCULUS"
    ? selected.filter((question) => question.questionNumber >= 23)
    : selected;
}

function makeAbstractRecord(form, question, accuracyPaper) {
  const family = familyFor(question.intent);
  const accuracyEvidence = accuracyEvidenceForQuestion(
    accuracyPaper,
    question.questionNumber
  );
  const classification = classifyAccuracyEvidence(accuracyEvidence);
  const difficultyTier = conservativeTierForAccuracy({
    ...classification,
    difficultyClass: classification.difficultyClass,
  });
  const sessionMonth = form.month === 8 && form.year === 2022 ? 9 : form.month;
  const isKiceMock = [6, 9].includes(sessionMonth);
  const sourceAuthority = isKiceMock ? "KICE" : "EDUCATION_OFFICE";
  const sourceId = [form.year, String(sessionMonth).padStart(2, "0"), sourceAuthority, form.form, `Q${question.questionNumber}`].join("-");
  return {
    sourceId,
    sourceAuthority,
    sourceKind: isKiceMock ? "MOCK_EVALUATION" : "NATIONAL_ACHIEVEMENT_TEST",
    archiveProvider: "EBSI",
    year: form.year,
    sessionMonth,
    administeredMonth: form.month,
    form: form.form,
    questionNumber: question.questionNumber,
    sourcePositionBand: sourceBandForDifficultyClass(
      classification.difficultyClass
    ),
    finalSlotInfluence: classification.difficultyClass === "KILLER",
    status: family.status,
    exclusionReason: family.exclusionReason,
    courseId: family.courseId,
    courseLabel: COURSE_LABELS[family.courseId] || "",
    familyId: family.familyId,
    familyLabel: family.familyLabel,
    difficultyTier,
    difficultyClass: classification.difficultyClass,
    difficultyPolicyVersion: ARENA_ACCURACY_DIFFICULTY_POLICY_VERSION,
    difficultyBasis:
      classification.classificationConfidence === "EXACT"
        ? "EBSI_OBSERVED_CORRECT_RATE"
        : classification.classificationConfidence === "CENSORED_BOUND"
          ? "EBSI_TOP15_CENSORED_CORRECT_RATE_BOUND"
          : "UNRESOLVED_ACCURACY_EVIDENCE",
    runtimeDifficultyEligible:
      family.status === "ACTIVE_REFERENCE" &&
      classification.difficultyClass !== "UNRESOLVED",
    accuracyEvidence: {
      ...accuracyEvidence,
      classificationConfidence: classification.classificationConfidence,
    },
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
  const runtimeEligible = active.filter(
    (record) => record.runtimeDifficultyEligible === true
  );
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
    runtimeDifficultyEligibleReferences: runtimeEligible.length,
    exactAccuracyReferences: records.filter(
      (record) => record.accuracyEvidence?.metricKind === "EBSI_OBSERVED_TOP15"
    ).length,
    censoredAccuracyReferences: records.filter(
      (record) =>
        record.accuracyEvidence?.metricKind ===
        "EBSI_TOP15_CENSORED_LOWER_BOUND"
    ).length,
    unavailableAccuracyReferences: records.filter(
      (record) => record.accuracyEvidence?.metricKind === "UNAVAILABLE"
    ).length,
    excludedReferences: records.filter((record) => record.status === "EXCLUDED").length,
    reviewRequired: records.filter((record) => record.status === "REVIEW_REQUIRED").length,
    byCourse: countBy(active, "courseId"),
    byDifficulty: countBy(active, "difficultyTier"),
    byDifficultyClass: countBy(runtimeEligible, "difficultyClass"),
    byAccuracyEvidence: countBy(records, "difficultyBasis"),
    byFamily: countBy(active, "familyId"),
    byPositionBand: countBy(active, "sourcePositionBand"),
    bySessionMonth: countBy(active, "sessionMonth"),
    byAuthority: countBy(active, "sourceAuthority"),
  };
}

async function main() {
  const [forms, accuracyPapers] = await Promise.all([
    collectOfficialForms(),
    collectOfficialAccuracyPapers(),
  ]);
  const accuracyPaperMap = new Map(
    accuracyPapers.map((paper) => [accuracyPaperKey(paper), paper])
  );
  const raw = [];
  for (const [index, form] of forms.entries()) {
    process.stdout.write(`[${index + 1}/${forms.length}] ${form.year} ${form.month} ${form.form}\n`);
    const file = await downloadPdf(form.solutionUrl);
    const text = await readPdfText(file);
    const sections = selectTargetSections(form, extractQuestionSections(text));
    raw.push({ ...form, questions: sections });
  }
  await fs.writeFile(RAW_RESEARCH_FILE, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  const records = raw.flatMap((form) => {
    const sessionMonth = normalizedSessionMonth(form.year, form.month);
    const accuracyPaper = accuracyPaperMap.get(
      accuracyPaperKey({
        year: form.year,
        sessionMonth,
        form: form.form,
      })
    );
    return form.questions.map((question) =>
      makeAbstractRecord(form, question, accuracyPaper)
    );
  });
  const payload = {
    schemaVersion: "ARENA_OFFICIAL_MOCK_RESEARCH_V3",
    generatedAt: new Date().toISOString(),
    sourceNotice: "2016년 이후 고3 전국연합학력평가·모의평가의 EBSi 해설 출제의도와 EBSi 자체분석 문항 정답률을 결합하고 원문 문제·정답·해설은 저장하지 않음. 수능은 제외함",
    methodology: {
      targetYears: [2016, 2026],
      targetGrade: 3,
      queriedMonths: TARGET_MONTHS,
      targetMonths: [...new Set(forms.map((form) =>
        normalizedSessionMonth(form.year, form.month)
      ))].sort((left, right) => left - right),
      targetQuestions: TARGET_QUESTIONS,
      excludedExamTypes: ["CSAT"],
      sourcePositionsAreAuxiliary: true,
      difficultyPolicyVersion: ARENA_ACCURACY_DIFFICULTY_POLICY_VERSION,
      difficultySignals: [
        "EBSi 자체분석 문항 정답률",
        "EBSi 오답률 TOP15 비노출 문항의 검증 가능한 정답률 하한",
      ],
      accuracyEvidencePolicy:
        "TOP15는 정확한 정답률로 분류하고 비노출 문항은 하한과 상한이 하나의 난이도 구간에 완전히 포함될 때만 확정",
      fifthSlotRule: "TIER_ACCURACY_CLASS_MIX",
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
