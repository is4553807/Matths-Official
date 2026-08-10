const {
  DEFAULT_DAILY_MATCH_LIMITS_BY_TIER,
  UNRANKED_DAILY_ATTACK_LIMIT,
  defaultLearningPackagePolicyDefinition,
  mainPolicySnapshot,
} = require("./arenaPolicyService");
const {
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  PACK_RULES,
  PUBLIC_DIFFICULTY_TO_CATALOG_TIER,
  PUBLIC_DIFFICULTY_SPECS,
  RANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE,
  TIER_LABELS,
  TIER_SPECS,
  UNRANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE,
} = require("./arenaOneOnOneDifficultyPolicy");
const {
  getOfficialMockResearchSummary,
} = require("./arenaOfficialMockResearchCatalog");
const {
  getPrivateMockResearchSummary,
} = require("./arenaPrivateMockResearchCatalog");
const ARENA_2028_MATH_ALIGNMENT = require("../dataAnalysis/arena2028MathAlignment.json");

const PAYBACK_RULEBOOK_BASELINE_AT =
  new Date("2026-08-02T00:00:00+09:00");

const COMMON_MATCH_SUMMARY = [
  "두 사용자는 Division과 티어에 맞게 생성·검산된 같은 주관식 5문항을 문항당 최대 10분 동안 풉니다.",
  "이전 문항으로 돌아갈 수 없고, 5번 문항 완료 또는 시간 종료 뒤 문제는 닫힙니다. 새로고침·일시적 연결 끊김에도 제한시간은 계속 흐르며 같은 문항이 다시 표시됩니다.",
  "문제가 닫힌 뒤 60초 안에 풀이 증거 사진 1~5장을 제출합니다. 이 필수 증거를 기한 안에 내지 않으면 별도 소명 기한 없이 자동 패배합니다.",
  "매치가 성립한 뒤에는 상대의 서비스 닉네임만 표시하며 실명은 공개하지 않습니다.",
  "승패는 점수 → 정답 수 → 정답 문항 풀이시간 → 전체 풀이시간 순으로 정합니다.",
  "완전히 동점이면 방어자가 승리합니다.",
  "1대1 경기 결과로 배치고사에서 정한 실력 기준은 바뀌지 않습니다. 공격자가 이기면 티어·티어 내 순위·GP가 함께 교환됩니다.",
];

