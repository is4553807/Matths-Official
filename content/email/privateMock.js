"use strict";

function uploadReminder({
  weekKey,
  missingFormLabels,
}) {
  const missing =
    missingFormLabels.join(", ");
  return {
    subject:
      "[Matths] 이번 주 사설 모의고사를 업로드해주세요.",
    heading:
      "이번 주 사설 모의고사를 업로드해주세요.",
    kicker:
      "MATTHS OPERATIONS",
    text: [
      "이번 주 Matths 사설 모의고사가 아직 등록되지 않았습니다.",
      "",
      `기준 주차: ${weekKey}`,
      `누락 회차: ${missing}`,
      "A·B·C형 문제지 PDF, 답안지 JSON, 확인용 답지 PDF를 관리자 페이지에 업로드해주세요.",
      "",
      "관리자 페이지: /admin/private-mock-exams",
    ].join("\n"),
    body: [
      "이번 주 A·B·C형 가운데 등록되지 않은 시험이 있습니다.",
      `누락 회차: ${missing}`,
      "문제지 PDF, 답안지 JSON, 확인용 답지 PDF를 관리자 페이지에 업로드해주세요.",
    ].join("\n"),
  };
}

function evidenceRequest({
  questionNumbers,
  deadlineLabel,
  instructions,
}) {
  return {
    title:
      "시험 기록 확인을 위한 풀이과정 제출 요청",
    emailSubject:
      "풀이과정 제출이 필요합니다",
    inboxMessage:
      `${questionNumbers.join(", ")}번 문항의 풀이과정을 ${deadlineLabel}까지 제출해주세요. 검토 전에는 부정행위로 확정되지 않습니다.`,
    emailMessage: [
      "사설 모의고사 응시 기록 중 추가 확인이 필요한 항목이 있어 풀이과정 제출을 요청드립니다.",
      "본 요청은 부정행위를 확정하거나 페널티를 부여했다는 의미가 아니며, 공정한 검토를 위해 필요한 확인 절차입니다.",
      "",
      "[제출 요청 정보]",
      `요청 문항: ${questionNumbers.join(", ")}번`,
      `제출 기한: ${deadlineLabel}`,
      `제출 자료: ${instructions}`,
      "",
      "기한 안에 문제를 해결한 전체 과정을 확인할 수 있는 사진 또는 PDF를 제출해주세요.",
      "자료가 접수되면 운영팀이 응시 기록과 함께 검토하며, 검토 결과 안내까지 최대 3영업일 정도 소요될 수 있습니다.",
    ].join("\n"),
  };
}

function integrityPenalty({
  reason,
  warningCount,
  remainingWeekCount = 3,
}) {
  const duration =
    `이 안내 이후 진행되는 정규 사설 모의고사 ${remainingWeekCount}회(${remainingWeekCount}주)가 모두 종료될 때까지`;
  return {
    title:
      "사설 모의고사 이용 제한 안내",
    inboxMessage: [
      "제출한 소명 자료 검토가 완료되었습니다.",
      `검토 결과 사설 모의고사 응시가 제한되었습니다.`,
      `제한 기간: ${duration}`,
      `현재 남은 제한: ${remainingWeekCount}회(${remainingWeekCount}주)`,
      `적용 사유: ${reason}`,
      `현재 누적 경고: ${warningCount}회`,
      "제한 상세 페이지에서 적용일과 해제 기준을 확인할 수 있습니다.",
    ].join("\n"),
    emailMessage: [
      "제출해주신 소명 자료와 해당 회차의 응시 기록을 종합하여 검토했습니다.",
      "검토 결과, 사설 모의고사 운영 기준에 따라 이용 제한 조치가 적용되었음을 안내드립니다.",
      "",
      "[적용 조치]",
      `제한 기간: ${duration}`,
      `현재 남은 제한: ${remainingWeekCount}회(${remainingWeekCount}주)`,
      "주간 A·B·C 시험은 한 묶음으로 계산하며, 세 번째 제한 주차가 종료되면 별도 신청 없이 자동으로 해제됩니다.",
      `현재 누적 경고: ${warningCount}회`,
      "",
      "[처리 사유]",
      reason,
      "",
      "조치 내용에 관해 추가 설명이 필요하거나 사실관계 확인을 요청하려면 문의 페이지를 이용해주세요.",
      "접수된 문의는 관련 기록을 다시 확인한 뒤 순서대로 답변드리며, 최대 3영업일 정도 소요될 수 있습니다.",
    ].join("\n"),
  };
}

