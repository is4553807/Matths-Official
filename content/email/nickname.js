function changeRequest({
  reason,
  absoluteUrl,
}) {
  return {
    title:
      "닉네임 변경이 필요합니다.",
    subject:
      "닉네임 변경 요청",
    message: [
      `요청 사유: ${reason}`,
      "아래 변경 페이지에서 현재 계정으로 로그인한 뒤 새 닉네임의 중복 확인을 완료해주세요.",
      `변경 링크: ${absoluteUrl}`,
      "이 링크는 7일 동안 유효하며 한 번만 사용할 수 있습니다.",
    ].join("\n"),
  };
}

module.exports = {
  changeRequest,
};
