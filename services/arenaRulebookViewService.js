const {
  DEFAULT_DAILY_MATCH_LIMITS_BY_TIER,
  defaultLearningPackagePolicyDefinition,
  mainPolicySnapshot,
} = require("./arenaPolicyService");
const {
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  PACK_RULES,
  TIER_LABELS,
  TIER_SPECS,
} = require("./arenaOneOnOneDifficultyPolicy");

const PAYBACK_RULEBOOK_BASELINE_AT =
  new Date("2026-08-02T00:00:00+09:00");

const COMMON_MATCH_SUMMARY = [
  "두 사용자는 같은 주관식 준킬러 5문항을 10분 동안 풉니다.",
  "이전 문항으로 돌아갈 수 없고, 5번 문항 완료 또는 시간 종료 뒤 문제는 닫힙니다.",
  "문제가 닫힌 뒤 60초 안에 풀이 증거 사진 1~5장을 제출합니다.",
  "승패는 점수 → 정답 수 → 정답 문항 풀이시간 → 전체 풀이시간 순으로 정합니다.",
  "완전히 동점이면 방어자가 승리합니다.",
  "1대1 경기로 내부 실력 지표는 바뀌지 않습니다. 도전자가 이기면 티어·티어 내 순위·GP가 함께 교환됩니다.",
];