const RULEBOOKS = {
  SUB: {
    division: "SUB",
    title: "Unranked 경기 규정",
    eyebrow: "UNRANKED RULEBOOK",
    intro:
      "Unranked는 학습권 패키지의 정기권 학습 가능 일수와 페이백 점수를 관리하며, 같은 티어의 상위 순위 또는 바로 위 티어를 상대로 Arena 상태를 쟁탈하는 경쟁 구간입니다.",
    summary: COMMON_MATCH_SUMMARY,
    rules: [
      {
        number: 1,
        title: "참가 자격과 경기 종류",
        sections: [
          { title: "이용 자격", body: ["학습권 패키지가 활성 상태이고 배치고사를 완료해야 합니다.", "사용 가능한 정기권 학습 가능 일수가 0일이면 공격·방어·복수전과 신규 매칭이 모두 중단됩니다.", "학습권 만료 뒤 29일 학습권 패키지를 다시 구매하면 이전 배치를 재사용하지 않고 배치고사를 다시 완료해야 합니다."] },
          { title: "배치고사 확인 방식", body: ["배치고사는 문항별 서버 풀이시간과 답안 흐름을 기록하고, 결과 확인이 더 필요하면 준킬러 2문항과 킬러 2문항의 추가 확인 문제를 제공합니다.", "추가 확인은 시작 위치를 더 정확하게 정하기 위한 절차이며, Arena 1대1 경기의 60초 필수 풀이 증거나 부정행위 제재 절차를 배치고사에 적용하지 않습니다."] },
          { title: "공식 경기", body: ["Unranked의 공식 1대1은 일반 쟁탈전과 복수전뿐입니다.", "별도의 일반전은 존재하지 않습니다."] },
        ],
      },
      {
        number: 2,
        title: "도전 대상과 자동 매칭",
        sections: [
          { title: "상위 순위 우선", body: ["모든 티어에서 서버가 먼저 공격자와 같은 티어이면서 공격자보다 티어 내부 순위가 높은 적격 사용자를 찾습니다.", "같은 티어의 상위 후보가 한 명이라도 있으면 바로 위 티어 후보로 넘어가지 않습니다.", "후보군에서는 당일 방어 횟수가 가장 적은 사용자를 먼저 모으고, 동률 후보 안에서 한 명을 무작위로 정합니다. 상대의 닉네임이나 특정 계정은 직접 고를 수 없습니다."] },
          { title: "한 티어 상향 폴백", body: ["같은 티어의 상위 적격 후보가 없을 때만 정확히 바로 위 티어에서 상대를 다시 찾습니다.", "두 단계 이상 위 티어로는 확장하지 않습니다. 챌린저는 위 티어가 없으므로 같은 챌린저 중 자신보다 높은 순위의 후보만 만날 수 있습니다.", "각 티어의 0 GP 최하위도 공격으로 순위를 높일 수 있으며, 자신보다 아래 순위가 생기기 전까지 같은 티어 자동 방어 후보가 되지 않는 점은 별도 예외 없이 동일하게 적용합니다."] },
          { title: "자동 방어 미응시", body: ["자동 배정된 방어전을 시작하지 않은 기록이 5회 누적되면 자동 방어 후보에서 제외됩니다.", "이 상태에서도 정기권 학습 가능 일수는 매일 기존 규정대로 차감됩니다.", "참가 가능한 공격을 한 번 정상적으로 신청하면 미응시 누적이 0회로 초기화되고 자동 방어 배정이 다시 활성화됩니다."] },
          { title: "시작 기한", body: ["공식 매치가 만들어진 뒤 양측은 24시간 안에 시작해야 합니다.", "다만 일요일을 통과하면 시작 마감은 일요일 14:00으로 앞당겨집니다.", "공격자만 시작하지 않으면 방어자 승리, 방어자만 시작하지 않으면 공격자 승리로 자동 정산합니다. 양측 모두 시작하지 않으면 승패 없이 취소하며 예치한 페이백 점수는 그대로 반환합니다."] },
        ],
      },
      {
        number: 3,
        title: "일반 쟁탈전 페이백 점수",
        sections: [
          { title: "경기 생성", body: ["도전자는 페이백 점수 1점을 예치합니다.", "방어자는 경기 생성 시 어떤 점수도 예치하지 않으며, Unranked 경기로 정기권 학습 가능 일수는 바뀌지 않습니다."] },
          { title: "도전자 승리", body: ["시작 티어와 관계없이 도전자가 이기면 예치한 페이백 점수 1점을 전부 반환합니다.", "티어·티어 내 순위·GP는 교환되며 페이백 점수의 순변화는 없습니다."] },
          { title: "방어자 승리", body: ["방어자의 현재 Arena 상태를 유지하고 도전자가 예치한 페이백 점수 1점을 가져옵니다."] },
          { title: "0점과 패키지 만료", body: ["페이백 점수가 0점이면 일반 공격과 복수전 신청만 중단되며, 활성 29일 패키지의 남은 기능과 방어 자격은 유지됩니다.", "정기권 학습 가능 일수가 0일이 되어 29일 패키지가 끝나면 GOAT Arena 전체가 잠기고 방어 후보에서도 제외됩니다."] },
        ],
      },
      {
        number: 4,
        title: "복수전",
        sections: [
          { title: "신청", body: ["가장 최근 원경기의 패자에게 결과 화면에서 한 번만 복수전 선택권을 줍니다.", "복수하기를 누르면 페이백 점수 2점을 예치하고 상대는 선택권 없이 자동 참가합니다.", "경기 종료를 누르면 해당 원경기의 복수전 권리는 즉시 사라집니다."] },
          { title: "정상 완료", body: ["복수전 신청자가 이기면 Arena 상태를 다시 교환하고 예치한 2점 중 1점을 반환하며, 나머지 1점은 수수료로 소각합니다.", "복수전 신청자가 지면 Arena 상태를 유지하고 예치한 2점 중 1점은 방어자에게 이전하며, 나머지 1점은 수수료로 소각합니다."] },
          { title: "24시간 미완료", body: ["방어자만 미완료면 Arena 상태를 교환하고 도전자에게 1점을 반환하며 1점을 소각합니다.", "도전자만 미완료면 Arena 상태를 유지하고 방어자에게 1점을 이전하며 1점을 소각합니다.", "양측 모두 미완료면 Arena 상태를 유지하고 예치한 2점을 전부 소각합니다.", "복수전은 최근 7일 재대결 제한의 예외이며, 양측 모두 신청 뒤 24시간 안에 완료해야 합니다."] },
        ],
      },
      {
        number: 5,
        title: "일요일 운영과 페이백",
        sections: [
          { title: "일요일 경기 마감", body: ["매주 일요일 14:00부터 신규 신청·수락·준비·시작을 차단합니다.", "14:00 전에 시작한 경기는 문항당 10분 규칙을 적용한 채 15:00까지 답안·풀이 증거 제출과 정산을 끝내야 합니다.", "15:00에 끝나지 않은 예외 경기는 보류 상태로 보내고 운영자 알림을 만듭니다."] },
          { title: "페이백 자격", body: ["29일 학습권 패키지 이용 주기의 29일 모두를 하루도 빠짐없이 학습해야 합니다.", "페이백 점수와 공정성 검토 기준을 충족해야 하며, 일반 쟁탈전 최소 참여 횟수 조건은 없습니다.", "금액과 점수 구간은 결제할 때 안내된 기준으로 판정합니다."] },
        ],
      },
      {
        number: 6,
        title: "공정한 경기와 운영 검토",
        sections: [
          { title: "자동 감지와 공개 범위", body: ["공식 1대1 경기는 자동 공정성 확인 대상입니다.", "악용 방지를 위해 구체적인 감지 기준과 판정 방식은 공개하지 않습니다.", "검토 신호는 부정행위 확정이 아니며 최종 판정은 운영 검토 뒤 안내합니다."] },
          { title: "양측 일시정지와 24시간 검토", body: ["경기에서 운영 확인 신호가 감지되면 경기 종료 뒤 공격자와 방어자 모두의 신규 매치메이킹을 일시정지합니다.", "운영자는 양측의 문제별 답안·풀이시간·필수 증거와 제출된 소명 자료를 원칙적으로 24시간 안에 함께 확인합니다.", "검토 결과가 나오기 전까지 이 경기의 Arena 상태 변경과 공격자가 예치한 페이백 점수 정산을 보류합니다.", "이용 주기의 페이백 심사 시점이 검토 중 도래하면 심사를 탈락 처리하지 않고 해당 경기의 최종 판정까지 보류합니다. 검토 시작·완료 및 최종 결과는 플랫폼 우편함과 이메일로 안내합니다."] },
          { title: "추가 소명 자료", body: ["운영자는 필요하면 공격자 또는 방어자에게 추가 소명 자료를 요청할 수 있습니다.", "요청은 GOAT Arena 우편함과 이메일로 안내되며, 사용자는 안내된 업로드 버튼으로 실제 풀이과정 사진을 제출할 수 있습니다.", "요청을 받은 사용자가 요청 시점부터 24시간 안에 응답하지 않으면 추가 소명 자료가 없는 것으로 처리하며, 기한이 끝난 뒤에는 제출할 수 없습니다.", "운영자는 기한 안에 제출된 자료와 기존 답안·풀이시간·필수 풀이 증거를 함께 검토해 최종 판정합니다.", "실제 풀이 흐름이 분명히 확인되는 자료를 기한 안에 제출해야 억울한 오판 가능성을 줄일 수 있습니다."] },
          { title: "검토 결과 안내", body: ["운영 검토 결과는 공격자와 방어자에게 GOAT Arena 우편함과 이메일로 함께 안내합니다.", "안내에는 이상 없음 또는 위반 판정, 경기 정산 결과, 매치메이킹 제한 여부와 정지 시간 보상 여부가 포함됩니다.", "검토가 진행되는 동안 구매한 29일 학습권 패키지의 유효성은 유지됩니다."] },
          { title: "부정행위가 아닌 경우", body: ["운영자가 경기 양측 모두 이상 없다고 판단하면 두 참가자의 매치메이킹 일시정지를 해제하고 해당 경기를 유효 경기로 인정합니다.", "보류된 페이백 점수와 Arena 상태는 원래 1대1 경기 승패 규정에 따라 정산합니다.", "각 참가자에게 매치메이킹이 정지됐던 실제 시간만큼 현재 이용 주기의 만료·페이백 심사 시각을 연장합니다. 검토가 24시간을 넘기면 초과 시간을 포함한 전체 정지 시간을 보상합니다.", "따라서 페이백 심사 직전에 검토가 시작돼도 해당 기회를 잃지 않습니다. 이 보상은 페이백 점수를 직접 지급하는 방식이 아니라 동일한 매칭 가능 시간을 돌려주는 방식입니다."] },
          { title: "부정행위가 확정된 경우", body: ["공격자의 부정행위가 확정되면 공격자가 예치한 페이백 점수를 방어자에게 전부 이전합니다.", "방어자의 부정행위가 확정되면 공격자가 예치한 페이백 점수를 공격자에게 전부 반환하고 Arena 상태는 공격자 승리 기준으로 처리합니다.", "양측 모두 부정행위가 확정되면 Arena 상태는 유지하고 공격자가 예치한 페이백 점수는 전부 소각합니다.", "위반이 확정된 이용자는 경기 정산 뒤 해당 이용 주기에 사용 가능한 페이백 점수의 1/3을 정수 단위로 올림해 추가 소각합니다.", "부정행위가 확정된 사용자는 경고 1회, 운영 결과 통보 직후부터 5일간 매치메이킹 금지, 해당 이용 주기 페이백 심사 자동 탈락을 적용합니다.", "부정행위가 확정된 참가자에게는 검토 일시정지 시간을 보상하지 않습니다. 함께 검토받았으나 위반이 확인되지 않은 상대 참가자에게는 실제 일시정지 시간을 보상합니다. 구매한 29일 학습권 패키지 자체는 유효하지만 5일 제재 기간에는 GOAT Arena 매치메이킹을 이용할 수 없습니다."] },
        ],
      },
    ],
  },
  MAIN: {
    division: "MAIN",
    title: "Ranked 경기 규정",
    eyebrow: "RANKED RULEBOOK",
    intro:
      "Ranked는 Unranked에서 페이백 자격을 달성한 사용자가 학습일수를 예치해 상향 쟁탈전·하위 티어 초대전·복수전을 진행하는 상위 경쟁 구간입니다.",
    summary: COMMON_MATCH_SUMMARY,
    rules: [
      {
        number: 1,
        title: "진입과 학습일수",
        sections: [
          { title: "진입 조건", body: ["Unranked에서 페이백 자격이 확정되면 Ranked로 이동합니다.", "Ranked 학습일수는 Unranked 이월분, Ranked 진입 보너스와 경기 이전분으로 구성됩니다."] },
          { title: "통합 Ranked", body: ["Ranked의 티어 순위와 공식 1대1 경기는 고등학생·N수생·대학생·직장인 구분 없이 하나의 통합 풀에서 계산합니다.", "소속은 공개 랭킹의 소속 정보로만 활용하며 매칭 가능 상대나 티어 내 순위를 나누지 않습니다.", "최종 종합 랭킹과 Unranked 순위도 모든 이용자를 통합해 계속 표시합니다."] },
          { title: "잔액 구분", body: ["사용 가능 학습일수, 초대 예약 학습일수, 경기 예치 학습일수를 분리해 중복 사용을 막습니다.", "세 잔액이 모두 0이고 미정산 경기가 없으면 Ranked 이용이 만료되며, 이후 절차는 규정 8의 재구독 기준을 따릅니다."] },
        ],
      },
      {
        number: 2,
        title: "상향 쟁탈전과 자동 상대 선정",
        sections: [
          { title: "목표 선택", body: ["하위 티어 사용자는 목표 상위 티어만 선택합니다.", "조건을 충족한 사용자 중 한 명과 자동으로 연결되며, 선정된 상위 티어 사용자는 자동 참가합니다."] },
          { title: "통합 후보 선정", body: ["상대는 전체 Ranked에서 목표 티어·이용 자격·최근 상대 제외 조건을 통과한 후보 중에서 찾습니다.", "최근 24시간 동안 강제 방어를 가장 적게 한 사용자들을 우선 후보군으로 구성하고, 횟수가 같은 후보 안에서 무작위로 한 명을 정합니다.", "공식 경기 종료 뒤 6시간 동안은 다시 강제 자동 방어자로 배정하지 않으며, 진행 중 경기나 초대 예약이 있는 사용자도 강제 방어 후보에서 제외합니다.", "6시간 유예 중에도 초대전 적격 조건을 만족하면 상위 티어 사용자의 초대 알림을 받고 자발적으로 수락하거나 거절할 수 있습니다.", "닉네임·특정 계정은 직접 선택할 수 없습니다."] },
          { title: "자동 방어 미응시", body: ["자동 배정된 방어전을 시작하지 않은 기록이 5회 누적되면 자동 방어 후보에서 제외됩니다.", "자동 방어 제외 중에도 보유 학습일수는 일일 차감 규정대로 줄어들며, 잔액이 모두 소진되면 규정 8의 Ranked 만료·재구독 절차를 따릅니다.", "참가 가능한 공격을 한 번 정상적으로 신청하면 미응시 누적이 0회로 초기화되고 자동 방어 배정이 다시 활성화됩니다."] },
          { title: "티어 차이", body: ["최대 티어 차이는 3단계입니다.", "최소 예치 일수는 1단계 1일, 2단계 2일, 3단계 3일이며 모든 상향 쟁탈전의 최대 예치는 5일입니다.", "따라서 1단계 차이는 1~5일, 2단계 차이는 2~5일, 3단계 차이는 3~5일을 예치할 수 있으며 4단계 이상은 신청할 수 없습니다.", "상향 쟁탈전은 공격자만 예치 뒤 최소 1일을 남겨야 하며, 자동 방어자는 활성 이용 상태의 1일 이상만 필요합니다."] },
          { title: "시작 기한", body: ["성립한 공식 매치는 양측이 24시간 안에 시작해야 하며, 일요일을 통과하면 시작 마감은 일요일 14:00입니다.", "공격자만 시작하지 않으면 방어자 승리, 방어자만 시작하지 않으면 공격자 승리로 자동 정산합니다. 양측 모두 시작하지 않으면 승패 없이 취소하고 실제로 예치한 학습일수를 각각 반환합니다."] },
        ],
      },
      {
        number: 3,
        title: "하위 티어 초대전",
        sections: [
          { title: "초대 생성", body: ["상위 티어 사용자가 목표 하위 티어만 선택하고 학습일수를 예약합니다.", "특정 사용자를 선택할 수 없으며 조건을 충족한 하위 티어 사용자에게 초대장이 전달됩니다.", "초대 수락 화면에는 양측 티어와 티어 차이, 양측이 각각 예치할 학습일수, 수락자의 승리·패배 시 Arena 상태와 학습일수 결과를 먼저 표시합니다.", "가장 먼저 조건을 확인하고 수락을 완료한 한 명과만 매치가 성립하며, 수락 시 양측이 같은 학습일수를 예치합니다."] },
          { title: "후보 필터", body: ["최근 7일 안에 공식 매치가 성립한 상대는 자동 제외합니다. 단, 직전 경기의 복수전은 이 재대결 제한의 예외입니다.", "같은 사용자가 유지할 수 있는 미성립 초대는 목표 티어 하나당 1개입니다."] },
          { title: "취소와 기한", body: ["매치 성립 전 직접 취소는 무료이며 예약 일수를 전부 반환합니다.", "초대 예약 자체에는 고정 24시간 만료가 없습니다.", "일일 차감으로 초대자의 사용 가능 일수가 0이 되면 예약을 자동 취소하고 1일 수수료를 적용합니다."] },
        ],
      },
      {
        number: 4,
        title: "Ranked Arena 상태",
        sections: [
          { title: "경기 결과", body: ["상단 공통 규정의 판정 순서를 모든 Ranked 경기에 동일하게 적용합니다.", "공격자가 이기면 티어·티어 내 순위·GP를 모두 교환하고, 방어자가 이기면 세 값 모두 유지합니다."] },
        ],
      },
      {
        number: 5,
        title: "Ranked 학습일수 정산",
        sections: [
          { title: "상향 쟁탈전 정산", body: ["하위 티어 공격자가 예치한 학습일수만 정산합니다. 공격자가 이기면 자기 예치금을 반환하고 Arena 상태를 교환하며, 방어자가 이기면 공격자 예치금이 방어자에게 이전됩니다.", "자동 방어자는 예치하지 않으므로 상향 쟁탈전의 일반 정산은 학습일수를 새로 만들거나 소각하지 않습니다."] },
          { title: "수락형 초대전 정산", body: ["상위 티어의 하위 티어 초대전은 하위 사용자가 수락한 뒤 양측이 같은 학습일수를 예치합니다. 승자는 자기 예치금을 반환받고 상대 예치금을 이전받습니다.", "수락 전에 예치 일수와 승패별 결과를 확인할 수 있으며, 성립한 경기에는 안내된 조건이 끝까지 적용됩니다."] },
          { title: "중복 사용 방지", body: ["예약 또는 예치된 학습일수는 다른 공격·초대·복수전에 다시 사용할 수 없습니다.", "한 번에 하나의 미정산 공식 경기만 진행할 수 있으며, 동시에 들어온 다른 요청은 자동으로 취소됩니다."] },
        ],
      },
      {
        number: 6,
        title: "복수전",
        sections: [
          { title: "신청 금액", body: ["직전 경기의 패자가 결과 화면에서 즉시 신청합니다.", "원경기에서 복수전 신청자가 예치했던 학습일수를 S라고 하면 복수전 신청자는 2×S일을 예치합니다.", "상대는 자동 참가하며 양측 모두 24시간 안에 완료해야 합니다."] },
          { title: "정상 완료", body: ["Unranked 복수전과 같은 구조로 신청 금액에서 1일 수수료를 먼저 소각합니다.", "공격자가 이기면 Arena 상태를 교환하고 2×S-1일을 공격자에게 반환하며 1일을 수수료로 소각합니다.", "방어자가 이기면 Arena 상태를 유지하고 2×S-1일을 방어자에게 이전하며 1일을 수수료로 소각합니다."] },
          { title: "24시간 미완료", body: ["방어자만 미완료면 Arena 상태를 교환하고 2×S-1일을 공격자에게 반환하며 1일을 소각합니다.", "공격자만 미완료면 Arena 상태를 유지하고 2×S-1일을 방어자에게 이전하며 1일을 소각합니다.", "양측 모두 미완료면 Arena 상태를 유지하고 신청 금액 전부를 소각합니다.", "복수전은 최근 7일 재대결 제한의 예외입니다."] },
        ],
      },
      {
        number: 7,
        title: "일요일 운영과 이용 종료",
        sections: [
          { title: "일요일 마감", body: ["매주 일요일 14:00부터 신규 공격·초대 수락·매치 성립·복수전 신청·준비·시작을 차단합니다.", "미성립 초대 예약은 취소하지 않고 월요일 00:00까지 보류합니다.", "진행 중 경기는 문항당 10분 규칙을 적용한 채 15:00까지 끝내며 예외는 보류 상태와 운영자 알림으로 전환합니다."] },
          { title: "이용 종료", body: ["사용 가능·예약·경기 예치 학습일수가 모두 0이고 미정산 경기가 없으면 Ranked 이용이 만료되며 규정 8의 재구독 절차로 전환됩니다.", "만료 시점에 진행 중인 공식 경기가 있으면 그 경기를 먼저 끝내고 정산한 뒤 이용 종료 여부를 확정합니다.", "Ranked 달성 기록과 시즌 배지는 보존됩니다."] },
        ],
      },
      {
        number: 8,
        title: "Ranked 만료와 재구독",
        sections: [
          { title: "72시간 이내", body: ["만료 순간 Ranked 전체 순위와 참가자 수를 기준으로 Unranked 시작 위치를 계산합니다.", "72시간 안에 재구매하면 별도 시험 없이 환산된 티어·GP·Unranked 전체 순위로 시작하며, 정상 만료 기록은 최소 플래티넘을 보장합니다."] },
          { title: "72시간 초과", body: ["랭크 복귀전을 완료해야 합니다.", "최고 배치는 정상 환산 결과보다 정확히 한 티어 아래이며, 시험 결과가 더 낮으면 그 결과를 적용합니다."] },
          { title: "시즌 보상", body: ["Ranked 시즌 보상은 프로필에 보존되는 성취 배지로 지급합니다.", "성취 배지는 시즌이 끝나거나 Unranked로 이동해도 보존되며 학습일수로 교환되지 않습니다."] },
        ],
      },
      {
        number: 9,
        title: "공정한 경기와 운영 검토",
        sections: [
          { title: "자동 감지와 공개 범위", body: ["공식 1대1 경기는 자동 공정성 확인 대상입니다.", "악용 방지를 위해 구체적인 감지 기준과 판정 방식은 공개하지 않습니다.", "검토 신호는 부정행위 확정이 아니며 최종 판정은 운영 검토 뒤 안내합니다."] },
          { title: "양측 일시정지와 24시간 검토", body: ["경기에서 운영 확인 신호가 감지되면 경기 종료 뒤 공격자와 방어자 모두의 신규 매치메이킹을 일시정지합니다.", "운영자는 양측의 문제별 답안·풀이시간·필수 증거와 제출된 소명 자료를 원칙적으로 24시간 안에 함께 확인합니다.", "검토 결과가 나오기 전까지 이 경기의 Arena 상태 변경과 예치 학습일수 정산을 보류합니다.", "검토 시작·완료 및 최종 결과는 플랫폼 우편함과 이메일로 함께 안내합니다."] },
          { title: "추가 소명 자료", body: ["운영자는 필요하면 공격자 또는 방어자에게 추가 소명 자료를 요청할 수 있습니다.", "요청은 GOAT Arena 우편함과 이메일로 안내되며, 사용자는 안내된 업로드 버튼으로 실제 풀이과정 사진을 제출할 수 있습니다.", "요청을 받은 사용자가 요청 시점부터 24시간 안에 응답하지 않으면 추가 소명 자료가 없는 것으로 처리하며, 기한이 끝난 뒤에는 제출할 수 없습니다.", "운영자는 기한 안에 제출된 자료와 기존 답안·풀이시간·필수 풀이 증거를 함께 검토해 최종 판정합니다.", "실제 풀이 흐름이 분명히 확인되는 자료를 기한 안에 제출해야 억울한 오판 가능성을 줄일 수 있습니다."] },
          { title: "검토 결과 안내", body: ["운영 검토 결과는 공격자와 방어자에게 GOAT Arena 우편함과 이메일로 함께 안내합니다.", "안내에는 이상 없음 또는 위반 판정, 경기 정산 결과, 매치메이킹 제한 여부와 정지 시간 보상 여부가 포함됩니다.", "검토가 진행되는 동안 보유 학습일수와 이용 권한의 유효성은 유지됩니다."] },
          { title: "부정행위가 아닌 경우", body: ["운영자가 경기 양측 모두 이상 없다고 판단하면 두 참가자의 매치메이킹 일시정지를 해제하고 해당 경기를 유효 경기로 인정합니다.", "보류된 학습일수와 Arena 상태는 원래 1대1 경기 승패 규정에 따라 정산합니다.", "각 참가자에게 매치메이킹이 정지됐던 실제 시간만큼 현재 이용 주기의 만료·평가 시각을 연장합니다. 검토가 24시간을 넘기면 초과 시간을 포함한 전체 정지 시간을 보상합니다.", "이 시간 보상은 학습일수를 경기 자산으로 새로 지급하는 방식이 아니라 동일한 매칭 가능 시간을 돌려주는 방식입니다."] },
          { title: "부정행위가 확정된 경우", body: ["상향 쟁탈전·하위 티어 초대전·복수전 모두 실제로 예치된 학습일수만 정산합니다. 공격자가 위반하면 그 공격자가 예치한 학습일수는 방어자에게 이전하고, 방어자가 위반하면 방어자가 예치한 학습일수는 공격자에게 이전합니다. 각 참가자의 예치가 없는 경기에서는 존재하지 않는 예치금을 새로 만들지 않습니다.", "상위 티어 공격이 포함된 경기에서 공격자의 위반이 확정되면 Arena 상태를 교환하고, 방어자의 위반이 확정되면 Arena 상태를 유지합니다. 그 밖의 경기에서는 위반자가 승리하지 않도록 해당 경기의 공격·방어 방향으로 Arena 상태를 처리합니다.", "양측 모두 위반이 확정되면 Arena 상태는 유지하고 양측이 실제로 예치한 학습일수는 모두 소각합니다.", "위반이 확정된 이용자는 경기 정산 뒤 해당 이용 주기에 사용 가능한 학습일수의 1/3을 정수 단위로 올림해 추가 소각합니다.", "부정행위가 확정된 사용자는 경고 1회와 운영 결과 통보 직후부터 5일간 매치메이킹 금지를 적용합니다. Ranked 사용자는 이미 페이백을 완료한 상태이므로 페이백 심사 탈락 항목을 적용하지 않습니다.", "부정행위가 확정된 참가자에게는 검토 일시정지 시간을 보상하지 않습니다. 함께 검토받았으나 위반이 확인되지 않은 상대 참가자에게는 실제 일시정지 시간을 보상합니다. 이용 권한의 유효기간은 유지되지만 5일 제재 기간에는 GOAT Arena 매치메이킹을 이용할 수 없습니다."] },
          { title: "경기별 적용 규정", body: ["예치 금액·티어 차이·수수료·정산 방식은 경기를 만들 때 안내된 조건으로 확정됩니다.", "경기 도중 운영 규정이 바뀌어도 이미 시작된 경기의 조건은 바뀌지 않습니다."] },
        ],
      },
    ],
  },
};

