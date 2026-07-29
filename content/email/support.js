"use strict";

function inquiryReceived({
  inquiryId,
  user,
  subject,
  content,
}) {
  const cleanSubject =
    String(subject || "")
      .replace(/[\r\n]+/g, " ")
      .trim();
  return {
    subject:
      `[Matths 문의] ${cleanSubject}`,
    heading:
      "새 사용자 문의가 접수되었습니다.",
    kicker:
      "MATTHS SUPPORT",
    replyTo:
      user.email,
    text: [
      "Matths 사용자 문의가 접수되었습니다.",
      "",
      `문의 번호: ${inquiryId}`,
      `닉네임: ${user.nickname}`,
      `실명: ${user.realName || "미입력"}`,
      `가입 이메일: ${user.email}`,
      `학교: ${user.schoolName || "미설정"}`,
      "",
      `제목: ${cleanSubject}`,
      "",
      String(content || ""),
      "",
      "관리자 페이지에서 확인 후 가입 이메일로 답변해주세요.",
    ].join("\n"),
    body: [
      `문의 번호: ${inquiryId}`,
      `닉네임: ${user.nickname}`,
      `실명: ${user.realName || "미입력"}`,
      `가입 이메일: ${user.email}`,
      `학교: ${user.schoolName || "미설정"}`,
      "",
      `제목: ${cleanSubject}`,
      "",
      String(content || ""),
    ].join("\n"),
    footer:
      "관리자 페이지에서 확인 후 가입 이메일로 답변해주세요.",
  };
}

function inquiryReply({
  subject,
  message,
}) {
  const cleanSubject =
    String(subject || "")
      .replace(/[\r\n]+/g, " ")
      .trim();
  const cleanMessage =
    String(message || "").trim();
  return {
    subject:
      `[Matths 문의 답변] ${cleanSubject}`,
    heading:
      cleanSubject,
    kicker:
      "MATTHS SUPPORT",
    text: [
      "Matths에 남겨주신 문의에 답변드립니다.",
      "",
      cleanMessage,
      "",
      "추가 문의는 Matths 문의하기 페이지에서 남겨주세요.",
    ].join("\n"),
    body:
      cleanMessage,
    footer:
      "추가 문의는 Matths 문의하기 페이지에서 남겨주세요.",
  };
}

module.exports = {
  inquiryReceived,
  inquiryReply,
};