const RULEBOOKS = {
  SUB: {
    division: "SUB",
    title: "Sub Division 경기 규정",
    eyebrow: "SUB DIVISION RULEBOOK",
    intro:
      "Sub Division은 학습권 패키지의 정기권 학습 가능 일수와 페이백 점수를 관리하며, 바로 위 티어를 상대로 Arena 상태를 쟁탈하는 경쟁 구간입니다.",
    summary: COMMON_MATCH_SUMMARY,
    rules: [
      {
        number: 1,
        title: "참가 자격과 경기 종류",
        sections: [
          { title: "이용 자격", body: ["학습권 패키지가 활성 상태이고 배치고사를 완료해야 합니다.", "사용 가능한 정기권 학습 가능 일수가 0일이면 공격·방어·복수전과 신규 매칭이 모두 중단됩니다.", "학습권 만료 뒤 29일 학습권 패키지를 다시 구매하면 이전 배치를 재사용하지 않고 배치고사를 다시 완료해야 합니다."] },
          { title: "공식 경기", body: ["Sub Division의 공식 1대1은 일반 쟁탈전과 복수전뿐입니다.", "별도의 일반전은 존재하지 않습니다."] },
        ],
      },
      {
        number: 2,
        title: "도전 대상과 자동 매칭",
        sections: [
          { title: "기본 대상", body: ["도전자는 자신의 바로 위 티어만 선택할 수 있습니다.", "사용자는 상대의 닉네임이나 특정 계정을 고를 수 없으며, 서버가 선택한 티어 안의 적격 사용자 한 명을 무작위로 정합니다.", "선정된 상위 티어 사용자는 자동 참가합니다."] },
          { title: "경계 티어 예외", body: ["브론즈는 브론즈 또는 실버에 도전할 수 있습니다.", "챌린저는 챌린저에게 도전할 수 있습니다.", "그 밖의 같은 티어 또는 두 단계 이상 차이 나는 도전은 거절됩니다."] },
          { title: "시작 기한", body: ["공식 매치가 만들어진 뒤 양측은 24시간 안에 시작해야 합니다.", "다만 일요일을 통과하면 시작 마감은 일요일 14:30으로 앞당겨집니다."] },
        ],
      },
      {
        number: 3,
        title: "응시 진행과 증거",
        sections: [
          { title: "응시 방식", body: ["총 제한시간은 10분이며 문항별 풀이시간과 전체 풀이시간을 서버 시각으로 저장합니다.", "다음 문항으로 이동하면 이전 문제를 다시 보거나 답을 고칠 수 없습니다."] },
          { title: "풀이 증거", body: ["5번 문항 완료 또는 시간 종료 뒤 문제 화면을 닫고 60초 동안 사진 1~5장을 받습니다.", "상대에게는 증거를 공개하지 않으며 운영자는 관리자 화면에서 열람합니다."] },
        ],
      },
      {
        number: 4,
        title: "승패와 Arena 상태 교환",
        sections: [
          { title: "판정 순서", body: ["점수가 높은 사용자를 먼저 봅니다.", "점수가 같으면 정답 수, 정답 문항 풀이시간, 전체 풀이시간 순으로 비교합니다.", "네 기준이 모두 같으면 방어자가 승리합니다."] },
          { title: "도전자 승리", body: ["두 사용자의 티어·티어 내 순위·GP를 한 번의 정산으로 모두 교환합니다.", "내부 실력 지표는 변경하지 않습니다."] },
          { title: "방어자 승리", body: ["양측의 티어·티어 내 순위·GP는 그대로 유지됩니다.", "내부 실력 지표는 변경하지 않습니다."] },
        ],
      },
      {
        number: 5,
        title: "일반 쟁탈전 페이백 점수",
        sections: [
          { title: "경기 생성", body: ["도전자는 페이백 점수 1점을 예치합니다.", "방어자는 경기 생성 시 어떤 점수도 예치하지 않으며, Sub 경기로 정기권 학습 가능 일수는 바뀌지 않습니다."] },
          { title: "도전자 승리", body: ["실버 이상에서 시작한 도전자가 예치한 1점은 소각됩니다.", "브론즈에서 시작한 도전자가 이기면 예치한 1점을 반환해 페이백 점수의 순변화가 없습니다."] },
          { title: "방어자 승리", body: ["방어자의 현재 Arena 상태를 유지하고 도전자가 예치한 페이백 점수 1점을 가져옵니다."] },
          { title: "0점과 패키지 만료", body: ["페이백 점수가 0점이면 일반 공격과 복수전 신청만 중단되며, 활성 29일 패키지의 남은 기능과 방어 자격은 유지됩니다.", "정기권 학습 가능 일수가 0일이 되어 29일 패키지가 끝나면 GOAT Arena 전체가 잠기고 방어 후보에서도 제외됩니다."] },
        ],
      },
      {
        number: 6,
        title: "복수전",
        sections: [
          { title: "신청", body: ["가장 최근 원경기의 패자에게 결과 화면에서 한 번만 복수전 선택권을 줍니다.", "복수하기를 누르면 페이백 점수 2점을 예치하고 상대는 선택권 없이 자동 참가합니다.", "경기 종료를 누르면 해당 원경기의 복수전 권리는 즉시 사라집니다."] },
          { title: "정상 완료", body: ["도전자가 이기면 Arena 상태를 다시 교환하고 예치한 2점을 소각합니다.", "방어자가 이기면 Arena 상태를 유지하고 1점은 방어자에게 이전, 1점은 수수료로 소각합니다."] },
          { title: "24시간 미완료", body: ["방어자만 미완료면 Arena 상태를 교환하고 도전자에게 1점을 반환하며 1점을 소각합니다.", "도전자만 미완료면 Arena 상태를 유지하고 방어자에게 1점을 이전하며 1점을 소각합니다.", "양측 모두 미완료면 Arena 상태를 유지하고 예치한 2점을 전부 소각합니다.", "복수전은 양측 모두 신청 뒤 24시간 안에 완료해야 합니다."] },
        ],
      },
      {
        number: 7,
        title: "일요일 운영과 페이백",
        sections: [
          { title: "일요일 경기 마감", body: ["매주 일요일 14:30부터 신규 신청·수락·준비·시작을 차단합니다.", "14:30 전에 시작한 경기는 15:00까지 답안·풀이 증거 제출과 정산을 끝내야 합니다.", "15:00에 끝나지 않은 예외 경기는 보류 상태로 보내고 운영자 알림을 만듭니다."] },
          { title: "페이백 자격", body: ["29일 학습권 패키지 이용 주기의 29일 모두를 하루도 빠짐없이 학습해야 합니다.", "유료 일반 쟁탈전 완료 횟수, 별도 장부의 페이백 점수와 공정성 검토도 모두 충족해야 합니다.", "금액과 구간은 사용자의 결제 시점에 고정된 정책 버전으로 판정합니다."] },
        ],
      },
    ],
  },
  MAIN: {
    division: "MAIN",
    title: "Main Division 경기 규정",
    eyebrow: "MAIN DIVISION RULEBOOK",
    intro:
      "Main Division은 Sub Division에서 페이백 자격을 달성한 사용자가 학습일수를 예치해 상향 쟁탈전·하위 티어 초대전·복수전을 진행하는 상위 경쟁 구간입니다.",
    summary: COMMON_MATCH_SUMMARY,
    rules: [
      {
        number: 1,
        title: "진입과 학습일수",
        sections: [
          { title: "진입 조건", body: ["Sub Division에서 페이백 자격이 확정되면 Main Division으로 이동합니다.", "Main 학습일수는 Sub 이월분, Main 진입 보너스와 경기 이전분으로 구성됩니다."] },
          { title: "잔액 구분", body: ["사용 가능 학습일수, 초대 예약 학습일수, 경기 예치 학습일수를 분리해 중복 사용을 막습니다.", "세 잔액이 모두 0이고 미정산 경기가 없으면 Sub Division으로 강등됩니다."] },
        ],
      },
      {
        number: 2,
        title: "상향 쟁탈전과 자동 상대 선정",
        sections: [
          { title: "목표 선택", body: ["하위 티어 사용자는 목표 상위 티어만 선택합니다.", "서버가 적격 후보를 걸러 한 명을 무작위로 정하며, 선정된 상위 티어 사용자는 자동 참가합니다."] },
          { title: "티어 차이", body: ["최대 티어 차이는 3단계입니다.", "최소 예치 일수는 1단계 1일, 2단계 2일, 3단계 3일이며 4단계 이상은 신청할 수 없습니다.", "양측 모두 예치 뒤 사용할 학습일수가 최소 1일 남아야 합니다."] },
        ],
      },
      {
        number: 3,
        title: "하위 티어 초대전",
        sections: [
          { title: "초대 생성", body: ["상위 티어 사용자가 목표 하위 티어만 선택하고 학습일수를 예약합니다.", "특정 사용자를 선택할 수 없으며 서버가 적격 후보에게 초대장을 보냅니다.", "가장 먼저 수락을 완료한 한 명과만 매치가 성립합니다."] },
          { title: "후보 필터", body: ["최근 7일 안에 공식 매치가 성립한 상대는 자동 제외합니다.", "같은 사용자가 유지할 수 있는 미성립 초대는 목표 티어 하나당 1개입니다."] },
          { title: "취소와 기한", body: ["매치 성립 전 직접 취소는 무료이며 예약 일수를 전부 반환합니다.", "초대 예약 자체에는 고정 24시간 만료가 없습니다.", "일일 차감으로 초대자의 사용 가능 일수가 0이 되면 예약을 자동 취소하고 1일 수수료를 적용합니다."] },
        ],
      },
      {
        number: 4,
        title: "승패와 Arena 상태",
        sections: [
          { title: "판정", body: ["점수 → 정답 수 → 정답 문항 풀이시간 → 전체 풀이시간 순으로 정합니다.", "완전히 동점이면 방어자가 승리합니다."] },
          { title: "Arena 상태", body: ["Arena 도전자가 이기면 티어·티어 내 순위·GP를 모두 교환합니다.", "방어자가 이기면 세 값 모두 유지합니다.", "1대1 경기로 내부 실력 지표는 바뀌지 않습니다."] },
        ],
      },
      {
        number: 5,
        title: "Main 학습일수 정산",
        sections: [
          { title: "서버 정산", body: ["경기 성립 때 초대자가 정한 양측의 학습일수를 예치하고, 결과에 따라 이전·반환·소각합니다.", "클라이언트가 보낸 예치 일수나 잔액은 신뢰하지 않고 정책 스냅샷과 서버 장부만 사용합니다."] },
          { title: "중복 사용 방지", body: ["예약 또는 예치된 학습일수는 다른 공격·초대·복수전에 다시 사용할 수 없습니다.", "모든 장부 변경은 같은 경기 정산 키로 정확히 한 번만 기록합니다."] },
        ],
      },
      {
        number: 6,
        title: "복수전",
        sections: [
          { title: "신청 금액", body: ["직전 경기의 패자가 결과 화면에서 즉시 신청합니다.", "원경기 양측 예치 일수를 S라고 하면 복수전 신청자는 2×S일을 예치합니다.", "상대는 자동 참가하며 양측 모두 24시간 안에 완료해야 합니다."] },
          { title: "정상 완료", body: ["공격자가 이기면 Arena 상태를 교환하고 신청 금액 전부를 소각합니다.", "방어자가 이기면 Arena 상태를 유지하고 2×S-1일을 방어자에게 이전하며 1일을 수수료로 소각합니다."] },
          { title: "24시간 미완료", body: ["방어자만 미완료면 Arena 상태를 교환하고 2×S-1일을 공격자에게 반환하며 1일을 소각합니다.", "공격자만 미완료면 Arena 상태를 유지하고 2×S-1일을 방어자에게 이전하며 1일을 소각합니다.", "양측 모두 미완료면 Arena 상태를 유지하고 신청 금액 전부를 소각합니다."] },
        ],
      },
      {
        number: 7,
        title: "일요일 운영과 이용 종료",
        sections: [
          { title: "일요일 마감", body: ["매주 일요일 14:30부터 신규 공격·초대 수락·매치 성립·복수전 신청·준비·시작을 차단합니다.", "미성립 초대 예약은 취소하지 않고 월요일 00:00까지 보류합니다.", "진행 중 경기는 15:00까지 끝내며 예외는 보류 상태와 운영자 알림으로 전환합니다."] },
          { title: "이용 종료", body: ["사용 가능·예약·경기 예치 학습일수가 모두 0이고 미정산 경기가 없으면 Sub Division으로 강등됩니다.", "Main 달성 기록과 시즌 배지는 보존되며 재구매 시점에 따라 시험 없는 변환 또는 랭크 복귀전을 적용합니다."] },
        ],
      },
      {
        number: 8,
        title: "Main 만료 뒤 Sub 복귀",
        sections: [
          { title: "72시간 이내", body: ["만료 순간 Main 전체 순위와 참가자 수로 백분위를 계산하고 Sub 상위 58~100% 구간으로 환산합니다.", "72시간 안에 재구매하면 별도 시험 없이 환산 티어·0~99 GP·정확한 Sub 전체 순위로 시작하며, 정상 스냅샷은 최소 플래티넘을 보장합니다."] },
          { title: "72시간 초과", body: ["랭크 복귀전을 완료해야 합니다.", "최고 배치는 정상 환산 결과보다 정확히 한 티어 아래이며, 시험 결과가 더 낮으면 그 결과를 적용합니다."] },
          { title: "시즌 보상", body: ["Main 시즌 보상은 프로필에 보존되는 성취 배지로 지급합니다.", "성취 배지는 시즌이 끝나거나 Sub Division으로 이동해도 보존되며 학습일수로 교환되지 않습니다."] },
        ],
      },
      {
        number: 9,
        title: "Main Division 휴면",
        sections: [
          { title: "적용 대상", body: ["휴면 제도는 Main Division에만 적용합니다. Sub Division은 29일 학습권 패키지와 페이백 주기 안에서 운영되므로 별도 휴면 상태를 만들지 않습니다.", "Main Division에서 미활동 구간이 시작될 때 사용 가능한 정기권 학습 가능 일수가 20일 이상인 사용자만 휴면 판정 대상입니다."] },
          { title: "활동과 20일 판정", body: ["공식 1대1 경기를 완료하거나 Matths 주간 공식 모의고사를 제출하면 휴면 미활동 기록을 초기화합니다.", "로그인이나 페이지 열람만으로는 초기화되지 않습니다.", "20일 연속으로 두 활동이 모두 없으면 20일째 KST 일일 차감까지 마친 뒤 다음 날 00:00에 휴면 상태로 전환합니다."] },
          { title: "휴면 강등과 잔여 일수 보관", body: ["20일째까지 공식 활동이 없으면 보유 일수와 관계없이 Sub Division으로 강등합니다.", "20일 차감 뒤 남은 학습일수는 별도 보관하며 Sub Division 학습일수나 페이백 점수에는 절대 포함하지 않습니다."] },
          { title: "Main Division 재진입", body: ["강등된 사용자는 새 학습권 패키지, 배치고사, 29일 학습과 페이백 달성 등 일반 Sub Division 과정을 그대로 완료해야 합니다.", "그 과정을 통해 Main Division에 다시 진입하는 순간에만 보관한 학습일수를 새 Main 학습일수에 추가합니다. 남은 일수가 0일이었다면 추가 복원 없이 일반 Sub 절차만 적용합니다."] },
        ],
      },
    ],
  },
};