function integrityCleared({ reason }) {
  return {
    title:
      "사설 모의고사 소명 검토 결과 안내",
    inboxMessage: [
      "제출한 소명 자료 검토가 완료되었습니다.",
      "검토 결과 페널티를 부여하지 않기로 결정했습니다.",
      reason
        ? `검토 결과: ${reason}`
        : "제출 자료와 응시 기록을 종합해 정상 응시로 처리했습니다.",
      "해당 응시 기록은 주간 랭킹과 MMR 산정 대상에 정상 반영됩니다.",
    ].join("\n"),
    emailMessage: [
      "제출해주신 소명 자료와 해당 회차의 응시 기록을 종합하여 검토했습니다.",
      "검토 결과, 별도의 이용 제한이나 페널티를 부여하지 않기로 결정했음을 안내드립니다.",
      "",
      "[검토 결과]",
      reason ||
        "제출 자료와 응시 기록을 종합해 정상 응시로 처리했습니다.",
      "",
      "해당 응시 기록은 주간 랭킹과 MMR 산정 대상에 정상 반영됩니다.",
      "검토 절차에 성실히 협조해주셔서 감사합니다.",
    ].join("\n"),
  };
}

function answerCorrection({
  examTitle,
  corrections,
  reason,
}) {
  const correctionLines =
    corrections.flatMap(
      (correction) => [
        `문항: ${correction.questionNumber}번`,
        `문제 내용: ${correction.questionContent}`,
        `기존 정답: ${correction.oldAnswer}`,
        `정정 정답: ${correction.newAnswer}`,
        "",
      ]
    );
  return {
    subject:
      `${examTitle} 정답 정정 및 재채점 안내`,
    message: [
      "안녕하세요. Matths 운영팀입니다.",
      "",
      "사설 모의고사 검수 과정에서 정답 정보에 오류가 확인되어 아래와 같이 정정했습니다.",
      "응시에 혼선을 드린 점 진심으로 사과드립니다.",
      "",
      "[정정 내용]",
      ...correctionLines,
      "[정정 사유]",
      reason,
      "",
      "정정된 답안을 기준으로 해당 시험의 모든 응시 기록을 다시 채점했으며, 표준화 성적·전체 랭킹·MMR도 다시 산출했습니다.",
      "변경된 결과는 사설 모의고사 결과 및 War of GOAT 랭킹 페이지에서 확인할 수 있습니다.",
      "",
      "같은 문제가 반복되지 않도록 출제·검수 절차를 보완하겠습니다.",
      "불편을 드려 다시 한번 죄송합니다.",
      "",
      "Matths 운영팀 드림",
    ].join("\n"),
  };
}

function objectionReceived({
  objectionId,
  user,
  examTitle,
  questionNumber,
  issueDetail,
}) {
  return {
    subject:
      "[Matths] 사설 모의고사 문제 이의신청 접수",
    text: [
      "새 사설 모의고사 문제 이의신청이 접수되었습니다.",
      "",
      `접수 번호: ${objectionId}`,
      `신청자: ${user.realName || user.name}`,
      `가입 이메일: ${user.email}`,
      `시험지: ${examTitle}`,
      `문항: ${questionNumber}번`,
      "",
      "[문제가 있다고 판단한 부분]",
      issueDetail,
      "",
      "관리자 할 일 페이지에서 내용을 검토해주세요.",
    ].join("\n"),
  };
}

function objectionRejected({
  examTitle,
  questionNumber,
  reason,
}) {
  return {
    title:
      "사설 모의고사 문제 이의신청 검토 결과",
    message: [
      `시험지: ${examTitle}`,
      `문항: ${questionNumber}번`,
      "검토 결과 이의신청을 반려하기로 결정했습니다.",
      `반려 사유: ${reason}`,
      "의견을 보내주셔서 감사드리며, 추가 근거가 있는 경우 문의 페이지를 통해 전달해주세요.",
    ].join("\n"),
  };
}

function objectionAccepted({
  examTitle,
  questionNumber,
  reason,
}) {
  return {
    title:
      "사설 모의고사 문제 이의신청 반영 안내",
    message: [
      `시험지: ${examTitle}`,
      `문항: ${questionNumber}번`,
      "검토 결과 이의신청을 받아들여 정답을 정정했습니다.",
      `반영 사유: ${reason}`,
      "전체 응시 기록을 재채점하고 랭킹과 MMR을 다시 산출했습니다.",
      "정확한 검토에 도움을 주셔서 감사합니다.",
    ].join("\n"),
  };
}

module.exports = {
  answerCorrection,
  evidenceRequest,
  integrityCleared,
  integrityPenalty,
  objectionAccepted,
  objectionReceived,
  objectionRejected,
  uploadReminder,
};
