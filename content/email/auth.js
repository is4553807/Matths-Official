"use strict";

function passwordResetCode({ code }) {
  return {
    subject:
      "[Matths] 비밀번호 재설정 인증코드",
    heading:
      "비밀번호 재설정 인증코드",
    text: [
      "Matths 비밀번호 재설정 인증코드입니다.",
      "",
      String(code),
      "",
      "인증코드는 10분 동안 유효합니다.",
      "본인이 요청하지 않았다면 이 이메일을 무시해주세요.",
    ].join("\n"),
    highlight: String(code),
    footer:
      "인증코드는 10분 동안 유효합니다. 본인이 요청하지 않았다면 이 이메일을 무시해주세요.",
  };
}

function passwordResetLink({ resetUrl }) {
  return {
    subject:
      "[Matths] 비밀번호 재설정 링크",
    heading:
      "비밀번호를 다시 설정하세요.",
    text: [
      "Matths 운영자가 비밀번호 재설정 링크를 보냈습니다.",
      "",
      String(resetUrl),
      "",
      "이 링크는 10분 동안 한 번만 사용할 수 있습니다.",
      "본인이 요청하지 않았다면 이 이메일을 무시해주세요.",
    ].join("\n"),
    body:
      "아래 버튼을 누르면 새 비밀번호를 설정하는 Matths 보안 화면으로 이동합니다.",
    actionLabel:
      "비밀번호 재설정",
    actionUrl:
      String(resetUrl),
    footer:
      "이 링크는 10분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 이메일을 무시해주세요.",
  };
}

module.exports = {
  passwordResetCode,
  passwordResetLink,
};