const MATCHUP_ROWS = Object.freeze([
  ["브론즈 → 브론즈", "BRONZE", "T1"],
  ["브론즈 → 실버", "SILVER", "T2"],
  ["실버 → 골드", "GOLD", "T3"],
  ["골드 → 플래티넘", "PLATINUM", "T4"],
  ["플래티넘 → 에메랄드", "EMERALD", "T5"],
  ["에메랄드 → 다이아몬드", "DIAMOND", "T6"],
  ["다이아몬드 → 마스터", "MASTER", "T7"],
  ["마스터 → 그랜드마스터", "GRANDMASTER", "T8"],
  ["그랜드마스터 → 챌린저", "CHALLENGER", "T9"],
  ["챌린저 → 챌린저", "CHALLENGER", "T9"],
]);

function percentRange(values) {
  return `${Math.round(Number(values[0]) * 100)}~${Math.round(
    Number(values[1]) * 100
  )}%`;
}

function commonProblemDesignView() {
  return {
    policyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
    principles: [
      "Sub Division과 Main Division 모두 문제 난이도를 도전자가 아니라 방어자 티어에 맞춥니다.",
      "Main Division에서 티어 차이가 2~3단계여도 방어자 티어가 같은 경기는 같은 T등급을 사용합니다.",
      "챌린저가 방어자인 경기는 T9를 사용하며, 챌린저끼리 대결할 때만 팩 안의 난이도 곡선을 상단으로 조정합니다.",
    ],
    matchupRows: MATCHUP_ROWS.map(([matchup, anchor, difficultyTier]) => ({
      matchup,
      anchor: TIER_LABELS[anchor],
      difficultyTier,
    })),
    accuracyRows: Object.entries(TIER_SPECS).map(
      ([difficultyTier, spec]) => ({
        difficultyTier,
        anchor: TIER_LABELS[spec.anchor],
        defenderAccuracy: percentRange(spec.defenderAccuracy),
        challengerAccuracy:
          difficultyTier === "T1"
            ? `동티어 ${percentRange(spec.challengerAccuracy)}`
            : percentRange(spec.challengerAccuracy),
      })
    ),
    accuracyPrinciples: [
      "방어자 목표 정답률은 대체로 45~60% 구간에 맞춥니다.",
      "다른 티어끼리 대결할 때 도전자의 예상 정답률은 방어자보다 약 12~18%p 낮게 설계합니다.",
      "등급이 T1에서 T9로 올라갈수록 절대 난이도도 올라갑니다.",
    ],
    matchSpec: [
      ["문항 수", `준킬러 ${PACK_RULES.items}문항`],
      ["총점", `${PACK_RULES.totalScore}점 (문항당 ${PACK_RULES.perItemPoints}점)`],
      ["제한 시간", `${PACK_RULES.timeLimitMinutes}분`],
      ["문제 동일성", "두 사용자에게 완전히 같은 문제"],
      ["정답 형식", "3자리 이하 자연수 주관식"],
    ],
    semiKillerDefinition:
      "개념 2개 이상을 결합하고, 조건을 최소 한 단계 변형해야 식이 나오는 문항입니다.",
    excludedQuestion:
      "개념 하나를 직접 대입해 끝나는 기본 문항은 T1에도 넣지 않으며, 5문항 전부 준킬러로 구성합니다.",
  };
}

