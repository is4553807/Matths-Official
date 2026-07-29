function warningNotice({
  target = "게시글",
  reason,
  warningCount,
  autoSuspended,
}) {
  return {
    title:
      autoSuspended
        ? `${target} 경고 누적으로 계정이 정지되었습니다.`
        : `${target} 이용 경고가 부여되었습니다.`,
    message: [
      `경고 사유: ${reason}`,
      `현재 누적 경고: ${warningCount}회`,
      autoSuspended
        ? "경고가 3회 누적되어 계정 이용이 정지되었습니다."
        : "게시판 이용 규칙을 다시 확인해주세요.",
    ].join("\n"),
  };
}

module.exports = {
  warningNotice,
};
