/*
 * 최근 5개년 수학 모의고사 레퍼런스 코퍼스
 *
 * 기준
 * - 2022~2026년(2026년은 7월 25일 현재 공개분)
 * - 고1·고2 교육청 전국연합학력평가 전체
 * - 고3 교육청 전국연합학력평가 + 평가원 6·9월 모의평가 전체
 * - 고3은 공통 문항과 두 선택과목 분석을 위해 미적분/확률과 통계
 *   문제지를 각각 포함합니다.
 * - 수능 본시험은 '모의고사' 코퍼스에서 제외합니다.
 *
 * 원문 문제를 서비스에 복제하지 않고, 출제 유형·필요 개념·풀이
 * 단계를 분석한 메타데이터만 평가 생성기에 사용합니다.
 */

const ARCHIVE_URLS = {
  1: "https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs?targetCd=D100",
  2: "https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs?targetCd=D200",
  3: "https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs?targetCd=D300",
};

const YEARS = [
  2022,
  2023,
  2024,
  2025,
  2026,
];

const GRADE_ONE_TWO_SCHEDULES = {
  2022: [
    [3, "서울"],
    [6, "부산"],
    [9, "인천"],
    [11, "경기"],
  ],
  2023: [
    [3, "서울"],
    [6, "부산"],
    [9, "인천"],
    [11, "경기"],
  ],
  2024: [
    [3, "서울"],
    [6, "부산"],
    [9, "인천"],
    [10, "경기"],
  ],
  2025: [
    [3, "서울"],
    [6, "부산"],
    [9, "인천"],
    [10, "경기"],
  ],
  2026: [
    [3, "서울"],
    [6, "부산"],
  ],
};

const GRADE_THREE_SCHEDULES = {
  2022: [
    [3, "서울", "학평"],
    [4, "경기", "학평"],
    [6, "평가원", "모평"],
    [7, "인천", "학평"],
    [9, "평가원", "모평"],
    [10, "서울", "학평"],
  ],
  2023: [
    [3, "서울", "학평"],
    [4, "경기", "학평"],
    [6, "평가원", "모평"],
    [7, "인천", "학평"],
    [9, "평가원", "모평"],
    [10, "서울", "학평"],
  ],
  2024: [
    [3, "서울", "학평"],
    [4, "경기", "학평"],
    [6, "평가원", "모평"],
    [7, "인천", "학평"],
    [9, "평가원", "모평"],
    [10, "서울", "학평"],
  ],
  2025: [
    [3, "서울", "학평"],
    [5, "경기", "학평"],
    [6, "평가원", "모평"],
    [7, "인천", "학평"],
    [9, "평가원", "모평"],
    [10, "서울", "학평"],
  ],
  2026: [
    [3, "서울", "학평"],
    [5, "경기", "학평"],
    [6, "평가원", "모평"],
    [7, "인천", "학평"],
  ],
};

function twoDigits(value) {
  return String(value).padStart(2, "0");
}

function sessionId({
  year,
  grade,
  month,
}) {
  return [
    year,
    `g${grade}`,
    twoDigits(month),
  ].join("-");
}

function makeSession({
  year,
  grade,
  month,
  host,
  kind,
  selections,
}) {
  const id = sessionId({
    year,
    grade,
    month,
  });

  return {
    id,
    year,
    grade,
    month,
    host,
    kind,
    archiveUrl:
      ARCHIVE_URLS[grade],
    selections,
  };
}

const MOCK_EXAM_SESSIONS = [
  ...[1, 2].flatMap((grade) =>
    YEARS.flatMap((year) =>
      GRADE_ONE_TWO_SCHEDULES[
        year
      ].map(([month, host]) =>
        makeSession({
          year,
          grade,
          month,
          host,
          kind: "학평",
          selections: ["수학"],
        })
      )
    )
  ),
  ...YEARS.flatMap((year) =>
    GRADE_THREE_SCHEDULES[
      year
    ].map(([month, host, kind]) =>
      makeSession({
        year,
        grade: 3,
        month,
        host,
        kind,
        selections: [
          "미적분",
          "확률과 통계",
        ],
      })
    )
  ),
];

const MOCK_EXAM_PAPERS =
  MOCK_EXAM_SESSIONS.flatMap(
    (session) =>
      session.selections.map(
        (selection) => ({
          id:
            `${session.id}-${selection === "수학"
              ? "math"
              : selection === "미적분"
                ? "calculus"
                : "probability"}`,
          sessionId: session.id,
          year: session.year,
          grade: session.grade,
          month: session.month,
          host: session.host,
          kind: session.kind,
          selection,
          title:
            `고${session.grade} ${session.month}월 ${session.kind}` +
            `(${session.host}) ${selection}`,
          archiveUrl:
            session.archiveUrl,
          archiveFilters: {
            year: session.year,
            month: session.month,
            subject: selection,
          },
          analysisStatus: "indexed",
        })
      )
  );