const PUBLIC_TIER_ORDER = Object.freeze([
  "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD",
  "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
]);

const MATCHUP_ROWS = Object.freeze([
  ...PUBLIC_TIER_ORDER.map((tier) => [
    "Unranked",
    `${TIER_LABELS[tier]} 방어`,
    TIER_LABELS[tier],
    UNRANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE[tier],
  ]),
  ...PUBLIC_TIER_ORDER.map((tier, index) => [
    "Ranked",
    `${TIER_LABELS[tier]} 방어`,
    `같은 번호의 Unranked보다 높은 부담`,
    RANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE[tier],
  ]),
]);

function percentValue(value) {
  const scaled = Number(value) * 100;
  if (Number.isInteger(scaled)) return String(scaled);
  return scaled.toFixed(1);
}

function percentRange(values) {
  // U1의 35.0% 표기는 39.9%와 같은 소수 단위 구간임을 명확히 보여준다.
  const lower = Number(values[0]) === 0.35 ? "35.0" : percentValue(values[0]);
  return `${lower}~${percentValue(values[1])}%`;
}

function problemDesignView(division = "SUB") {
  const normalizedDivision = String(division || "SUB").toUpperCase();
  const isRanked = normalizedDivision === "MAIN";
  const publicName = isRanked ? "Ranked" : "Unranked";
  const difficultyPrefix = isRanked ? "R" : "U";
  const research = getOfficialMockResearchSummary();
  const privateResearch = getPrivateMockResearchSummary();
  const courseLabels = {
    "common-math-1": "공통수학Ⅰ",
    "common-math-2": "공통수학Ⅱ",
    algebra: "대수",
    "probability-statistics": "확률과 통계",
    "calculus-1": "미적분Ⅰ",
  };
  return {
    policyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
    division: normalizedDivision,
    isRanked,
    publicName,
    difficultyPrefix,
    principles: [
      "두 사용자는 항상 완전히 같은 문제를 풀고, 난이도는 Division과 방어자 티어로 확정합니다.",
      `${publicName} 난이도는 ${difficultyPrefix}1~${difficultyPrefix}9로 표시하며 숫자가 커질수록 조건 결합과 추론 부담이 높아집니다.`,
      "마스터·그랜드마스터·챌린저 구간은 다섯 문항 모두 29·30번형 킬러로 출제합니다.",
      "각 경기는 첫 문항에서 시작해 뒤 문항으로 갈수록 조건 결합과 경우분류 부담이 자연스럽게 높아집니다.",
    ],
    matchupRows: MATCHUP_ROWS
      .filter(([rowDivision]) => rowDivision === publicName)
      .map(([rowDivision, matchup, anchor, difficultyCode]) => ({
        division: rowDivision,
        matchup,
        anchor,
        difficultyCode,
      })),
    accuracyRows: Array.from({ length: 9 }, (_unused, index) => {
      const stage = `${difficultyPrefix}${index + 1}`;
      const spec = PUBLIC_DIFFICULTY_SPECS[stage];
      const allKiller = index >= 6;
      return {
        stage,
        primaryAccuracy: percentRange(
          allKiller ? spec.finalAccuracy : spec.regularAccuracy
        ),
        finalAccuracy: isRanked && !allKiller
          ? percentRange(spec.finalAccuracy)
          : "",
        composition: allKiller
          ? "29·30번형 킬러 5문항"
          : isRanked
            ? "준킬러 4문항 + 킬러 1문항"
            : "준킬러 5문항",
      };
    }),
    accuracyPrinciples: [
      isRanked
        ? "R1~R6은 1~4번 준킬러와 5번 29·30번형 킬러로 구성하고, R7~R9은 1~5번을 모두 29·30번형 킬러로 구성합니다."
        : "U1~U6은 1~5번을 모두 준킬러로 구성하고, U7~U9은 1~5번을 모두 29·30번형 킬러로 구성합니다.",
      "경기 화면에는 현재 문항의 예상 정답률 구간을 표시합니다. 이는 난이도 설계 목표이며 개인의 정답 확률이나 결과를 보장하는 수치가 아닙니다.",
      "초기 목표 구간은 실제 경기 데이터가 충분히 쌓이면 운영자가 난이도만 보정하며, 이미 생성된 경기는 바뀌지 않습니다.",
    ],
    structuralDifficultyPrinciples: [
      "단순 계산량을 늘리는 대신 서로 다른 개념의 결합, 조건의 식 변환, 경우 분류와 역추론을 중심으로 난이도를 만듭니다.",
      "준킬러는 최소 4단계, 29·30번형 킬러는 최소 5단계의 핵심 추론 구조를 통과해야 경기 문항으로 확정됩니다.",
      "숫자를 바꾼 뒤 우연히 쉬워진 문항은 생성 단계에서 제외하고, 자연수 정답·유일해·계산기 없이 풀이 가능 여부를 다시 검산합니다.",
    ],
    curveRows: isRanked
      ? [
          { division: "R1~R6", sequence: "쉬운 준킬러 → 준킬러 → 어려운 준킬러 → 최상위 준킬러 → 킬러", example: "R5 예시: 25~26% → 23~25% → 21~23% → 20~22% → 4~6%" },
          { division: "R7~R9", sequence: "킬러 → 킬러 → 킬러 → 킬러 → 킬러", example: "다섯 문항 모두 29·30번형" },
        ]
      : [
          { division: "U1~U6", sequence: "쉬움 → 보통 → 보통 → 어려움 → 가장 어려움", example: "U5 예시: 32% → 30% → 29% → 28% → 27%" },
          { division: "U7~U9", sequence: "킬러 → 킬러 → 킬러 → 킬러 → 킬러", example: "다섯 문항 모두 29·30번형" },
        ],
    compositionHeadline: isRanked
      ? "R1~R6은 준킬러 4문항과 킬러 1문항, R7~R9은 킬러 5문항입니다."
      : "U1~U6은 준킬러 5문항, U7~U9은 킬러 5문항입니다.",
    matchSpec: [
      [`${publicName} 일반 구간`, isRanked ? "R1~R6: 준킬러 4문항 + 29·30번형 킬러 1문항" : "U1~U6: 준킬러 5문항"],
      [`${publicName} 상위 구간`, `${difficultyPrefix}7~${difficultyPrefix}9: 29·30번형 킬러 5문항`],
      ["총점", `${PACK_RULES.totalScore}점 (문항당 ${PACK_RULES.perItemPoints}점)`],
      ["제한 시간", `문항당 ${PACK_RULES.timeLimitMinutes}분`],
      ["문제 동일성", "두 사용자에게 완전히 같은 문제"],
      ["정답 형식", "3자리 이하 자연수 주관식"],
      ["직접 출제 범위", "대수, 미적분Ⅰ, 확률과 통계"],
      ["기초 연계 범위", "공통수학Ⅰ·Ⅱ의 위계·연계 개념"],
      ["그래프·표", "문제 본문이 실제로 제시한 경우에만 정확한 식·라벨·점·좌표를 흰색 문제지에 표시"],
      ["유형 수", `${difficultyPrefix}1~${difficultyPrefix}9 각각 최소 30개 수치·조건 변형 유형`],
      ["반복 방지", "한 경기 안 유형 중복 금지 + 양쪽 참가자의 최근 공식 경기 5개 유형 우선 제외"],
    ],
    semiKillerDefinition:
      "13·14·20·21·27·28번 4점 문항의 사고 구조를 바탕으로 개념 2개 이상과 조건 변형을 결합하며, 기출 문장을 그대로 복제하지 않습니다.",
    excludedQuestion: isRanked
      ? "개념 하나를 직접 대입해 끝나는 기본 문항은 R1에도 넣지 않습니다. R1~R6은 마지막 문항을, R7~R9은 전 문항을 검산된 29·30번형 다중 조건 킬러로 고정합니다."
      : "개념 하나를 직접 대입해 끝나는 기본 문항은 U1에도 넣지 않습니다. U1~U6은 전 문항 준킬러, U7~U9은 전 문항을 검산된 29·30번형 다중 조건 킬러로 고정합니다.",
    curriculumAlignment: {
      sourceTitle: ARENA_2028_MATH_ALIGNMENT.source.title,
      directCourses: ARENA_2028_MATH_ALIGNMENT.assessmentScope.directCourses
        .map((course) => course.label),
      indirectCourses: ARENA_2028_MATH_ALIGNMENT.assessmentScope.indirectFoundationCourses
        .map((course) => course.label),
      behaviorDomains: ARENA_2028_MATH_ALIGNMENT.behaviorDomains
        .map((domain) => domain.label),
      representationRequirements:
        ARENA_2028_MATH_ALIGNMENT.representationRequirements,
    },
    research: {
      period: String(research.researchWindow || "").replace("-", "~"),
      sourceForms: research.sourceForms,
      referenceCount: research.targetQuestionReferences,
      activeReferenceCount: research.activeReferences,
      targetMonths: (research.targetMonths || []).join("·"),
      targetQuestions: research.targetQuestions.join("·"),
      excludedExamType: "수능",
      notice:
        "고3 전국연합학력평가와 평가원 모의평가의 공개 해설에서 출제 의도와 풀이 구조만 유형화하며, 기출 문제 문장·수치·정답을 그대로 재사용하지 않습니다.",
      privateCalibration: {
        reviewedSources: privateResearch.reviewedSources,
        activeSources: privateResearch.activeCalibrationSources,
        activeMetrics: privateResearch.activeCalibrationMetrics,
        minimumSampleSize: privateResearch.minimumCleanSampleSize,
        notice:
          "공식 무료 배포 사설 모의고사는 문제지·정답·해설·문항별 정답률과 충분한 표본을 모두 확인한 경우에만 목표 정답률 검증에 사용합니다. 사설 문항 원문은 복제하지 않습니다.",
      },
      courseRows: [
        "common-math-1",
        "common-math-2",
        "algebra",
        "probability-statistics",
        "calculus-1",
      ].map((courseId) => ({
        courseId,
        courseLabel: courseLabels[courseId] || courseId,
        count: Number(research.byCourse?.[courseId] || 0),
        referenceBasis:
          Number(research.byCourse?.[courseId] || 0) > 0
            ? "공식 해설 직접 참고"
            : "현 교육과정 전이 골격",
      })),
      familyRows: research.familyStats.slice(0, 12).map((family) => ({
        familyId: family.familyId,
        familyLabel: family.familyLabel,
        courseLabel: courseLabels[family.courseId] || family.courseId,
        referenceCount: family.references,
      })),
      difficultyRows: Object.entries(research.byDifficulty || {}).map(
        ([tier, count]) => ({
          tier: `${difficultyPrefix}${String(tier).replace("T", "")}`,
          count,
          composition: Number(String(tier).replace("T", "")) >= 7
            ? "29·30번형 킬러 사고 구조"
            : "13·14·20·21·27·28번형 준킬러 사고 구조",
        })
      ),
    },
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
        attackLimit: UNRANKED_DAILY_ATTACK_LIMIT,
        defenseLimit: Number(row.defenseLimit),
      })),
    minimumStreakDays:
      Number(source.payback?.minimumStreakDays) || 0,
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
      snapshot.displayName || "Ranked 운영 기준",
    policyVersionCode: snapshot.code,
    maximumTargetTierGap,
    stakeDaysByTierGap,
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
      "현재 적용 중인 Ranked 운영 정책이 없어 신규 경기를 신청할 수 없습니다.",
      "운영 정책이 활성화되면 최대 티어 차이와 차이별 최소 예치 일수가 이 화면에 자동 반영됩니다.",
    ];
  }
  return [
    "상향 쟁탈전의 최대 티어 차이는 3단계입니다.",
    "차이별 최소 예치 일수는 1단계 1일, 2단계 2일, 3단계 3일이며 공통 최대 예치는 5일입니다.",
    "1단계 차이는 1~5일, 2단계 차이는 2~5일, 3단계 차이는 3~5일을 선택할 수 있고 4단계 이상은 신청할 수 없습니다.",
    "상향 쟁탈전은 공격자만 예치 뒤 최소 1일을 남겨야 하며, 자동 방어자는 활성 상태의 1일 이상이면 됩니다.",
    "경기 종료 뒤 6시간 유예는 강제 자동 방어에만 적용합니다. 이 시간에도 수락형 하위 티어 초대전 알림을 받고 자발적으로 수락하거나 거절할 수 있습니다.",
    "수락형 하위 티어 초대전은 양측이 예치 뒤 최소 1일을 남겨야 합니다.",
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
    summary: rulebook.summary.map((line, index) => {
      if (index !== 0) return line;
      return normalizedDivision === "MAIN"
        ? "두 사용자는 같은 주관식 5문항을 문항당 최대 10분 동안 풉니다. R1~R6은 1~4번 준킬러와 5번 29·30번형 킬러, R7~R9은 5문항 모두 29·30번형 킬러로 구성합니다."
        : "두 사용자는 같은 주관식 5문항을 문항당 최대 10분 동안 풉니다. U1~U6은 5문항 모두 준킬러, U7~U9은 5문항 모두 29·30번형 킬러로 구성합니다.";
    }),
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
    problemDesign: problemDesignView(normalizedDivision),
  };
}

module.exports = {
  PAYBACK_RULEBOOK_BASELINE_AT,
  getArenaRulebook,
  commonProblemDesignView: problemDesignView,
  problemDesignView,
  mainPolicyView,
  paybackPolicyView,
};