function paybackPolicyView(policy) {
  const source = policy || {
    ...defaultLearningPackagePolicyDefinition(),
    createdAt: PAYBACK_RULEBOOK_BASELINE_AT,
    updatedAt: PAYBACK_RULEBOOK_BASELINE_AT,
    activatedAt: PAYBACK_RULEBOOK_BASELINE_AT,
  };
  const priceAmount = Number(source.priceAmount) || 0;
  const dateCandidates = [
    PAYBACK_RULEBOOK_BASELINE_AT,
    source.createdAt,
    source.updatedAt,
    source.activatedAt,
    source.effectiveFrom,
  ]
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  const lastModifiedAt = new Date(
    Math.max(...dateCandidates.map((value) => value.getTime()))
  );

  return {
    displayName: source.displayName || "29일 학습 패키지",
    priceAmount,
    initialLearningDays: Number(source.initialLearningDays) || 29,
    initialPaybackScoreDays:
      Number(source.initialPaybackScoreDays) || 29,
    dailyMatchLimitsByTier: (source.dailyMatchLimitsByTier?.length
      ? source.dailyMatchLimitsByTier
      : DEFAULT_DAILY_MATCH_LIMITS_BY_TIER).map((row) => ({
        tier: row.tier,
        tierLabel: TIER_LABELS[row.tier] || row.tier,
        attackLimit: Number(row.attackLimit),
        defenseLimit: Number(row.defenseLimit),
      })),
    minimumStreakDays:
      Number(source.payback?.minimumStreakDays) || 0,
    minimumPaidNormalAttacks:
      Number(source.payback?.minimumPaidNormalAttacks) || 0,
    minimumScoreDays:
      Number(source.payback?.minimumScoreDays) || 0,
    bands: (source.payback?.bands || []).map((band) => ({
      minScoreDays: Number(band.minScoreDays),
      maxScoreDays:
        band.maxScoreDays === null ||
        band.maxScoreDays === undefined
          ? null
          : Number(band.maxScoreDays),
      ratePercent: Number(band.ratePercent),
      expectedPaybackAmount: Math.floor(
        (priceAmount * Number(band.ratePercent)) / 100
      ),
    })),
    lastModifiedAt,
    effectiveFrom: source.effectiveFrom || null,
    isFallback: !policy,
  };
}