const UNIT_REFERENCE_RULES = {
  "algebra/exponential-logarithmic-functions": {
    corpusFilter: (paper) =>
      paper.grade < 3 ||
      paper.selection === "미적분",
    signals: [
      "지수·로그 식의 치환과 해의 조건",
      "지수·로그 그래프의 교점과 평행이동",
      "상용로그를 이용한 자릿수·소수부분 해석",
      "지수·로그 방정식과 부등식의 매개변수",
    ],
  },
  "algebra/trigonometric-functions": {
    corpusFilter: (paper) =>
      paper.grade < 3 ||
      paper.selection === "미적분",
    signals: [
      "삼각함수 그래프의 주기·최대최소 역추론",
      "일반각의 사분면과 삼각함수 값",
      "사인법칙·코사인법칙·넓이의 연쇄 적용",
      "도형 조건에서 길이와 각을 단계적으로 복원",
    ],
  },
  "algebra/sequences": {
    corpusFilter: (paper) =>
      paper.grade < 3 ||
      paper.selection === "미적분",
    signals: [
      "부분합으로 일반항 복원",
      "등차·등비 조건의 연립",
      "점화식의 블록·주기 분석",
      "시그마 변형과 망원합",
      "정수·자연수 조건을 이용한 후보 제거",
    ],
  },
  "calculus-1/limits-and-continuity": {
    corpusFilter: (paper) =>
      paper.grade >= 2 &&
      (
        paper.grade < 3 ||
        paper.selection === "미적분"
      ),
    signals: [
      "인수분해·유리화 후 극한",
      "좌극한·우극한·함숫값의 일치",
      "구간별 함수의 연속 조건으로 매개변수 결정",
      "중간값 정리의 존재 구간 판정",
    ],
  },
  "calculus-1/differentiation": {
    corpusFilter: (paper) =>
      paper.grade >= 2 &&
      (
        paper.grade < 3 ||
        paper.selection === "미적분"
      ),
    signals: [
      "도함수의 근에서 증가·감소와 극값 복원",
      "접선 조건과 다항함수 계수 결정",
      "방정식 실근 개수를 그래프 교점으로 변환",
      "위치·속도·가속도의 단계적 해석",
      "후속 적분 문항에서 적분 직전 단계까지만 절단",
    ],
  },
  "calculus-1/integration": {
    corpusFilter: (paper) =>
      paper.grade >= 2 &&
      (
        paper.grade < 3 ||
        paper.selection === "미적분"
      ),
    signals: [
      "도함수 조건에서 원함수를 복원한 뒤 정적분",
      "교점과 함수의 대소를 판정한 뒤 넓이 계산",
      "속도의 부호 변화 시점을 찾아 이동거리 계산",
      "정적분으로 정의된 함수의 조건 해석",
    ],
  },
  "probability-statistics/counting": {
    corpusFilter: (paper) =>
      paper.grade < 3 ||
      paper.selection ===
        "확률과 통계",
    signals: [
      "중복·인접·양끝 조건이 있는 배열",
      "포함배제로 금지 조건 제거",
      "중복조합의 하한·상한 치환",
      "이항계수의 특정 항과 계수합",
    ],
  },
  "probability-statistics/probability": {
    corpusFilter: (paper) =>
      paper.grade < 3 ||
      paper.selection ===
        "확률과 통계",
    signals: [
      "조건부확률에서 표본공간 축소",
      "독립 시행과 여사건",
      "베이즈형 원인 역추론",
      "비복원 추출의 단계별 조건 갱신",
    ],
  },
  "probability-statistics/statistics": {
    corpusFilter: (paper) =>
      paper.grade < 3 ||
      paper.selection ===
        "확률과 통계",
    signals: [
      "확률분포표에서 미지 확률과 기댓값 복원",
      "이항분포의 평균·분산 역추론",
      "정규분포 표준화와 대칭성",
      "표본평균의 분포와 표본 크기",
      "신뢰구간 길이의 역산",
    ],
  },
};

function getUnitReferenceAnalysis(
  courseId,
  unitId
) {
  const key = `${courseId}/${unitId}`;
  const rule =
    UNIT_REFERENCE_RULES[key];

  if (!rule) return null;

  const papers =
    MOCK_EXAM_PAPERS.filter(
      rule.corpusFilter
    );

  return {
    key,
    years: YEARS.slice(),
    signals: rule.signals.slice(),
    paperIds: papers.map(
      (paper) => paper.id
    ),
    sessionIds: [
      ...new Set(
        papers.map(
          (paper) =>
            paper.sessionId
        )
      ),
    ],
  };
}

function referenceIdsForTemplate(
  courseId,
  unitId,
  templateIndex,
  count = 5
) {
  const analysis =
    getUnitReferenceAnalysis(
      courseId,
      unitId
    );

  if (!analysis) return [];

  const ids = analysis.paperIds;
  const selected = [];

  for (
    let offset = 0;
    offset < ids.length &&
    selected.length < count;
    offset += 1
  ) {
    const index =
      (
        templateIndex +
        offset *
          Math.max(
            1,
            Math.floor(
              ids.length / count
            )
          )
      ) % ids.length;
    const id = ids[index];

    if (!selected.includes(id)) {
      selected.push(id);
    }
  }

  return selected;
}

if (MOCK_EXAM_PAPERS.length !== 92) {
  throw new Error(
    `최근 5개년 모의고사 코퍼스는 92개 문제지여야 합니다: ${MOCK_EXAM_PAPERS.length}`
  );
}

module.exports = {
  YEARS,
  ARCHIVE_URLS,
  MOCK_EXAM_SESSIONS,
  MOCK_EXAM_PAPERS,
  UNIT_REFERENCE_RULES,
  getUnitReferenceAnalysis,
  referenceIdsForTemplate,
};
