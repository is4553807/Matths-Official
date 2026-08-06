const ERROR_HELP_ITEMS = [
  {
    status: 400,
    title: "요청 형식 오류",
    summary:
      "필수 입력값이 빠졌거나 허용되지 않는 형식으로 요청했습니다.",
    action:
      "입력칸의 안내 문구와 파일 형식을 확인한 뒤 다시 제출해주세요.",
  },
  {
    status: 401,
    title: "로그인 필요",
    summary:
      "로그인 세션이 없거나 만료되어 본인 확인이 필요한 기능을 열 수 없습니다.",
    action:
      "다시 로그인한 뒤 같은 메뉴에서 진행해주세요.",
  },
  {
    status: 403,
    title: "이용 권한 없음",
    summary:
      "현재 계정 역할, 이용권 또는 GOAT Arena 참가 상태로는 요청한 기능을 사용할 수 없습니다.",
    action:
      "대시보드의 이용 플랜과 계정 상태를 확인해주세요.",
  },
  {
    status: 404,
    title: "페이지 또는 기록 없음",
    summary:
      "주소가 잘못되었거나 요청한 페이지·시험·경기·자료 기록을 찾을 수 없습니다.",
    action:
      "이전 화면에서 링크를 다시 열고, 계속 발생하면 해당 주소와 함께 문의해주세요.",
  },
  {
    status: 409,
    title: "현재 상태와 요청 충돌",
    summary:
      "이미 처리된 요청을 다시 보냈거나, 진행 중인 시험·경기·정산 상태와 새 요청이 충돌했습니다.",
    action:
      "페이지를 새로고침해 최신 상태를 확인하세요. 배치고사 완료 뒤 재시작 요청도 이 코드로 차단됩니다.",
  },
  {
    status: 410,
    title: "이용 가능 시간 종료",
    summary:
      "초대, 경기, 증거 제출 또는 일회용 링크의 이용 기한이 끝났습니다.",
    action:
      "대시보드에서 현재 상태와 새로 이용할 수 있는 절차를 확인해주세요.",
  },
  {
    status: 413,
    title: "업로드 용량 초과",
    summary:
      "업로드한 파일의 개수나 전체·개별 용량이 허용 범위를 넘었습니다.",
    action:
      "파일 수와 용량을 줄이고 허용된 확장자인지 확인해주세요.",
  },
  {
    status: 422,
    title: "입력 내용 검증 실패",
    summary:
      "요청 형식은 맞지만 답안, 계좌, 정책 값처럼 내용 자체를 안전하게 처리할 수 없습니다.",
    action:
      "화면에 표시된 입력 조건에 맞게 값을 수정해주세요.",
  },
  {
    status: 423,
    title: "기능 잠금",
    summary:
      "일요일 Arena 잠금, 계정 검토, 이용권 만료 또는 운영 정책 때문에 기능이 잠겨 있습니다.",
    action:
      "잠금 사유와 해제 시간을 화면에서 확인한 뒤 이용해주세요.",
  },
  {
    status: 429,
    title: "요청 횟수 초과",
    summary:
      "짧은 시간에 같은 요청이 반복되어 계정과 서버 보호를 위해 잠시 제한했습니다.",
    action:
      "잠시 기다린 뒤 한 번만 다시 요청해주세요.",
  },
  {
    status: 500,
    title: "서버 처리 오류",
    summary:
      "요청 처리 중 예상하지 못한 문제가 발생했습니다. 입력 실수로 단정할 수 없는 오류입니다.",
    action:
      "잠시 뒤 다시 시도하고, 반복되면 발생 시각·주소·500 코드를 문의에 남겨주세요.",
  },
  {
    status: 501,
    title: "아직 제공하지 않는 기능",
    summary:
      "화면이나 경로는 준비됐지만 실제 처리 기능은 아직 활성화되지 않았습니다.",
    action:
      "현재 이용 가능한 대체 메뉴를 사용하거나 기능 공개 안내를 확인해주세요.",
  },
  {
    status: 503,
    title: "일시적인 서비스 이용 불가",
    summary:
      "문제 유형 검산, 데이터베이스 연결 또는 운영 점검 때문에 서비스를 잠시 사용할 수 없습니다.",
    action:
      "잠시 뒤 새로고침하고 계속 발생하면 발생 시각과 503 코드를 문의에 남겨주세요.",
  },
].map((item) => ({
  ...item,
  code: String(item.status),
  id: `faq-error-${item.status}`,
}));

function errorHelpForStatus(
  status
) {
  const normalized = Number(status);
  return (
    ERROR_HELP_ITEMS.find(
      (item) =>
        item.status === normalized
    ) ||
    ERROR_HELP_ITEMS.find(
      (item) =>
        item.status === 500
    )
  );
}

function errorFaqHref(status) {
  const help =
    errorHelpForStatus(status);
  return `/faq?code=${help.code}#${help.id}`;
}

module.exports = {
  ERROR_HELP_ITEMS,
  errorFaqHref,
  errorHelpForStatus,
};