function mainPolicyView(policy) {
  const snapshot = mainPolicySnapshot(policy);
  if (!snapshot) return null;
  const maximumTargetTierGap = Math.max(
    1,
    Number(snapshot.maximumTargetTierGap) || 1
  );
  const stakeDaysByTierGap = (snapshot.stakeDaysByTierGap || [])
    .map((band) => ({
      tierGap: Number(band.tierGap),
      stakeDays: Number(band.stakeDays),
    }))
    .filter(
      (band) =>
        Number.isInteger(band.tierGap) &&
        band.tierGap >= 1 &&
        band.tierGap <= maximumTargetTierGap &&
        Number.isInteger(band.stakeDays) &&
        band.stakeDays >= 1
    )
    .sort((left, right) => left.tierGap - right.tierGap);
  const source =
    typeof policy.toObject === "function"
      ? policy.toObject()
      : policy;
  const dateCandidates = [
    source.effectiveFrom,
    source.activatedAt,
    source.updatedAt,
  ]
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));

  return {
    displayName:
      snapshot.displayName || "Main Division 운영 기준",
    policyVersionCode: snapshot.code,
    maximumTargetTierGap,
    stakeDaysByTierGap,
    requiresOpponentDaysGreaterThanStake:
      snapshot.requiresOpponentDaysGreaterThanStake,
    repeatOpponentExclusionDays:
      snapshot.repeatOpponentExclusionDays,
    revengeStakeMultiplier:
      snapshot.revengeStakeMultiplier,
    revengeFeeDays:
      snapshot.revengeFeeDays,
    effectiveFrom: new Date(snapshot.effectiveFrom),
    effectiveUntil: snapshot.effectiveUntil
      ? new Date(snapshot.effectiveUntil)
      : null,
    lastModifiedAt: new Date(
      Math.max(
        new Date(snapshot.effectiveFrom).getTime(),
        ...dateCandidates.map((value) => value.getTime())
      )
    ),
  };
}

