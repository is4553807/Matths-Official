"use strict";

function professionalNotice({
  user,
  title,
  message,
}) {
  const recipientName =
    String(
      user?.realName ||
        user?.name ||
        "회원"
    ).trim();
  const cleanTitle =
    String(
      title || "운영 안내"
    ).trim();
  const cleanMessage =
    String(message || "")
      .replace(/\r\n?/g, "\n")
      .trim();

  return [
    `안녕하세요, ${recipientName}님.`,
    "Matths 운영팀입니다.",
    "",
    `회원님의 계정 및 서비스 이용과 관련하여 「${cleanTitle}」 내용을 안내드립니다.`,
    "아래 내용은 운영 정책과 확인된 기록을 바탕으로 전달드리는 공식 안내입니다.",
    "",
    "[안내 내용]",
    cleanMessage,
    "",
    "[확인 및 문의 절차]",
    "안내 내용을 확인하신 뒤 추가 설명이나 이의 제기가 필요한 경우, 사이트의 문의 페이지를 통해 관련 내용을 남겨주세요.",
    "접수된 문의는 제출 순서와 확인이 필요한 자료의 범위에 따라 검토되며, 답변까지 최대 3영업일 정도 소요될 수 있습니다.",
    "검토가 완료되면 회원가입 시 등록한 이메일 또는 Matths 알림 우편함을 통해 결과를 안내드리겠습니다.",
    "",
    "원활하고 공정한 서비스 운영을 위한 절차이오니 협조 부탁드립니다.",
    "감사합니다.",
    "",
    "Matths 운영팀 드림",
  ].join("\n");
}

module.exports = {
  professionalNotice,
};