function mainTierGapRuleBody(policy) {
  if (!policy) {
    return [
      "현재 적용 중인 Main Division 운영 정책이 없어 신규 경기를 신청할 수 없습니다.",
      "운영 정책이 활성화되면 최대 티어 차이와 차이별 최소 예치 일수가 이 화면에 자동 반영됩니다.",
    ];
  }
  const stakeSummary = policy.stakeDaysByTierGap
    .map((band) => `${band.tierGap}단계 ${band.stakeDays}일`)
    .join(", ");
  return [
    `현재 활성 정책의 최대 티어 차이는 ${policy.maximumTargetTierGap}단계입니다.`,
    `차이별 최소 예치 일수는 ${stakeSummary}입니다.`,
    `${policy.maximumTargetTierGap + 1}단계 이상 차이 나는 상대에게는 신청할 수 없습니다.`,
    policy.requiresOpponentDaysGreaterThanStake
      ? "양측 모두 예치한 뒤 사용할 정기권 학습 가능 일수가 최소 1일 남아야 합니다."
      : "상대의 경기 후 잔여 학습일 조건은 현재 활성 정책에서 적용하지 않습니다.",
  ];
}

function rulebookRules(division, mainPolicy) {
  return RULEBOOKS[division].rules.map((rule) => ({
    ...rule,
    sections: rule.sections.map((section) => ({
      ...section,
      body:
        division === "MAIN" &&
        rule.number === 2 &&
        section.title === "티어 차이"
          ? mainTierGapRuleBody(mainPolicy)
          : [...section.body],
    })),
  }));
}

function getArenaRulebook(
  division,
  {
    paybackPolicy = null,
    mainPolicy = null,
    upcomingPaybackPolicy = null,
    upcomingMainPolicy = null,
  } = {}
) {
  const normalizedDivision = String(
    division || ""
  ).toUpperCase();
  const rulebook = RULEBOOKS[normalizedDivision] || null;
  if (!rulebook) return null;
  const activeMainPolicy =
    normalizedDivision === "MAIN"
      ? mainPolicyView(mainPolicy)
      : null;
  return {
    ...rulebook,
    summary: [...rulebook.summary],
    rules: rulebookRules(
      normalizedDivision,
      activeMainPolicy
    ),
    paybackPolicy:
      normalizedDivision === "SUB"
        ? paybackPolicyView(paybackPolicy)
        : null,
    mainPolicy: activeMainPolicy,
    upcomingPolicy:
      normalizedDivision === "SUB" && upcomingPaybackPolicy
        ? paybackPolicyView(upcomingPaybackPolicy)
        : normalizedDivision === "MAIN" && upcomingMainPolicy
          ? mainPolicyView(upcomingMainPolicy)
          : null,
    problemDesign: commonProblemDesignView(),
  };
}

module.exports = {
  PAYBACK_RULEBOOK_BASELINE_AT,
  getArenaRulebook,
  commonProblemDesignView,
  mainPolicyView,
  paybackPolicyView,
};
